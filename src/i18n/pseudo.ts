/**
 * The pseudo-locale: English, made obviously not English.
 *
 * Every letter is swapped for an accented twin and every vowel is doubled, so
 * a translated sentence comes out about a third longer, the way German or
 * Russian does. Any text still in plain ASCII English on an `/en-xa/` page
 * therefore never went through the catalog, and any layout that breaks at the
 * longer length will break in a real translation too.
 *
 * What it leaves alone, because a translator must as well: `{placeholders}`,
 * `<tags>`, digits, punctuation, and Morse itself (dots, dashes, slashes). It
 * also leaves alone any run of capitals of three or fewer letters: those are
 * characters being taught (E, T), prosigns (AR, SK) and abbreviations (CQ,
 * WPM), which no translation changes.
 *
 * `accentOnly` skips the stretching. The registry's titles and descriptions go
 * through that version so the length tests run on the pseudo-locale exactly as
 * they would on a real one, and FAQ link phrases stay substrings of their
 * answers.
 */

const ACCENTED: Readonly<Record<string, string>> = {
  a: 'å',
  b: 'ƀ',
  c: 'ç',
  d: 'ð',
  e: 'é',
  f: 'ƒ',
  g: 'ĝ',
  h: 'ĥ',
  i: 'î',
  j: 'ĵ',
  k: 'ķ',
  l: 'ļ',
  m: 'ɱ',
  n: 'ñ',
  o: 'ö',
  p: 'þ',
  q: 'ǫ',
  r: 'ŕ',
  s: 'š',
  t: 'ţ',
  u: 'û',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ý',
  z: 'ž',
  A: 'Å',
  B: 'Ɓ',
  C: 'Ç',
  D: 'Đ',
  E: 'É',
  F: 'Ƒ',
  G: 'Ĝ',
  H: 'Ĥ',
  I: 'Î',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ļ',
  M: 'Ṁ',
  N: 'Ñ',
  O: 'Ö',
  P: 'Þ',
  Q: 'Ǫ',
  R: 'Ŕ',
  S: 'Š',
  T: 'Ţ',
  U: 'Û',
  V: 'Ṽ',
  W: 'Ŵ',
  X: 'Ẋ',
  Y: 'Ý',
  Z: 'Ž',
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'A', 'E', 'I', 'O', 'U'])

/** Placeholders, tags, and short all-caps words: passed through untouched. */
const KEEP = /(\{[A-Za-z]\w*\}|<\/?[A-Za-z][\w-]*>|\b[A-Z0-9]{1,3}\b)/

export interface PseudoOptions {
  /** Accent only, no stretching: lengths stay as they are. */
  accentOnly?: boolean
}

function transformRun(run: string, stretch: boolean): string {
  let out = ''
  for (const char of run) {
    const accented = ACCENTED[char]
    if (!accented) {
      out += char
      continue
    }
    out += stretch && VOWELS.has(char) ? accented + accented : accented
  }
  return out
}

/** One string in the pseudo-locale. */
export function pseudoString(text: string, options: PseudoOptions = {}): string {
  const stretch = options.accentOnly !== true
  return text
    .split(KEEP)
    .map((part, index) => (index % 2 === 1 ? part : transformRun(part, stretch)))
    .join('')
}

/** Keys whose values are addresses or identifiers, never prose. */
const NOT_PROSE = new Set(['href', 'path', 'parent', 'markdown', 'slug', 'url', 'group', 'id'])

/**
 * A whole value in the pseudo-locale: strings transformed, arrays and objects
 * walked, and the address-like fields above left as they are.
 */
export function pseudoValue<T>(value: T, options: PseudoOptions = {}): T {
  if (typeof value === 'string') return pseudoString(value, options) as T
  if (Array.isArray(value)) return value.map((item) => pseudoValue(item, options)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value)) {
      out[key] = NOT_PROSE.has(key) ? inner : pseudoValue(inner, options)
    }
    return out as T
  }
  return value
}
