// Optional questions about the spot, and the one safety rule they feed.
//
// The rule is deliberately one-directional: what the person tells us can only make the suggestion MORE
// cautious, never less. It runs in the browser on top of the model's tier, and it is NOT part of the
// pipeline that was evaluated in the training notebook, so the notebook's numbers describe the model and
// its tiers only. Answers stay in this browser (they are not sent to the backend).
import { TIER_RANK } from './tiers.js'

export const EMPTY_ANSWERS = { site: '', changed: '', symptoms: '' }

// Wording matches how people describe places on the body. The value is a stable code.
export const BODY_SITES = [
  { value: 'face', label: 'Face' },
  { value: 'scalp', label: 'Scalp' },
  { value: 'ear', label: 'Ear' },
  { value: 'neck', label: 'Neck' },
  { value: 'chest', label: 'Chest' },
  { value: 'abdomen', label: 'Abdomen' },
  { value: 'back', label: 'Back' },
  { value: 'arm', label: 'Arm' },
  { value: 'hand', label: 'Hand, including palm or nails' },
  { value: 'leg', label: 'Leg' },
  { value: 'foot', label: 'Foot, including sole or nails' },
  { value: 'genital', label: 'Genital area' },
  { value: 'other', label: 'Somewhere else' },
]

export const CHANGED_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure' },
]

export const SYMPTOM_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

// The least cautious tier a red-flag answer is allowed to leave the person with.
export const RED_FLAG_FLOOR = 'see_doctor_soon'

const labelOf = (list, value) => list.find((o) => o.value === value)?.label ?? ''
export const siteLabel = (value) => labelOf(BODY_SITES, value)

// Plain-language reasons for each red-flag answer ("because you told us ...").
export function redFlagReasons(answers) {
  const a = answers ?? EMPTY_ANSWERS
  const out = []
  if (a.changed === 'yes') out.push('the spot has changed in size, shape or colour')
  if (a.symptoms === 'yes') out.push('it bleeds, itches, hurts, or has a sore or crust that will not heal')
  return out
}

// Returns { tier, raised, reasons, from }. `tier` is never less cautious than the model's tier.
export function applyRedFlags(modelTier, answers) {
  const reasons = redFlagReasons(answers)
  if (reasons.length === 0) return { tier: modelTier, raised: false, reasons, from: null }
  // An unknown tier from the backend is treated like "needs review" (see tierInfo in tiers.js).
  const rank = TIER_RANK[modelTier] ?? TIER_RANK.flag_for_human_review
  if (rank >= TIER_RANK[RED_FLAG_FLOOR]) return { tier: modelTier, raised: false, reasons, from: null }
  return { tier: RED_FLAG_FLOOR, raised: true, reasons, from: modelTier }
}

// Rows for the summary sheet and the details view: [question, answer]. Blank answers say so.
export function answerRows(answers) {
  const a = answers ?? EMPTY_ANSWERS
  const changed = { yes: 'Yes', no: 'No', unsure: 'Not sure' }[a.changed]
  const symptoms = { yes: 'Yes', no: 'No' }[a.symptoms]
  return [
    ['Body site', siteLabel(a.site) || 'Not answered'],
    ['Changed in size, shape or colour recently', changed || 'Not answered'],
    ['Bleeds, itches, hurts, or a sore that will not heal', symptoms || 'Not answered'],
  ]
}

export const hasAnyAnswer = (answers) => Boolean(answers && (answers.site || answers.changed || answers.symptoms))
