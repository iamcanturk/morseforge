import { describe, expect, it } from 'vitest'
import { handTypedMorse, stringLiterals, stripInterpolations } from './proseScan'

describe('stripInterpolations', () => {
  it('removes expressions, including nested braces and templates', () => {
    expect(stripInterpolations('a ${b} c')).toBe('a  c')
    expect(stripInterpolations('a ${x ? `${y}` : { z: 1 }.z} c')).toBe('a  c')
  })

  it('leaves a lone dollar sign alone', () => {
    expect(stripInterpolations('costs $5')).toBe('costs $5')
  })
})

describe('stringLiterals', () => {
  it('reads all three quote styles and skips comments', () => {
    const source = `
      // 'not this'
      const a = 'one'
      const b = "two"
      /* 'nor this' */
      const c = \`three \${four}\`
    `
    expect(stringLiterals(source)).toEqual(['one', 'two', 'three '])
  })

  it('keeps an apostrophe inside double quotes in one piece', () => {
    expect(stringLiterals(`const a = "it's fine"`)).toEqual(["it's fine"])
  })
})

describe('handTypedMorse', () => {
  it('finds a code typed into a sentence', () => {
    expect(handTypedMorse(`const a = 'SOS is ... --- ...'`)).toEqual(['...', '---', '...'])
  })

  it('accepts a code that arrives through interpolation', () => {
    expect(handTypedMorse('const a = `SOS is ${encode("SOS")}`')).toEqual([])
  })

  it('ignores spread operators and prose hyphens', () => {
    expect(handTypedMorse(`const a = [...items]\nconst b = 'five-character, well-known'`)).toEqual(
      [],
    )
  })
})
