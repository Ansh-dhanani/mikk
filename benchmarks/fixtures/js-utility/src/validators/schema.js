export function validateSchema(data, schema) {
  const errors = []
  for (const [field, rule] of Object.entries(schema)) {
    const value = data[field]
    if (rule.required && (value === undefined || value === null)) {
      errors.push({ field, message: `${field} is required` })
      continue
    }
    if (value !== undefined && rule.type && typeof value !== rule.type) {
      errors.push({ field, message: `${field} must be ${rule.type}` })
    }
    if (typeof value === 'string' && rule.minLength && value.length < rule.minLength) {
      errors.push({ field, message: `${field} must be at least ${rule.minLength} chars` })
    }
    if (typeof value === 'number' && rule.min !== undefined && value < rule.min) {
      errors.push({ field, message: `${field} must be >= ${rule.min}` })
    }
  }
  return { valid: errors.length === 0, errors }
}
