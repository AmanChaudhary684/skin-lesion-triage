import Frame from './Frame.jsx'
import { className, tierInfo } from '../lib/tiers.js'
import { answerRows } from '../lib/risk.js'
import { formatDate, pct } from '../lib/format.js'

// Only visible when printing (see App.css). "Save as PDF" in the print dialog gives a file the person can
// bring to an appointment: what the model found, what the person reported, and earlier checks of the same spot.
export default function PrintSheet({ result, assessed, answers, earlier = [], photoUrl, aspect, date }) {
  const shown = tierInfo(assessed?.tier ?? result.triage_tier)
  const modelTier = tierInfo(result.triage_tier)
  const raised = Boolean(assessed?.raised)
  const isOod = Boolean(result.out_of_distribution)
  const rows = Object.entries(result.all_probabilities ?? {}).sort((a, b) => b[1] - a[1])
  const melanoma = result.melanoma_probability ?? result.all_probabilities?.mel ?? null

  return (
    <section className="print-sheet" aria-hidden="true">
      <h1>SkinSight AI summary</h1>
      <p className="print-date">{formatDate(date)}</p>

      <div className="frames">
        <Frame src={photoUrl} alt="" aspect={aspect} caption="Photo" maxWidth={300} />
        <Frame
          src={`data:image/png;base64,${result.heatmap_overlay_png_base64}`}
          alt=""
          aspect={aspect}
          caption="Where the model looked"
          maxWidth={300}
        />
      </div>

      <h2>Suggested next step: {shown.label}</h2>
      <p>{result.triage_message}</p>
      {raised && (
        <p>
          <strong>Raised from “{modelTier.label}”</strong> because the person reported that{' '}
          {assessed.reasons.join(' and ')}.
        </p>
      )}
      {isOod && (
        <p>
          <strong>Unfamiliar photo.</strong> The image looks different from the close-up lesion photos the
          model learned from, so the model’s guess below is not reliable.
        </p>
      )}

      <div className="print-block">
        <h2>What the person reported</h2>
        <table className="print-table">
          <tbody>
            {answerRows(answers).map(([q, a]) => (
              <tr key={q}>
                <th scope="row">{q}</th>
                <td>{a}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="print-block">
        <h2>What the model found</h2>
        <p>
          Best match: <strong>{result.predicted_class_name}</strong> at {pct(result.confidence)}
          {result.low_confidence ? ' (low confidence)' : ''}
          {isOod ? ' (not reliable for this photo)' : ''}.
          {melanoma != null && (
            <>
              {' '}
              Chance of melanoma: <strong>{pct(melanoma, 1)}</strong>.
            </>
          )}
        </p>
        <table className="print-table">
          <thead>
            <tr>
              <th scope="col">Lesion type</th>
              <th scope="col">Model confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([code, p]) => (
              <tr key={code}>
                <td>{className(code)}</td>
                <td>{pct(p, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {earlier.length > 0 && (
        <div className="print-block">
          <h2>Earlier checks of the same body site</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Suggested next step</th>
                <th scope="col">Chance of melanoma</th>
              </tr>
            </thead>
            <tbody>
              {earlier.map((it) => (
                <tr key={it.id}>
                  <td>{formatDate(it.ts)}</td>
                  <td>{tierInfo(it.tier).label}</td>
                  <td>{it.melanoma == null ? 'Not recorded' : pct(it.melanoma, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            These numbers come from the model, not from measurements. Changes in light, angle or distance
            move them, and they do not show size or growth.
          </p>
        </div>
      )}

      {result.mock_mode && <p>Demo mode: no trained model was loaded, so this result is random.</p>}
      <p className="print-fine">
        This is a screening aid from a student project. It is not a medical device, it does not diagnose,
        and it does not replace seeing a dermatologist. The model was trained and tested on dermatoscope
        images, so photos taken with a phone may be less reliable. Bring this page to your appointment.
      </p>
    </section>
  )
}
