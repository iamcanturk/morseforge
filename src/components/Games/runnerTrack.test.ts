import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Track } from './RunnerScreen'
import { ALL_LETTERS, MORSE_ALPHABET } from '../../data/morseAlphabet'
import { prettify } from '../../engine/morseEncoder'

/** The visible text of some markup: tags and attributes dropped. */
const text = (html: string) => html.replace(/<[^>]*>/g, '')

const render = (gates: { id: number; character: string; distance: number; hinted?: boolean }[]) =>
  renderToStaticMarkup(createElement(Track, { distance: 0, runnerAt: 0.08, gates }))

describe('a Morse Runner gate (DEC-032)', () => {
  it('shows its letter and never its code', () => {
    for (const character of ALL_LETTERS) {
      const shown = text(render([{ id: 1, character, distance: 40 }]))
      expect(shown).toBe(character)
      expect(shown).not.toContain(prettify(MORSE_ALPHABET[character]!))
    }
  })

  it('shows the code once it is hinted', () => {
    const shown = text(render([{ id: 1, character: 'K', distance: 40, hinted: true }]))
    expect(shown).toContain('K')
    expect(shown).toContain(prettify(MORSE_ALPHABET.K!))
  })
})
