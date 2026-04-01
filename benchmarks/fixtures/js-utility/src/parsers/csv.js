/**
 * Parse a CSV string into an array of objects.
 * @param {string} csv - Raw CSV string
 * @param {Object} options
 * @param {string} options.delimiter - Column delimiter (default: ',')
 * @param {boolean} options.header - First row is header (default: true)
 * @returns {Array<Object>}
 */
export function parseCsv(csv, { delimiter = ',', header = true } = {}) {
  const lines = csv.trim().split('\n').map(l => l.split(delimiter).map(c => c.trim()))
  if (!header) return lines.map(row => ({ values: row }))
  const [headers, ...rows] = lines
  return rows.map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? null]))
  )
}

/**
 * Convert an array of objects to CSV string.
 */
export function toCsv(data, { delimiter = ',', includeHeader = true } = {}) {
  if (!data.length) return ''
  const keys = Object.keys(data[0])
  const rows = data.map(obj => keys.map(k => JSON.stringify(obj[k] ?? '')).join(delimiter))
  return includeHeader ? [keys.join(delimiter), ...rows].join('\n') : rows.join('\n')
}

export function detectDelimiter(firstLine) {
  const candidates = [',', ';', '\t', '|']
  const counts = candidates.map(d => ({ d, count: (firstLine.match(new RegExp('\\' + d, 'g')) || []).length }))
  return counts.sort((a, b) => b.count - a.count)[0].d
}
