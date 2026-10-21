/**
 * Find Morse typed by hand into a source file.
 *
 * CONTRIBUTING's one rule is that a code appears in exactly one place,
 * `morseAlphabet.ts`. Copy files (`faq.ts`, `pages.ts`, `landing.ts`) are the
 * likeliest place to break it, because a sentence like "SOS is ... --- ..." is
 * the natural thing to write. This reads such a file the way a person would: it
 * drops comments and the contents of `${...}` interpolations, which is where a
 * code is *supposed* to arrive from, and reports any run of three or more dots
 * and hyphens left inside a string literal.
 *
 * Used by tests only. It lives under `seo/` so it ships nowhere.
 */

/** Remove `//` and block comments, leaving URLs inside strings alone. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Remove every `${ ... }` expression, however deeply its braces nest. */
export function stripInterpolations(source: string): string {
  let result = ''
  let depth = 0
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!
    if (depth === 0 && character === '$' && source[index + 1] === '{') {
      depth = 1
      index++
      continue
    }
    if (depth > 0) {
      if (character === '{') depth++
      else if (character === '}') depth--
      continue
    }
    result += character
  }
  return result
}

/** The text of every string and template literal, with interpolations removed. */
export function stringLiterals(source: string): string[] {
  const code = stripInterpolations(stripComments(source))
  const pattern = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\[\s\S])*`/g
  return [...code.matchAll(pattern)].map((match) => match[0].slice(1, -1))
}

/** Runs of three or more dots and hyphens in the string literals of a file. */
export function handTypedMorse(source: string): string[] {
  return stringLiterals(source).flatMap((literal) => literal.match(/[.-]{3,}/g) ?? [])
}
