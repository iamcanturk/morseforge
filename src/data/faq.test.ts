import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CHARACTERS, PAGE_CHARACTERS } from './characters'
import { PAGE_FAQ, characterFaq, faqFor, wordFaq, type FaqItem } from './faq'
import { WORDS } from './words'
import { handTypedMorse } from '../seo/proseScan'
import { LETTERS } from './morseAlphabet'
import { encode } from '../engine/morseEncoder'

const wordsIn = (text: string) => text.trim().split(/\s+/).length

/** Every FAQ the site can render: the fixed pages, every word, every character. */
const everything: [string, FaqItem[]][] = [
  ...Object.entries(PAGE_FAQ).map(([path, items]): [string, FaqItem[]] => [path, [...items]]),
  ...WORDS.map((word): [string, FaqItem[]] => [`word:${word.slug}`, wordFaq(word)]),
  ...Object.values(CHARACTERS).map((facts): [string, FaqItem[]] => [
    `character:${facts.character}`,
    characterFaq(facts),
  ]),
]

describe('every FAQ', () => {
  it('has at least one entry per source, and covers every word and character', () => {
    expect(Object.keys(PAGE_FAQ).length).toBeGreaterThanOrEqual(8)
    expect(everything.length).toBe(
      Object.keys(PAGE_FAQ).length + WORDS.length + Object.keys(CHARACTERS).length,
    )
  })

  it('asks a question and gives a self-contained answer of at least 25 words', () => {
    for (const [source, items] of everything) {
      expect(items.length, source).toBeGreaterThan(0)
      for (const item of items) {
        expect(item.question.endsWith('?'), `${source}: ${item.question}`).toBe(true)
        expect(
          wordsIn(item.answer),
          `${source}: "${item.question}" answers in ${wordsIn(item.answer)} words`,
        ).toBeGreaterThanOrEqual(25)
      }
    }
  })

  it('never asks the same question twice on one page', () => {
    for (const [source, items] of everything) {
      const questions = items.map((item) => item.question)
      expect(new Set(questions).size, source).toBe(questions.length)
    }
  })

  it('never leaks an unfilled value into the copy', () => {
    for (const [source, items] of everything) {
      for (const item of items) {
        for (const text of [item.question, item.answer]) {
          expect(text, `${source}: ${item.question}`).not.toMatch(/undefined|null|NaN|\[object/)
        }
      }
    }
  })

  it('links only phrases that appear in the answer', () => {
    for (const [source, items] of everything) {
      for (const item of items) {
        for (const link of item.links ?? []) {
          expect(item.answer, `${source}: "${link.text}"`).toContain(link.text)
          expect(link.href, `${source}: "${link.text}"`).toMatch(/^(\/|https:\/\/)/)
        }
      }
    }
  })
})

describe('Morse in the copy', () => {
  it('is never typed into faq.ts, only interpolated', () => {
    // CONTRIBUTING's one rule. A code in an answer arrives through encode() or
    // the alphabet, so it cannot disagree with the trainer.
    const source = readFileSync(new URL('./faq.ts', import.meta.url), 'utf8')
    expect(handTypedMorse(source)).toEqual([])
  })

  it('renders the codes the answers quote from the data', () => {
    const translator = faqFor('/morse-code-translator/')[0]!.answer
    expect(translator).toContain(`"${encode('SOS')}"`)
    expect(translator).toContain(`"${encode('HI THERE')}"`)
  })
})

describe('/morse-code-alphabet/ FAQ', () => {
  const [count, , digits, longest, timing] = faqFor('/morse-code-alphabet/')

  it('splits the standard from the common extras, as the owner decided (DEC-012)', () => {
    expect(count!.answer).toContain('26 letters, 10 digits and 13 punctuation marks')
    expect(count!.answer).toContain(
      '5 widely used marks that the standard does not define: the exclamation mark, ampersand, semicolon, underscore and dollar sign',
    )
    expect(count!.answer).not.toMatch(/\b18\b/)
  })

  it('states the digit rule the tests already check', () => {
    expect(digits!.answer).toContain('1 is one dot and four dashes, 2 is two dots and three dashes')
    expect(digits!.answer).toContain('up to 5, which is five dots')
    expect(digits!.answer).toContain('6 is one dash and four dots, up to 0, which is five dashes')
    expect(digits!.answer).toContain('exactly five elements long')
  })

  it('lists the twelve four-element letters alphabetically', () => {
    expect(longest!.answer).toContain(
      '12 letters share that length: B, C, F, H, J, L, P, Q, V, X, Y and Z',
    )
  })

  it('quotes the timing at 20 WPM from the timing engine', () => {
    expect(timing!.answer).toContain(
      'one unit is 60 milliseconds, so a dash lasts 180 milliseconds',
    )
    expect(timing!.answer).toContain('between letters three units and between words seven')
  })
})

describe('/learn-morse-code-in-7-days/ FAQ', () => {
  const plan = faqFor('/learn-morse-code-in-7-days/')

  it('says what the plan teaches in the words the audit approved', () => {
    expect(plan[0]!.answer).toContain('all 26 letters and 10 digits in seven days')
    expect(plan[1]!.answer).toContain('E (one dot) and T (one dash)')
    expect(plan[1]!.answer).toContain('the four two-element characters I, A, N and M')
    expect(plan[1]!.answer).toContain('the eight three-element characters')
    expect(plan[1]!.answer).toContain('the twelve four-element ones')
  })

  it('answers how long a day takes from the curriculum, not from memory', () => {
    const minutes = plan.find((item) => item.question.includes('minutes a day'))!
    expect(minutes.answer).toContain('Between 10 and 25 minutes')
    expect(minutes.answer).toContain('Day 1 takes about 10 minutes')
    expect(minutes.answer).toContain('days 5 and 6 about 25 minutes each')
    expect(minutes.answer).toContain('about 2 hours 15 minutes')
  })

  it('points the Farnsworth answer at the ARRL paper', () => {
    const farnsworth = plan.find((item) => item.question === 'What is Farnsworth timing?')!
    expect(farnsworth.links?.map((link) => link.href)).toContain(
      'https://www.arrl.org/files/file/Technology/x9004008.pdf',
    )
  })
})

describe('home FAQ', () => {
  it('has the five questions people ask', () => {
    expect(faqFor('/').map((item) => item.question)).toEqual([
      'How long does it take to learn Morse code?',
      'Is MorseForge free?',
      'What is the best way to learn Morse code?',
      'Can I practise Morse code on my phone?',
      'Which Morse code does MorseForge teach?',
    ])
  })

  it('gives the learning time from the plan', () => {
    const answer = faqFor('/')[0]!.answer
    expect(answer).toContain('about 2 hours 15 minutes of practice')
    expect(answer).toContain('7-day plan')
    expect(answer).toContain('sessions of 10 to 25 minutes')
  })
})

describe('translator FAQ', () => {
  it('names the exclamation mark as outside the standard and gives its code from the data', () => {
    const punctuation = faqFor('/morse-code-translator/').find((item) =>
      item.question.includes('punctuation'),
    )!
    expect(punctuation.answer).toContain('all 10 digits and 13 punctuation marks')
    expect(punctuation.answer).toContain('The exclamation mark is not in the standard')
  })
})

describe('word FAQs', () => {
  it('opens with the entry and its note, and times it at 20 WPM', () => {
    const sos = wordFaq(WORDS.find((word) => word.slug === 'sos')!)
    expect(sos[0]!.question).toBe('What is SOS in Morse code?')
    expect(sos[1]!.answer).toContain('about 1.6 seconds')
    expect(sos[1]!.answer).toContain('6 dots and 3 dashes')
    expect(sos[1]!.answer).toContain('60 milliseconds')
  })

  it('only explains how to write a multi-word entry', () => {
    const single = wordFaq(WORDS.find((word) => word.slug === 'hello')!)
    const multi = wordFaq(WORDS.find((word) => word.slug === 'i-love-you')!)
    expect(single).toHaveLength(2)
    expect(multi).toHaveLength(3)
    expect(multi[2]!.question).toBe('How do you write I love you in Morse code?')
    expect(multi[2]!.answer).toContain('the three words of I love you are divided by two slashes')
    const goodMorning = wordFaq(WORDS.find((word) => word.slug === 'good-morning')!)
    expect(goodMorning[2]!.answer).toContain('divided by one slash.')
  })
})

describe('character FAQs', () => {
  it('describes A from the data', () => {
    const [what, confused, learn] = characterFaq(CHARACTERS['A']!)
    expect(what!.answer).toContain(`A in Morse code is "${LETTERS.A}", spoken di-dah`)
    expect(what!.answer).toContain('takes 300 milliseconds')
    expect(what!.answer).toContain('two steps from the root')
    expect(confused!.answer).toContain('N (-.), its mirror image with dots and dashes swapped')
    expect(learn!.answer).toContain('on day 2, together with I, N and M')
  })

  it('leaves a question out when its value is empty', () => {
    const questions = characterFaq(CHARACTERS['?']!).map((item) => item.question)
    expect(questions).toContain('What is the question mark in Morse code?')
    expect(questions.some((question) => question.startsWith('How do you learn'))).toBe(false)
  })

  it('has a full FAQ for every letter and digit', () => {
    for (const character of PAGE_CHARACTERS) {
      expect(characterFaq(CHARACTERS[character]!).length, character).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('Signal setting FAQ (DEC-045)', () => {
  const item = faqFor('/practice/').find((entry) => entry.question.includes('sound off'))

  it('answers the deaf and sound-off question on the practice page', () => {
    expect(item?.question).toBe('Can I practise Morse code with the sound off, or if I am deaf?')
    expect(item!.answer).toContain('three choices: sound, lamp or both')
    expect(item!.answer).toContain('the 60-second challenge')
  })

  it('links Settings to the Signal panel', () => {
    expect(item!.links).toEqual([{ text: 'Settings', href: '/settings/#signal' }])
  })
})

describe('Morse Runner FAQ', () => {
  it('states the commit rule the runner follows', () => {
    const [, timing] = faqFor('/games/morse-runner/')
    expect(timing!.answer).toContain(
      'committed as soon as what you have keyed matches a gate, or can no longer match any gate on the track',
    )
    expect(timing!.links?.map((link) => link.href)).toContain('/settings/')
  })
})

describe('faqFor', () => {
  it('returns nothing for a page without a FAQ', () => {
    expect(faqFor('/privacy/')).toEqual([])
  })
})
