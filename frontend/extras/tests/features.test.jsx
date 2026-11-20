import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../lib/imageQuality.js', async (orig) => ({
  ...(await orig()),
  analyzeImageUrl: vi.fn(async () => ({
    width: 800, height: 600, aspect: 800 / 600,
    notes: [{ id: 'ok', level: 'ok', text: 'No problems spotted with size, light or focus.' }],
  })),
}))
vi.mock('../lib/images.js', () => ({
  loadImage: vi.fn(), drawScaled: vi.fn(), makeThumb: vi.fn(async () => 'data:image/jpeg;base64,AAAA'),
}))

import App from '../App.jsx'
import { STORAGE_KEY } from '../lib/history.js'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const OOD_MESSAGE = 'This photo looks different from the close-up lesion images this model learned from, so its answer would not be reliable.'

const nv = {
  mock_mode: false, predicted_class_code: 'nv', predicted_class_name: 'Melanocytic nevus (common mole)',
  confidence: 0.95, low_confidence: false, confidence_floor: 0.85,
  all_probabilities: { akiec: 0.007, bcc: 0.008, bkl: 0.004, df: 0.006, mel: 0.011, nv: 0.952, vasc: 0.012 },
  melanoma_probability: 0.011, triage_tier: 'routine_monitor', triage_reason: 'low_risk_class',
  triage_message: 'This pattern is most often benign. Keep an eye on it and mention it at your next routine check-up.',
  heatmap_class_code: 'nv', heatmap_overlay_png_base64: PNG,
  ood_checked: true, out_of_distribution: false, ood_score: 40.1, ood_threshold: 60.2,
}
const ood = { ...nv, out_of_distribution: true, ood_score: 99.9, triage_tier: 'flag_for_human_review', triage_reason: 'out_of_distribution', triage_message: OOD_MESSAGE }
const oodUrgent = {
  ...ood, confidence: 0.4, low_confidence: true, melanoma_probability: 0.2, triage_tier: 'urgent_care',
  triage_reason: 'mel_threshold', triage_message: 'The chance of melanoma is high enough that a dermatologist check is recommended.',
}

function mockBackend(predict) {
  vi.stubGlobal('fetch', vi.fn(async (url) =>
    url === '/api/health' ? { ok: true, json: async () => ({ status: 'ok', mock_mode: false }) } : { ok: true, json: async () => predict }))
}
const photo = () => new File(['x'.repeat(2048)], 'spot.jpg', { type: 'image/jpeg' })
const choose = () => fireEvent.change(screen.getByTestId('photo-input'), { target: { files: [photo()] } })

beforeEach(() => {
  localStorage.clear()
  let n = 0
  URL.createObjectURL = vi.fn(() => `blob:t-${++n}`); URL.revokeObjectURL = vi.fn()
  window.print = vi.fn(); window.scrollTo = vi.fn()
})
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

async function analyze(user) {
  choose()
  await user.click(await screen.findByRole('button', { name: 'Analyze photo' }))
}
async function answer(user, { site, changed, symptoms } = {}) {
  choose()
  await screen.findByText(/No problems spotted/)
  if (site) await user.selectOptions(screen.getByLabelText('Where on the body is it?'), site)
  if (changed) await user.click(within(screen.getByRole('group', { name: /changed in size/ })).getByRole('radio', { name: changed }))
  if (symptoms) await user.click(within(screen.getByRole('group', { name: /bleed, itch or hurt/ })).getByRole('radio', { name: symptoms }))
  await user.click(screen.getByRole('button', { name: 'Analyze photo' }))
}

describe('optional questions', () => {
  it('appear once a photo is chosen, and never block the check', async () => {
    mockBackend(nv)
    const user = userEvent.setup()
    render(<App />)
    expect(screen.queryByText('About this spot (optional)')).not.toBeInTheDocument()
    choose()
    expect(await screen.findByText('About this spot (optional)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Analyze photo' })).toBeEnabled() // nothing answered
    await user.click(screen.getByRole('button', { name: 'Analyze photo' }))
    expect(await screen.findByRole('heading', { name: 'Routine: keep an eye on it' })).toBeInTheDocument()
    expect(screen.queryByText(/Raised because/)).not.toBeInTheDocument()
  })

  it('"changed: yes" raises a routine result, says why, and keeps the model\'s own message', async () => {
    mockBackend(nv)
    const user = userEvent.setup()
    render(<App />)
    await answer(user, { site: 'arm', changed: 'Yes' })
    expect(await screen.findByRole('heading', { name: 'Book a dermatologist appointment' })).toBeInTheDocument()
    expect(screen.getByText(/Raised because you told us the spot has changed/)).toBeInTheDocument()
    expect(screen.getByText(/Routine: keep an eye on it/, { selector: '.reading-raised' })).toBeInTheDocument()
    expect(within(document.querySelector('.reading')).getByText(nv.triage_message)).toBeInTheDocument()
  })

  it('"No" and "Not sure" do not change the result', async () => {
    mockBackend(nv)
    const user = userEvent.setup()
    render(<App />)
    await answer(user, { changed: 'Not sure', symptoms: 'No' })
    expect(await screen.findByRole('heading', { name: 'Routine: keep an eye on it' })).toBeInTheDocument()
  })

  it('saves what was shown AND what the model said, plus the site', async () => {
    mockBackend(nv)
    const user = userEvent.setup()
    render(<App />)
    await answer(user, { site: 'foot', symptoms: 'Yes' })
    await screen.findByRole('heading', { name: 'Book a dermatologist appointment' })
    await user.click(screen.getByRole('button', { name: 'Save to My checks' }))
    await screen.findByText('Saved to My checks on this device.')
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))[0]
    expect(saved).toMatchObject({ tier: 'see_doctor_soon', modelTier: 'routine_monitor', raisedFrom: 'routine_monitor', site: 'foot', symptoms: 'yes', ood: false })
    await user.click(screen.getByRole('button', { name: /^My checks/ }))
    expect((await screen.findAllByText(/Foot, including sole or nails/)).length).toBeGreaterThan(0)
  })

  it('are cleared for the next photo', async () => {
    mockBackend(nv)
    const user = userEvent.setup()
    render(<App />)
    await answer(user, { site: 'arm', changed: 'Yes' })
    await screen.findByRole('heading', { name: 'Book a dermatologist appointment' })
    await user.click(screen.getByRole('button', { name: 'Check another photo' }))
    choose()
    await screen.findByText(/No problems spotted/)
    expect(screen.getByLabelText('Where on the body is it?')).toHaveValue('')
    expect(within(screen.getByRole('group', { name: /changed in size/ })).getByRole('radio', { name: 'Yes' })).not.toBeChecked()
  })
})

