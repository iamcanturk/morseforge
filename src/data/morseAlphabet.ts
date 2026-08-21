/**
 * The single source of truth for Morse code in MorseForge (PROJECT.md §31).
 *
 * Codes follow ITU-R M.1677-1 ("International Morse code"), the recommendation
 * that actually standardises the timing and the character set. Anything not in
 * that recommendation (the accented letters, `$`, `_`) is marked as extended so
 * lessons and generated practice can exclude it.
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

export const PUNCTUATION = {
  '.': '.-.-.-',
  ',': '--..--',
  '?': '..--..',
  "'": '.----.',
  '!': '-.-.--',
  '/': '-..-.',
  '(': '-.--.',
  ')': '-.--.-',
  '&': '.-...',
  ':': '---...',
  ';': '-.-.-.',
  '=': '-...-',
  '+': '.-.-.',
  '-': '-....-',
  _: '..--.-',
  '"': '.-..-.',
  $: '...-..-',
  '@': '.--.-.',
} as const satisfies Record<string, MorseCode>

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
} as const satisfies Record<string, MorseCode>

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
