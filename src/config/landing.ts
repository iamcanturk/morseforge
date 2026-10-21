/**
 * The landing page's copy, as data.
 *
 * `index.astro` is being rebuilt while the words on it are being rewritten, and
 * those two jobs should not touch the same lines. So the words live here, typed,
 * and the page only wires them to markup: `LANDING.hero.h1` goes in the `<h1>`,
 * each `LANDING.tools.items` entry becomes a card, and so on. Restyle freely;
 * nothing here needs retyping.
 *
 * The order of the keys is the order of the page (DEC-012). The first
 * interactive element is the live key in the hero, and the decode puzzle is the
 * third section, below the three-step explanation. Every figure is interpolated
 * from `FACTS`, and `landing.test.ts` checks the page says the things the SEO
 * audit requires it to say (visible H1, what Morse code is, what MorseForge is,
 * the four target phrases, a five-question FAQ).
 */

import { faqFor, type FaqItem } from '../data/faq'
import { capitalise, joinList, numberWord } from '../data/format'
import { LETTERS } from '../data/morseAlphabet'
import { MORSE_TREE, treeDepth } from '../data/tree'
import { FACTS, MASTERY_RULE } from './facts'
import { CITATIONS, SITE } from './site'

export interface LandingLink {
  /** Exact text inside the paragraph to turn into a link. */
  text: string
  href: string
}

export interface LandingCta {
  label: string
  href: string
}

export interface LandingStep {
  title: string
  body: string
  href: string
}

export interface LandingTool {
  title: string
  blurb: string
  href: string
}

/**
 * One of the hero's promises. A promise that can be checked links to where
 * (JI-3): the source code, or the privacy page that says what stays on the
 * device. The rest are plain statements.
 */
export interface LandingPromise {
  text: string
  href?: string
}

export interface LandingParagraph {
  text: string
  links?: readonly LandingLink[]
}

export interface LandingCopy {
  hero: {
    /** The brand line. It stays as the eyebrow and the wordmark's tagline. */
    eyebrow: string
    /** The one visible H1. */
    h1: string
    lead: string
    /**
     * The live key: the first interactive element on the page. `heading` and
     * `hint` speak to a first-timer; someone who has keyed before sees
     * `welcomeHeading` instead, and no E/T hint (J-07).
     */
    key: { heading: string; welcomeHeading: string; hint: string }
    primaryCta: LandingCta
    secondaryCta: LandingCta
    tertiaryCta: LandingCta
  }
  steps: { heading: string; items: readonly LandingStep[] }
  decode: { heading: string; lead: string }
  network: { heading: string; lead: string }
  tools: { heading: string; items: readonly LandingTool[] }
  why: { heading: string; paragraphs: readonly string[]; link: LandingLink }
  whatMorseForgeIs: { heading: string; paragraph: LandingParagraph }
  whatIsMorse: { heading: string; paragraph: LandingParagraph }
  faq: { heading: string; items: readonly FaqItem[] }
  promises: readonly LandingPromise[]
}

const firstDay = FACTS.planFirstDayCharacters

/** "dot" or "dash": what a one-element character is made of. */
const elementName = (character: string): string =>
  LETTERS[character as keyof typeof LETTERS] === '.' ? 'dot' : 'dash'

/** "E is a single dot and T is a single dash". */
const singleElementSentence = joinList(
  firstDay.map((character) => `${character} is a single ${elementName(character)}`),
)

