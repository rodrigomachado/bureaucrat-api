import { trimMargin } from './strings'

describe('trimMargin', () => {
  test('basic margin trim', () => {
    expect(trimMargin`
      |Hello World
    `).toBe('Hello World')
  })

  test('trim 2 lines', () => {
    expect(trimMargin`
      |First Line
      |Second Line
    `).toBe('First Line\nSecond Line')
  })

  test('interpolation', () => {
    expect(trimMargin`
      |1 + 1 = ${1 + 1}
      |2 + 2 = ${2 + 2}
      |3 + 3 = ${3 + 3}
    `).toBe('1 + 1 = 2\n2 + 2 = 4\n3 + 3 = 6')
  })

  test('non empty head line', () => {
    expect(() => trimMargin`bogus
      |Line
    `).toThrowError(/The first line on a trimMargin string must be empty\./)
  })

  test('non empty tail line', () => {
    expect(() => trimMargin`
      |Line
    bogus`).toThrowError(/The last line on a trimMargin string must be empty\./)
  })

  test('missing pipe', () => {
    expect(() => trimMargin`
      Line
    `).toThrowError(/The margin symbol \(\|\) must be in the start of the line\./)

    expect(() => trimMargin`
      First | Line
    `).toThrowError(/The margin symbol \(\|\) must be in the start of the line\./)

    expect(() => trimMargin`
      |First Line
      Second Line
      |Third Line
    `).toThrowError(/The margin symbol \(\|\) must be in the start of the line\./)
  })
})
