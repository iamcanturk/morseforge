/**
 * The page registry: one place that knows every route and what to say about it.
 *
 * Titles, descriptions, headings, intros, nav labels, `llms.txt` lines and
 * breadcrumbs used to be typed separately into each template, the header, the
 * footer, the 404 and `llms.txt`, so they disagreed (six titles over 60
 * characters, seven descriptions over 155, a hand-written list of "key pages"
 * that left out the pages people search for). Now a template renders
 * `getPage(path)` and everything else is derived from the same entry.
 *
 * Titles include the " | MorseForge" suffix and are at most 60 characters;
 * descriptions are at most 155. Both limits are measured on the *rendered*
 * strings, with every bound figure interpolated, in `pages.test.ts`. Any figure
 * in this file comes from `FACTS` and any code from the alphabet, never typed.
 *
 * Dynamic routes (word pages, blog posts, character pages) are not listed here
 * because there is one entry per item, not per route. `wordPage`,
 * `blogPage` and `characterPage` below apply the same rules to them.
 */

import type { CharacterFacts } from '../data/characters'
import { describeElements, joinList, numberWord } from '../data/format'
import { ALL_DIGITS, ALL_LETTERS, DIGITS } from '../data/morseAlphabet'
import { PARIS_UNITS } from '../engine/timingEngine'
import type { MorseWord } from '../data/words'
import { FACTS, MASTERY_RULE, spanOf, wordFacts } from './facts'
import { LANDING } from './landing'
import { CITATIONS, SITE } from './site'

/** The browser-title budget before a results page cuts the title off. */
export const TITLE_MAX = 60
/** The description budget before a results page cuts it off. */
export const DESCRIPTION_MAX = 155

/** Where a page sits in navigation. `internal` pages are not linked from the site. */
export type PageGroup = 'home' | 'learn' | 'practise' | 'lookup' | 'internal'

/** Headings for the navigation groups, in display order. */
export const GROUP_LABELS: Readonly<Record<Exclude<PageGroup, 'home' | 'internal'>, string>> = {
  learn: 'Learn',
  practise: 'Practise',
  lookup: 'Look up',
}

export interface PageEntry {
  /** URL path with leading and trailing slash. The registry key. */
  path: string
  /** The `<title>`, brand suffix included, at most 60 characters. */
  title: string
  /** The meta description, at most 155 characters. */
  description: string
  /** The one visible `<h1>`. */
  h1: string
  /** Answer-first opening paragraph, written to be quoted on its own. */
  intro: string
  /** Short label for the header, footer and 404 links. */
  navLabel: string
  /** A few words under the label in the menu. */
  hint: string
  group: PageGroup
  /** One line for `llms.txt`, after the link: what the page is. */
  llmsSummary: string
  /** False keeps the page out of the sitemap and `llms.txt`, and noindexes it. */
  indexable: boolean
  /** Path of the page above it in the breadcrumb, or null for directly under Home. */
  parent: string | null
  /** Path of the plain-Markdown copy, or null. See the handoff before relying on it. */
  markdown: string | null
}

const BRAND = ` | ${SITE.name}`
const ITU = CITATIONS.itu.short
const { letterCount: L, digitCount: D, planDays: DAYS, challengeSeconds: SECONDS } = FACTS
const BY_LEN = FACTS.lettersByLength

/** "Name | MorseForge" while it fits, and just "Name" when the suffix would overflow. */
export function titleWithBrand(base: string): string {
  const full = `${base}${BRAND}`
  return full.length <= TITLE_MAX ? full : base
}

/**
 * The longest description that fits: `base` plus the first suffix that keeps the
 * total within the budget, trying them from fullest to shortest. Falls back to
 * the bare base, which a test then holds to the limit.
 */
export function fitDescription(base: string, suffixes: readonly string[]): string {
  return (
    suffixes.map((suffix) => `${base}${suffix}`).find((text) => text.length <= DESCRIPTION_MAX) ??
    base
  )
}

const HOME_PATH = '/'

