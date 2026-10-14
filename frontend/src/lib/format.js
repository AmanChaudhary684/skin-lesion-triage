export const pct = (x, digits = 0) => `${(x * 100).toFixed(digits)}%`

export function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function daysBetween(a, b) {
  return Math.round(Math.abs(b - a) / 86400000)
}

export function formatBytes(n) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
