export function formatDate(date, locale = 'en-US') {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}

export function formatRelative(date) {
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

export function parseIso(isoString) {
  const d = new Date(isoString)
  if (isNaN(d.getTime())) throw new Error(`Invalid ISO string: ${isoString}`)
  return d
}
