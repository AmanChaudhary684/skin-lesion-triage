import { FocusIcon, Mark, SunIcon, TargetIcon } from './Icons.jsx'

const TIPS = [
  {
    Icon: Mark,
    title: 'Fill the frame',
    text: 'Get close so the lesion takes up most of the photo.',
  },
  {
    Icon: SunIcon,
    title: 'Light it evenly',
    text: 'Use bright, even light. Avoid flash glare and shadows.',
  },
  {
    Icon: FocusIcon,
    title: 'Keep it sharp',
    text: 'Hold steady and tap to focus before you shoot.',
  },
  {
    Icon: TargetIcon,
    title: 'One pigmented lesion',
    text: 'Close-ups like a dermatoscope image work best. Wounds, rashes, burns and full-body photos give meaningless results.',
  },
]

export default function PhotoGuide() {
  return (
    <ul className="guide">
      {TIPS.map(({ Icon, title, text }) => (
        <li key={title}>
          <Icon className="guide-icon" />
          <div>
            <strong>{title}</strong>
            <p>{text}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
