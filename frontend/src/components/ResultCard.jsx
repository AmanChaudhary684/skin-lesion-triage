import { useEffect, useRef } from 'react'
import Frame from './Frame.jsx'
import Meter from './Meter.jsx'
import Probabilities from './Probabilities.jsx'
import { PrinterIcon, TIER_ICONS } from './Icons.jsx'
import { tierInfo } from '../lib/tiers.js'
import { pct } from '../lib/format.js'

export default function ResultCard({
  result,
  assessed,
  photoUrl,
  aspect,
  savedId,
  saveNote,
  saving,
  onSave,
  onPrint,
  onNew,
}) {
  const headingRef = useRef(null)

  // Move focus to the result so screen-reader and keyboard users land on it.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: false })
  }, [result])

  // The tier shown is the model's tier, raised (never lowered) by red-flag answers (see lib/risk.js).
  const raised = Boolean(assessed?.raised)
  const tier = tierInfo(assessed?.tier ?? result.triage_tier)
  const modelTier = tierInfo(result.triage_tier)
  const TierIcon = TIER_ICONS[tier.tone]
  // An "unfamiliar photo" result: the photo looks unlike the training images (backend OOD check).
  const isOod = Boolean(result.out_of_distribution)
  const unreliable = isOod && result.triage_tier !== 'urgent_care' // do not present the guess as a result
  const floor = result.confidence_floor ?? null
  const lowConfidence = result.low_confidence ?? (floor != null ? result.confidence < floor : false)
  const showUnsure = lowConfidence && result.triage_tier === 'urgent_care'

  return (
    <section className="result" aria-labelledby="result-heading">
      {result.mock_mode && (
        <p className="demo-banner">
          Demo mode: no trained model is loaded, so these results are random. They only show how the
          app works.
        </p>
      )}

      <div className={`reading tone-${tier.tone}`}>
        <TierIcon className="reading-icon" />
        <div>
          <h2 id="result-heading" ref={headingRef} tabIndex={-1}>
            {tier.label}
          </h2>
          <p className="reading-text">{result.triage_message}</p>
          {raised && (
            <p className="reading-raised">
              <strong>Raised because you told us {assessed.reasons.join(' and ')}.</strong> The photo check
              alone said “{modelTier.label}”. A spot like this is worth showing to a dermatologist whatever
              a photo check says.
            </p>
          )}
          {isOod && result.triage_tier === 'urgent_care' && (
            <p className="reading-unsure">
              <strong>This photo looks different from the close-ups the model learned from.</strong> Treat
              the details below with extra caution. The melanoma warning stands, because melanoma cannot be
              ruled out.
            </p>
          )}
          {showUnsure && !isOod && (
            <p className="reading-unsure">
              <strong>The model is not sure about this photo.</strong> Its best match is{' '}
              {result.predicted_class_name.toLowerCase()} at only {pct(result.confidence)}. We still suggest a
              check because melanoma cannot be ruled out. Photos that are not close-ups like a dermatoscope
              image often cause this.
            </p>
          )}
        </div>
      </div>

      {unreliable ? (
        <div className="match match-unreliable">
          <p className="match-line">
            <span className="match-label">The model’s guess</span>
            <strong className="match-name">{result.predicted_class_name}</strong>
            <span className="match-pct">{pct(result.confidence)}</span>
            <span className="chip chip-unsure">Unfamiliar photo</span>
          </p>
          <p className="meter-note">
            This photo looks different from the close-ups the model learned from, so this guess and its
            percentage should not be relied on.
          </p>
        </div>
      ) : (
        <div className="match">
          <p className="match-line">
            <span className="match-label">Best match</span>
            <strong className="match-name">{result.predicted_class_name}</strong>
            <span className="match-pct">{pct(result.confidence)}</span>
            {lowConfidence && <span className="chip chip-unsure">Low confidence</span>}
            {isOod && <span className="chip chip-unsure">Unfamiliar photo</span>}
          </p>
          <Meter value={result.confidence} floor={floor} />
          <p className="meter-note">
            {floor != null
              ? `The tick marks ${pct(floor)}, the level the model needs to count as confident.`
              : 'This is the model’s own estimate. It is not a guarantee.'}
          </p>
        </div>
      )}

      <div className="frames">
        <Frame src={photoUrl} alt="Your photo" aspect={aspect} caption="Your photo" />
        <Frame
          src={`data:image/png;base64,${result.heatmap_overlay_png_base64}`}
          alt={`Heatmap showing where the model looked, explaining ${result.heatmap_class_code ?? 'its best match'}`}
          aspect={aspect}
          caption={
            result.heatmap_class_code && result.heatmap_class_code !== result.predicted_class_code
              ? 'Where the model looked (for melanoma)'
              : 'Where the model looked'
          }
        />
      </div>

      <details className="why" open>
        <summary>Why this result</summary>
        <p className="why-text">
          {unreliable
            ? 'The bars show how the model split its guess across seven lesion types, but for a photo this unlike its training images they are not trustworthy. '
            : 'The bars show how the model split its confidence across seven lesion types. '}
          In the heatmap, warm areas pushed the model toward its answer. It shows where the model looked. It
          is not proof that the answer is right.
        </p>
        <Probabilities probs={result.all_probabilities} topCode={result.predicted_class_code} />
      </details>

      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSave}
          disabled={Boolean(savedId) || saving}
        >
          {savedId ? 'Saved to My checks' : saving ? 'Saving…' : 'Save to My checks'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onPrint}>
          <PrinterIcon /> Save or print summary
        </button>
        <button type="button" className="text-btn" onClick={onNew}>
          Check another photo
        </button>
      </div>
      {saveNote && (
        <p className="save-note" role="status">
          {saveNote}
        </p>
      )}
      <p className="fine-print">
        This is a screening aid from a student project, and it can be wrong. If a spot changes, bleeds or
        worries you, see a dermatologist whatever this tool says. Saved checks stay in this browser only.
      </p>
    </section>
  )
}
