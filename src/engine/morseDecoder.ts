/**
 * Morse → text (PROJECT.md §11, §14).
 *
 * The decoder is deliberately forgiving about input notation, because it serves
 * three very different callers: the translator page (where a human types
 * whatever they have pasted from somewhere), the practice screens (clean input
 * from the encoder), and the live key (a stream of elements arriving one at a
 * time).
 */

import { CODE_TO_CHARACTER, PROSIGNS } from '../data/morseAlphabet'

/** The character used for an element sequence with no known mapping. */
export const UNKNOWN_CHARACTER = '•' // "•" — visually distinct from "?"

/**
 * Normalise the many ways people write Morse into `.`/`-`/` `/`/`.
 *
 * Accepts the typographic forms the app itself renders (·, −), the Unicode
 * dashes that word processors substitute (–, —), the middle dot, and `_` for a
 * dash. Any run of whitespace around a `/` collapses to a single separator.
 */
export function normalizeMorse(input: string): string {
  return (
    input
      .replace(/[·•∙]/g, '.')
      .replace(/[−–—_]/g, '-')
      .replace(/[|]/g, '/')
      // A run of two or more spaces, or any line break, is an implicit word
      // break. This has to happen before whitespace is collapsed, or the gap
      // that carried the meaning is gone.
      .replace(/[ \t]{2,}|[\r\n]+/g, ' / ')
      // Collapse however the separators ended up written into a single " / ".
      .replace(/\s*\/[\s/]*/g, ' / ')
      .replace(/ +/g, ' ')
      .trim()
  )
}

/** Decode one element sequence such as `".-"`. Returns null when unmapped. */
export function decodeCharacter(code: string): string | null {
  return CODE_TO_CHARACTER.get(code) ?? null
}

export interface DecodeResult {
  text: string
  /** Element sequences that matched nothing, in the order encountered. */
  unknown: string[]
}

export interface DecodeOptions {
  /**
   * Treat known prosigns (`...---...` → SOS) as single characters. Off by
   * default: with standard spacing `... --- ...` already decodes to SOS, and
   * turning this on would make an un-gapped blob decode differently from the
   * same blob correctly spaced.
   */
  expandProsigns?: boolean
}

/**
 * Decode a Morse string to text.
 *
 * Word separation is recognised from an explicit `/` or from a run of two or
 * more spaces, so both the app's own output and hand-typed Morse work.
 */
export function decodeDetailed(morse: string, options: DecodeOptions = {}): DecodeResult {
  const unknown: string[] = []
  const normalized = normalizeMorse(morse)
  if (!normalized) return { text: '', unknown }

  const prosignLookup = options.expandProsigns
    ? new Map<string, string>(Object.entries(PROSIGNS).map(([name, code]) => [code, name]))
    : null

  const words = normalized
    .split('/')
    .map((w) => w.trim())
    .filter(Boolean)

  const decodedWords = words.map((word) =>
    word
      .split(' ')
      .filter(Boolean)
      .map((code) => {
        const prosign = prosignLookup?.get(code)
        if (prosign) return prosign

        const character = CODE_TO_CHARACTER.get(code)
        if (character) return character

        unknown.push(code)
        return UNKNOWN_CHARACTER
      })
      .join(''),
  )

  return { text: decodedWords.join(' '), unknown }
}

/** Decode a Morse string to text. */
export function decode(morse: string, options?: DecodeOptions): string {
  return decodeDetailed(morse, options).text
}

/**
 * Live decoding for the straight key (PROJECT.md §14).
 *
 * The key engine pushes elements in as they are keyed; this accumulates them
 * and resolves a character when the operator pauses. It is a class rather than
 * a pure function because the real-time screen needs to render the
 * partially-typed character ("..-" before it becomes U) on every keystroke.
 */
export class LiveDecoder {
  #buffer = ''
  #decoded = ''

  /** The element sequence keyed so far for the character in progress. */
  get pending(): string {
    return this.#buffer
  }

  /** Everything resolved so far. */
  get text(): string {
    return this.#decoded
  }

  /**
   * The character the pending buffer would produce right now, or null if it is
   * not (yet) a valid sequence. Drives the live "you are sending a U" hint.
   */
  get preview(): string | null {
    return this.#buffer ? (CODE_TO_CHARACTER.get(this.#buffer) ?? null) : null
  }

  pushElement(element: '.' | '-'): void {
    this.#buffer += element
  }

  /**
   * The operator paused long enough to end a character. Resolves the buffer and
   * returns what was decoded, or null if nothing was pending.
   */
  commitCharacter(): string | null {
    if (!this.#buffer) return null
    const character = CODE_TO_CHARACTER.get(this.#buffer) ?? UNKNOWN_CHARACTER
    this.#decoded += character
    this.#buffer = ''
    return character
  }

  /** The operator paused long enough to end a word. */
  commitWord(): void {
    this.commitCharacter()
    // Never open with a space, and never double up.
    if (this.#decoded && !this.#decoded.endsWith(' ')) this.#decoded += ' '
  }

  /** Drop the character in progress, keeping what is already decoded (§10 Cancel). */
  clearPending(): void {
    this.#buffer = ''
  }

  reset(): void {
    this.#buffer = ''
    this.#decoded = ''
  }
}
