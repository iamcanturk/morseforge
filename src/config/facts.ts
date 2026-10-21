/**
 * The numbers the copy quotes, each computed from the data it describes.
 *
 * A figure typed into a sentence is a figure that goes stale, and the first
 * audit found seven of them already disagreeing with the code. Copy imports
 * from here instead: change the plan, the alphabet or the speed range and every
 * sentence that mentions it follows, and the tests next door fail if a claim
 * stops being true.
 */

import {
  buildTimeline,
  dotDuration,
  dashDuration,
  timelineDuration,
  UNITS,
} from '../engine/timingEngine'
import { LINES } from '../game/dailyChallenge'
import { LEVEL_REQUIREMENTS, SKILLS } from '../game/mastery'
import { SIXTY_SECOND_CHALLENGE } from '../game/session'
import { WPM_RANGE } from '../storage/settings'
import { CURRICULUM, CURRICULUM_TOTAL_MINUTES } from '../data/curriculum'
import { formatMinutes, formatSeconds, numberWord } from '../data/format'
import {
  DIGITS,
  ITU_PUNCTUATION,
  LETTERS,
  NON_ITU_PUNCTUATION,
  PROSIGNS,
} from '../data/morseAlphabet'
import { WORDS, breakdown, morseFor, wordLabel, type MorseWord } from '../data/words'

/** Letters grouped by how many elements their code has: 1 holds E and T. */
function lettersByLength(): Readonly<Record<number, readonly string[]>> {
  const groups: Record<number, string[]> = {}
  for (const [letter, code] of Object.entries(LETTERS)) {
    ;(groups[code.length] ??= []).push(letter)
  }
  return groups
}

const BY_LEN = lettersByLength()
const digitLengths = new Set(Object.values(DIGITS).map((code) => code.length))
const ituLengths = Object.values(ITU_PUNCTUATION).map((code) => code.length)
const letterLengths = Object.values(LETTERS).map((code) => code.length)
const planMinutes = CURRICULUM.map((day) => day.minutes)
const longestMinutes = Math.max(...planMinutes)

/** The speed the pages quote when they give an example duration. */
const EXAMPLE_WPM = 20

/** What Mastered (level 5) asks of a character, straight from the grader. */
const MASTERED = LEVEL_REQUIREMENTS[5]

export const FACTS = {
  /** `L` in the audit: 26. */
  letterCount: Object.keys(LETTERS).length,
  /** `D`: 10. */
  digitCount: Object.keys(DIGITS).length,
  /** `P_ITU`: the marks ITU-R M.1677-1 defines. */
  ituPunctuationCount: Object.keys(ITU_PUNCTUATION).length,
  /** `P_EXT`: the common marks it does not. */
  nonItuPunctuationCount: Object.keys(NON_ITU_PUNCTUATION).length,

  /** `BY_LEN`: letters by element count, in alphabetical order. */
  lettersByLength: BY_LEN,
  /** Shortest and longest letter, in elements. */
  letterMinElements: Math.min(...letterLengths),
  letterMaxElements: Math.max(...letterLengths),
  /** Every digit is the same length; this is that length. */
  digitElements: digitLengths.size === 1 ? [...digitLengths][0]! : NaN,
  /** The ITU punctuation range, which is not the same as the whole set's. */
  ituPunctuationMinElements: Math.min(...ituLengths),
  ituPunctuationMaxElements: Math.max(...ituLengths),

  /** `DAYS`: 7. */
  planDays: CURRICULUM.length,
  /** `MIN`: the plan's total practice time, in minutes. */
  planMinutes: CURRICULUM_TOTAL_MINUTES,
  /** `MIN` as the sentence says it: "2 hours 15 minutes". */
  planTime: formatMinutes(CURRICULUM_TOTAL_MINUTES),
  /** Shortest and longest day, in minutes. */
  planMinMinutesPerDay: Math.min(...planMinutes),
  planMaxMinutesPerDay: longestMinutes,
  /** The day numbers that ask for the longest time. More than one is normal. */
  planLongestDays: CURRICULUM.filter((day) => day.minutes === longestMinutes).map((day) => day.day),
  /** Minutes day one asks for. */
  planFirstDayMinutes: CURRICULUM[0]!.minutes,
  /** What day one teaches: E and T. */
  planFirstDayCharacters: CURRICULUM[0]!.characters,
  /** The operator call the last day ends on. */
  planClosingCall: CURRICULUM.at(-1)!.words[0]!,

  /** `WPM_MIN` and `WPM_MAX`: the range the sliders offer. */
  wpmMin: WPM_RANGE.min,
  wpmMax: WPM_RANGE.max,
  /** The speed every "how long does it take" example is quoted at. */
  exampleWpm: EXAMPLE_WPM,
  /** `UNIT20`: one dot, in milliseconds, at the example speed. */
  unitMs: dotDuration(EXAMPLE_WPM),
  /** A dash at the example speed. */
  dashMs: dashDuration(EXAMPLE_WPM),
  /** The PARIS constant: milliseconds per unit at one word per minute. */
  unitMsAtOneWpm: dotDuration(1),
  units: UNITS,

  /** The challenge length, in seconds. */
  challengeSeconds: SIXTY_SECOND_CHALLENGE.durationMs! / 1000,
  /** `DAILY_LINES`: 8. */
  dailyLines: LINES,
  /** `WORDS_N`: 22. */
  wordCount: WORDS.length,
  /** The prosign the SOS post and the word page both describe. */
  sosProsign: PROSIGNS.SOS,

  /** Skills tracked per character: recognising, hearing and sending. */
  skillCount: SKILLS.length,
  /** Answers every one of those skills needs before a character can be Mastered. */
  masteryMinAttempts: MASTERED.minAttemptsPerSkill,
  /**
   * The average accuracy, as a whole percentage, that Mastered asks for. It is
   * the mean of the three skills, not a floor on each one.
   */
  masteryPercent: Math.round(MASTERED.minScore * 100),
} as const

