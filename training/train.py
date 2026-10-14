"""
Train a transfer-learning classifier on HAM10000.

Run on a machine/Colab with a GPU and internet access (to download
ImageNet-pretrained weights):

    python train.py --data-dir ../data --epochs 15 --backbone resnet34

Saves the best checkpoint (by validation macro-F1) to
checkpoints/best_model.pt, in the format backend/model_utils.py expects.
"""

import argparse
import os

import torch
import torch.nn as nn
from sklearn.metrics import classification_report, f1_score
from torch.utils.data import DataLoader, random_split
from torchvision import models, transforms

from dataset import HAM10000Dataset
from labels import CLASS_CODES

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


def build_model(backbone: str, num_classes: int) -> nn.Module:
    if backbone == "resnet18":
        model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
        model.fc = nn.Linear(model.fc.in_features, num_classes)
    elif backbone == "resnet34":
        model = models.resnet34(weights=models.ResNet34_Weights.DEFAULT)
        model.fc = nn.Linear(model.fc.in_features, num_classes)
    elif backbone == "efficientnet_b0":
        model = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.DEFAULT)
        model.classifier[1] = nn.Linear(model.classifier[1].in_features, num_classes)
    else:
        raise ValueError(f"Unknown backbone: {backbone}")
    return model


def get_transforms():
    train_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(20),
        transforms.ColorJitter(brightness=0.2, contrast=0.2),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    return train_tf, eval_tf


def evaluate(model, loader, device):
    model.eval()
    all_preds, all_labels = [], []
    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            outputs = model(images)
            preds = outputs.argmax(dim=1).cpu()
            all_preds.extend(preds.tolist())
            all_labels.extend(labels.tolist())
    macro_f1 = f1_score(all_labels, all_preds, average="macro")
    report = classification_report(
        all_labels, all_preds, target_names=CLASS_CODES, zero_division=0
    )
    return macro_f1, report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="../data")
    parser.add_argument("--backbone", default="resnet34",
                         choices=["resnet18", "resnet34", "efficientnet_b0"])
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--val-split", type=float, default=0.15)
    parser.add_argument("--out-dir", default="checkpoints")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    train_tf, eval_tf = get_transforms()
    full_dataset = HAM10000Dataset(
        metadata_csv=os.path.join(args.data_dir, "HAM10000_metadata.csv"),
        images_dir=os.path.join(args.data_dir, "images"),
        transform=train_tf,
    )

    val_size = int(len(full_dataset) * args.val_split)
    train_size = len(full_dataset) - val_size
    train_ds, val_ds = random_split(full_dataset, [train_size, val_size])
    val_ds.dataset.transform = eval_tf  # eval transform, no augmentation

    sampler = full_dataset.make_weighted_sampler()
    # Note: WeightedRandomSampler indexes into the *full* dataset, so when
    # using random_split subsets directly it's simplest to instead pass
    # sampler only when training on the full dataset. For a clean subset +
    # weighted sampling combo, generate a Subset-aware sampler:
    train_indices = train_ds.indices
    train_weights = [sampler.weights[i] for i in train_indices]
    train_sampler = torch.utils.data.WeightedRandomSampler(
        weights=torch.DoubleTensor(train_weights),
        num_samples=len(train_weights),
        replacement=True,
    )

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, sampler=train_sampler)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False)

    model = build_model(args.backbone, num_classes=len(CLASS_CODES)).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    criterion = nn.CrossEntropyLoss()

    os.makedirs(args.out_dir, exist_ok=True)
    best_f1 = 0.0

    for epoch in range(args.epochs):
        model.train()
        running_loss = 0.0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * images.size(0)

        train_loss = running_loss / len(train_ds)
        val_f1, report = evaluate(model, val_loader, device)
        print(f"Epoch {epoch + 1}/{args.epochs} | train_loss={train_loss:.4f} | val_macro_f1={val_f1:.4f}")

        if val_f1 > best_f1:
            best_f1 = val_f1
            torch.save({
                "model_state_dict": model.state_dict(),
                "backbone": args.backbone,
                "class_codes": CLASS_CODES,
                "val_macro_f1": val_f1,
            }, os.path.join(args.out_dir, "best_model.pt"))
            print(f"  New best model saved (macro_f1={val_f1:.4f})")
            print(report)

    print(f"Training complete. Best val macro-F1: {best_f1:.4f}")


if __name__ == "__main__":
    main()
