import { useEffect, useState } from 'react'
import Probabilities from './Probabilities.jsx'
import { TIER_ICONS } from './Icons.jsx'
import { tierInfo } from '../lib/tiers.js'
import { daysBetween, formatDate, pct } from '../lib/format.js'

function Compare({ a, b, onClose }) {
  const days = daysBetween(a.ts, b.ts)
  const gap = days === 0 ? 'on the same day' : `${days} day${days === 1 ? '' : 's'} apart`
  const rows = [
    ['Suggested next step', (it) => tierInfo(it.tier).label],
    ['Best match', (it) => `${it.className} ${pct(it.confidence)}`],
    ['Chance of melanoma', (it) => (it.melanoma == null ? 'Not recorded' : pct(it.melanoma, 1))],
  ]
  return (
    <section className="compare" aria-labelledby="compare-heading">
      <div className="compare-head">
        <h3 id="compare-heading">Comparing two checks</h3>
        <button type="button" className="text-btn" onClick={onClose}>
          Clear selection
        </button>
      </div>
      <p className="muted">These photos were taken {gap}.</p>

      <div className="compare-grid">
        {[
          ['Earlier', a],
          ['Later', b],
        ].map(([when, it]) => (
          <figure key={it.id}>
            <div className="frame">
              <img src={it.thumb} alt={`${when} photo`} style={{ aspectRatio: String(it.aspect || 1) }} />
            </div>
            <figcaption>
              {when}: {formatDate(it.ts)}
              {it.label ? `, ${it.label}` : ''}
            </figcaption>
          </figure>
        ))}
      </div>

      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Measure</span>
            </th>
            <th scope="col">Earlier</th>
            <th scope="col">Later</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, get]) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>{get(a)}</td>
              <td>{get(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fine-print">
        These numbers come from the model. They are not measurements. Changes in light, angle or distance
        can move them, and they do not show size or growth. If you notice a change in size, shape or
        colour, show both photos to a dermatologist.
      </p>
    </section>
  )
}

function CheckItem({ item, selected, onToggle, onLabel, onRemove }) {
  const tier = tierInfo(item.tier)
  const TierIcon = TIER_ICONS[tier.tone]
  const when = formatDate(item.ts)
  return (
    <li className={`check tone-${tier.tone}`}>
      <img
        className="check-thumb"
        src={item.thumb}
        alt={`Saved photo from ${when}`}
        style={{ aspectRatio: String(item.aspect || 1) }}
      />
      <div className="check-info">
        <input
          className="check-label"
          aria-label={`Label for the check from ${when}`}
          placeholder="Add a label, such as left forearm"
          defaultValue={item.label}
          maxLength={60}
          onBlur={(e) => e.target.value !== item.label && onLabel(item.id, e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <p className="check-date">{when}</p>
        <p className="check-result">
          <span className={`chip chip-${tier.tone}`}>
            <TierIcon /> {tier.short}
          </span>
          <span>
            {item.className} {pct(item.confidence)}
            {item.lowConfidence ? ', low confidence' : ''}
          </span>
          {item.demo && <span className="chip chip-demo">Demo model</span>}
        </p>
        <details className="check-details">
          <summary>Show details</summary>
          {item.message && <p className="why-text">{item.message}</p>}
          {item.heat && (
            <div className="frame frame-small">
              <img src={item.heat} alt="Heatmap saved with this check" style={{ aspectRatio: String(item.aspect || 1) }} />
            </div>
          )}
          {item.probs && <Probabilities probs={item.probs} topCode={item.classCode} />}
        </details>
      </div>
      <div className="check-actions">
        <label className="compare-toggle">
          <input type="checkbox" checked={selected} onChange={() => onToggle(item.id)} /> Compare
        </label>
        <button
          type="button"
          className="text-btn text-btn-danger"
          onClick={() => onRemove(item.id)}
          aria-label={`Delete the check from ${when}`}
        >
          Delete
        </button>
      </div>
    </li>
  )
}

export default function HistoryView({ items, onLabel, onRemove, onClearAll, onStart }) {
  const [selected, setSelected] = useState([])

  // Forget selections for checks that were deleted.
  useEffect(() => {
    setSelected((sel) => {
      const kept = sel.filter((id) => items.some((it) => it.id === id))
      return kept.length === sel.length ? sel : kept
    })
  }, [items])

  // Picking a third check drops the oldest pick, so there are never more than two.
  const toggle = (id) =>
    setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id].slice(-2)))

  const pair = selected
    .map((id) => items.find((it) => it.id === id))
    .filter(Boolean)
    .sort((x, y) => x.ts - y.ts)

  function handleClearAll() {
    if (window.confirm('Delete all saved checks from this browser? This cannot be undone.')) {
      setSelected([])
      onClearAll()
    }
  }

  if (items.length === 0) {
    return (
      <section className="history" aria-labelledby="history-heading">
        <h2 id="history-heading">My checks</h2>
        <div className="empty">
          <p>
            Nothing saved yet. After a check, choose “Save to My checks” to keep it on this device and
            compare photos over time.
          </p>
          <button type="button" className="btn btn-primary" onClick={onStart}>
            Start a check
          </button>
        </div>
        <p className="privacy-note">
          Saved checks stay in this browser on this device. Nothing is uploaded.
        </p>
      </section>
    )
  }

  return (
    <section className="history" aria-labelledby="history-heading">
      <div className="history-head">
        <h2 id="history-heading">My checks</h2>
        <button type="button" className="text-btn text-btn-danger" onClick={handleClearAll}>
          Delete all
        </button>
      </div>
      <p className="privacy-note">
        Saved checks stay in this browser on this device. Nothing is uploaded. Clearing your browser data
        removes them.
      </p>

      {pair.length === 2 ? (
        <Compare a={pair[0]} b={pair[1]} onClose={() => setSelected([])} />
      ) : (
        items.length > 1 && (
          <p className="muted" role="status">
            {selected.length === 1
              ? 'Tick Compare on one more check to see the two side by side.'
              : 'Tick Compare on two checks to see them side by side.'}
          </p>
        )
      )}

      <ol className="checks">
        {items.map((it) => (
          <CheckItem
            key={it.id}
            item={it}
            selected={selected.includes(it.id)}
            onToggle={toggle}
            onLabel={onLabel}
            onRemove={onRemove}
          />
        ))}
      </ol>
    </section>
  )
}
