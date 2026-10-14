import { useRef, useState } from 'react'
import PhotoGuide from './PhotoGuide.jsx'
import { AlertIcon, CheckIcon, UploadIcon } from './Icons.jsx'
import { formatBytes } from '../lib/format.js'

export const ACCEPT = 'image/jpeg,image/png,image/webp'

export default function UploadCard({ photo, notes, assessing, loading, error, onFile, onAnalyze }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const openPicker = () => inputRef.current?.click()

  function handleChange(e) {
    const f = e.target.files?.[0]
    e.target.value = '' // lets the same file be chosen again later
    if (f) onFile(f)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) onFile(f)
  }

  function handleDragOver(e) {
    e.preventDefault()
    if (!dragging) setDragging(true)
  }

  return (
    <section className="upload" aria-labelledby="add-photo">
      <h2 id="add-photo">Add a photo</h2>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleChange}
        hidden
        data-testid="photo-input"
      />

      {!photo ? (
        <>
          <button
            type="button"
            className={`dropzone${dragging ? ' is-over' : ''}`}
            onClick={openPicker}
            onDragOver={handleDragOver}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <UploadIcon className="dropzone-icon" />
            <span className="dropzone-title">Drop a photo here or choose a file</span>
            <span className="dropzone-hint">
              JPG, PNG or WebP. One lesion, in focus, filling most of the frame.
            </span>
          </button>
          <h3 className="guide-title">Taking a good photo</h3>
          <PhotoGuide />
        </>
      ) : (
        <>
          <div className="photo-row">
            <div className="frame frame-inline">
              <img src={photo.url} alt="The photo you selected" />
            </div>
            <div className="photo-meta">
              <p className="file-name">{photo.file.name}</p>
              <p className="file-detail">
                {photo.width ? `${photo.width} × ${photo.height} px, ` : ''}
                {formatBytes(photo.file.size)}
              </p>
              <button type="button" className="text-btn" onClick={openPicker}>
                Choose a different photo
              </button>
              <ul className="notes" aria-live="polite">
                {assessing ? (
                  <li className="note note-wait">Checking the photo…</li>
                ) : (
                  notes.map((n) => (
                    <li key={n.id} className={`note note-${n.level}`}>
                      {n.level === 'ok' ? <CheckIcon /> : <AlertIcon />}
                      <span>{n.text}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
          <details className="tips">
            <summary>Photo tips</summary>
            <PhotoGuide />
          </details>
        </>
      )}

      {photo && (
        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onAnalyze}
            disabled={photo.unreadable || assessing || loading}
            aria-busy={loading}
          >
            {loading ? 'Analyzing…' : 'Analyze photo'}
          </button>
          {loading && (
            <span className="muted" role="status">
              This takes a few seconds.
            </span>
          )}
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
