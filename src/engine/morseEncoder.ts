/**
 * Text → Morse (PROJECT.md §11).
 *
 * Output convention, used everywhere in the app and by the translator page:
 *   - elements of a character are adjacent:      A → ".-"
 *   - characters within a word are space-separated: AN → ".- -."
 *   - words are separated by " / ":              A N → ".- / -."
 *
 * The slash is the conventional written word separator in Morse and survives
 * copy/paste and URL round-trips, which double-space does not.
 */

import { MORSE_ALPHABET } from '../data/morseAlphabet'

export const WORD_SEPARATOR = '/'

export interface EncodeOptions {
  /**
   * What to do with characters that have no Morse representation.
   * - `skip` (default): drop them silently — right for audio playback.
   * - `keep`: pass them through verbatim, wrapped in `?`, so the translator
   *   page can show the user exactly what it could not handle.
   */
  unknown?: 'skip' | 'keep'
}

export interface EncodeResult {
  morse: string
  /** Characters that had no Morse mapping, in the order encountered. */
  unsupported: string[]
}

/** Encode a single character. Returns null when there is no mapping. */
export function encodeCharacter(character: string): string | null {
  return MORSE_ALPHABET[character.toUpperCase()] ?? null
}

/** Encode text, also reporting whatever could not be represented. */
export function encodeDetailed(text: string, options: EncodeOptions = {}): EncodeResult {
  const { unknown = 'skip' } = options
  const unsupported: string[] = []

  const words = text.trim().toUpperCase().split(/\s+/).filter(Boolean)

  const encodedWords = words.map((word) => {
    const codes: string[] = []
    // Spread rather than split('') so astral characters (emoji) stay intact and
    // get reported as one unsupported item instead of two broken halves.
    for (const character of word) {
      const code = MORSE_ALPHABET[character]
      if (code) {
        codes.push(code)
        continue
      }
      unsupported.push(character)
      if (unknown === 'keep') codes.push(`?${character}?`)
    }
    return codes.join(' ')
  })

  return {
    morse: encodedWords.filter(Boolean).join(` ${WORD_SEPARATOR} `),
    unsupported,
  }
}

/** Encode text to a Morse string. */
export function encode(text: string, options?: EncodeOptions): string {
  return encodeDetailed(text, options).morse
}

/**
 * Render Morse with typographic dots and dashes for display. Data stays as
 * `.`/`-`; this is presentation only, and is what the UI shows so that `.`
 * does not get mistaken for a full stop at small sizes.
 */
export function prettify(morse: string): string {
  return morse.replaceAll('.', '·').replaceAll('-', '−')
}
