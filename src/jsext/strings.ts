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

/**
 * Removes the margin of a string.
 * 
 * Consider the following code:
 * ```js
 * const a = trimMargin`
 *   |Hello
 *   |World
 * `
 * ```
 * 
 * `a` will be set to:
 * ```
 * Hello
 * World
 * ```
 * , which is a string with two lines, with a single word on each line.
 * 
 * Note that `trimMargin` does not remove empty spaces from the end of lines.
 * 
 * `trimMargin` discards the first and last lines (the ones containing backticks). They must be empty (or
 * contain only spaces).
 * 
 * Every line must contain the margin symbol: "|". Only spaces or tabs are allowed before it.
 */
export function trimMargin(strings: TemplateStringsArray, ...exprs: any[]): string {
  let all = ''
  for (let i = 0; i < exprs.length; i++) {
    all += strings[i]
    all += exprs[i]
  }
  all += strings.at(-1)

  const lines = all.split('\n')
  if (lines.at(0)?.trim() !== '') throw new Error(
    `The first line on a trimMargin string must be empty. String: \`${all}\``
  )
  lines.shift() // remove first line
  if (lines.at(-1)?.trim() !== '') throw new Error(
    `The last line on a trimMargin string must be empty. String: \`${all}\``
  )
  lines.pop() // remove last line
  if (!lines.length) return ''

  return lines.reduce((acc, line, pos) => {
    const marginPos = line.indexOf('|')
    if (marginPos < 0 || line.substring(0, marginPos).trim() !== '') throw new Error(
      `The margin symbol (|) must be in the start of the line. Line ${pos + 1} String: \`${all}\``
    )
    return acc + line.substring(marginPos + 1) + (pos === lines.length - 1 ? '' : '\n')
  }, '')
}
