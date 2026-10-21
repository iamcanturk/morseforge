import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LANDING, type LandingParagraph } from './landing'
import { SITE } from './site'
import { findPage } from './pages'
import { handTypedMorse } from '../seo/proseScan'

const wordsIn = (text: string) => text.trim().split(/\s+/).length

/** Every string the page shows, in page order. */
function visibleText(): string {
  const { hero, steps, decode, network, tools, why, whatMorseForgeIs, whatIsMorse, faq } = LANDING
  return [
    hero.eyebrow,
    hero.h1,
    hero.lead,
    hero.key.heading,
    hero.key.hint,
    hero.primaryCta.label,
    hero.secondaryCta.label,
    hero.tertiaryCta.label,
    steps.heading,
    ...steps.items.flatMap((item) => [item.title, item.body]),
    decode.heading,
    decode.lead,
    network.heading,
    network.lead,
    tools.heading,
    ...tools.items.flatMap((item) => [item.title, item.blurb]),
    why.heading,
    ...why.paragraphs,
    why.link.text,
    whatMorseForgeIs.heading,
    whatMorseForgeIs.paragraph.text,
    whatIsMorse.heading,
    whatIsMorse.paragraph.text,
    faq.heading,
    ...faq.items.flatMap((item) => [item.question, item.answer]),
    ...LANDING.promises.map((promise) => promise.text),
  ].join('\n')
}

describe('LANDING hero', () => {
  it('has the visible H1 the owner chose, with the brand line kept as the eyebrow', () => {
    expect(LANDING.hero.h1).toBe('Learn Morse code by ear, not from a chart')
    expect(LANDING.hero.eyebrow).toBe(SITE.tagline)
    expect(LANDING.hero.eyebrow).toBe('Learn Morse. Build the Signal.')
  })

  it('reads the day-one and day-seven figures from the plan', () => {
    expect(LANDING.hero.lead).toContain(
      'Two characters on day one, all 26 letters and 10 digits by day seven.',
    )
    expect(LANDING.hero.lead).toContain('Morse code trainer')
  })

  it('invites the visitor to send a first signal with the live key', () => {
    expect(LANDING.hero.key.heading).toBe('Send your first signal')
    expect(LANDING.hero.key.hint).toContain('E is a single dot and T is a single dash')
  })

  it('points the three calls to action at the learn, test and key pages', () => {
    expect(LANDING.hero.primaryCta.href).toBe('/learn/')
    expect(LANDING.hero.secondaryCta).toEqual({
      label: 'Take the 60-second test',
      href: '/challenge/',
    })
    expect(LANDING.hero.tertiaryCta.href).toBe('/telegraph/')
  })
})

describe('LANDING order', () => {
  it('follows the page: hero key, steps, decode puzzle third', () => {
    expect(Object.keys(LANDING)).toEqual([
      'hero',
      'steps',
      'decode',
      'network',
      'tools',
      'why',
      'whatMorseForgeIs',
      'whatIsMorse',
      'faq',
      'promises',
    ])
  })

  it('has three steps, each linking where it says', () => {
    expect(LANDING.steps.items.map((step) => step.href)).toEqual([
      '/learn/',
      '/telegraph/',
      '/challenge/',
    ])
    expect(LANDING.steps.items[2]!.body).toContain('60-second test')
  })

  it('keeps the two paragraphs the audit called good, with the count interpolated', () => {
    expect(LANDING.why.paragraphs).toHaveLength(2)
    expect(LANDING.why.paragraphs[0]).toContain('memorise 26 patterns of dots and dashes')
    expect(LANDING.why.link.href).toBe('/blog/why-a-morse-code-chart-does-not-work/')
  })
})

describe('quotable paragraphs', () => {
  const paragraphs: [string, LandingParagraph][] = [
    ['What MorseForge is', LANDING.whatMorseForgeIs.paragraph],
    ['What is Morse code?', LANDING.whatIsMorse.paragraph],
  ]

  it.each(paragraphs)('%s is self-contained, answer-first and 40 to 70 words', (_, paragraph) => {
    expect(wordsIn(paragraph.text)).toBeGreaterThanOrEqual(40)
    expect(wordsIn(paragraph.text)).toBeLessThanOrEqual(70)
  })

  it.each(paragraphs)('%s links only text that is in it', (_, paragraph) => {
    for (const link of paragraph.links ?? []) expect(paragraph.text).toContain(link.text)
  })

  it('names the product and the thing it teaches in the first sentence', () => {
    expect(LANDING.whatMorseForgeIs.paragraph.text).toMatch(
      /^MorseForge is a free Morse code trainer that runs in your browser\./,
    )
    expect(LANDING.whatIsMorse.paragraph.text).toMatch(/^Morse code sends text as short and long/)
  })

  it('states the plan and ITU facts from the data', () => {
    expect(LANDING.whatMorseForgeIs.paragraph.text).toContain(
      'learn all 26 letters and 10 digits in 7 days',
    )
    expect(LANDING.whatIsMorse.paragraph.text).toContain(
      'every digit is exactly five elements long',
    )
    expect(LANDING.whatIsMorse.paragraph.text).toContain('Recommendation ITU-R M.1677-1')
  })
})

describe('keywords the audit wants in natural sentences', () => {
  const text = visibleText().toLowerCase()

  it.each(['learn morse code', 'morse code trainer', 'morse code practice', 'morse code audio'])(
    'says "%s" at least once',
    (phrase) => {
      expect(text).toContain(phrase)
    },
  )
})

describe('numbers in the tools list', () => {
  it('are the ones the data holds', () => {
    const blurbs = LANDING.tools.items.map((item) => item.blurb).join('\n')
    expect(blurbs).toContain('About 2 hours 15 minutes in total')
    expect(blurbs).toContain('from 5 to 40 WPM')
    expect(blurbs).toContain(
      'All 26 letters, 10 numbers and 13 punctuation marks per ITU-R M.1677-1',
    )
    expect(blurbs).toContain('22 words and phrases, from SOS to 73')
  })

  it('names the new message tool', () => {
    expect(LANDING.tools.items.map((item) => item.href)).toContain('/message/')
  })
})

describe('the hero promises (JI-3)', () => {
  it('link only to the proof: the repository, or a page that exists', () => {
    const linked = LANDING.promises.filter((promise) => promise.href)
    expect(linked.map((promise) => promise.text)).toEqual([
      'Progress stays on your device',
      'Open source',
    ])
    for (const { href } of linked) {
      if (href!.startsWith('http')) expect(href).toBe(SITE.repo)
      else expect(findPage(href!), href).toBeDefined()
    }
  })
})

describe('FAQ', () => {
  it('shows the five questions the audit specified', () => {
    expect(LANDING.faq.items).toHaveLength(5)
  })
})

describe('Morse in the copy', () => {
  it('is never typed into landing.ts', () => {
    const source = readFileSync(new URL('./landing.ts', import.meta.url), 'utf8')
    expect(handTypedMorse(source)).toEqual([])
  })
})
