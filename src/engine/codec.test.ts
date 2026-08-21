import { describe, expect, it } from 'vitest'
import { LETTERS, MORSE_ALPHABET } from '../data/morseAlphabet'
import { encode, encodeDetailed, prettify } from './morseEncoder'
import { LiveDecoder, decode, decodeDetailed, normalizeMorse } from './morseDecoder'

describe('encode', () => {
  it('joins elements tightly, characters by space, words by slash', () => {
    expect(encode('A')).toBe('.-')
    expect(encode('AN')).toBe('.- -.')
    expect(encode('A N')).toBe('.- / -.')
  })

  it('is case-insensitive', () => {
    expect(encode('sos')).toBe(encode('SOS'))
  })

  it('encodes SOS as three spaced characters, not a prosign blob', () => {
    expect(encode('SOS')).toBe('... --- ...')
  })

  it('collapses runs of whitespace into a single word break', () => {
    expect(encode('HELLO   WORLD')).toBe(encode('HELLO WORLD'))
    expect(encode('  E  ')).toBe('.')
  })

  it('drops unsupported characters by default and reports them', () => {
    const result = encodeDetailed('E🚀T')
    expect(result.morse).toBe('. -')
    expect(result.unsupported).toEqual(['🚀'])
  })

  it('keeps unsupported characters visible when asked', () => {
    // The placeholder occupies a character slot of its own, so it is
    // space-separated like any other character in the word.
    expect(encodeDetailed('E🚀', { unknown: 'keep' }).morse).toBe('. ?🚀?')
  })

  it('returns empty for empty input', () => {
    expect(encode('')).toBe('')
    expect(encode('   ')).toBe('')
  })
})

describe('decode', () => {
  it('reads the encoder’s own output', () => {
    expect(decode('.- / -.')).toBe('A N')
    expect(decode('... --- ...')).toBe('SOS')
  })

  it('accepts a double space as a word break', () => {
    expect(decode('.-  -.')).toBe('A N')
  })

  it('accepts the typographic forms the UI renders', () => {
    expect(decode('·− / −·')).toBe('A N')
  })

  it('accepts dashes that word processors substitute', () => {
    expect(decode('.—')).toBe('A')
    expect(decode('._')).toBe('A')
  })

  it('marks unmappable sequences instead of dropping them', () => {
    const result = decodeDetailed('.- ........ -.')
    expect(result.text).toBe('A•N')
    expect(result.unknown).toEqual(['........'])
  })

  it('leaves prosigns alone unless asked', () => {
    expect(decode('...---...')).toBe('•')
    expect(decode('...---...', { expandProsigns: true })).toBe('SOS')
  })

  it('returns empty for empty input', () => {
    expect(decode('')).toBe('')
    expect(decode('  /  ')).toBe('')
  })
})

describe('normalizeMorse', () => {
  it('collapses spacing around word separators', () => {
    expect(normalizeMorse('.-   /   -.')).toBe('.- / -.')
    expect(normalizeMorse('.-|-.')).toBe('.- / -.')
  })
})

describe('round trip', () => {
  it('survives every character in the alphabet', () => {
    for (const character of Object.keys(MORSE_ALPHABET)) {
      expect(decode(encode(character)), `${character} failed to round-trip`).toBe(character)
    }
  })

  it('survives realistic messages', () => {
    for (const message of ['SOS', 'CQ CQ CQ', 'HELLO WORLD', 'DE TA', 'MORSEFORGE 73']) {
      expect(decode(encode(message))).toBe(message)
    }
  })
})

describe('prettify', () => {
  it('swaps in typographic glyphs that survive a re-decode', () => {
    expect(prettify('.-')).toBe('·−')
    expect(decode(prettify(encode('HELLO')))).toBe('HELLO')
  })
})

describe('LiveDecoder', () => {
  it('previews the character being keyed before it is committed', () => {
    const live = new LiveDecoder()
    live.pushElement('.')
    expect(live.pending).toBe('.')
    expect(live.preview).toBe('E')

    live.pushElement('.')
    expect(live.preview).toBe('I')

    live.pushElement('-')
    expect(live.preview).toBe('U')
  })

  it('returns null preview for a sequence that is not a character yet', () => {
    const live = new LiveDecoder()
    expect(live.preview).toBeNull()
    live.pushElement('.')
    live.pushElement('.')
    live.pushElement('.')
    live.pushElement('.')
    live.pushElement('.')
    live.pushElement('.')
    live.pushElement('.')
    expect(live.preview).toBeNull()
  })

  it('accumulates committed characters into words', () => {
    const live = new LiveDecoder()
    for (const element of ['.', '.', '.'] as const) live.pushElement(element)
    live.commitCharacter()
    for (const element of ['-', '-', '-'] as const) live.pushElement(element)
    live.commitCharacter()
    for (const element of ['.', '.', '.'] as const) live.pushElement(element)
    live.commitCharacter()
    expect(live.text).toBe('SOS')
  })

  it('commits the pending character when a word ends', () => {
    const live = new LiveDecoder()
    live.pushElement('.')
    live.commitWord()
    expect(live.text).toBe('E ')
    expect(live.pending).toBe('')
  })

  it('never opens with a space or doubles one up', () => {
    const live = new LiveDecoder()
    live.commitWord()
    expect(live.text).toBe('')

    live.pushElement('.')
    live.commitWord()
    live.commitWord()
    expect(live.text).toBe('E ')
  })

  it('cancels the character in progress without losing decoded text', () => {
    const live = new LiveDecoder()
    live.pushElement('.')
    live.commitCharacter()
    live.pushElement('-')
    live.pushElement('-')
    live.clearPending()
    expect(live.pending).toBe('')
    expect(live.text).toBe('E')
  })

  it('marks an unrecognised sequence rather than silently dropping it', () => {
    const live = new LiveDecoder()
    for (let i = 0; i < 8; i++) live.pushElement('.')
    expect(live.commitCharacter()).toBe('•')
    expect(live.text).toBe('•')
  })

  it('commits nothing when nothing is pending', () => {
    expect(new LiveDecoder().commitCharacter()).toBeNull()
  })

  it('keys every letter correctly', () => {
    for (const [character, code] of Object.entries(LETTERS)) {
      const live = new LiveDecoder()
      for (const element of code) live.pushElement(element as '.' | '-')
      expect(live.commitCharacter()).toBe(character)
    }
  })
})
