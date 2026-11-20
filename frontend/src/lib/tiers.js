// Triage tiers. The keys are the strings the backend sends (training/labels.py).
export const TIERS = {
  urgent_care: {
    label: 'See a dermatologist soon',
    short: 'Urgent',
    tone: 'urgent',
  },
  see_doctor_soon: {
    label: 'Book a dermatologist appointment',
    short: 'Book soon',
    tone: 'soon',
  },
  routine_monitor: {
    label: 'Routine: keep an eye on it',
    short: 'Routine',
    tone: 'routine',
  },
  flag_for_human_review: {
    label: 'Needs a clinician to look',
    short: 'Needs review',
    tone: 'review',
  },
}

// How cautious each tier is, lowest to highest. "Needs a clinician" sits above routine because it
// stops short of reassuring the person, but below "book an appointment".
export const TIER_RANK = {
  routine_monitor: 0,
  flag_for_human_review: 1,
  see_doctor_soon: 2,
  urgent_care: 3,
}

// Unknown tier from the backend: fall back to the most cautious, non-alarming option.
export function tierInfo(key) {
  return TIERS[key] ?? TIERS.flag_for_human_review
}

// Names for the seven HAM10000 classes. Keep these identical to CLASS_NAMES in training/labels.py,
// so the headline and the probability list never show two names for the same class.
export const CLASS_NAMES = {
  akiec: 'Actinic keratoses / intraepithelial carcinoma',
  bcc: 'Basal cell carcinoma',
  bkl: 'Benign keratosis-like lesion',
  df: 'Dermatofibroma',
  mel: 'Melanoma',
  nv: 'Melanocytic nevus (common mole)',
  vasc: 'Vascular lesion',
}

export function className(code) {
  return CLASS_NAMES[code] ?? code
}