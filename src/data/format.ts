/**
 * Small formatters for turning data into the sentences the pages say.
 *
 * Copy that contains a number must interpolate the constant it came from, never
 * type it (CONTRIBUTING's one rule, extended from codes to every figure). These
 * exist so that doing the right thing is also the shorter thing to write.
 */

/** "2 hours 15 minutes", "1 hour", "45 minutes". Rounds to whole minutes. */
export function formatMinutes(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    throw new RangeError(`minutes must be a non-negative finite number, got ${totalMinutes}`)
  }
  const rounded = Math.round(totalMinutes)
  const hours = Math.floor(rounded / 60)
  const minutes = rounded % 60
  const parts: string[] = []
  if (hours > 0) parts.push(plural(hours, 'hour'))
  if (minutes > 0 || hours === 0) parts.push(plural(minutes, 'minute'))
  return parts.join(' ')
}

/** "1 minute", "2 minutes". Pass `pluralForm` for the irregular ones. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** Milliseconds as seconds to one decimal place: 1620 becomes "1.6". */
export function formatSeconds(milliseconds: number): string {
  return (Math.round(milliseconds / 100) / 10).toFixed(1)
}

/** "A", "A and B", "A, B and C". No Oxford comma, matching the site's copy. */
export function joinList(items: readonly string[], conjunction = 'and'): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1)}`
}

const SMALL_NUMBERS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
] as const

/**
 * A number as a word up to twenty, digits beyond that. Prose reads better with
 * "seven days" than "7 days" for small counts, and badly with "twenty-six" typed
 * by hand next to a constant that could change.
 */
export function numberWord(value: number): string {
  return Number.isInteger(value) && value >= 0 && value <= 20
    ? SMALL_NUMBERS[value]!
    : String(value)
}

/** Upper-case the first letter, for a number word at the start of a sentence. */
export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Describe a Morse code in words: ".-" is "one dot and one dash", "....-" is
 * "four dots and one dash". Used wherever prose explains a pattern, so the
 * explanation is derived from the code instead of retyped beside it.
 */
export function describeElements(code: string): string {
  const dots = [...code].filter((element) => element === '.').length
  const dashes = code.length - dots
  const dotText = dots > 0 ? plural(dots, 'dot') : ''
  const dashText = dashes > 0 ? plural(dashes, 'dash', 'dashes') : ''
  // Lead with whichever element the code starts with, so "-...." reads as
  // "one dash and four dots", the way it sounds.
  const ordered = code.startsWith('-') ? [dashText, dotText] : [dotText, dashText]
  return ordered
    .filter(Boolean)
    .map((text) => text.replace(/^(\d+)/, (digits) => numberWord(Number(digits))))
    .join(' and ')
}
