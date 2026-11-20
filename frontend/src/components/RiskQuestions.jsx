import { BODY_SITES, CHANGED_OPTIONS, SYMPTOM_OPTIONS } from '../lib/risk.js'

function Choices({ name, legend, options, value, onChange }) {
  return (
    <fieldset className="field choice-group">
      <legend>{legend}</legend>
      <div className="choices">
        {options.map((o) => (
          <label key={o.value} className={`choice${value === o.value ? ' is-on' : ''}`}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

// Three optional questions shown once a photo is chosen. They never block "Analyze photo".
export default function RiskQuestions({ answers, onChange }) {
  const set = (key) => (value) => onChange({ ...answers, [key]: value })
  return (
    <section className="about" aria-labelledby="about-heading">
      <h3 id="about-heading">About this spot (optional)</h3>
      <p className="about-note">
        These answers stay on this device. They can only make the suggestion more cautious, never less.
      </p>

      <div className="field">
        <label htmlFor="body-site">Where on the body is it?</label>
        <select id="body-site" value={answers.site} onChange={(e) => set('site')(e.target.value)}>
          <option value="">Choose a place</option>
          {BODY_SITES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <Choices
        name="changed"
        legend="Has it changed in size, shape or colour in the past few months?"
        options={CHANGED_OPTIONS}
        value={answers.changed}
        onChange={set('changed')}
      />
      <Choices
        name="symptoms"
        legend="Does it bleed, itch or hurt, or is there a sore or crust that will not heal?"
        options={SYMPTOM_OPTIONS}
        value={answers.symptoms}
        onChange={set('symptoms')}
      />
    </section>
  )
}
