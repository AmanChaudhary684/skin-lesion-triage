import { useCallback, useEffect, useRef, useState } from 'react'
import UploadCard from './components/UploadCard.jsx'
import ResultCard from './components/ResultCard.jsx'
import HistoryView from './components/HistoryView.jsx'
import PrintSheet from './components/PrintSheet.jsx'
import { Mark } from './components/Icons.jsx'
import { analyzeImageUrl } from './lib/imageQuality.js'
import { makeThumb } from './lib/images.js'
import {
  addCheck,
  buildCheck,
  clearHistory,
  loadHistory,
  removeCheck,
  updateLabel,
} from './lib/history.js'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 20 * 1024 * 1024

const HEALTH_TEXT = {
  checking: 'Checking the model…',
  ready: 'Model ready',
  demo: 'Demo model (random results)',
  offline: 'Backend not reachable',
}

export default function App() {
  const [view, setView] = useState('check') // 'check' | 'history'
  const [photo, setPhoto] = useState(null) // { file, url, width, height, aspect, unreadable }
  const [notes, setNotes] = useState([])
  const [assessing, setAssessing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [savedId, setSavedId] = useState(null)
  const [saveNote, setSaveNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState(() => loadHistory())
  const [health, setHealth] = useState('checking')

  // Guards against a slow image check finishing after a newer photo was chosen.
  const assessToken = useRef(0)
  const photoUrlRef = useRef(null)

  // Is the backend up, and is it running the real model or the random demo?
  useEffect(() => {
    let alive = true
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad status'))))
      .then((h) => {
        if (!alive) return
        setHealth(h.mock_mode || h.model_loaded === false ? 'demo' : 'ready')
      })
      .catch(() => alive && setHealth('offline'))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    document.title = view === 'history' ? 'My checks · SkinSight AI' : 'SkinSight AI · Photo check'
  }, [view])

  // Free the object URL when the photo changes or the page closes.
  useEffect(() => {
    const prev = photoUrlRef.current
    photoUrlRef.current = photo?.url ?? null
    if (prev && prev !== photo?.url) URL.revokeObjectURL(prev)
  }, [photo])
  useEffect(() => () => photoUrlRef.current && URL.revokeObjectURL(photoUrlRef.current), [])

  const resetOutcome = () => {
    setResult(null)
    setError('')
    setSavedId(null)
    setSaveNote('')
  }

  const handleFile = useCallback(async (file) => {
    resetOutcome()
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('That file type is not supported. Please choose a JPG, PNG or WebP photo.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('That photo is larger than 20 MB. Please choose a smaller one.')
      return
    }

    const token = ++assessToken.current
    const url = URL.createObjectURL(file)
    setPhoto({ file, url, width: 0, height: 0, aspect: 1, unreadable: false })
    setNotes([])
    setAssessing(true)
    try {
      const info = await analyzeImageUrl(url)
      if (token !== assessToken.current) return
      setPhoto({ file, url, width: info.width, height: info.height, aspect: info.aspect, unreadable: false })
      setNotes(info.notes)
    } catch {
      if (token !== assessToken.current) return
      setPhoto({ file, url, width: 0, height: 0, aspect: 1, unreadable: true })
      setNotes([
        { id: 'unreadable', level: 'warn', text: 'This file could not be read as an image. Please choose another photo.' },
      ])
    } finally {
      if (token === assessToken.current) setAssessing(false)
    }
  }, [])

  async function handleAnalyze() {
    if (!photo || loading) return
    resetOutcome()
    setLoading(true)
    try {
      const body = new FormData()
      body.append('file', photo.file)
      const res = await fetch('/api/predict', { method: 'POST', body })
      if (!res.ok) {
        let detail = ''
        try {
          const j = await res.json()
          if (typeof j.detail === 'string') detail = j.detail
        } catch {
          /* no JSON body */
        }
        throw new Error(detail || `The server answered with an error (${res.status}).`)
      }
      setResult(await res.json())
    } catch (e) {
      if (e instanceof TypeError) {
        setError(
          'Could not reach the backend. Start it with “python -m uvicorn main:app --reload” in the backend folder, then try again.',
        )
      } else {
        setError(e.message || 'Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!result || !photo || savedId || saving) return
    setSaving(true)
    setSaveNote('')
    try {
      const thumb = await makeThumb(photo.url, 360)
      const heat = await makeThumb(`data:image/png;base64,${result.heatmap_overlay_png_base64}`, 160)
      if (!thumb) {
        setSaveNote('Could not make a small copy of the photo, so nothing was saved.')
        return
      }
      const check = buildCheck(result, { thumb, heat, aspect: photo.aspect })
      const out = addCheck(history, check)
      if (!out.ok) {
        setSaveNote('This browser would not let us save. Private mode or a full disk can cause that.')
        return
      }
      setHistory(out.items)
      setSavedId(check.id)
      setSaveNote(
        out.trimmed > 0
          ? `Saved. The oldest ${out.trimmed === 1 ? 'check was' : `${out.trimmed} checks were`} removed to make room.`
          : 'Saved to My checks on this device.',
      )
    } finally {
      setSaving(false)
    }
  }

  function handleNew() {
    assessToken.current += 1
    setPhoto(null)
    setNotes([])
    setAssessing(false)
    resetOutcome()
    window.scrollTo?.({ top: 0 })
  }

  const goCheck = () => setView('check')

  return (
    <>
      <div className="app-chrome">
        <a className="skip-link" href="#main">
          Skip to content
        </a>

        <header className="site-header">
          <div className="site-header-inner">
            <p className="wordmark">
              <Mark className="wordmark-icon" />
              SkinSight AI
            </p>
            <p className={`health health-${health}`} role="status">
              <span className="health-dot" aria-hidden="true" />
              {HEALTH_TEXT[health]}
            </p>
          </div>
          <nav className="tabs" aria-label="Sections">
            <button
              type="button"
              className="tab"
              aria-current={view === 'check' ? 'page' : undefined}
              onClick={() => setView('check')}
            >
              New check
            </button>
            <button
              type="button"
              className="tab"
              aria-current={view === 'history' ? 'page' : undefined}
              onClick={() => setView('history')}
            >
              My checks{history.length > 0 ? ` (${history.length})` : ''}
            </button>
          </nav>
        </header>

        <main id="main" className="page">
          {view === 'check' ? (
            <>
              {result ? (
                <h1 className="sr-only">Photo check result</h1>
              ) : (
                <div className="intro">
                  <h1>Check a skin lesion photo</h1>
                  <p>
                    A student prototype that sorts a close-up photo into a suggested next step and shows what the
                    model looked at. It does not diagnose.
                  </p>
                </div>
              )}

              {health === 'demo' && !result && (
                <p className="demo-banner">
                  The backend is running without a trained model, so results are random. Put the checkpoint in
                  the backend folder and restart it.
                </p>
              )}

              {!result && (
                <UploadCard
                  photo={photo}
                  notes={notes}
                  assessing={assessing}
                  loading={loading}
                  error={error}
                  onFile={handleFile}
                  onAnalyze={handleAnalyze}
                />
              )}

              {result && photo && (
                <ResultCard
                  result={result}
                  photoUrl={photo.url}
                  aspect={photo.aspect}
                  savedId={savedId}
                  saveNote={saveNote}
                  saving={saving}
                  onSave={handleSave}
                  onPrint={() => window.print()}
                  onNew={handleNew}
                />
              )}
            </>
          ) : (
            <HistoryView
              items={history}
              onLabel={(id, label) => setHistory((h) => updateLabel(h, id, label))}
              onRemove={(id) => setHistory((h) => removeCheck(h, id))}
              onClearAll={() => setHistory(clearHistory())}
              onStart={goCheck}
            />
          )}
        </main>

        <footer className="site-footer">
          <p>
            SkinSight AI is a student project for the course Applications of AI. It is a screening aid, not a
            medical device, and it does not replace a dermatologist.
          </p>
        </footer>
      </div>

      {result && photo && (
        <PrintSheet result={result} photoUrl={photo.url} aspect={photo.aspect} date={Date.now()} />
      )}
    </>
  )
}
