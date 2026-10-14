import { describe, expect, it } from 'vitest'
import { assessQuality, laplacianVariance, meanBrightness, THRESHOLDS } from '../lib/imageQuality.js'
import { tierInfo, className } from '../lib/tiers.js'
import { daysBetween, formatBytes, pct } from '../lib/format.js'
import {
  MAX_ITEMS,
  addCheck,
  buildCheck,
  loadHistory,
  persist,
  removeCheck,
  updateLabel,
  STORAGE_KEY,
} from '../lib/history.js'

function memoryStorage(limitBytes = Infinity) {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (v.length > limitBytes) throw new Error('QuotaExceededError')
      m.set(k, v)
    },
    removeItem: (k) => m.delete(k),
  }
}

// A deterministic pseudo-random generator so the tests do not flake.
function rng(seed = 1) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function noiseImage(w, h, mean, sigma, seed = 1) {
  const r = rng(seed)
  const g = new Float32Array(w * h)
  for (let i = 0; i < g.length; i++) g[i] = mean + (r() - 0.5) * 2 * sigma * 1.7
  return g
}

function boxBlur(g, w, h, passes) {
  let src = g
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(src.length)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx))
            const yy = Math.min(h - 1, Math.max(0, y + dy))
            s += src[yy * w + xx]
            n++
          }
        out[y * w + x] = s / n
      }
    }
    src = out
  }
  return src
}

describe('image quality', () => {
  const w = 128
  const h = 128

  it('mean brightness', () => {
    expect(meanBrightness(new Float32Array([0, 100, 200]))).toBe(100)
    expect(meanBrightness(new Float32Array([]))).toBe(0)
  })

  it('a textured photo scores high, a blurred copy of it scores much lower', () => {
    // texture: a few coarse blobs plus fine grain
    const sharp = noiseImage(w, h, 140, 20, 3)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sharp[y * w + x] += 30 * Math.sin(x / 5) * Math.cos(y / 7)
    const blurred = boxBlur(sharp, w, h, 6)
    const vs = laplacianVariance(sharp, w, h)
    const vb = laplacianVariance(blurred, w, h)
    expect(vs).toBeGreaterThan(THRESHOLDS.blurVariance * 10)
    expect(vb).toBeLessThan(vs / 20)
  })

  it('a flat image is flagged as out of focus', () => {
    const flat = new Float32Array(w * h).fill(150)
    expect(laplacianVariance(flat, w, h)).toBe(0)
    const { notes } = assessQuality({ width: 800, height: 800, gray: flat, gw: w, gh: h })
    expect(notes.map((n) => n.id)).toContain('blur')
  })

  it('a sharp, well-lit, large photo gets the all-clear', () => {
    const g = noiseImage(w, h, 140, 18, 5)
    const { notes } = assessQuality({ width: 1200, height: 900, gray: g, gw: w, gh: h })
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ id: 'ok', level: 'ok' })
  })

  it('flags small, odd-shaped, dark and washed-out photos', () => {
    const textured = (mean) => noiseImage(w, h, mean, 18, 9)
    const ids = (args) => assessQuality(args).notes.map((n) => n.id)
    expect(ids({ width: 200, height: 200, gray: textured(140), gw: w, gh: h })).toEqual(['resolution'])
    expect(ids({ width: 1600, height: 500, gray: textured(140), gw: w, gh: h })).toEqual(['shape'])
    expect(ids({ width: 500, height: 1600, gray: textured(140), gw: w, gh: h })).toEqual(['shape'])
    expect(ids({ width: 800, height: 800, gray: textured(20), gw: w, gh: h })).toEqual(['dark'])
    expect(ids({ width: 800, height: 800, gray: textured(245), gw: w, gh: h })).toEqual(['bright'])
  })

  it('does not blow up on a tiny image', () => {
    expect(laplacianVariance(new Float32Array(4), 2, 2)).toBe(Infinity)
  })
})

describe('tiers and formatting', () => {
  it('falls back to the cautious tier for an unknown key', () => {
    expect(tierInfo('something_new').tone).toBe('review')
    expect(tierInfo('urgent_care').tone).toBe('urgent')
  })
  it('class names', () => {
    expect(className('mel')).toBe('Melanoma')
    expect(className('zzz')).toBe('zzz')
  })
  it('format helpers', () => {
    expect(pct(0.1234)).toBe('12%')
    expect(pct(0.1234, 1)).toBe('12.3%')
    expect(daysBetween(0, 3 * 86400000)).toBe(3)
    expect(formatBytes(500)).toBe('1 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})

const result = {
  mock_mode: false,
  predicted_class_code: 'nv',
  predicted_class_name: 'Common mole (nevus)',
  confidence: 0.91,
  low_confidence: false,
  confidence_floor: 0.85,
  all_probabilities: { nv: 0.91, mel: 0.05 },
  melanoma_probability: 0.05,
  triage_tier: 'routine_monitor',
  triage_reason: 'low_risk_class',
  triage_message: 'ok',
}

describe('history storage', () => {
  it('saves, loads, relabels and removes', () => {
    const st = memoryStorage()
    const c = buildCheck(result, { thumb: 'data:image/jpeg;base64,AA', heat: null, aspect: 1.5 })
    const out = addCheck([], c, st)
    expect(out.ok).toBe(true)
    expect(loadHistory(st)).toHaveLength(1)
    expect(loadHistory(st)[0]).toMatchObject({ tier: 'routine_monitor', melanoma: 0.05, demo: false })

    const relabelled = updateLabel(out.items, c.id, '  left forearm  ', st)
    expect(relabelled[0].label).toBe('left forearm')
    expect(loadHistory(st)[0].label).toBe('left forearm')

    expect(removeCheck(relabelled, c.id, st)).toEqual([])
    expect(loadHistory(st)).toEqual([])
  })

  it('keeps only the newest MAX_ITEMS', () => {
    const st = memoryStorage()
    let items = []
    for (let i = 0; i < MAX_ITEMS + 3; i++) {
      items = addCheck(items, buildCheck(result, { thumb: 't', heat: null, aspect: 1 }), st).items
    }
    expect(items).toHaveLength(MAX_ITEMS)
  })

  it('drops the oldest when the browser quota is hit, and reports it', () => {
    const big = 'x'.repeat(400)
    const mk = () => ({ ...buildCheck(result, { thumb: big, heat: null, aspect: 1 }) })
    const st = memoryStorage(1500)
    let items = []
    let last
    for (let i = 0; i < 6; i++) {
      last = addCheck(items, mk(), st)
      expect(last.ok).toBe(true)
      items = last.items
    }
    expect(items.length).toBeLessThan(6)
    expect(JSON.stringify(items).length).toBeLessThanOrEqual(1500)
  })

  it('reports failure when storage is unavailable and ignores corrupt data', () => {
    expect(persist([{}], null).ok).toBe(false)
    const st = memoryStorage()
    st.setItem(STORAGE_KEY, '{not json')
    expect(loadHistory(st)).toEqual([])
    st.setItem(STORAGE_KEY, JSON.stringify([{ id: 1 }, { id: 'a', ts: 1, tier: 'x', thumb: 't' }]))
    expect(loadHistory(st)).toHaveLength(1)
  })
})
