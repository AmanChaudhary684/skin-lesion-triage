import Frame from './Frame.jsx'
import { className, tierInfo } from '../lib/tiers.js'
import { formatDate, pct } from '../lib/format.js'

// Only visible when printing (see App.css). "Save as PDF" in the print dialog gives a file
// the person can bring to an appointment.
export default function PrintSheet({ result, photoUrl, aspect, date }) {
  const tier = tierInfo(result.triage_tier)
  const top3 = Object.entries(result.all_probabilities ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  return (
    <section className="print-sheet" aria-hidden="true">
      <h1>SkinSight AI photo check</h1>
      <p className="print-date">{formatDate(date)}</p>

      <div className="frames">
        <Frame src={photoUrl} alt="" aspect={aspect} caption="Your photo" maxWidth={300} />
        <Frame
          src={`data:image/png;base64,${result.heatmap_overlay_png_base64}`}
          alt=""
          aspect={aspect}
          caption="Where the model looked"
          maxWidth={300}
        />
      </div>

      <h2>{tier.label}</h2>
      <p>{result.triage_message}</p>
      <p>
        Best match: <strong>{result.predicted_class_name}</strong> at {pct(result.confidence)}
        {result.low_confidence ? ' (low confidence)' : ''}.
      </p>
      <ul>
        {top3.map(([code, p]) => (
          <li key={code}>
            {className(code)}: {pct(p, 1)}
          </li>
        ))}
      </ul>
      {result.mock_mode && <p>Demo mode: no trained model was loaded, so this result is random.</p>}
      <p className="print-fine">
        This is a screening aid from a student project. It is not a medical device, it does not diagnose,
        and it does not replace seeing a dermatologist. Bring this page to your appointment.
      </p>
    </section>
  )
}
