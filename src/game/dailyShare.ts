/**
 * Scoring and sharing the daily challenge (PROJECT.md §19, §54 item 12).
 *
 * Two jobs, both pure so both are testable without a browser:
 *
 * 1. **Score a run honestly.** Accuracy is taken over every line of the day,
 *    so a line nobody answered counts as a line nobody copied. Before this, a
 *    run abandoned after one perfect line scored 100% and was sealed as a
 *    pass. An unfinished run is "incomplete" and can never be a pass.
 *
 * 2. **Build the spoiler-free share.** One square per line, the headline
 *    numbers, the streak and the link — and never the text of a line, so a
 *    result posted at breakfast gives nothing away to someone who plays at
 *    lunch. Every number comes from the run itself, the exported `LINES` and a
 *    fixed epoch; none is typed.
 */

import { SITE } from '../config/site'
import { gradeCopy, type CopyGrade } from './copy'
import { LINES } from './dailyChallenge'

/**
 * Daily #1. The day the project's first commit landed, so the number counts
 * the days the wire has been running. Fixed: moving it would renumber every
 * result anyone has ever posted.
 */
export const DAILY_EPOCH = '2026-08-21'

/** Where a share sends people. */
export const DAILY_URL = `${SITE.url}/daily/`

const DAY_MS = 86_400_000

const utcMidnight = (date: string): number => Date.parse(`${date}T00:00:00Z`)

/**
 * The challenge number for a UTC date key: 1 on the epoch, counting up.
 *
 * Dates before the epoch (a clock set to 1970) read as 1 rather than as zero
 * or a negative number nobody could make sense of.
 */
