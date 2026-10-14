"""
Evaluate a trained checkpoint on the OFFICIAL ISIC2018 Task 3 test set --
an external benchmark your train/val split never touched, so this number
isn't subject to the random-split luck that validation-set numbers can be.

Expects (from your Kaggle/Dataverse download):
    ISIC2018_Task3_Test_Images/          <- folder of .jpg images
    ISIC2018_Task3_Test_GroundTruth.csv  <- official one-hot labels

Run:
    python evaluate_test_set.py \
        --checkpoint checkpoints/best_model.pt \
        --test-images-dir /path/to/ISIC2018_Task3_Test_Images \
        --test-groundtruth /path/to/ISIC2018_Task3_Test_GroundTruth.csv
"""

import argparse
import os

import pandas as pd
import torch
import torch.nn.functional as F
from PIL import Image
from sklearn.metrics import classification_report, f1_score
from torchvision import models, transforms

from labels import CLASS_CODES, HIGH_RISK

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


def build_model(backbone: str, num_classes: int):
    if backbone == "resnet18":
        model = models.resnet18(weights=None)
        model.fc = torch.nn.Linear(model.fc.in_features, num_classes)
    elif backbone == "resnet34":
        model = models.resnet34(weights=None)
        model.fc = torch.nn.Linear(model.fc.in_features, num_classes)
    elif backbone == "efficientnet_b0":
        model = models.efficientnet_b0(weights=None)
        model.classifier[1] = torch.nn.Linear(model.classifier[1].in_features, num_classes)
    else:
        raise ValueError(f"Unknown backbone: {backbone}")
    return model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", default="checkpoints/best_model.pt")
    parser.add_argument("--test-images-dir", required=True)
    parser.add_argument("--test-groundtruth", required=True)
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    ckpt = torch.load(args.checkpoint, map_location=device)
    backbone = ckpt.get("backbone", "resnet34")
    model = build_model(backbone, num_classes=len(CLASS_CODES)).to(device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()
    print(f"Loaded {backbone} checkpoint (val_macro_f1={ckpt.get('val_macro_f1', 'n/a')}, "
          f"high_risk_recall={ckpt.get('high_risk_recall', 'n/a')})")

    eval_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])

    gt = pd.read_csv(args.test_groundtruth)

    all_preds, all_labels = [], []
    missing = 0

    for _, row in gt.iterrows():
        image_id = str(row["image_id"])
        true_class = str(row["dx"]).strip().lower()
        if true_class not in CLASS_CODES:
            continue

        img_path = None
        for ext in (".jpg", ".jpeg", ".png"):
            candidate = os.path.join(args.test_images_dir, image_id + ext)
            if os.path.exists(candidate):
                img_path = candidate
                break
        if img_path is None:
            missing += 1
            continue

        image = Image.open(img_path).convert("RGB")
        input_tensor = eval_tf(image).unsqueeze(0).to(device)

        with torch.no_grad():
            logits = model(input_tensor)
            pred_idx = int(F.softmax(logits, dim=1).argmax(dim=1).item())

        all_preds.append(pred_idx)
        all_labels.append(CLASS_CODES.index(true_class))

    if missing:
        print(f"Warning: {missing} images listed in ground truth were not found in {args.test_images_dir}")

    print(f"\nEvaluated on {len(all_labels)} official ISIC2018 test images\n")

    macro_f1 = f1_score(all_labels, all_preds, average="macro")
    report_dict = classification_report(
        all_labels, all_preds, target_names=CLASS_CODES, zero_division=0, output_dict=True
    )
    report_text = classification_report(
        all_labels, all_preds, target_names=CLASS_CODES, zero_division=0
    )
    high_risk_recall = sum(report_dict[c]["recall"] for c in HIGH_RISK) / len(HIGH_RISK)

    print(report_text)
    print(f"Macro-F1: {macro_f1:.4f}")
    print(f"High-risk recall (mel, bcc): {high_risk_recall:.4f}")


if __name__ == "__main__":
    main()