/**
 * The mastery rule as a clause, for copy that says "a character counts as
 * mastered only with …". It states exactly what `masteryLevel` checks: a
 * minimum number of answers in every skill AND an average across them, so the
 * page never promises a per-skill bar the grader does not apply.
 */
export const MASTERY_RULE = `at least ${MASTERED.minAttemptsPerSkill} answers in each of the ${numberWord(SKILLS.length)} skills and an average of ${Math.round(MASTERED.minScore * 100)}% or better across them`

/** "A–Z": the first and last of a run of characters, joined by an en dash. */
export function spanOf(characters: readonly string[]): string {
  return `${characters[0]}–${characters.at(-1)}`
}

export interface WordFacts {
  /** "I love you", or "SOS" for the entries that are codes. */
  label: string
  /** The Morse, with letters spaced and words separated by a slash. */
  morse: string
  /** Characters sent, spaces excluded. */
  characters: number
  dots: number
  dashes: number
  /** Whitespace-separated words in the entry. */
  wordCount: number
  /** Milliseconds to send it at the example speed, silences included. */
  sendMs: number
  /** `sendMs` as seconds to one decimal: "1.6". */
  sendSeconds: string
}

/**
 * Everything a word page states about its entry, computed in one place so the
 * title, the answer block, the FAQ and the schema agree to the decimal.
 */
export function wordFacts(word: MorseWord): WordFacts {
  const morse = morseFor(word)
  const sendMs = timelineDuration(buildTimeline(morse, { wpm: EXAMPLE_WPM }))
  return {
    label: wordLabel(word),
    morse,
    characters: breakdown(word).length,
    dots: [...morse].filter((element) => element === '.').length,
    dashes: [...morse].filter((element) => element === '-').length,
    wordCount: word.text.trim().split(/\s+/).length,
    sendMs,
    sendSeconds: formatSeconds(sendMs),
  }
}

/** A word that operators send as one prosign rather than as its letters. */
export interface ProsignFacts {
  /** The prosign's code, with no letter gaps: "...---...". */
  morse: string
  /** Milliseconds to send it run together at the example speed. */
  sendMs: number
  /** `sendMs` as seconds to one decimal. */
  sendSeconds: string
}

/**
 * The run-together form of a word that is also a prosign (SOS), or null.
 *
 * The word page plays and times the spelled-out letters, so anything it says
 * about the prosign has to be timed separately or the page contradicts itself.
 */
export function prosignFacts(word: MorseWord): ProsignFacts | null {
  const morse = (PROSIGNS as Readonly<Record<string, string>>)[word.text]
  if (!morse) return null
  const sendMs = timelineDuration(buildTimeline(morse, { wpm: EXAMPLE_WPM }))
  return { morse, sendMs, sendSeconds: formatSeconds(sendMs) }
}

/**
 * One sentence that squares the page's spelled-out timing with how the word is
 * really sent, or null for an ordinary word. Shared by the page, its Markdown
 * copy and its FAQ so all three say the same thing.
 */
export function prosignNote(word: MorseWord): string | null {
  const prosign = prosignFacts(word)
  if (!prosign) return null
  const spelled = wordFacts(word)
  return `This page plays ${spelled.label} letter by letter, with the usual gap between letters, which takes about ${spelled.sendSeconds} seconds at ${EXAMPLE_WPM} words per minute. On the air it is sent run together as one prosign, "${prosign.morse}", with no gaps between the letters, which takes about ${prosign.sendSeconds} seconds.`
}