export const PAGES = [
  {
    path: HOME_PATH,
    title: `Learn Morse Code Online — Free Morse Trainer${BRAND}`,
    description: `Learn Morse code by sound in ${DAYS} days with a free online trainer: real CW audio, a keyboard telegraph key and daily drills. No account, no ads, offline.`,
    h1: LANDING.hero.h1,
    intro: LANDING.hero.lead,
    navLabel: 'Home',
    hint: 'A free Morse code trainer',
    group: 'home',
    llmsSummary: 'overview and entry points',
    indexable: true,
    parent: null,
    markdown: null,
  },

  // Learn
  {
    path: '/learn/',
    title: `Morse Code Lessons — See It, Hear It, Send It${BRAND}`,
    description:
      'Guided Morse code lessons, one character at a time: see the code, hear it, send it back, then drill everything so far. Free, in your browser, no account.',
    h1: 'Morse code lessons',
    intro: `Each lesson teaches one Morse code character three ways: you see its dots and dashes, hear it as a real CW tone, and send it back with your keyboard or the on-screen key. Then it drills everything you have learned so far. Lessons follow the ${DAYS}-day plan's order and pick up exactly where you left off.`,
    navLabel: 'Guided lessons',
    hint: 'See it, hear it, send it',
    group: 'learn',
    llmsSummary: 'guided lessons: see, hear and send each character, then drill everything so far',
    indexable: true,
    parent: null,
    markdown: null,
  },
  {
    path: '/learn-morse-code-in-7-days/',
    title: `Learn Morse Code in ${DAYS} Days — Free Daily Plan${BRAND}`,
    description: `Learn all ${L} letters and ${D} digits of Morse code in ${DAYS} days, about ${FACTS.planTime} in total. Shortest codes first, with audio and drills for every day.`,
    h1: `Learn Morse code in ${DAYS} days`,
    intro: `You can learn the whole Morse code alphabet in a week by learning it in the order the code is built: shortest characters first, one layer of the Morse tree per day. This free plan takes about ${FACTS.planTime} of practice in total, spread over ${DAYS} days, and ends with all ${L} letters and ${D} digits.`,
    navLabel: `${DAYS}-day plan`,
    hint: 'The whole course, written out',
    group: 'learn',
    llmsSummary: `the full day-by-day plan: ${L} letters and ${D} digits in ${DAYS} days, about ${FACTS.planTime}`,
    indexable: true,
    parent: null,
    markdown: '/learn-morse-code-in-7-days.md',
  },
  {
    path: '/tree/',
    title: `Morse Code Tree — How Every Letter Is Built${BRAND}`,
    description:
      'An interactive Morse code tree: a dot branches left, a dash branches right, and every letter sits where its code leads. Press any letter to hear it.',
    h1: 'The Morse code tree',
    intro: `The Morse code tree shows why every character has the code it has. From the root, a dot branches one way and a dash the other, so each character sits exactly where its own code leads. ${joinList(BY_LEN[1]!)} are one step from the root, the ${BY_LEN[2]!.length} two-element letters two steps away, and the ${BY_LEN[4]!.length} four-element letters four.`,
    navLabel: 'The Morse tree',
    hint: 'Why each letter has its code',
    group: 'learn',
    llmsSummary: 'the binary tree behind the code, interactive: a dot branches left, a dash right',
    indexable: true,
    parent: null,
    markdown: null,
  },

  // Practise
  {
    path: '/practice/',
    title: `Morse Code Practice — Listen, Read and Send${BRAND}`,
    description:
      'Free Morse code practice in three modes: copy by ear, read dots and dashes, or key it yourself. Spaced repetition brings back what you are about to forget.',
    h1: 'Morse code practice',
    intro: `Morse code practice here has three modes, because recognising, hearing and sending a character are separate skills. Copy characters by ear, read printed dots and dashes, or key them yourself. Spaced repetition picks each prompt from what you are closest to forgetting, and a character only counts as mastered with ${MASTERY_RULE}.`,
    navLabel: 'Practice',
    hint: 'Listen, read or send',
    group: 'practise',
    llmsSummary: 'practice in three modes with spaced repetition: copy by ear, read, or send',
    indexable: true,
    parent: null,
    markdown: null,
  },
  {
    path: '/copy/',
    title: `Morse Code Copy Practice: Groups, Words, Calls${BRAND}`,
    description:
      'Copy whole lines of Morse code: five-character groups, common words, on-air phrases and callsigns. Each line is graded character by character.',
    h1: 'Morse code copy practice',
    intro:
      'Copy practice sends whole lines of Morse code and grades what you type, character by character. Choose five-character code groups, common words, on-air phrases or callsigns. Lines are aligned before grading, so missing one character costs one mark instead of everything after it, and you see exactly which characters got past you.',
    navLabel: 'Copy practice',
    hint: 'Whole lines, graded per character',
    group: 'practise',
    llmsSummary: 'copy whole lines: code groups, words, on-air phrases, callsigns',
    indexable: true,
    parent: null,
    markdown: null,
  },
  {
    path: '/daily/',
    title: `Daily Morse Code Challenge — Same for Everyone${BRAND}`,
    description: `One Morse code challenge a day, identical for everyone: ${FACTS.dailyLines} lines at a set speed, generated from the date. One attempt, no account, works offline.`,
    h1: 'Daily Morse code challenge',
    intro: `The daily Morse code challenge is identical for everyone on the same UTC date: ${FACTS.dailyLines} lines at a fixed speed and pass mark, generated in your browser from the date itself. You get one attempt a day, it works offline, and your streak counts the days you showed up rather than the days you passed.`,
    navLabel: 'Daily challenge',
    hint: 'The same one for everyone',
    group: 'practise',
    llmsSummary: 'one challenge a day, generated from the UTC date so it is the same for everyone',
    indexable: true,
    parent: null,
    markdown: null,
  },
  {
    path: '/challenge/',
    title: `Morse Code Practice Test: ${SECONDS}-Second Challenge${BRAND}`,
    description: `A free ${SECONDS}-second Morse code test: hear one character at a time and type it. See your score, then send a link that challenges a friend to beat it.`,
    h1: `The ${SECONDS}-second Morse code test`,
    intro: `The ${SECONDS}-second Morse code challenge is a quick practice test: one character plays at a time and you type what you hear. When the time is up you get a score and a link that carries the same settings, so a friend can take the identical test and try to beat your result.`,
    navLabel: `${SECONDS}-second challenge`,
    hint: 'How many can you decode?',
    group: 'practise',
    llmsSummary: `a ${SECONDS}-second practice test: type each character you hear, then challenge a friend with a link`,
    indexable: true,
    parent: null,
    markdown: null,
  },
  {
    path: '/telegraph/',
    title: `Online Morse Code Key — Send With Your Keyboard${BRAND}`,
    description:
      'Turn your keyboard or phone into a Morse code key. Tap for a dot, hold for a dash, and see each character decoded live with real CW audio. Free.',
    h1: 'Online Morse code key',
    intro:
      'This online Morse code key turns your keyboard into a straight key or a pair of iambic paddles. Tap Space for a dot, hold it for a dash, and pause to finish a character; choose paddles in Settings and hold one key for dits, another for dahs. On a phone, use the on-screen key. Everything you send is decoded live and played as real CW audio, and nothing is saved to a server.',
    navLabel: 'Telegraph key',
    hint: 'Send freely and read it back',
    group: 'practise',
    llmsSummary:
      'send Morse with the keyboard or screen as a straight key or iambic paddles, decoded live',
    indexable: true,
    parent: null,
    markdown: null,
  },
  {
    path: '/message/',
    title: `Send a Secret Message in Morse Code${BRAND}`,
    description:
      "Write a message, get a link, and whoever opens it hears it in Morse code. The message lives in the link's fragment, so it never reaches a server.",
    h1: 'Send a secret message in Morse code',
    intro:
      'Write a message and get a link that plays it in Morse code. The message is stored after the # sign in the link, which browsers never send to a server. It is a fun way to share Morse, not encryption: anyone who has the link can read it.',
    navLabel: 'Secret message',
    hint: 'A message in a link',
    group: 'practise',
    llmsSummary:
      'compose a message and get a link that plays it in Morse code; the message lives in the URL fragment and never reaches a server',
    indexable: true,
    parent: null,
    markdown: null,
  },
  {
    path: '/games/signal-defender/',
    title: `Signal Defender — Morse Code Decoding Game${BRAND}`,
    description:
      'A free Morse code game. Signals fall as dots and dashes, sounding as they appear; type the letter each spells before it lands. The letter shows on a hit.',
    h1: 'Signal Defender: a Morse code decoding game',
    intro:
      'Signal Defender is a Morse code decoding game. Signals fall down the screen as dots and dashes and sound as they appear, and you type the letter each one spells before it lands; the letter itself shows only when you hit it. It trains decoding at speed, which fails on codes you cannot recognise before the next one arrives, and every hit feeds the same review schedule as practice.',
    navLabel: 'Signal Defender',
    hint: 'Decode them before they land',
    group: 'practise',
    llmsSummary:
      'a decoding game: signals fall as Morse code and must be read before they land; the letter shows only on a hit',
    indexable: true,
    parent: null,
    markdown: null,
  },
  {
    path: '/games/morse-runner/',
    title: `Morse Runner — Morse Code Sending Game${BRAND}`,
    description:
      'A free Morse code sending game. Gates rush at you, each showing one letter; key its code from memory, on your keyboard or screen, before you reach it.',
    h1: 'Morse Runner: a Morse code sending game',
    intro:
      'Morse Runner is a Morse code sending game. Gates rush towards you, each showing one letter but not its code, and you key the code from memory before you arrive. A wrong send reveals the code as a hint, but a gate passed on its hint scores nothing. Unlike the telegraph, the clock does not wait, so it shows whether you can really send a character or only work it out.',
    navLabel: 'Morse Runner',
    hint: 'Send before you arrive',
    group: 'practise',
    llmsSummary:
      'a sending game: each gate shows a letter, and its code must be keyed from memory before the gate arrives',
    indexable: true,
    parent: null,
    markdown: null,
  },

  // Look up
  {
    path: '/morse-code-translator/',
    title: `Morse Code Translator With Audio: Text to Morse${BRAND}`,
    description: `Translate text to Morse code and Morse back to text as you type. Play it as audio or a flashing light at ${FACTS.wpmMin}–${FACTS.wpmMax} WPM. Free, no account, works offline.`,
    h1: 'Morse code translator',
    intro: `This Morse code translator turns text into Morse code, and Morse code back into text, as you type. Dots are written as periods and dashes as hyphens, with a space between letters and a slash between words. Any result can be played as audio or as a flashing signal lamp at ${FACTS.wpmMin} to ${FACTS.wpmMax} words per minute.`,
    navLabel: 'Translator',
    hint: 'Text to Morse and back',
    group: 'lookup',
    llmsSummary: `two-way text and Morse translator with audio and a signal lamp, ${FACTS.wpmMin} to ${FACTS.wpmMax} WPM`,
    indexable: true,
    parent: null,
    markdown: null,
  },
  {
    path: '/morse-code-alphabet/',
    title: `Morse Code Alphabet: ${spanOf(ALL_LETTERS)}, ${spanOf(ALL_DIGITS)} Chart With Sound${BRAND}`,
    description: `The Morse code alphabet per ${ITU}: ${L} letters, ${D} numbers and punctuation. Press any character to hear it from ${FACTS.wpmMin} to ${FACTS.wpmMax} WPM. Free, no signup.`,
    h1: 'The Morse code alphabet',
    intro: `The Morse code alphabet gives every letter, digit and punctuation mark a fixed pattern of dots and dashes. International Morse code, defined in ${ITU}, has ${L} letters between ${numberWord(FACTS.letterMinElements)} and ${numberWord(FACTS.letterMaxElements)} elements long, ${D} digits of exactly ${numberWord(FACTS.digitElements)} elements, and ${FACTS.ituPunctuationCount} punctuation marks. Press any character below to hear it at your chosen speed.`,
    navLabel: 'Alphabet',
    hint: 'Every character, playable',
    group: 'lookup',
    llmsSummary: `all ${L} letters, ${D} digits and ${FACTS.ituPunctuationCount} punctuation marks from ${ITU}, plus ${FACTS.nonItuPunctuationCount} common marks it does not define, playable`,
    indexable: true,
    parent: null,
    markdown: '/morse-code-alphabet.md',
  },
  // SEO-D reference pages (TASK-021, package N). The how-to hub belongs with
  // Learn, but `pagesInGroup('learn')` is pinned by a test to the header's three
  // links, so it sits in Look up until the header is driven by the registry.
  {
    path: '/morse-code-numbers/',
    title: `Morse Code Numbers ${spanOf(ALL_DIGITS)}: Chart, Sound and Rule${BRAND}`,
    description: `Morse code numbers ${ALL_DIGITS[0]} to ${ALL_DIGITS.at(-1)}, each exactly ${numberWord(FACTS.digitElements)} elements long. Learn the one rule that spells every digit, hear each number and practise them for free.`,
    h1: 'Morse code numbers',
    intro: `Morse code numbers are the easiest part of the code to learn, because one rule spells all ${numberWord(D)}. Every digit is exactly ${numberWord(FACTS.digitElements)} elements long. 1 is ${describeElements(DIGITS['1'])}, each digit after it moves one more dot in until 5 is ${describeElements(DIGITS['5'])}, and from 6 the dashes return until 0 is ${describeElements(DIGITS['0'])}.`,
    navLabel: 'Morse code numbers',
    hint: `The one rule behind ${spanOf(ALL_DIGITS)}`,
    group: 'lookup',
    llmsSummary: `the ${D} digits, each ${numberWord(FACTS.digitElements)} elements long, the rule that spells them, their send times and mirror pairs`,
    indexable: true,
    parent: '/morse-code-alphabet/',
    markdown: null,
  },
  {
    path: '/morse-code-speed/',
    title: `Morse Code Speed: WPM, PARIS and Timing Chart${BRAND}`,
    description: `How Morse code speed works: the PARIS standard, the ${FACTS.units.DOT}:${FACTS.units.DASH}:${FACTS.units.WORD_GAP} timing rule and the dot length at every speed from ${FACTS.wpmMin} to ${FACTS.wpmMax} WPM, computed from the timing engine.`,
    h1: 'Morse code speed and timing',
    intro: `Morse code speed is measured in words per minute with the reference word PARIS, which is exactly ${PARIS_UNITS} units long including its trailing gap. A unit is one dot, so at W words per minute a dot lasts ${FACTS.unitMsAtOneWpm} ÷ W milliseconds: ${FACTS.unitMs} ms at ${FACTS.exampleWpm} WPM. Dashes last ${FACTS.units.DASH} units, letter gaps ${FACTS.units.CHARACTER_GAP} and word gaps ${FACTS.units.WORD_GAP}.`,
    navLabel: 'Speed and timing',
    hint: 'WPM, PARIS and the timing rule',
    group: 'lookup',
    llmsSummary: `how WPM is measured with PARIS (${PARIS_UNITS} units), the unit rule, and the dot length at every speed from ${FACTS.wpmMin} to ${FACTS.wpmMax} WPM`,
    indexable: true,
    parent: null,
    markdown: null,
  },
  {
    path: '/how-to-learn-morse-code/',
    title: `How to Learn Morse Code: A Step-by-Step Guide${BRAND}`,
    description:
      'How to learn Morse code so it sticks: learn by sound, shortest codes first, use Farnsworth timing, send as well as listen. Free tools for every step.',
    h1: 'How to learn Morse code',
    intro: `To learn Morse code, learn each character as a sound rather than a pattern on a chart, starting with the shortest codes. Keep the characters fast and the gaps long, which is Farnsworth timing, send as well as listen, and practise for ${FACTS.planMinMinutesPerDay} to ${FACTS.planMaxMinutesPerDay} minutes a day. The alphabet takes about ${numberWord(DAYS)} days; copying at speed takes months.`,
    navLabel: 'How to learn',
    hint: 'The method, step by step',
    group: 'lookup',
    llmsSummary:
      'the method in short steps: by sound, shortest codes first, Farnsworth timing, sending, daily practice, then speed',
    indexable: true,
    parent: null,
    markdown: null,
  },
  {
    path: '/words/',
    title: `Words in Morse Code: SOS, I Love You, CQ, 73${BRAND}`,
    description: `${FACTS.wordCount} words and phrases in Morse code, each with audio, a letter-by-letter breakdown and what it means on the air. SOS, I love you, CQ, 73 and more.`,
    h1: 'Words in Morse code',
    intro: `These ${FACTS.wordCount} words and phrases are among the most looked-up in Morse code, from SOS and I LOVE YOU to operator shorthand like CQ and 73. Each page plays the word as audio, breaks it down letter by letter and explains what it means on the air, so you can read it, hear it and send it.`,
    navLabel: 'Words in Morse',
    hint: 'SOS, CQ, I love you…',
    group: 'lookup',
    llmsSummary: `${FACTS.wordCount} words and phrases, each playable, with a letter-by-letter breakdown and a note`,
    indexable: true,
    parent: null,
    markdown: null,
  },
  {
    path: '/blog/',
    title: `Morse Code Notes: Timing, Technique and Speed${BRAND}`,
    description:
      'How to learn Morse code properly: why charts fail, what Farnsworth timing is for, which order to learn in, and how long it really takes.',
    h1: 'Notes on learning Morse code',
    intro:
      'These notes explain how to learn Morse code so that it sticks: why memorising a chart caps your speed, which order to learn the letters in, what Farnsworth timing is for, and how long it really takes. Each note opens with a direct answer and is also available as plain Markdown for reading tools and assistants.',
    navLabel: 'Notes',
    hint: 'How to learn it properly',
    group: 'lookup',
    llmsSummary: 'short articles on learning technique, each opening with a direct answer',
    indexable: true,
    parent: null,
    markdown: null,
  },
  {
    path: '/privacy/',
    title: `Privacy — What MorseForge Stores and Sends${BRAND}`,
    description:
      'No accounts, no ads, Google Analytics only if you accept. Progress stays in your browser. What is counted, and how to switch our own counter and GA off.',
    h1: 'Privacy',
    intro:
      'MorseForge has no accounts and no ads, and your progress stays in your own browser. Google Analytics runs only if you accept it. This page lists exactly what is stored on your device, what is counted, and how to switch our own counter and Google Analytics off.',
    navLabel: 'Privacy',
    hint: 'Consent-based analytics',
    group: 'lookup',
    llmsSummary:
      'no accounts, no ads; Google Analytics only with consent, alongside a cookieless Cloudflare beacon and a first-party counter: what is stored and what is counted',
    indexable: true,
    parent: null,
    markdown: null,
  },

  // Linked from the header but of no value in search (DEC-012).
  {
    path: '/stats/',
    title: `Your Progress${BRAND}`,
    description:
      'Your Morse code progress: level, streak, characters mastered, accuracy, best speed and achievements. Stored in your own browser.',
    h1: 'Your progress',
    intro:
      'Your level, streak, mastered characters, accuracy, best speed and achievements. Everything on this page is stored in your own browser and is never sent anywhere.',
    navLabel: 'Your progress',
    hint: 'Level, streak, achievements',
    group: 'lookup',
    llmsSummary: 'your own progress, stored in your browser',
    indexable: false,
    parent: null,
    markdown: null,
  },
  {
    path: '/settings/',
    title: `Settings${BRAND}`,
    description:
      'Choose how signals reach you (sound, lamp or both), set the CW tone, speed, Farnsworth spacing and key bindings, and export or import your progress.',
    h1: 'Settings',
    intro:
      'Choose how signals reach you (sound, lamp or both), set the CW tone, speed, Farnsworth spacing and key bindings, and export or import your progress.',
    navLabel: 'Settings',
    hint: 'Signal, tone, speed and keys',
    group: 'lookup',
    llmsSummary: 'signal (sound, lamp or both), tone, speed, Farnsworth spacing and key bindings',
    indexable: false,
    parent: null,
    markdown: null,
  },

  // Not part of the public site.
  {
    path: '/404/',
    title: `Page Not Found${BRAND}`,
    description: 'That page does not exist. Here is the way back.',
    h1: 'No signal here',
    intro: 'That page does not exist. Here is the way back.',
    navLabel: 'Page not found',
    hint: 'That page does not exist',
    group: 'internal',
    llmsSummary: 'not found',
    indexable: false,
    parent: null,
    markdown: null,
  },
  {
    path: '/panel/',
    title: `Panel — ${SITE.name}`,
    description: 'Usage summary.',
    h1: 'Panel',
    intro: 'Usage summary for the site owner.',
    navLabel: 'Panel',
    hint: 'Usage summary',
    group: 'internal',
    llmsSummary: 'owner-only usage summary',
    indexable: false,
    parent: null,
    markdown: null,
  },
  {
    path: '/studio/',
    title: `Studio — ${SITE.name}`,
    description: 'Render a message as Morse and record it.',
    h1: 'Studio',
    intro: 'Render a message as Morse and record it. For the site owner.',
    navLabel: 'Studio',
    hint: 'Render and record a message',
    group: 'internal',
    llmsSummary: 'owner-only recording tool',
    indexable: false,
    parent: null,
    markdown: null,
  },
] as const satisfies readonly PageEntry[]