export function dailyNumber(date: string): number {
  const at = utcMidnight(date)
  if (!Number.isFinite(at)) return 1
  return Math.max(1, Math.round((at - utcMidnight(DAILY_EPOCH)) / DAY_MS) + 1)
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                     */
/* -------------------------------------------------------------------------- */

/** How one line went, for its square. */
export type LineTone = 'perfect' | 'pass' | 'under'

/**
 * What a padded line is stored as: every character sent was copied, but more
 * was typed. Just under 1, so it can never read as clean, and still 100% when
 * shown, because `percent` allows for float error and every sent character
 * really was copied.
 */
export const PADDED_LINE = 1 - 1e-12

/**
 * A line's stored score: its accuracy, except that a line with every character
 * plus extras is held just under 1 (`PADDED_LINE`). Accuracy alone cannot
 * tell "CQ DX" copied as "CQ DXX" from a clean copy, and the share counted it
 * as a clean 🟩 while free practice called the same line a pass.
 */
export function lineScore(grade: CopyGrade): number {
  return grade.accuracy >= 1 && !grade.perfect ? PADDED_LINE : grade.accuracy
}

/**
 * One line's tone, against the day's pass mark: from its grade while the run is
 * live, or from its stored score (`lineScore`) afterwards. Perfect means clean,
 * nothing missed and nothing added, as free practice counts it.
 */
export function lineTone(line: number | CopyGrade, passMark: number): LineTone {
  const score = typeof line === 'number' ? line : lineScore(line)
  if (score >= 1) return 'perfect'
  return score >= passMark ? 'pass' : 'under'
}

/**
 * A percentage for display, rounded **down**.
 *
 * Rounding to nearest would print "100%" for a run that dropped one character
 * in three hundred, which is a claim the run does not support.
 */
export function percent(accuracy: number): number {
  if (!Number.isFinite(accuracy) || accuracy <= 0) return 0
  return Math.min(100, Math.floor(accuracy * 100 + 1e-9))
}

export interface DailyOutcome {
  /**
   * Score per line, 0..1, one entry per line of the day (`lineScore`): the
   * line's accuracy, held just under 1 for a padded line. Unplayed is 0.
   */
  lines: number[]
  /** Characters copied over characters sent, across every line of the day. */
  accuracy: number
  /** True only when every line was answered. */
  completed: boolean
  /** Completed and at or over the pass mark. */
  passed: boolean
  /** Lines answered before the run ended. */
  answered: number
}

/**
 * Score a run against the whole day.
 *
 * `graded` holds the answered lines in order; anything after them was never
 * answered and is scored as an empty copy of its prompt. Weighting by
 * characters rather than averaging lines keeps this the same figure a reader
 * of "87% accuracy" expects: characters right out of characters sent.
 */
export function scoreDaily(
  prompts: readonly string[],
  graded: readonly CopyGrade[],
  passMark: number,
): DailyOutcome {
  let hits = 0
  let total = 0
  const lines = prompts.map((prompt, index) => {
    const grade = graded[index] ?? gradeCopy(prompt, '')
    hits += grade.hits
    total += grade.total
    return lineScore(grade)
  })

  const answered = Math.min(graded.length, prompts.length)
  const completed = prompts.length > 0 && answered >= prompts.length
  const accuracy = total === 0 ? 0 : hits / total

  return { lines, accuracy, completed, passed: completed && accuracy >= passMark, answered }
}

/* -------------------------------------------------------------------------- */
/* The share                                                                   */
/* -------------------------------------------------------------------------- */

/** One square per line. Colour plus a distinct glyph each, never colour alone. */
export const LINE_GLYPH: Record<LineTone, string> = {
  perfect: '🟩',
  pass: '🟨',
  under: '🟥',
}

export interface DailyShareInput {
  /** UTC date key of the run. */
  date: string
  /** Per-line accuracy as stored. Padded with misses up to `totalLines`. */
  lines: readonly number[]
  accuracy: number
  passMark: number
  /** The daily streak including this run. */
  streak: number
  /** False for a run that stopped early. Missing means an older, finished record. */
  completed?: boolean
  /** Lines in the day. Defaults to the exported `LINES`. */
  totalLines?: number
}

export interface DailySummary {
  number: number
  tones: LineTone[]
  /** Lines at or over the pass mark, perfect ones included. */
  overBar: number
  /** Lines copied without a single miss. */
  clean: number
  total: number
  percent: number
  completed: boolean
}

/** The facts a share (text or image) is built from. */
export function summarizeDaily(input: DailyShareInput): DailySummary {
  const total = Math.max(1, input.totalLines ?? LINES)
  const tones = Array.from({ length: total }, (_, index) =>
    lineTone(input.lines[index] ?? 0, input.passMark),
  )
  return {
    number: dailyNumber(input.date),
    tones,
    overBar: tones.filter((tone) => tone !== 'under').length,
    clean: tones.filter((tone) => tone === 'perfect').length,
    total,
    percent: percent(input.accuracy),
    completed: input.completed !== false,
  }
}

/** `MorseForge Daily #62 · 7/8 lines · 91%`, plus a flag for an unfinished run. */
export function shareHeadline(input: DailyShareInput): string {
  const s = summarizeDaily(input)
  const head = `${SITE.name} Daily #${s.number} · ${s.overBar}/${s.total} lines · ${s.percent}%`
  // A run that stopped early is still a result, but it says so: otherwise the
  // squares after the stop read as lines that were tried and failed.
  return s.completed ? head : `${head} · incomplete`
}

export function shareStreak(streak: number): string | null {
  if (!Number.isFinite(streak) || streak < 1) return null
  return `🔥 ${Math.floor(streak)}-day streak`
}

/** The lines of the share, without the link. */
function shareBody(input: DailyShareInput): string[] {
  const s = summarizeDaily(input)
  const streak = shareStreak(input.streak)
  return [
    shareHeadline(input),
    s.tones.map((tone) => LINE_GLYPH[tone]).join(''),
    ...(streak ? [streak] : []),
  ]
}

/** The full text, link last, for the clipboard. */
export function dailyShareText(input: DailyShareInput): string {
  return [...shareBody(input), DAILY_URL].join('\n')
}

/**
 * The Web Share payload. The link travels as `url` and is left out of `text`,
 * because most share targets append the url to the text and would otherwise
 * post it twice.
 */
export function dailySharePayload(input: DailyShareInput): { text: string; url: string } {
  return { text: shareBody(input).join('\n'), url: DAILY_URL }
}
