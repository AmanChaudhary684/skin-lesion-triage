"""
Maps calibrated class probabilities to an urgency tier.

This is the piece that makes the product a *triage assistant* rather
than a bare classifier -- see Q8/Q12 of your Milestone 1 answers.

The rules below are the SAME rules that were evaluated in
SkinSight_AI_Training_v2.ipynb (validation + held-out ISIC 2018 test set),
so the numbers in the report describe what this code actually does:

  1. Melanoma is the top class, OR P(melanoma) >= the melanoma threshold
        -> urgent_care            (checked BEFORE the low-confidence rule, for safety)
  2. Top-class probability < confidence floor
        -> flag_for_human_review
  3. Top class is BCC / AKIEC, OR P(BCC) >= the BCC threshold
        -> see_doctor_soon
  4. Everything else
        -> routine_monitor

The thresholds and the floor are NOT hard-coded here: they are tuned in the
notebook (on validation data only) and travel inside the checkpoint file
(skinsight_final_v2.pt), so retraining updates them automatically.
The DEFAULT_* values below are only used in mock mode.
"""

import os
import sys
from dataclasses import dataclass
from typing import Dict, Optional

import numpy as np

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "training"))
from labels import (  # noqa: E402
    CLASS_CODES, CLASS_NAMES,
    TIER_URGENT, TIER_SOON, TIER_ROUTINE, TIER_REVIEW,
)

MEL = CLASS_CODES.index("mel")
BCC = CLASS_CODES.index("bcc")

# Defaults = the values the v2 notebook produced. Real values come from the checkpoint.
DEFAULT_THRESHOLDS = {"mel": 0.038, "bcc": 0.24}
DEFAULT_FLOOR = 0.85

# Class -> tier when no special rule fires. Mirrors BASE_TIER in the notebook.
# NOTE: this differs from labels.HIGH_RISK (which lists BCC as high risk): in the
# evaluated pipeline only melanoma is "urgent"; BCC and AKIEC are "see doctor soon".
DEFAULT_BASE_TIER = {
    "mel": TIER_URGENT,
    "bcc": TIER_SOON, "akiec": TIER_SOON,
    "bkl": TIER_ROUTINE, "nv": TIER_ROUTINE, "df": TIER_ROUTINE, "vasc": TIER_ROUTINE,
}

# The notebook stores tier names as display strings; translate them to this project's constants.
NOTEBOOK_TIER_NAMES = {
    "Urgent": TIER_URGENT,
    "See doctor soon": TIER_SOON,
    "Routine": TIER_ROUTINE,
    "Needs human review": TIER_REVIEW,
}

TIER_MESSAGES = {
    TIER_URGENT: "This pattern is consistent with a higher-risk lesion type. See a dermatologist as soon as you can.",
    TIER_SOON: "This pattern may need a closer look. Book a dermatologist appointment in the coming weeks.",
    TIER_ROUTINE: "This pattern is most often benign. Keep an eye on it and mention it at your next routine check-up.",
    TIER_REVIEW: "The model isn't confident enough to give a reliable read on this image. Please have it reviewed by a clinician directly.",
}


@dataclass
class TriageResult:
    tier: str
    message: str
    predicted_class_code: str
    predicted_class_name: str
    confidence: float
    reason: str                 # mel_top | mel_threshold | low_confidence | bcc_akiec | bcc_threshold | low_risk_class
    melanoma_probability: float


def tier_map_from_notebook(base_tier: Optional[Dict[str, str]]) -> Dict[str, str]:
    """Convert the notebook's {'mel': 'Urgent', ...} into this project's tier constants."""
    if not base_tier:
        return dict(DEFAULT_BASE_TIER)
    return {code: NOTEBOOK_TIER_NAMES.get(t, t) for code, t in base_tier.items()}


def triage(
    probs: np.ndarray,
    floor: float = DEFAULT_FLOOR,
    thresholds: Optional[Dict[str, float]] = None,
    base_tier: Optional[Dict[str, str]] = None,
) -> TriageResult:
    """
    probs: 1-D array of CALIBRATED class probabilities, in CLASS_CODES order.
    floor / thresholds / base_tier: from the checkpoint (see module docstring).
    """
    thr = thresholds or DEFAULT_THRESHOLDS
    base = base_tier or DEFAULT_BASE_TIER

    k = int(np.argmax(probs))
    code = CLASS_CODES[k]
    conf = float(probs[k])
    p_mel = float(probs[MEL])
    p_bcc = float(probs[BCC])

    message = None
    if code == "mel" or p_mel >= thr["mel"]:
        tier = TIER_URGENT
        if code == "mel":
            reason = "mel_top"
        else:
            reason = "mel_threshold"
            message = (
                f"The model's most likely match is {CLASS_NAMES[code].lower()}, but the chance of "
                "melanoma is high enough that a dermatologist check is recommended as a precaution. "
                "See a dermatologist as soon as you can."
            )
    elif conf < floor:
        tier, reason = TIER_REVIEW, "low_confidence"
    elif base[code] == TIER_SOON or p_bcc >= thr["bcc"]:
        tier = TIER_SOON
        reason = "bcc_akiec" if base[code] == TIER_SOON else "bcc_threshold"
    else:
        tier, reason = base[code], "low_risk_class"

    return TriageResult(
        tier=tier,
        message=message or TIER_MESSAGES[tier],
        predicted_class_code=code,
        predicted_class_name=CLASS_NAMES[code],
        confidence=conf,
        reason=reason,
        melanoma_probability=p_mel,
    )