import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SignalPiece, SignalReveal, fieldX } from './signalPiece'
import { translatorFor } from '../../i18n/server'
import { inIsland } from '../../i18n/testing'

const spokenCode = (code: string) => translatorFor('en').spokenCode(code)
import { ALL_DIGITS, ALL_LETTERS, MORSE_ALPHABET } from '../../data/morseAlphabet'

/** The visible text of some markup: tags and attributes dropped. */
const text = (html: string) => html.replace(/<[^>]*>/g, '')

describe('a falling Signal Defender piece (DEC-027)', () => {
  it('shows the code and never the letter it spells', () => {
    for (const character of ALL_LETTERS) {
      const html = renderToStaticMarkup(
        inIsland(
          createElement(SignalPiece, { character, x: 0.5, y: 0.3, danger: false }),
          'defender',
        ),
      )
      const code = MORSE_ALPHABET[character]!
      // Drawn element by element, in order...
      const drawn = [...html.matchAll(/data-el="(dit|dah)"/g)].map((match) => match[1])
      expect(drawn).toEqual([...code].map((element) => (element === '-' ? 'dah' : 'dit')))
      // ...and spoken as the same sequence; the letter is nowhere.
      expect(text(html)).toBe(spokenCode(code))
      expect(text(html)).not.toContain(character)
    }
  })

  it('reveals the letter once the signal is hit', () => {
    const html = renderToStaticMarkup(
      inIsland(
        createElement(SignalReveal, { character: 'Q', x: 0.5, y: 0.5, points: 24 }),
        'defender',
      ),
    )
    expect(text(html)).toContain('Q')
    expect(text(html)).toContain('+24')
  })

  it('keeps the widest code inside the glass on a 390px phone', () => {
    // The phone field is about 310px wide inside the cabinet (measured). The
    // unit is 0.35em of a 6.5cqw size clamped to at least 20px; a dot is one
    // unit, a dash three, with a unit between elements.
    const field = 310
    const unit = 0.35 * Math.max(20, 0.065 * field)
    const units = (code: string) =>
      [...code].reduce((sum, element) => sum + (element === '-' ? 3 : 1), 0) + code.length - 1
    const widest = Math.max(
      ...[...ALL_LETTERS, ...ALL_DIGITS].map((character) => units(MORSE_ALPHABET[character]!)),
    )
    const halfWidth = (widest * unit) / 2
    // The rules place a signal between 0.1 and 0.9 of the width.
    expect(fieldX(0.1) * field).toBeGreaterThan(halfWidth)
    expect((1 - fieldX(0.9)) * field).toBeGreaterThan(halfWidth)
    expect(fieldX(0.5)).toBe(0.5)
  })
})