/** Every registered path, as a type: what a per-language catalog must cover. */
export type PagePath = (typeof PAGES)[number]['path']

const BY_PATH: ReadonlyMap<string, PageEntry> = new Map(
  PAGES.map((page): [string, PageEntry] => [page.path, page]),
)

/** The entry for a path, or undefined. */
export function findPage(path: string): PageEntry | undefined {
  return BY_PATH.get(path)
}

/** The entry for a path. Throws, so a mistyped path fails the build instead of rendering blank. */
export function getPage(path: string): PageEntry {
  const page = BY_PATH.get(path)
  if (!page) throw new Error(`No page registered for "${path}". Add it to src/config/pages.ts.`)
  return page
}

/** Pages in a navigation group, in registry order. */
export function pagesInGroup(group: PageGroup): PageEntry[] {
  return PAGES.filter((page) => page.group === group)
}

/** Every page that belongs in the sitemap and `llms.txt`. */
export function indexablePages(): PageEntry[] {
  return PAGES.filter((page) => page.indexable)
}

/** Absolute URL for a path. */
export function pageUrl(path: string): string {
  return new URL(path, SITE.url).href
}

export interface Crumb {
  name: string
  path: string
}

/**
 * The breadcrumb for a page: Home, then each ancestor, then the page itself.
 *
 * The visible crumb and the BreadcrumbList JSON-LD must say the same thing, so
 * both are built from this. Home has no breadcrumb. A dynamic page passes its
 * own `leaf` (a word, a post) and names its registered parent in `parent`.
 */
