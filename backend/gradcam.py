"""
Grad-CAM (Selvaraju et al., 2017) for visualizing which region of a
lesion image drove the model's prediction.

Works with any torchvision CNN backbone -- just pass the target
convolutional layer (e.g. model.layer4[-1] for a ResNet).
"""

from typing import Tuple

import numpy as np
import torch
import torch.nn.functional as F


class GradCAM:
    def __init__(self, model: torch.nn.Module, target_layer: torch.nn.Module):
        self.model = model
        self.target_layer = target_layer
        self.activations = None
        self.gradients = None
        self._register_hooks()

    def _register_hooks(self):
        def forward_hook(module, inp, out):
            self.activations = out.detach()

        def backward_hook(module, grad_in, grad_out):
            self.gradients = grad_out[0].detach()

        self.target_layer.register_forward_hook(forward_hook)
        self.target_layer.register_full_backward_hook(backward_hook)

    def generate(self, input_tensor: torch.Tensor, class_idx: int = None) -> Tuple[np.ndarray, int]:
        """
        input_tensor: shape (1, 3, H, W), already normalized.
        Returns (heatmap as HxW float array in [0, 1], the class index used).
        """
        self.model.eval()
        output = self.model(input_tensor)

        if class_idx is None:
            class_idx = int(output.argmax(dim=1).item())

        self.model.zero_grad()
        score = output[0, class_idx]
        score.backward()

        # Global-average-pool the gradients over spatial dims -> channel weights
        weights = self.gradients.mean(dim=(2, 3), keepdim=True)  # (1, C, 1, 1)
        cam = (weights * self.activations).sum(dim=1, keepdim=True)  # (1, 1, h, w)
        cam = F.relu(cam)

        cam = F.interpolate(
            cam, size=input_tensor.shape[-2:], mode="bilinear", align_corners=False
        )
        cam = cam.squeeze().cpu().numpy()

        cam_min, cam_max = cam.min(), cam.max()
        if cam_max - cam_min > 1e-8:
            cam = (cam - cam_min) / (cam_max - cam_min)
        else:
            cam = np.zeros_like(cam)

        return cam, class_idx


def overlay_heatmap(original_rgb: np.ndarray, heatmap: np.ndarray, alpha: float = 0.4) -> np.ndarray:
    """
    original_rgb: HxWx3 uint8 array (0-255).
    heatmap: HxW float array in [0, 1].
    Returns an HxWx3 uint8 array with a red-hot heatmap blended over the original.
    """
    heatmap_uint8 = (heatmap * 255).astype(np.uint8)

    # Simple red-channel heatmap (avoids an OpenCV dependency).
    colored = np.zeros_like(original_rgb, dtype=np.float32)
    colored[..., 0] = heatmap_uint8  # red channel driven by activation strength
    colored[..., 1] = heatmap_uint8 * 0.3
    colored[..., 2] = 0

    blended = (1 - alpha) * original_rgb.astype(np.float32) + alpha * colored
    return np.clip(blended, 0, 255).astype(np.uint8)
