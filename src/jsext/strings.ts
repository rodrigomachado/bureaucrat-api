/**
 * Converts a string from camelCase to snake_case.
 */
export function toCamelCase(s: string) {
  return s.replace(/(_\w)/g, m => m[1].toUpperCase())
}

/**
 * Converts a snake_case string into "Capitalized Spaced".
 */
export function toCapitalizedSpaced(s: string) {
  s = s.trim()
  if (!s.length) return s
  s = s[0].toUpperCase() + s.substring(1)
  s = s.replace(/(_\w)/g, m => ' ' + m[1].toUpperCase())
  return s
}