describe('unfamiliar photo', () => {
  it('is shown as "needs a clinician", with the model\'s guess marked unreliable and no confidence meter', async () => {
    mockBackend(ood)
    const user = userEvent.setup()
    render(<App />)
    await analyze(user)
    expect(await screen.findByRole('heading', { name: 'Needs a clinician to look' })).toBeInTheDocument()
    expect(within(document.querySelector('.reading')).getByText(OOD_MESSAGE, { exact: false })).toBeInTheDocument()
    const match = screen.getByText('The model’s guess').closest('.match')
    expect(within(match).getByText('Unfamiliar photo')).toBeInTheDocument()
    expect(screen.queryByText('Best match')).not.toBeInTheDocument()
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
  })

  it('keeps an urgent melanoma flag urgent, with the extra caution', async () => {
    mockBackend(oodUrgent)
    const user = userEvent.setup()
    render(<App />)
    await analyze(user)
    expect(await screen.findByRole('heading', { name: 'See a dermatologist soon' })).toBeInTheDocument()
    expect(screen.getByText(/looks different from the close-ups the model learned from/)).toBeInTheDocument()
    expect(screen.getByRole('meter')).toBeInTheDocument()
    expect(screen.getAllByText('Unfamiliar photo').length).toBeGreaterThan(0)
  })

  it('is raised by a red-flag answer, and says the photo was unfamiliar in My checks', async () => {
    mockBackend(ood)
    const user = userEvent.setup()
    render(<App />)
    await answer(user, { site: 'back', changed: 'Yes' })
    expect(await screen.findByRole('heading', { name: 'Book a dermatologist appointment' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save to My checks' }))
    await screen.findByText('Saved to My checks on this device.')
    await user.click(screen.getByRole('button', { name: /^My checks/ }))
    expect(await screen.findByText(/Unfamiliar photo, so the model’s guess is not reliable/)).toBeInTheDocument()
  })
})

describe('summary sheet and compare', () => {
  it('lists the answers, and earlier checks of the same body site only', async () => {
    mockBackend(nv)
    const user = userEvent.setup()
    const { container } = render(<App />)
    for (const site of ['arm', 'leg']) {
      await answer(user, { site })
      await screen.findByRole('heading', { name: 'Routine: keep an eye on it' })
      await user.click(screen.getByRole('button', { name: 'Save to My checks' }))
      await screen.findByText('Saved to My checks on this device.')
      await user.click(screen.getByRole('button', { name: 'Check another photo' }))
    }
    await answer(user, { site: 'arm', changed: 'No' })
    await screen.findByRole('heading', { name: 'Routine: keep an eye on it' })
    const sheet = container.parentElement.querySelector('.print-sheet')
    expect(sheet).toHaveTextContent('What the person reported')
    expect(sheet).toHaveTextContent('Body site')
    expect(sheet).toHaveTextContent('Arm')
    expect(sheet).toHaveTextContent('Earlier checks of the same body site')
    expect([...sheet.querySelectorAll('tr')].filter((r) => /Routine: keep an eye on it/.test(r.textContent))).toHaveLength(1) // arm only, not leg
    expect(sheet).toHaveTextContent('Chance of melanoma: 1.1%')
  })

  it('has no "earlier checks" section when no site was chosen', async () => {
    mockBackend(nv)
    const user = userEvent.setup()
    const { container } = render(<App />)
    await analyze(user)
    await screen.findByRole('heading', { name: 'Routine: keep an eye on it' })
    expect(container.parentElement.querySelector('.print-sheet')).not.toHaveTextContent('Earlier checks')
  })

  it('adds body site and reported change to the compare table', async () => {
    mockBackend(nv)
    const user = userEvent.setup()
    render(<App />)
    for (const changed of ['Yes', 'No']) {
      await answer(user, { site: 'hand', changed })
      await user.click(await screen.findByRole('button', { name: 'Save to My checks' }))
      await screen.findByText('Saved to My checks on this device.')
      await user.click(screen.getByRole('button', { name: 'Check another photo' }))
    }
    await user.click(screen.getByRole('button', { name: /^My checks/ }))
    for (const box of await screen.findAllByRole('checkbox', { name: 'Compare' })) await user.click(box)
    const table = within(screen.getByRole('region', { name: 'Comparing two checks' })).getByRole('table')
    expect(within(table).getByText('Body site')).toBeInTheDocument()
    expect(within(table).getAllByText('Hand, including palm or nails')).toHaveLength(2)
    expect(within(table).getByText('You said it had changed')).toBeInTheDocument()
  })
})
