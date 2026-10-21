/**
 * Morse as words, for a screen reader.
 *
 * Screen readers read the display glyphs badly: "·" comes out as "middle dot"
 * or nothing at all, "−" as "minus", and a plain "." as a pause. Every place
 * that shows a code to the eye puts this text beside it for the ear, with the
 * glyphs `aria-hidden`.
 *
 * Takes a code as `encode()` writes it (`.`, `-`, a space between characters,
 * ` / ` between words) and also the prettified glyphs, so a caller never has
 * to know which form it holds. Any run of separators is one "break": a
 * listener needs to hear where one character ends, not count the spaces.
 * Anything else (the translator's `?x?` placeholders) is not Morse and is
 * left out.
 *
 *   spokenCode('.-')        → 'dot dash'
 *   spokenCode('.- / -.')   → 'dot dash break dash dot'
 */
export function spokenCode(code: string): string {
  const words: string[] = []
  let pendingBreak = false
  for (const mark of code) {
    const word = WORDS[mark]
    if (word === undefined) continue
    if (word === 'break') {
      pendingBreak = words.length > 0
      continue
    }
    if (pendingBreak) words.push('break')
    pendingBreak = false
    words.push(word)
  }
  return words.join(' ')
}

const WORDS: Readonly<Record<string, 'dot' | 'dash' | 'break'>> = {
  '.': 'dot',
  '·': 'dot',
  '-': 'dash',
  '−': 'dash',
  ' ': 'break',
  '/': 'break',
}
