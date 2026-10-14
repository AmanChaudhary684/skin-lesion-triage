"""
Loads the trained checkpoint (or falls back to a randomly-initialized
"mock mode" model if none exists yet) and runs the full predict
pipeline: preprocess -> classify -> calibrate -> triage tier -> Grad-CAM.

The checkpoint is the single bundle file written by the last cells of
SkinSight_AI_Training_v2.ipynb:

    training/checkpoints/skinsight_final_v2.pt

It contains the weights AND everything needed to reproduce the notebook's
predictions exactly: architecture, class order, image sizes, normalisation
constants, temperature, the melanoma/BCC thresholds and the confidence floor.
(Set the SKINSIGHT_CHECKPOINT environment variable to use a different file.)

Mock mode exists so the backend and frontend teams can build and test
the whole flow end-to-end without a checkpoint -- drop the file above in
place and mock mode turns off automatically.
"""

import base64
import io
import os
import sys

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from torchvision import models, transforms

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "training"))
from labels import CLASS_CODES  # noqa: E402

from gradcam import GradCAM, overlay_heatmap
from triage import (
    DEFAULT_BASE_TIER, DEFAULT_FLOOR, DEFAULT_THRESHOLDS, MEL, tier_map_from_notebook, triage,
)

CHECKPOINT_PATH = os.environ.get("SKINSIGHT_CHECKPOINT") or os.path.join(
    os.path.dirname(__file__), "..", "training", "checkpoints", "skinsight_final_v2.pt"
)

_BILINEAR = getattr(Image, "Resampling", Image).BILINEAR  # works on old and new Pillow

# Used only in mock mode (a real checkpoint carries its own values).
_IMAGENET_MEAN = [0.485, 0.456, 0.406]
_IMAGENET_STD = [0.229, 0.224, 0.225]


def build_network(arch: str, dropout: float = 0.3):
    """Rebuild the network exactly as the notebook did (same layer names -> weights load cleanly).
    Dropout does nothing at inference time; its value is irrelevant here."""
    n = len(CLASS_CODES)
    if arch == "resnet34":
        net = models.resnet34(weights=None)  # weights=None: no ImageNet download needed to boot
        net.fc = nn.Sequential(nn.Dropout(dropout), nn.Linear(net.fc.in_features, n))
        target_layer = net.layer4[-1]
    elif arch == "efficientnet_b0":
        net = models.efficientnet_b0(weights=None)
        net.classifier = nn.Sequential(nn.Dropout(dropout), nn.Linear(net.classifier[1].in_features, n))
        target_layer = net.features[-1]
    else:
        raise ValueError(f"Unsupported architecture in checkpoint: {arch!r}")
    return net, target_layer


