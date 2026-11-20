import { describe, expect, it } from 'vitest'
import { EMPTY_ANSWERS, answerRows, applyRedFlags, hasAnyAnswer, redFlagReasons } from '../lib/risk.js'
import { TIER_RANK } from '../lib/tiers.js'

const TIERS = Object.keys(TIER_RANK)
const ANSWER_SETS = []
for (const changed of ['', 'yes', 'no', 'unsure'])
  for (const symptoms of ['', 'yes', 'no'])
    for (const site of ['', 'arm']) ANSWER_SETS.push({ site, changed, symptoms })

describe('red-flag rule', () => {
  it('leaves the tier alone when nothing is reported', () => {
    expect(applyRedFlags('routine_monitor', EMPTY_ANSWERS)).toEqual({
      tier: 'routine_monitor', raised: false, reasons: [], from: null,
    })
    expect(applyRedFlags('routine_monitor', { site: 'arm', changed: 'no', symptoms: 'no' }).raised).toBe(false)
    expect(applyRedFlags('routine_monitor', { changed: 'unsure' }).raised).toBe(false)
    expect(applyRedFlags('routine_monitor', undefined).raised).toBe(false)
  })

  it('raises "routine" to "see doctor soon" when the spot has changed or has symptoms', () => {
    const a = applyRedFlags('routine_monitor', { ...EMPTY_ANSWERS, changed: 'yes' })
    expect(a).toMatchObject({ tier: 'see_doctor_soon', raised: true, from: 'routine_monitor' })
    expect(a.reasons).toEqual(['the spot has changed in size, shape or colour'])
    const b = applyRedFlags('routine_monitor', { ...EMPTY_ANSWERS, symptoms: 'yes' })
    expect(b).toMatchObject({ tier: 'see_doctor_soon', raised: true })
    const both = applyRedFlags('routine_monitor', { ...EMPTY_ANSWERS, changed: 'yes', symptoms: 'yes' })
    expect(both.reasons).toHaveLength(2)
  })

  it('raises "needs a clinician" too, and treats an unknown tier like it', () => {
    expect(applyRedFlags('flag_for_human_review', { changed: 'yes' }).tier).toBe('see_doctor_soon')
    expect(applyRedFlags('something_new', { changed: 'yes' })).toMatchObject({ tier: 'see_doctor_soon', raised: true })
  })

  it('never touches a result that is already "see doctor soon" or urgent', () => {
    for (const t of ['see_doctor_soon', 'urgent_care']) {
      const r = applyRedFlags(t, { changed: 'yes', symptoms: 'yes' })
      expect(r.tier).toBe(t)
      expect(r.raised).toBe(false)
      expect(r.reasons).toHaveLength(2) // still reported, so the summary can list them
    }
  })

  it('can NEVER make the suggestion less cautious (every tier x every answer combination)', () => {
    for (const t of TIERS)
      for (const a of ANSWER_SETS) {
        const out = applyRedFlags(t, a)
        expect(TIER_RANK[out.tier]).toBeGreaterThanOrEqual(TIER_RANK[t])
        if (out.raised) expect(out.tier).toBe('see_doctor_soon')
      }
  })

  it('describes the answers, saying so when one is missing', () => {
    expect(answerRows(EMPTY_ANSWERS).map(([, a]) => a)).toEqual(['Not answered', 'Not answered', 'Not answered'])
    const rows = answerRows({ site: 'foot', changed: 'unsure', symptoms: 'no' })
    expect(rows[0]).toEqual(['Body site', 'Foot, including sole or nails'])
    expect(rows[1][1]).toBe('Not sure')
    expect(rows[2][1]).toBe('No')
    expect(hasAnyAnswer(EMPTY_ANSWERS)).toBe(false)
    expect(hasAnyAnswer({ site: 'arm' })).toBe(true)
    expect(redFlagReasons(null)).toEqual([])
  })
})
