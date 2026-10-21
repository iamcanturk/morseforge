import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { characterHref, slugsFromPaths } from './characterLinks'
import { stripComments } from '../../seo/proseScan'
import { ITU_PUNCTUATION, LETTERS, NON_ITU_PUNCTUATION } from '../../data/morseAlphabet'
import { encode } from '../../engine/morseEncoder'

/**
 * Package I's reference pages and players.
 *
 * The rule these pages are most likely to break is the one CONTRIBUTING puts
 * first: a Morse code is typed in exactly one file, morseAlphabet.ts. A page is
 * where "SOS is ... --- ..." is the natural thing to write, so every file here
 * is scanned for a run of three or more dots and hyphens in its text, after
 * dropping comments, `{...}` expressions and the syntax that legitimately
 * contains such runs (frontmatter fences, spread operators, ellipses).
 */

const FILES = [
  'components/Translator/Translator.tsx',
  'components/MorsePlayer/MorsePlayer.tsx',
  'components/MorsePlayer/MorsePlayer.astro',
  'components/MorsePlayer/player.ts',
  'components/Alphabet/AlphabetChart.astro',
  'components/Alphabet/Breadcrumbs.astro',
  'components/Alphabet/Pips.astro',
  'components/Alphabet/characterLinks.ts',
  'components/Alphabet/chart.ts',
  'pages/morse-code-translator.astro',
  'pages/morse-code-alphabet.astro',
  'pages/words/index.astro',
  'pages/words/[slug].astro',
  'pages/blog/index.astro',
  'pages/blog/[...slug].astro',
  'pages/404.astro',
  'pages/privacy.astro',
  'styles/pkg-i.css',
]

const read = (file: string) =>
  readFileSync(fileURLToPath(new URL(`../../${file}`, import.meta.url)), 'utf8')

/** Text a reader could see or copy: comments, code fences and spreads removed. */
function visibleRuns(source: string): string[] {
  const text = stripComments(source)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^---$/gm, '')
    .replace(/\.\.\.(?=[\w$[({'"`])/g, '')
    .replace(/var\(--[\w-]+/g, '')
    .replace(/…/g, '')
  return text.match(/[.-]{3,}/g) ?? []
}

describe('reference pages: no hand-typed Morse', () => {
  for (const file of FILES) {
    it(file, () => {
      expect(visibleRuns(read(file))).toEqual([])
    })
  }

  it('the scan does catch a typed code', () => {
    expect(visibleRuns('<p>SOS is ... --- ...</p>')).not.toEqual([])
  })
})

describe('slugsFromPaths', () => {
  it('reads the single param of each path, whatever it is called', () => {
    const paths = [{ params: { char: 'a' } }, { params: { slug: 'question-mark' } }]
    expect([...slugsFromPaths(paths)]).toEqual(['a', 'question-mark'])
  })

  it('ignores anything that is not a static path list', () => {
    expect(slugsFromPaths(undefined).size).toBe(0)
    expect(slugsFromPaths([{ params: { a: 'x', b: 'y' } }, {}]).size).toBe(0)
  })
})

describe('characterHref', () => {
  it('links only to a page the route builds', () => {
    expect(characterHref('A', new Set(['a']))).toBe('/morse-code-alphabet/a/')
    expect(characterHref('B', new Set(['a']))).toBeNull()
    expect(characterHref('?', new Set(['question-mark']))).toBe(
      '/morse-code-alphabet/question-mark/',
    )
  })

  it('never links a character MorseForge cannot send', () => {
    expect(characterHref('§', new Set(['§']))).toBeNull()
  })
})

describe('alphabet page claims', () => {
  it('the multiplication sign really is sent as X, so it needs no tile of its own', () => {
    // ITU-R M.1677-1 gives the multiplication sign the same code as X.
    expect(encode('X')).toBe(LETTERS.X)
    expect(Object.values(ITU_PUNCTUATION)).not.toContain(LETTERS.X)
  })

  it('the two punctuation plates do not overlap', () => {
    const itu = new Set(Object.keys(ITU_PUNCTUATION))
    expect(Object.keys(NON_ITU_PUNCTUATION).filter((mark) => itu.has(mark))).toEqual([])
  })
})
