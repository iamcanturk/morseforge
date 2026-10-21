import { describe, expect, it } from 'vitest'
import { MORSE_ALPHABET } from '../data/morseAlphabet'
import { encode, prettify } from './morseEncoder'
import { spokenCode } from './spokenCode'

describe('spokenCode', () => {
  it('reads one element as one word', () => {
    expect(spokenCode(encode('E'))).toBe('dot')
    expect(spokenCode(encode('T'))).toBe('dash')
  })

  it('reads every element of a character in order', () => {
    expect(spokenCode(encode('A'))).toBe('dot dash')
    expect(spokenCode(encode('N'))).toBe('dash dot')
  })

  it('says "break" once between characters and once between words', () => {
    expect(spokenCode(encode('AN'))).toBe('dot dash break dash dot')
    expect(spokenCode(encode('A N'))).toBe('dot dash break dash dot')
  })

  it('reads the prettified glyphs the same as the data form', () => {
    for (const text of ['E', 'SOS', 'HELLO WORLD', '73']) {
      expect(spokenCode(prettify(encode(text)))).toBe(spokenCode(encode(text)))
    }
  })

  it('has as many element words as the code has elements, for every character', () => {
    for (const code of Object.values(MORSE_ALPHABET)) {
      const words = spokenCode(code).split(' ')
      expect(words).toHaveLength(code.length)
      expect(words.every((word) => word === 'dot' || word === 'dash')).toBe(true)
    }
  })

  it('never starts or ends with a break, and never repeats one', () => {
    const spoken = spokenCode(` ${encode('SOS SOS')} / `)
    expect(spoken.startsWith('break')).toBe(false)
    expect(spoken.endsWith('break')).toBe(false)
    expect(spoken).not.toMatch(/break break/)
  })

  it('leaves out what is not Morse, and is empty for nothing', () => {
    expect(spokenCode(encode('A~B', { unknown: 'keep' }))).toBe(spokenCode(encode('AB')))
    expect(spokenCode('')).toBe('')
    expect(spokenCode(' / ')).toBe('')
  })
})
