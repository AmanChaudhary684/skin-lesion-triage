import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../lib/imageQuality.js', async (orig) => ({
  ...(await orig()),
  analyzeImageUrl: vi.fn(async () => ({
    width: 800,
    height: 600,
    aspect: 800 / 600,
    notes: [{ id: 'ok', level: 'ok', text: 'No problems spotted with size, light or focus.' }],
  })),
}))
vi.mock('../lib/images.js', () => ({
  loadImage: vi.fn(),
  drawScaled: vi.fn(),
  makeThumb: vi.fn(async () => 'data:image/jpeg;base64,AAAA'),
}))

import App from '../App.jsx'
import { analyzeImageUrl } from '../lib/imageQuality.js'
import { STORAGE_KEY } from '../lib/history.js'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const nvResult = {
  mock_mode: false,
  predicted_class_code: 'nv',
  predicted_class_name: 'Common mole (nevus)',
  confidence: 0.97,
  low_confidence: false,
  confidence_floor: 0.85,
  all_probabilities: { akiec: 0.003, bcc: 0.004, bkl: 0.01, df: 0.002, mel: 0.01, nv: 0.97, vasc: 0.001 },
  melanoma_probability: 0.01,
  triage_tier: 'routine_monitor',
  triage_reason: 'low_risk_class',
  triage_message: 'This looks like a low-risk type. Keep an eye on it.',
  heatmap_class_code: 'nv',
  heatmap_overlay_png_base64: PNG,
}

const melResult = {
  ...nvResult,
  predicted_class_code: 'nv',
  predicted_class_name: 'Common mole (nevus)',
  confidence: 0.302,
  low_confidence: true,
  all_probabilities: { akiec: 0.05, bcc: 0.1, bkl: 0.1, df: 0.01, mel: 0.302, nv: 0.302, vasc: 0.04 },
  melanoma_probability: 0.302,
  triage_tier: 'urgent_care',
  triage_reason: 'mel_threshold',
  triage_message: 'The model flagged possible melanoma. Please see a dermatologist soon.',
  heatmap_class_code: 'mel',
}

