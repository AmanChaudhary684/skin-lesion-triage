import { className } from '../lib/tiers.js'
import { pct } from '../lib/format.js'

// How the model split its confidence across the seven lesion types (they add up to 100%).
export default function Probabilities({ probs, topCode }) {
  const rows = Object.entries(probs ?? {}).sort((a, b) => b[1] - a[1])
  return (
    <ul className="bars" aria-label="Model confidence for each lesion type">
      {rows.map(([code, p]) => (
        <li key={code} className={code === topCode ? 'is-top' : undefined}>
          <div className="bar-line">
            <span className="bar-name">
              {className(code)} <span className="bar-code">{code}</span>
            </span>
            <span className="bar-value">{pct(p, 1)}</span>
          </div>
          <div className="bar-track" aria-hidden="true">
            <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, p * 100))}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
