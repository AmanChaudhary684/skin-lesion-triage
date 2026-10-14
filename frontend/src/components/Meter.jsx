const clamp = (n) => Math.max(0, Math.min(100, n))

// Confidence meter with a tick at the "confident enough" line (the backend's confidence floor).
export default function Meter({ value, floor }) {
  const pct = clamp(value * 100)
  const floorPct = floor == null ? null : clamp(floor * 100)
  return (
    <div
      className="meter"
      role="meter"
      aria-label="Model confidence"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className="meter-fill" style={{ width: `${pct}%` }} />
      {floorPct != null && <div className="meter-floor" style={{ left: `${floorPct}%` }} />}
    </div>
  )
}
