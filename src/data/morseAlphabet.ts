/**
 * The single source of truth for Morse code in MorseForge (PROJECT.md §31).
 *
 * Codes follow ITU-R M.1677-1 ("International Morse code"), the recommendation
 * that actually standardises the timing and the character set. Not everything
 * here is in that recommendation, and the data says which is which rather than
 * leaving it to a comment:
 *
 *   - `ITU_PUNCTUATION` is the punctuation the recommendation defines.
 *   - `NON_ITU_PUNCTUATION` is common in practice but not in the standard
 *     (`! & ; _ $`). `PUNCTUATION` is the union of the two, so `encode` and
 *     `decode` accept both.
 *   - `EXTENDED_LETTERS` are the accented letters, kept out of generated practice.
 *
 * Any page that says "per ITU-R M.1677-1" must draw from the first group only.
 *
 * Dots are `.` and dashes are `-` throughout the codebase. Never `·`/`—`, and
 * never `dit`/`dah` in data — those are display concerns.
 */

export type MorseCode = string

/** A–Z. The MVP target per PROJECT.md §32. */
export const LETTERS = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
} as const satisfies Record<string, MorseCode>

export const DIGITS = {
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
} as const satisfies Record<string, MorseCode>

/**
 * Punctuation defined by ITU-R M.1677-1.
 *
 * Thirteen marks. The recommendation gives `(` and `)` a code each, and does
 * not define `!`, `&`, `;`, `_` or `$`: those are in
 * `NON_ITU_PUNCTUATION`. A public page that says "all of these follow the
 * standard" has to stop at this list.
 */
export const ITU_PUNCTUATION = {
  '.': '.-.-.-',
  ',': '--..--',
  '?': '..--..',
  "'": '.----.',
  '/': '-..-.',
  '(': '-.--.',
  ')': '-.--.-',
  ':': '---...',
  '=': '-...-',
  '+': '.-.-.',
  '-': '-....-',
  '"': '.-..-.',
  '@': '.--.-.',
} as const satisfies Record<string, MorseCode>

/**
 * Marks that are in common use but are not in ITU-R M.1677-1 (DEC-012).
 *
 * They stay encodable, because people type them, but they are presented as a
 * separate group ("Common but not in ITU-R M.1677-1") and never counted in a
 * sentence that cites the standard.
 */
export const NON_ITU_PUNCTUATION = {
  '!': '-.-.--',
  '&': '.-...',
  ';': '-.-.-.',
  _: '..--.-',
  $: '...-..-',
} as const satisfies Record<string, MorseCode>

/** Every punctuation mark MorseForge can send: the ITU set plus the common extras. */
export const PUNCTUATION = {
  ...ITU_PUNCTUATION,
  ...NON_ITU_PUNCTUATION,
} as const satisfies Record<string, MorseCode>

/**
 * What each mark is called, for headings, alt text and URL slugs
 * ("question-mark"). A bare `?` is a poor heading and an unreadable slug.
 */
export const PUNCTUATION_NAMES = {
  '.': 'full stop',
  ',': 'comma',
  '?': 'question mark',
  "'": 'apostrophe',
  '/': 'slash',
  '(': 'left parenthesis',
  ')': 'right parenthesis',
  ':': 'colon',
  '=': 'equals sign',
  '+': 'plus sign',
  '-': 'hyphen',
  '"': 'quotation mark',
  '@': 'at sign',
  '!': 'exclamation mark',
  '&': 'ampersand',
  ';': 'semicolon',
  _: 'underscore',
  $: 'dollar sign',
} as const satisfies Record<keyof typeof PUNCTUATION, string>

/**
 * Non-English letters. PROJECT.md §32 lists Ü and Ä in the learning order, but
 * §32 also says A–Z is the v1 target — so these are available to the translator
 * and decoder while staying out of generated practice.
 */
export const EXTENDED_LETTERS = {
  Ä: '.-.-',
  Á: '.--.-',
  É: '..-..',
  Ñ: '--.--',
  Ö: '---.',
  Ü: '..--',
} as const satisfies Record<string, MorseCode>

/** Everything MorseForge can encode or decode. */
export const MORSE_ALPHABET: Readonly<Record<string, MorseCode>> = Object.freeze({
  ...LETTERS,
  ...DIGITS,
  ...PUNCTUATION,
  ...EXTENDED_LETTERS,
})

/**
 * Reverse lookup, built once at module load. Every code in MORSE_ALPHABET is
 * unique — `alphabet.test.ts` asserts it, so this map never loses an entry.
 */
export const CODE_TO_CHARACTER: ReadonlyMap<MorseCode, string> = new Map(
  Object.entries(MORSE_ALPHABET).map(([char, code]) => [code, char]),
)

/**
 * Prosigns are sent as a single character with no internal letter gap. They are
 * deliberately kept out of MORSE_ALPHABET: `...---...` would otherwise collide
 * with a legitimate S-O-S decode, and the decoder must keep returning "SOS".
 * Used for the §50 easter eggs.
 */
export const PROSIGNS = {
  SOS: '...---...',
  AR: '.-.-.', // end of message
  SK: '...-.-', // end of contact
  BT: '-...-', // new paragraph
  KN: '-.--.', // invitation to a named station
  CT: '-.-.-', // starting signal
} as const satisfies Record<string, MorseCode>

/**
 * What each prosign means, kept next to the codes so a page, `llms-full.txt`
 * and a future prosigns page all read one source. Meanings are hand-authored
 * facts; the codes are never repeated here.
 */
export const PROSIGN_MEANINGS = {
  SOS: 'distress signal',
  AR: 'end of message',
  SK: 'end of contact',
  BT: 'new paragraph or break',
  KN: 'go ahead, named station only',
  CT: 'starting signal (start of transmission)',
} as const satisfies Record<keyof typeof PROSIGNS, string>

export const ALL_LETTERS = Object.keys(LETTERS) as (keyof typeof LETTERS)[]
export const ALL_DIGITS = Object.keys(DIGITS) as (keyof typeof DIGITS)[]

/**
 * Teaching order (PROJECT.md §4.1 / §32). Grouped by code length so a learner
 * meets the whole "depth" of the Morse tree at once — E/T, then the 2-element
 * characters, then the 3-element ones. This is the tree's own structure, which
 * is why the Signal Tree lights up a full ring per stage.
 */
export const LEARNING_STAGES: readonly (readonly string[])[] = [
  ['E', 'T'],
  ['I', 'A', 'N', 'M'],
  ['S', 'U', 'R', 'W', 'D', 'K', 'G', 'O'],
  ['H', 'V', 'F', 'L', 'P', 'J', 'B', 'X', 'C', 'Y', 'Z', 'Q'],
]

/** Flattened teaching order — all 26 letters, in the order they are unlocked. */
export const LEARNING_ORDER: readonly string[] = LEARNING_STAGES.flat()

/** How many dots+dashes a character takes. Used for difficulty weighting. */
export function codeLength(character: string): number {
  return MORSE_ALPHABET[character.toUpperCase()]?.length ?? 0
}

/** Is this character something MorseForge knows how to transmit? */
export function isEncodable(character: string): boolean {
  const c = character.toUpperCase()
  return c === ' ' || c in MORSE_ALPHABET
}
