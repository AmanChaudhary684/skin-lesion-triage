"""
HAM10000 Dataset loader.

Expected layout after you download the dataset (Kaggle:
kmader/skin-cancer-mnist-ham10000, or the Harvard Dataverse original):

    data/
      HAM10000_metadata.csv
      images/                  <- flatten both HAM10000_images_part_1
                                   and part_2 into this one folder
        ISIC_0024306.jpg
        ISIC_0024307.jpg
        ...

The metadata CSV needs at least: image_id, dx (diagnosis code).
"""

import os
from collections import Counter

import pandas as pd
import torch
from PIL import Image
from torch.utils.data import Dataset, WeightedRandomSampler

from labels import CLASS_CODES, class_index


class HAM10000Dataset(Dataset):
    def __init__(self, metadata_csv: str, images_dir: str, transform=None):
        self.df = pd.read_csv(metadata_csv)
        self.df = self.df[self.df["dx"].isin(CLASS_CODES)].reset_index(drop=True)
        self.images_dir = images_dir
        self.transform = transform

    def __len__(self):
        return len(self.df)

    def _image_path(self, image_id: str) -> str:
        for ext in (".jpg", ".jpeg", ".png"):
            candidate = os.path.join(self.images_dir, image_id + ext)
            if os.path.exists(candidate):
                return candidate
        raise FileNotFoundError(f"No image found for {image_id} in {self.images_dir}")

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        image = Image.open(self._image_path(row["image_id"])).convert("RGB")
        label = class_index(row["dx"])
        if self.transform:
            image = self.transform(image)
        return image, label

    def class_counts(self) -> Counter:
        return Counter(self.df["dx"])

    def make_weighted_sampler(self) -> WeightedRandomSampler:
        """
        HAM10000 is heavily imbalanced (nv is ~67% of the dataset).
        This gives each sample a weight inversely proportional to its
        class frequency so rare, higher-risk classes (mel, bcc, akiec)
        aren't drowned out during training.
        """
        counts = self.class_counts()
        weight_per_class = {code: 1.0 / counts[code] for code in counts}
        sample_weights = [weight_per_class[dx] for dx in self.df["dx"]]
        return WeightedRandomSampler(
            weights=torch.DoubleTensor(sample_weights),
            num_samples=len(sample_weights),
            replacement=True,
        )