export const LANDING: LandingCopy = {
  hero: {
    eyebrow: SITE.tagline,
    h1: 'Learn Morse code by ear, not from a chart',
    lead: `A free Morse code trainer with real CW audio and a telegraph key on your keyboard. ${capitalise(numberWord(firstDay.length))} characters on day one, all ${FACTS.letterCount} letters and ${FACTS.digitCount} digits by day ${numberWord(FACTS.planDays)}.`,
    key: {
      heading: 'Send your first signal',
      welcomeHeading: 'Your station',
      hint: `Tap the key or press Space: a short press is a dot, a long press is a dash. ${capitalise(singleElementSentence)}, so start there.`,
    },
    primaryCta: { label: 'Start learning — day 1', href: '/learn/' },
    secondaryCta: {
      label: `Take the ${FACTS.challengeSeconds}-second test`,
      href: '/challenge/',
    },
    tertiaryCta: { label: 'Or open the full Morse key', href: '/telegraph/' },
  },

  steps: {
    heading: 'Start in under a minute',
    items: [
      {
        title: 'Hear one character',
        body: 'The guided lesson shows it, plays it as real Morse code audio, then asks you to send it back.',
        href: '/learn/',
      },
      {
        title: 'Send your own',
        body: 'Hold the space bar or the on-screen key: tap for a dot, hold for a dash.',
        href: '/telegraph/',
      },
      {
        title: 'Test yourself',
        body: `A ${FACTS.challengeSeconds}-second test, one character at a time, then a link to challenge a friend.`,
        href: '/challenge/',
      },
    ],
  },

  decode: {
    heading: 'Can you read this?',
    lead: 'It is a real signal at real Morse timing. Press play, listen, and type what you hear.',
  },

  /** The tree drawing (Landing/NetworkTree.astro); its figure text is in Landing/network.ts. */
  network: {
    heading: `${FACTS.letterCount} letters. ${treeDepth(MORSE_TREE)} levels. One tree.`,
    lead: 'A dot goes left, a dash goes right — every letter sits where its own code spells it out.',
  },

  tools: {
    heading: 'Free Morse code tools',
    items: [
      {
        title: `Learn Morse code in ${FACTS.planDays} days`,
        blurb: `The alphabet in the order the code is built, one layer of the tree per day. About ${FACTS.planTime} in total.`,
        href: '/learn-morse-code-in-7-days/',
      },
      {
        title: 'Morse code practice',
        blurb:
          'Copy by ear, read dots and dashes, or send. Spaced repetition brings back what you are about to forget.',
        href: '/practice/',
      },
      {
        title: 'Morse code translator',
        blurb: `Text to Morse and back as you type, with audio and a signal lamp from ${FACTS.wpmMin} to ${FACTS.wpmMax} WPM.`,
        href: '/morse-code-translator/',
      },
      {
        title: 'Morse code alphabet',
        blurb: `All ${FACTS.letterCount} letters, ${FACTS.digitCount} numbers and ${FACTS.ituPunctuationCount} punctuation marks per ${CITATIONS.itu.short}. Press any to hear it.`,
        href: '/morse-code-alphabet/',
      },
      {
        title: 'Online Morse key',
        blurb:
          'Your keyboard becomes a straight key. Tap for a dot, hold for a dash, decoded live.',
        href: '/telegraph/',
      },
      {
        title: 'The Morse code tree',
        blurb: 'Why every letter has the code it has, drawn as the binary tree it really is.',
        href: '/tree/',
      },
      {
        title: 'Words in Morse code',
        blurb: `${FACTS.wordCount} words and phrases, from SOS to 73, each playable and explained.`,
        href: '/words/',
      },
      {
        title: 'Send a secret message',
        blurb:
          'Write a message and get a link. Whoever opens it hears it in Morse code, and the message never reaches a server.',
        href: '/message/',
      },
      {
        title: `${FACTS.challengeSeconds}-second test · Daily challenge · Games`,
        blurb: 'Copy and send under a clock, when you are ready to find out what has stuck.',
        href: '/challenge/',
      },
    ],
  },

  why: {
    heading: 'Why learning by sound works',
    paragraphs: [
      `Most people learn Morse from a chart, memorise ${numberWord(FACTS.letterCount)} patterns of dots and dashes, and hit a wall around ten words per minute that no amount of practice moves. The chart caused it: it taught them to translate rather than to hear, and that extra step is a fixed cost the speed eventually outruns.`,
      `MorseForge teaches each character as a sound from the first minute, in the order the code is actually structured, and makes you send it back as well as read it. It tracks recognising, hearing and sending separately, because they are different abilities, and a character only counts as mastered with ${MASTERY_RULE}.`,
    ],
    link: {
      text: "Why you can't learn Morse code from a chart",
      href: '/blog/why-a-morse-code-chart-does-not-work/',
    },
  },

  whatMorseForgeIs: {
    heading: 'What MorseForge is',
    paragraph: {
      text: `MorseForge is a free Morse code trainer that runs in your browser. It teaches International Morse code by sound, shortest codes first, so you can learn all ${FACTS.letterCount} letters and ${FACTS.digitCount} digits in ${FACTS.planDays} days. You hear real CW audio, send with your keyboard as a telegraph key, and your progress stays on your device.`,
      links: [{ text: `${FACTS.planDays} days`, href: '/learn-morse-code-in-7-days/' }],
    },
  },

  whatIsMorse: {
    heading: 'What is Morse code?',
    paragraph: {
      text: `Morse code sends text as short and long signals called dots and dashes, or dits and dahs. Every letter, digit and punctuation mark has its own fixed pattern: ${singleElementSentence}, and every digit is exactly ${numberWord(FACTS.digitElements)} elements long. The international version is defined by Recommendation ${CITATIONS.itu.short}.`,
      links: [
        { text: 'fixed pattern', href: '/morse-code-alphabet/' },
        { text: CITATIONS.itu.short, href: CITATIONS.itu.url },
      ],
    },
  },

  faq: { heading: 'Questions people ask', items: faqFor('/') },

  promises: [
    { text: 'No account' },
    { text: 'No ads' },
    { text: 'Works offline' },
    { text: 'Progress stays on your device', href: '/privacy/' },
    { text: 'Open source', href: SITE.repo },
  ],
}
