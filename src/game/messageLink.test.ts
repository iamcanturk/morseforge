import { describe, expect, it } from 'vitest'
import { encode } from '../engine/morseEncoder'
import { MORSE_ALPHABET } from '../data/morseAlphabet'
import { WPM_RANGE } from '../storage/settings'
import {
  MESSAGE_MAX,
  MESSAGE_PATH,
  PAYLOAD_MAX,
  checkMessage,
  decodeMessageLink,
  describeProblem,
  encodeMessageLink,
  gradeGuess,
  messageCells,
  normaliseMessage,
  stripUnsupported,
  unsupportedCharacters,
  visibleCharacter,
} from './messageLink'

/** The fragment of an encoded link, or a failure. */
function hashOf(text: string, wpm?: number): string {
  const result = encodeMessageLink(text, wpm === undefined ? {} : { wpm })
  if (!result.ok) throw new Error(`expected ${text} to encode, got ${result.problem}`)
  return result.hash
}

describe('round trip', () => {
  it.each([
    'SOS',
    'meet me at nine',
    'HELLO, WORLD!',
    '73 DE MORSEFORGE',
    'Ä Ö Ü É Ñ Á',
    'WHAT?! "YES" (NO) A+B=C @ 3/4 $5 _X_',
  ])('%s survives encode then decode', (text) => {
    const decoded = decodeMessageLink(hashOf(text))
    expect(decoded).toEqual({ ok: true, message: { text: normaliseMessage(text), wpm: null } })
  })

  it('carries the sending speed, and only one inside the range the UI offers', () => {
    expect(decodeMessageLink(hashOf('HI', 20))).toEqual({
      ok: true,
      message: { text: 'HI', wpm: 20 },
    })
    expect(hashOf('HI', WPM_RANGE.max + 1)).not.toContain('wpm')
    expect(hashOf('HI', WPM_RANGE.min - 1)).not.toContain('wpm')
    expect(hashOf('HI', 12.5)).not.toContain('wpm')
  })

  it('round-trips a message of exactly the maximum length', () => {
    const text = 'E'.repeat(MESSAGE_MAX)
    expect(decodeMessageLink(hashOf(text))).toMatchObject({ ok: true, message: { text } })
  })

  it('round-trips the longest possible payload (two-byte letters only)', () => {
    const text = 'Ä'.repeat(MESSAGE_MAX)
    const hash = hashOf(text)
    expect(hash.length - '#m='.length).toBeLessThanOrEqual(PAYLOAD_MAX)
    expect(decodeMessageLink(hash)).toMatchObject({ ok: true, message: { text } })
  })

  it('builds a link on the message page, inside the fragment', () => {
    const result = encodeMessageLink('hi', { origin: 'https://example.test' })
    expect(result.ok && result.url).toMatch(
      new RegExp(`^https://example\\.test${MESSAGE_PATH}#m=[A-Za-z0-9_-]+$`),
    )
  })

  it('never puts the message itself in the link', () => {
    const result = encodeMessageLink('MEET ME AT NINE')
    expect(result.ok && result.url).not.toMatch(/MEET|NINE/i)
    // and never in a query string, which would reach the server
    expect(result.ok && result.url).not.toContain('?')
  })

  it('accepts the hash with or without its #, and a bare payload', () => {
    const hash = hashOf('HELLO')
    const payload = hash.slice('#m='.length)
    for (const variant of [hash, hash.slice(1), payload, `#${payload}`]) {
      expect(decodeMessageLink(variant)).toMatchObject({ ok: true, message: { text: 'HELLO' } })
    }
  })
})