export function breadcrumbTrail(path: string, leaf?: { name: string; parent: string }): Crumb[] {
  if (path === HOME_PATH) return []
  const trail: Crumb[] = []
  let current = leaf ? getPage(leaf.parent) : getPage(path)
  const ancestors: Crumb[] = []
  for (;;) {
    ancestors.unshift({ name: current.navLabel, path: current.path })
    if (current.parent === null) break
    current = getPage(current.parent)
  }
  trail.push({ name: 'Home', path: HOME_PATH }, ...ancestors)
  if (leaf) trail.push({ name: leaf.name, path })
  return trail
}

export interface WordPageMeta {
  path: string
  title: string
  description: string
  h1: string
  parent: string
  /** The answer-first sentence, in parts so the page can bold the label and the code. */
  answer: { label: string; morse: string; detail: string }
}

/**
 * Title, description and answer block for a word page (audit §2.6).
 *
 * The title tries the code first because that is what people search for, and
 * gives it up for the longer entries rather than overflow: "Good morning in
 * Morse Code: ... | MorseForge" fits, a longer phrase falls back to the suffix,
 * and the longest to the bare name.
 */
export function wordPage(word: MorseWord): WordPageMeta {
  const facts = wordFacts(word)
  const { label, morse } = facts
  const candidates = [
    `${label} in Morse Code: ${morse}${BRAND}`,
    `${label} in Morse Code — Hear It, Send It${BRAND}`,
    `${label} in Morse Code${BRAND}`,
  ]
  const title = candidates.find((candidate) => candidate.length <= TITLE_MAX) ?? candidates[2]!

  return {
    path: `/words/${word.slug}/`,
    title,
    description: fitDescription(`${label} in Morse code is "${morse}".`, [
      ` Hear it at your own speed, see the code for each of its ${facts.characters} characters, and learn to send it yourself.`,
      " Hear it, see each letter's code and learn to send it.",
      ' Hear it and learn to send it.',
    ]),
    h1: `${label} in Morse code`,
    parent: '/words/',
    answer: {
      label,
      morse,
      detail: `It is ${facts.characters} characters made of ${facts.dots} dots and ${facts.dashes} dashes, and takes about ${facts.sendSeconds} seconds to send at ${FACTS.exampleWpm} words per minute.`,
    },
  }
}

