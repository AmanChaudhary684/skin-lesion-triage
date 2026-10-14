// "My checks": saved results kept ONLY in this browser (localStorage). Nothing is uploaded.
export const STORAGE_KEY = 'skinsight.history.v1'
export const MAX_ITEMS = 30

function getStorage() {
  try {
    return window.localStorage
  } catch {
    return null // blocked (e.g. some private modes)
  }
}

function isValid(item) {
  return (
    item &&
    typeof item === 'object' &&
    typeof item.id === 'string' &&
    typeof item.ts === 'number' &&
    typeof item.tier === 'string' &&
    typeof item.thumb === 'string'
  )
}

export function loadHistory(storage = getStorage()) {
  if (!storage) return []
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isValid) : []
  } catch {
    return []
  }
}

// Write the list. If the browser's quota is hit, drop the oldest items until it fits.
export function persist(items, storage = getStorage()) {
  if (!storage) return { ok: false, items, trimmed: 0 }
  let list = items
  let trimmed = 0
  for (;;) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(list))
      return { ok: true, items: list, trimmed }
    } catch {
      if (list.length <= 1) return { ok: false, items, trimmed: 0 }
      list = list.slice(0, -1) // list is newest first, so this removes the oldest
      trimmed += 1
    }
  }
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function buildCheck(result, { thumb, heat, aspect }) {
  return {
    id: newId(),
    ts: Date.now(),
    label: '',
    tier: result.triage_tier,
    reason: result.triage_reason ?? null,
    classCode: result.predicted_class_code,
    className: result.predicted_class_name,
    confidence: result.confidence,
    melanoma: result.melanoma_probability ?? result.all_probabilities?.mel ?? null,
    probs: result.all_probabilities,
    lowConfidence: Boolean(result.low_confidence),
    floor: result.confidence_floor ?? null,
    message: result.triage_message,
    aspect,
    thumb,
    heat: heat ?? null,
    demo: Boolean(result.mock_mode),
  }
}

export function addCheck(items, check, storage) {
  const next = [check, ...items].slice(0, MAX_ITEMS)
  const out = persist(next, storage)
  return out.ok ? { ...out, trimmed: out.trimmed + (next.length < items.length + 1 ? 1 : 0) } : out
}

export function updateLabel(items, id, label, storage) {
  const next = items.map((it) => (it.id === id ? { ...it, label: label.trim().slice(0, 60) } : it))
  persist(next, storage)
  return next
}

export function removeCheck(items, id, storage) {
  const next = items.filter((it) => it.id !== id)
  persist(next, storage)
  return next
}

export function clearHistory(storage = getStorage()) {
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    /* nothing to do */
  }
  return []
}