describe('checkMessage', () => {
  it('normalises case and whitespace the way Morse can express them', () => {
    expect(normaliseMessage('  hello \n\t world  ')).toBe('HELLO WORLD')
  })

  it('composes a decomposed letter into the one the alphabet knows', () => {
    expect(checkMessage('Ä')).toMatchObject({ ok: true, text: 'Ä' })
  })

  it('refuses an empty message', () => {
    expect(checkMessage('   ')).toMatchObject({ ok: false, problem: 'empty' })
  })

  it('refuses one character over the cap, and counts characters not code units', () => {
    expect(checkMessage('E'.repeat(MESSAGE_MAX + 1))).toMatchObject({
      ok: false,
      problem: 'too-long',
      length: MESSAGE_MAX + 1,
    })
    expect(checkMessage('Ä'.repeat(MESSAGE_MAX))).toMatchObject({ ok: true })
  })

  it('names each unsupported character once, in order', () => {
    expect(checkMessage('hi 😀 <b> 😀 #')).toMatchObject({
      ok: false,
      problem: 'unsupported',
      unsupported: ['😀', '<', '>', '#'],
    })
  })

  it('treats every character of the alphabet as sendable', () => {
    const all = Object.keys(MORSE_ALPHABET)
    expect(unsupportedCharacters(all.join(''))).toEqual([])
  })

  it('can strip what Morse cannot send', () => {
    expect(stripUnsupported('hi 😀 there <3')).toBe('HI THERE 3')
  })

  it('never throws on a non-string', () => {
    expect(checkMessage(undefined as unknown as string)).toMatchObject({ ok: false })
  })
})

describe('hostile and broken links', () => {
  /** A fragment carrying arbitrary text, bypassing the composer's checks. */
  const forged = (text: string) => `#m=${Buffer.from(text, 'utf8').toString('base64url')}`

  it('refuses markup smuggled into a hand-made link', () => {
    expect(decodeMessageLink(forged('<img src=x onerror=alert(1)>'))).toEqual({
      ok: false,
      problem: 'unsupported',
    })
    expect(decodeMessageLink(forged('<script>alert(1)</script>'))).toEqual({
      ok: false,
      problem: 'unsupported',
    })
  })

  it('refuses the composer refusal cases when they arrive by link', () => {
    expect(decodeMessageLink(forged('E'.repeat(MESSAGE_MAX + 1)))).toMatchObject({ ok: false })
    expect(decodeMessageLink(forged('   '))).toEqual({ ok: false, problem: 'empty' })
  })

  it('refuses a huge payload without decoding it', () => {
    const huge = `#m=${'A'.repeat(5_000_000)}`
    const started = performance.now()
    expect(decodeMessageLink(huge)).toEqual({ ok: false, problem: 'malformed' })
    expect(performance.now() - started).toBeLessThan(50)
    expect(decodeMessageLink(`#m=${'A'.repeat(PAYLOAD_MAX + 4)}`)).toEqual({
      ok: false,
      problem: 'too-long',
    })
  })

  it.each([
    ['not base64', '#m=hello world!'],
    ['impossible length', '#m=A'],
    ['standard base64 alphabet', '#m=SGk+Lw=='],
    ['invalid UTF-8', `#m=${Buffer.from([0xff, 0xfe, 0x41]).toString('base64url')}`],
    ['lone surrogate bytes', `#m=${Buffer.from([0xed, 0xa0, 0x80]).toString('base64url')}`],
    ['percent garbage', '#m=%E0%A4%A'],
  ])('reports %s as malformed', (_, hash) => {
    const result = decodeMessageLink(hash)
    expect(result.ok).toBe(false)
    expect(result.ok === false && ['malformed', 'unsupported']).toContain(
      result.ok === false && result.problem,
    )
  })

  it('treats an empty fragment as nothing sent', () => {
    for (const hash of ['', '#', '  ', undefined, null, 42]) {
      expect(decodeMessageLink(hash)).toEqual({ ok: false, problem: 'none' })
    }
  })

  it('treats a link without the message key as empty', () => {
    expect(decodeMessageLink('#wpm=20')).toEqual({ ok: false, problem: 'empty' })
    expect(decodeMessageLink('#m=')).toEqual({ ok: false, problem: 'empty' })
  })

  it('ignores a nonsense speed rather than refusing the message', () => {
    const hash = hashOf('HI')
    for (const wpm of ['99999', '-5', 'abc', '1e2', '']) {
      expect(decodeMessageLink(`${hash}&wpm=${wpm}`)).toEqual({
        ok: true,
        message: { text: 'HI', wpm: null },
      })
    }
  })

  it('ignores parameters it does not know, such as a tracker a chat app appended', () => {
    expect(decodeMessageLink(`${hashOf('HI')}&utm_source=chat`)).toMatchObject({ ok: true })
  })
})