/** The fields of a blog post's frontmatter that decide its metadata. */
export interface BlogMetaInput {
  slug: string
  title: string
  seoTitle?: string | undefined
  description: string
}

/**
 * Title and path for a blog post. The H1 stays the author's `title`; the
 * `<title>` is `seoTitle` when there is one, with the brand suffix added only
 * while the whole thing stays within 60 characters.
 */
export function blogPage(post: BlogMetaInput) {
  return {
    path: `/blog/${post.slug}/`,
    title: titleWithBrand(post.seoTitle ?? post.title),
    description: post.description,
    h1: post.title,
    parent: '/blog/',
  }
}

export interface CharacterPageMeta {
  path: string
  title: string
  description: string
  h1: string
  parent: string
}

/**
 * Title and description for a character page.
 *
 * The spoken form is dropped from the title when it would push it past 60
 * characters, which happens for the digits ("dah-dah-dah-dah-dah").
 */
export function characterPage(facts: CharacterFacts): CharacterPageMeta {
  const subject = facts.character
  const noun = facts.kind === 'letter' ? 'letter' : facts.kind === 'digit' ? 'number' : 'mark'
  const candidates = [
    `${subject} in Morse Code: ${facts.code} (${facts.spoken}) With Sound${BRAND}`,
    `${subject} in Morse Code: ${facts.code} With Sound${BRAND}`,
    `${subject} in Morse Code: ${facts.code}${BRAND}`,
    `${subject} in Morse Code${BRAND}`,
  ]
  const title = candidates.find((candidate) => candidate.length <= TITLE_MAX) ?? candidates[3]!

  return {
    path: `/morse-code-alphabet/${facts.slug}/`,
    title,
    description: fitDescription(
      `The ${noun} ${subject} in Morse code is ${facts.code} (${facts.spelled}, "${facts.spoken}").`,
      [
        ' Hear it, see where it sits in the Morse tree, what it is confused with, and how to send it.',
        ' Hear it, see where it sits, and learn to send it.',
        ' Hear it and learn to send it.',
      ],
    ),
    h1: `${subject} in Morse code`,
    parent: '/morse-code-alphabet/',
  }
}
