"""
Shared label definitions for the HAM10000 lesion classes and the
urgency-tier triage mapping used across training and the backend.

HAM10000 metadata (HAM10000_metadata.csv) uses the `dx` column with
these seven short codes. Keep this file as the single source of
truth -- both training/train.py and backend/triage.py import from it.
"""

# Order matters: this is the class index <-> label mapping the model
# is trained against. Do not reorder once you've trained a checkpoint.
CLASS_CODES = ["akiec", "bcc", "bkl", "df", "mel", "nv", "vasc"]

CLASS_NAMES = {
    "akiec": "Actinic keratoses / intraepithelial carcinoma",
    "bcc": "Basal cell carcinoma",
    "bkl": "Benign keratosis-like lesion",
    "df": "Dermatofibroma",
    "mel": "Melanoma",
    "nv": "Melanocytic nevus (common mole)",
    "vasc": "Vascular lesion",
}

# Clinical risk grouping used to derive the triage tier. This is a
# simplification for an MVP/triage-support tool, NOT a diagnostic
# claim -- document this assumption explicitly in your report and
# ethics section.
HIGH_RISK = {"mel", "bcc"}
MEDIUM_RISK = {"akiec"}
LOW_RISK = {"bkl", "df", "nv", "vasc"}

TIER_URGENT = "urgent_care"
TIER_SOON = "see_doctor_soon"
TIER_ROUTINE = "routine_monitor"
TIER_REVIEW = "flag_for_human_review"


def class_index(code: str) -> int:
    return CLASS_CODES.index(code)


def class_from_index(idx: int) -> str:
    return CLASS_CODES[idx]
