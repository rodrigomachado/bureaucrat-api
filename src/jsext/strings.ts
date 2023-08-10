/**
 * Converts a string from camelCase to snake_case.
 */
export function toCamelCase(s: string) {
  return s.replace(/(_\w)/g, m => m[1].toUpperCase())
}
