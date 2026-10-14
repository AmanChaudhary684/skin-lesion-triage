const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
}

// The viewfinder mark: four crop corners around a dot. Also the motif of the photo frames.
export const Mark = (props) => (
  <svg {...base} {...props}>
    <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
    <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
  </svg>
)

export const AlertIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M12 3.6 2.9 19.4h18.2L12 3.6Z" />
    <path d="M12 10v4.4" />
    <circle cx="12" cy="17" r=".7" fill="currentColor" stroke="none" />
  </svg>
)

export const CalendarIcon = (props) => (
  <svg {...base} {...props}>
    <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
  </svg>
)

export const CheckIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.2 12.4 2.6 2.6 5-5.4" />
  </svg>
)

export const QuestionIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8" />
    <circle cx="12" cy="16.6" r=".7" fill="currentColor" stroke="none" />
  </svg>
)

export const UploadIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9" />
    <path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15" />
  </svg>
)

export const SunIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="3.8" />
    <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" />
  </svg>
)

export const FocusIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="2.4" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
  </svg>
)

export const TargetIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M12 3.5c3.6 0 7 2.6 7 6.6 0 4.6-3.6 9.9-7 9.9s-7-5.3-7-9.9c0-4 3.4-6.6 7-6.6Z" />
    <circle cx="12" cy="10.5" r="2" />
  </svg>
)

export const PrinterIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M7 9V4h10v5M7 17H5.5A1.5 1.5 0 0 1 4 15.5v-5A1.5 1.5 0 0 1 5.5 9h13a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17" />
    <rect x="7" y="14" width="10" height="6.5" rx="1" />
  </svg>
)

export const TIER_ICONS = {
  urgent: AlertIcon,
  soon: CalendarIcon,
  routine: CheckIcon,
  review: QuestionIcon,
}