function mockBackend({ health = { status: 'ok', mock_mode: false }, predict = nvResult, predictStatus = 200 } = {}) {
  const fn = vi.fn(async (url, init) => {
    if (url === '/api/health') return { ok: true, json: async () => health }
    if (url === '/api/predict') {
      if (predictStatus !== 200) return { ok: false, status: predictStatus, json: async () => predict }
      return { ok: true, json: async () => predict }
    }
    throw new Error('unexpected ' + url)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const photo = (name = 'arm.jpg', type = 'image/jpeg') => new File(['x'.repeat(2048)], name, { type })
const choose = (file) => fireEvent.change(screen.getByTestId('photo-input'), { target: { files: [file] } })

beforeEach(() => {
  localStorage.clear()
  let n = 0
  URL.createObjectURL = vi.fn(() => `blob:test-${++n}`)
  URL.revokeObjectURL = vi.fn()
  window.print = vi.fn()
  window.scrollTo = vi.fn()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function analyze(user) {
  choose(photo())
  await user.click(await screen.findByRole('button', { name: 'Analyze photo' }))
}

describe('check flow', () => {
  it('shows model status and the empty dropzone', async () => {
    mockBackend()
    render(<App />)
    expect(await screen.findByText('Model ready')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Check a skin lesion photo')
    expect(screen.getByRole('button', { name: /Drop a photo here/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Analyze photo' })).not.toBeInTheDocument()
  })

  it('selects a photo, runs the check, and shows a low-risk result', async () => {
    const fetchMock = mockBackend()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Model ready')

    choose(photo())
    expect(await screen.findByText(/No problems spotted/)).toBeInTheDocument()
    expect(screen.getByText('arm.jpg')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Analyze photo' }))
    const heading = await screen.findByRole('heading', { name: 'Routine: keep an eye on it' })
    await waitFor(() => expect(heading).toHaveFocus())

    const call = fetchMock.mock.calls.find(([u]) => u === '/api/predict')
    expect(call[1].method).toBe('POST')
    expect(call[1].body.get('file').name).toBe('arm.jpg')

    const match = screen.getByText('Best match').closest('.match')
    expect(within(match).getByText('Common mole (nevus)')).toBeInTheDocument()
    expect(within(match).getByText('97%')).toBeInTheDocument()
    expect(screen.queryByText('Low confidence')).not.toBeInTheDocument()
    expect(screen.queryByText(/The model is not sure/)).not.toBeInTheDocument()
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '97')
    expect(screen.getByAltText(/Heatmap showing where the model looked/)).toBeInTheDocument()
  })

  it('explains an urgent result that the model itself is unsure about', async () => {
    mockBackend({ predict: melResult })
    const user = userEvent.setup()
    render(<App />)
    await analyze(user)

    expect(await screen.findByRole('heading', { name: 'See a dermatologist soon' })).toBeInTheDocument()
    expect(screen.getByText(/The model is not sure about this photo/)).toBeInTheDocument()
    expect(screen.getByText('Low confidence')).toBeInTheDocument()
    expect(screen.getByText('Where the model looked (for melanoma)')).toBeInTheDocument()
  })

  it('rejects an unsupported file type before uploading', async () => {
    const fetchMock = mockBackend()
    render(<App />)
    choose(photo('notes.pdf', 'application/pdf'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not supported/)
    expect(fetchMock.mock.calls.some(([u]) => u === '/api/predict')).toBe(false)
  })

  it('rejects a photo over 20 MB', async () => {
    mockBackend()
    render(<App />)
    const big = photo()
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 })
    choose(big)
    expect(await screen.findByRole('alert')).toHaveTextContent(/larger than 20 MB/)
  })

  it('tells the person how to start the backend when it is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByText('Backend not reachable')).toBeInTheDocument()
    await analyze(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/uvicorn main:app --reload/)
  })

  it('shows the server message on a 400', async () => {
    mockBackend({ predict: { detail: 'Could not read the uploaded image.' }, predictStatus: 400 })
    const user = userEvent.setup()
    render(<App />)
    await analyze(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not read the uploaded image.')
  })

  it('warns in demo mode, once', async () => {
    mockBackend({ health: { status: 'ok', mock_mode: true }, predict: { ...nvResult, mock_mode: true } })
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByText('Demo model (random results)')).toBeInTheDocument()
    expect(screen.getAllByText(/without a trained model|no trained model is loaded/)).toHaveLength(1)
    await analyze(user)
    await screen.findByRole('heading', { name: 'Routine: keep an eye on it' })
    expect(screen.getAllByText(/without a trained model|no trained model is loaded/)).toHaveLength(1)
    expect(screen.getByText(/no trained model is loaded/)).toBeInTheDocument()
  })

  it('"Check another photo" returns to an empty dropzone', async () => {
    mockBackend()
    const user = userEvent.setup()
    render(<App />)
    await analyze(user)
    await screen.findByRole('heading', { name: 'Routine: keep an eye on it' })
    await user.click(screen.getByRole('button', { name: 'Check another photo' }))
    expect(screen.getByRole('button', { name: /Drop a photo here/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Routine: keep an eye on it' })).not.toBeInTheDocument()
  })

  it('a stale image check does not overwrite a newer photo', async () => {
    mockBackend()
    let release
    analyzeImageUrl.mockImplementationOnce(
      () =>
        new Promise((res) => {
          release = () =>
            res({ width: 100, height: 100, aspect: 1, notes: [{ id: 'old', level: 'warn', text: 'OLD NOTE' }] })
        }),
    )
    render(<App />)
    choose(photo('first.jpg'))
    await screen.findByText('first.jpg')
    choose(photo('second.jpg'))
    expect(await screen.findByText(/No problems spotted/)).toBeInTheDocument()
    release()
    await Promise.resolve()
    expect(screen.queryByText('OLD NOTE')).not.toBeInTheDocument()
    expect(screen.getByText('second.jpg')).toBeInTheDocument()
  })

  it('prints through the browser print dialog and renders the print sheet', async () => {
    mockBackend()
    const user = userEvent.setup()
    const { container } = render(<App />)
    await analyze(user)
    await screen.findByRole('heading', { name: 'Routine: keep an eye on it' })
    expect(container.parentElement.querySelector('.print-sheet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Save or print summary/ }))
    expect(window.print).toHaveBeenCalledTimes(1)
  })
})

describe('my checks', () => {
  async function saveOne(user, result) {
    await analyze(user)
    await screen.findByRole('heading', { name: result })
    await user.click(screen.getByRole('button', { name: 'Save to My checks' }))
    await screen.findByText('Saved to My checks on this device.')
  }

  it('saves only when asked, and keeps it on this device', async () => {
    mockBackend()
    const user = userEvent.setup()
    render(<App />)
    await analyze(user)
    await screen.findByRole('heading', { name: 'Routine: keep an eye on it' })
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Save to My checks' }))
    expect(await screen.findByRole('button', { name: 'Saved to My checks' })).toBeDisabled()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'My checks (1)' })).toBeInTheDocument()
  })

  it('shows the saved check, lets you label and delete it', async () => {
    mockBackend()
    const user = userEvent.setup()
    render(<App />)
    await saveOne(user, 'Routine: keep an eye on it')
    await user.click(screen.getByRole('button', { name: /^My checks/ }))

    const label = await screen.findByLabelText(/Label for the check from/)
    await user.type(label, 'left forearm{Enter}')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))[0].label).toBe('left forearm')

    await user.click(screen.getByRole('button', { name: /Delete the check from/ }))
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual([])
  })

  it('compares two saved checks, never more than two at once', async () => {
    mockBackend()
    const user = userEvent.setup()
    render(<App />)
    await saveOne(user, 'Routine: keep an eye on it')
    await user.click(screen.getByRole('button', { name: 'Check another photo' }))
    await saveOne(user, 'Routine: keep an eye on it')
    await user.click(screen.getByRole('button', { name: 'Check another photo' }))
    await saveOne(user, 'Routine: keep an eye on it')

    await user.click(screen.getByRole('button', { name: /^My checks/ }))
    const boxes = await screen.findAllByRole('checkbox', { name: 'Compare' })
    expect(boxes).toHaveLength(3)

    await user.click(boxes[0])
    expect(screen.getByText(/Tick Compare on one more check/)).toBeInTheDocument()
    await user.click(boxes[1])
    const compare = screen.getByRole('region', { name: 'Comparing two checks' })
    expect(within(compare).getByRole('table')).toBeInTheDocument()
    expect(within(compare).getByText(/not measurements/)).toBeInTheDocument()

    await user.click(boxes[2])
    expect(boxes.filter((b) => b.checked)).toHaveLength(2)
    expect(boxes[0]).not.toBeChecked()
  })

  it('"Delete all" asks first', async () => {
    mockBackend()
    const user = userEvent.setup()
    render(<App />)
    await saveOne(user, 'Routine: keep an eye on it')
    await user.click(screen.getByRole('button', { name: /^My checks/ }))

    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    await user.click(screen.getByRole('button', { name: 'Delete all' }))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toHaveLength(1)

    confirm.mockReturnValueOnce(true)
    await user.click(screen.getByRole('button', { name: 'Delete all' }))
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('says so when the browser will not store anything', async () => {
    mockBackend()
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<App />)
    await analyze(user)
    await screen.findByRole('heading', { name: 'Routine: keep an eye on it' })
    await user.click(screen.getByRole('button', { name: 'Save to My checks' }))
    expect(await screen.findByText(/would not let us save/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save to My checks' })).toBeEnabled()
    vi.restoreAllMocks()
  })
})