describe('messageCells', () => {
  it('gives every character its code from the alphabet, and keeps word gaps', () => {
    const cells = messageCells('hi you')
    expect(cells.map((cell) => cell.character).join('')).toBe('HI YOU')
    expect(cells[2]).toMatchObject({ space: true, code: '' })
    expect(
      cells
        .filter((cell) => !cell.space)
        .map((cell) => cell.code)
        .join(' '),
    ).toBe(encode('HI YOU').replace(' / ', ' '))
  })
})

describe('gradeGuess', () => {
  it('is exact regardless of case and spacing', () => {
    expect(gradeGuess('  meet   me ', 'MEET ME')).toMatchObject({
      exact: true,
      correct: 6,
      letters: 6,
    })
  })

  it('marks positions, counting word gaps as right', () => {
    const graded = gradeGuess('MXET ME', 'MEET ME')
    expect(graded.exact).toBe(false)
    expect(graded.correct).toBe(5)
    expect(graded.cells).toEqual([true, false, true, true, true, true, true])
  })

  it('handles an empty guess', () => {
    expect(gradeGuess('', 'SOS')).toMatchObject({ exact: false, correct: 0, letters: 3 })
  })
})

describe('describeProblem', () => {
  it('says something for every problem', () => {
    for (const problem of ['empty', 'too-long', 'unsupported', 'malformed'] as const) {
      expect(describeProblem(problem).length).toBeGreaterThan(10)
    }
  })

  it('quotes the cap from the constant and the unsupported characters', () => {
    expect(describeProblem('too-long', { length: 90 })).toContain(String(MESSAGE_MAX))
    expect(describeProblem('unsupported', { unsupported: ['😀', '#'] })).toBe(
      'Morse has no code for “😀”, “#”.',
    )
  })

  it('shows invisible characters by code point rather than as nothing', () => {
    expect(visibleCharacter('​')).toBe('U+200B')
    expect(visibleCharacter('‮')).toBe('U+202E')
    expect(visibleCharacter('#')).toBe('#')
  })
})

describe('fragments that are not messages, and padded ones that are', () => {
  it('reads a page anchor as no message, so the composer and its draft survive', () => {
    // BaseLayout's skip link is #main; the page also has #faq and #top.
    for (const hash of ['#main', '#faq', '#top', '#SOS', '#how.it.works', '#utm_source=x']) {
      expect(decodeMessageLink(hash), hash).toEqual({ ok: false, problem: 'none' })
    }
  })

  it('accepts base64 = padding, keyed or bare', () => {
    // "Hi" is SGk in base64url, and SGk= with standard padding.
    expect(decodeMessageLink('#m=SGk=')).toEqual({ ok: true, message: { text: 'HI', wpm: null } })
    expect(decodeMessageLink('#m=SGk%3D&wpm=20')).toEqual({
      ok: true,
      message: { text: 'HI', wpm: 20 },
    })
    expect(decodeMessageLink('SGk=')).toEqual({ ok: true, message: { text: 'HI', wpm: null } })
    expect(decodeMessageLink('#SGk=')).toMatchObject({ ok: true, message: { text: 'HI' } })
  })

  it('still reports a damaged keyed link as damaged', () => {
    expect(decodeMessageLink('#m=main')).toEqual({ ok: false, problem: 'malformed' })
  })
})