class LesionModel:
    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.mock_mode = not os.path.exists(CHECKPOINT_PATH)

        # Defaults (mock mode); overwritten from the checkpoint below.
        arch = "resnet34"
        self.temperature = 1.0
        self.floor = DEFAULT_FLOOR
        self.thresholds = dict(DEFAULT_THRESHOLDS)
        self.base_tier = dict(DEFAULT_BASE_TIER)
        self.img_size, self.cache_size = 224, 256
        mean, std = _IMAGENET_MEAN, _IMAGENET_STD
        self.source_run = None
        ckpt = None

        if self.mock_mode:
            print(
                "[model_utils] No checkpoint found at "
                f"{os.path.abspath(CHECKPOINT_PATH)} -- running in MOCK MODE with "
                "randomly-initialized weights. Predictions are not "
                "meaningful; this is for integration testing only."
            )
        else:
            ckpt = self._read_bundle()
            arch = ckpt["arch"]
            self.temperature = float(ckpt["temperature"])
            self.floor = float(ckpt["floor"])
            self.thresholds = {k: float(v) for k, v in ckpt["hr_thresholds"].items()}
            self.base_tier = tier_map_from_notebook(ckpt.get("base_tier"))
            self.img_size = int(ckpt["img_size"])
            self.cache_size = int(ckpt["cache_size"])
            mean, std = ckpt["mean"], ckpt["std"]
            self.source_run = ckpt.get("source_run")

        self.model, self.target_layer = build_network(arch)
        if ckpt is not None:
            self.model.load_state_dict(ckpt["state_dict"])  # strict: raises if anything is off
            print(
                f"[model_utils] Loaded {self.source_run or 'checkpoint'} ({arch}) | "
                f"temperature={self.temperature:.3f} | thresholds={self.thresholds} | floor={self.floor}"
            )
        self.model.to(self.device)
        self.model.eval()  # BatchNorm/Dropout in inference mode -- must happen before ANY forward pass
        self.gradcam = GradCAM(self.model, self.target_layer)

        # Same preprocessing as training: resize to cache_size, then to img_size, then ImageNet-normalise.
        self._to_tensor = transforms.Compose([
            transforms.Resize((self.img_size, self.img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean, std),
        ])

    @staticmethod
    def _read_bundle() -> dict:
        try:
            ckpt = torch.load(CHECKPOINT_PATH, map_location="cpu", weights_only=True)
        except Exception as err:  # e.g. numpy scalars inside the bundle; the file is our own, so this is safe
            print(f"[model_utils] weights_only load failed ({type(err).__name__}); retrying with full unpickling")
            ckpt = torch.load(CHECKPOINT_PATH, map_location="cpu", weights_only=False)

        needed = ["state_dict", "arch", "classes", "temperature", "floor", "hr_thresholds",
                  "img_size", "cache_size", "mean", "std"]
        missing = [k for k in needed if k not in ckpt]
        if missing:
            raise RuntimeError(
                f"{CHECKPOINT_PATH} is not a SkinSight v2 bundle (missing keys: {missing}). "
                "Use skinsight_final_v2.pt produced by the last cells of SkinSight_AI_Training_v2.ipynb."
            )
        if list(ckpt["classes"]) != list(CLASS_CODES):
            raise RuntimeError(
                f"Class order mismatch! checkpoint={list(ckpt['classes'])} vs labels.py={list(CLASS_CODES)}. "
                "Every prediction would be mislabelled."
            )
        return ckpt

    def _preprocess(self, image: Image.Image) -> torch.Tensor:
        image = image.convert("RGB").resize((self.cache_size, self.cache_size), _BILINEAR)
        return self._to_tensor(image)

    def predict(self, image: Image.Image, include_heatmap: bool = True) -> dict:
        image = image.convert("RGB")
        input_tensor = self._preprocess(image).unsqueeze(0).to(self.device)

        # 1) classify + calibrate (temperature scaling) -- no gradients needed
        with torch.no_grad():
            logits = self.model(input_tensor)
        probs = F.softmax(logits / self.temperature, dim=1).squeeze(0).cpu().numpy()

        # 2) triage with the thresholds/floor tuned in the notebook
        result = triage(probs, self.floor, self.thresholds, self.base_tier)

        # 3) Grad-CAM for the class that DROVE the decision. Normally the top class, but if the tier is
        #    "urgent" only because P(melanoma) passed its threshold, explain the melanoma score instead.
        heatmap_b64, heatmap_class = None, None
        if include_heatmap:
            heatmap_idx = MEL if result.reason == "mel_threshold" else int(np.argmax(probs))
            input_tensor.requires_grad_(True)
            heatmap, heatmap_idx = self.gradcam.generate(input_tensor, class_idx=heatmap_idx)
            original_resized = np.array(image.resize((self.img_size, self.img_size)))
            heatmap_b64 = _encode_png_base64(overlay_heatmap(original_resized, heatmap))
            heatmap_class = CLASS_CODES[heatmap_idx]

        return {
            "mock_mode": self.mock_mode,
            "predicted_class_code": result.predicted_class_code,
            "predicted_class_name": result.predicted_class_name,
            "confidence": round(result.confidence, 4),
            # True when the top class is below the confidence floor. The UI uses this for an honest
            # "the model is not sure" note (a melanoma-flagged result can still be low confidence).
            "low_confidence": bool(result.confidence < self.floor),
            "confidence_floor": round(self.floor, 4),
            "all_probabilities": {
                CLASS_CODES[i]: round(float(p), 4) for i, p in enumerate(probs)
            },
            "melanoma_probability": round(result.melanoma_probability, 4),
            "triage_tier": result.tier,
            "triage_reason": result.reason,
            "triage_message": result.message,
            "heatmap_class_code": heatmap_class,
            "heatmap_overlay_png_base64": heatmap_b64,
        }


def _encode_png_base64(image_array: np.ndarray) -> str:
    buf = io.BytesIO()
    Image.fromarray(image_array).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")