"""
Out-of-distribution (OOD) check: "is this photo like the images the model was trained on?"

A softmax classifier always has to pick one of its 7 classes, and it can pick one with high
confidence even for an image unlike anything it saw in training. Temperature scaling and the
confidence floor cannot catch that, because the model's confidence is the very thing that is wrong.

This module adds a check that does NOT use the model's confidence. It looks at the model's internal
feature vector (the 512-number summary just before the final classifier layer for ResNet-34) and
measures how far it is from the typical feature vectors of the training images, using the
Mahalanobis distance (Lee et al., 2018):

    score(image) = min over classes c of  (f - mean_c)^T  P  (f - mean_c)

where f is the image's feature vector, mean_c is the average feature vector of training images of
class c, and P is the inverse of the covariance matrix shared by all classes. A big score means
"far from everything the model learned from".

The threshold is chosen on VALIDATION images only (so that ~5 % of normal validation images would be
flagged), and travels inside the checkpoint bundle, exactly like the temperature and the triage
thresholds. The notebook that fits it (SkinSight_OOD_Addon.ipynb) and the backend (model_utils.py)
both import THIS file, so the maths cannot drift apart.

Only torch is needed.
"""

import torch

_CHUNK = 512  # images scored at a time; keeps memory small even for 1280-dim EfficientNet features


def fit_mahalanobis(feats: torch.Tensor, labels: torch.Tensor, n_classes: int, ridge: float = 1e-3):
    """
    feats:  (N, D) feature vectors of the TRAINING images (no augmentation)
    labels: (N,)   integer class of each training image
    Returns (class_means (C, D), precision (D, D)) as float32 tensors.

    `ridge` adds a small multiple of the average variance to the covariance diagonal so the matrix
    is always safely invertible (needed because some feature dimensions are almost constant).
    """
    f = feats.detach().double().cpu()
    y = labels.detach().long().cpu()
    d = f.shape[1]

    means = torch.zeros(n_classes, d, dtype=torch.double)
    for c in range(n_classes):
        sel = f[y == c]
        if len(sel) == 0:
            raise ValueError(f"class index {c} has no training images; cannot fit its mean")
        means[c] = sel.mean(dim=0)

    centred = f - means[y]                      # subtract each image's own class mean
    cov = centred.T @ centred / len(f)          # one covariance shared by all classes
    cov = cov + ridge * (torch.trace(cov) / d) * torch.eye(d, dtype=torch.double)
    precision = torch.linalg.inv(cov)
    precision = (precision + precision.T) / 2   # remove tiny numerical asymmetry
    return means.float(), precision.float()


def mahalanobis_score(feats: torch.Tensor, class_means: torch.Tensor, precision: torch.Tensor) -> torch.Tensor:
    """
    feats: (N, D) or (D,) -> returns (N,) squared Mahalanobis distance to the NEAREST class mean.
    Higher = more unlike the training data.
    """
    f = feats.detach().double().cpu()
    if f.ndim == 1:
        f = f.unsqueeze(0)
    mu = class_means.detach().double().cpu()
    p = precision.detach().double().cpu()

    out = []
    for i in range(0, len(f), _CHUNK):
        diff = f[i:i + _CHUNK, None, :] - mu[None, :, :]               # (n, C, D)
        d2 = torch.einsum("ncd,de,nce->nc", diff, p, diff)              # (n, C)
        out.append(d2.min(dim=1).values)
    return torch.cat(out)


def threshold_at_percentile(val_scores: torch.Tensor, keep: float = 0.95) -> float:
    """Score below which `keep` of the (normal) validation images fall. keep=0.95 -> ~5 % get flagged."""
    return float(torch.quantile(val_scores.double(), keep).item())


def make_ood_bundle(class_means, precision, threshold, keep, feature_layer="avgpool"):
    """The dictionary stored under the key "ood" in the checkpoint bundle (tensors + plain numbers only,
    so torch.load(weights_only=True) keeps working)."""
    return dict(
        method="mahalanobis",
        feature_layer=feature_layer,
        class_means=class_means.float().cpu(),
        precision=precision.float().cpu(),
        threshold=float(threshold),
        keep_percentile=float(keep),
    )