import { describe, expect, it } from 'vitest'
import {
  DAILY_EPOCH,
  DAILY_URL,
  LINE_GLYPH,
  dailyNumber,
  dailySharePayload,
  dailyShareText,
  lineTone,
  percent,
  scoreDaily,
  shareHeadline,
  shareStreak,
  summarizeDaily,
  type DailyShareInput,
} from './dailyShare'
import { LINES, dailyChallenge } from './dailyChallenge'
import { gradeCopy } from './copy'
import { SITE } from '../config/site'

const input = (overrides: Partial<DailyShareInput> = {}): DailyShareInput => ({
  date: '2026-10-21',
  lines: [1, 1, 1, 0.85, 1, 1, 0.4, 1],
  accuracy: 0.914,
  passMark: 0.8,
  streak: 12,
  completed: true,
  totalLines: 8,
  ...overrides,
})

describe('dailyNumber', () => {
  it('is 1 on the epoch and counts days from it', () => {
    expect(dailyNumber(DAILY_EPOCH)).toBe(1)
    expect(dailyNumber('2026-08-22')).toBe(2)
    expect(dailyNumber('2026-10-21')).toBe(62)
  })

  it('counts UTC days across a month and a year boundary', () => {
    expect(dailyNumber('2026-09-01')).toBe(12)
    expect(dailyNumber('2027-01-01')).toBe(dailyNumber('2026-12-31') + 1)
  })

  it('never goes below 1 for a date before the epoch or a broken key', () => {
    expect(dailyNumber('1970-01-01')).toBe(1)
    expect(dailyNumber('not-a-date')).toBe(1)
  })
})

describe('lineTone', () => {
  it('splits perfect, over the bar and under it', () => {
    expect(lineTone(1, 0.8)).toBe('perfect')
    expect(lineTone(0.8, 0.8)).toBe('pass')
    expect(lineTone(0.79, 0.8)).toBe('under')
    expect(lineTone(0, 0.8)).toBe('under')
  })
})

describe('percent', () => {
  it('rounds down, so a dropped character never prints as 100%', () => {
    expect(percent(299 / 300)).toBe(99)
    expect(percent(1)).toBe(100)
    expect(percent(0.8)).toBe(80)
  })

  it('reads garbage as 0', () => {
    expect(percent(Number.NaN)).toBe(0)
    expect(percent(-1)).toBe(0)
  })
})

describe('scoreDaily', () => {
  const prompts = ['ABCDE', 'FGHIJ', 'KLMNO', 'PQRST']

  it('scores a finished run over every character sent', () => {
    const graded = [
      gradeCopy('ABCDE', 'ABCDE'),
      gradeCopy('FGHIJ', 'FGHIJ'),
      gradeCopy('KLMNO', 'KLMNX'),
      gradeCopy('PQRST', 'PQRST'),
    ]
    const outcome = scoreDaily(prompts, graded, 0.8)
    expect(outcome.accuracy).toBeCloseTo(19 / 20)
    expect(outcome.lines).toEqual([1, 1, 0.8, 1])
    expect(outcome.completed).toBe(true)
    expect(outcome.passed).toBe(true)
  })

  it('counts unanswered lines as misses (B3)', () => {
    // One perfect line, then GIVE UP. This used to score 100% and seal a pass.
    const outcome = scoreDaily(prompts, [gradeCopy('ABCDE', 'ABCDE')], 0.8)
    expect(outcome.accuracy).toBeCloseTo(5 / 20)
    expect(outcome.lines).toEqual([1, 0, 0, 0])
    expect(outcome.answered).toBe(1)
    expect(outcome.completed).toBe(false)
    expect(outcome.passed).toBe(false)
  })

  it('never calls an unfinished run a pass, however good the answered part', () => {
    const graded = prompts.slice(0, 3).map((p) => gradeCopy(p, p))
    const outcome = scoreDaily(prompts, graded, 0.5)
    expect(outcome.accuracy).toBeGreaterThanOrEqual(0.5)
    expect(outcome.passed).toBe(false)
  })

  it('gives up with nothing answered as 0%, incomplete', () => {
    const outcome = scoreDaily(prompts, [], 0.8)
    expect(outcome).toMatchObject({ accuracy: 0, completed: false, passed: false, answered: 0 })
  })

  it('weights by characters, not by lines', () => {
    const outcome = scoreDaily(
      ['A', 'BCDEFGHIJ'],
      [gradeCopy('A', ''), gradeCopy('BCDEFGHIJ', 'BCDEFGHIJ')],
      0.8,
    )
    expect(outcome.accuracy).toBeCloseTo(9 / 10)
  })

  it('never stores a padded line as clean, and the share shows it as a pass', () => {
    // Sent "CQ DX", typed "CQ DXX": every character copied, one added.
    const padded = gradeCopy('CQ DX', 'CQ DXX')
    expect(padded.accuracy).toBe(1)
    expect(lineTone(padded, 0.8)).toBe('pass')
    expect(lineTone(gradeCopy('CQ DX', 'CQ DX'), 0.8)).toBe('perfect')

    const outcome = scoreDaily(['CQ DX', 'AB'], [padded, gradeCopy('AB', 'AB')], 0.8)
    expect(outcome.lines[0]).toBeLessThan(1)
    expect(outcome.lines[1]).toBe(1)
    // The run's accuracy is untouched: every sent character was copied.
    expect(outcome.accuracy).toBe(1)
    expect(percent(outcome.lines[0]!)).toBe(100)

    const s = summarizeDaily(
      input({ lines: outcome.lines, totalLines: 2, accuracy: outcome.accuracy, passMark: 0.8 }),
    )
    expect(s.tones).toEqual(['pass', 'perfect'])
    expect(s.clean).toBe(1)
  })

  it('scores a real day against its own prompts', () => {
    const day = dailyChallenge('2026-10-21')
    const outcome = scoreDaily(
      day.prompts,
      day.prompts.map((p) => gradeCopy(p, p)),
      day.passMark,
    )
    expect(outcome.lines).toHaveLength(LINES)
    expect(outcome.accuracy).toBe(1)
    expect(outcome.passed).toBe(true)
  })
})

describe('summarizeDaily', () => {
  it('counts lines over the bar (perfect included) and clean lines', () => {
    const s = summarizeDaily(input())
    expect(s.overBar).toBe(7)
    expect(s.clean).toBe(6)
    expect(s.total).toBe(8)
    expect(s.percent).toBe(91)
  })

  it('takes the line count from the exported LINES by default', () => {
    const s = summarizeDaily(input({ totalLines: undefined, lines: [1] }))
    expect(s.total).toBe(LINES)
    expect(s.tones).toHaveLength(LINES)
    // Missing lines are misses, not skipped.
    expect(s.tones.slice(1).every((tone) => tone === 'under')).toBe(true)
  })

  it('treats a record without `completed` as a finished one', () => {
    expect(summarizeDaily(input({ completed: undefined })).completed).toBe(true)
  })
})

describe('dailyShareText', () => {
  it('matches the agreed shape exactly', () => {
    expect(dailyShareText(input())).toBe(
      [
        `${SITE.name} Daily #62 · 7/8 lines · 91%`,
        '🟩🟩🟩🟨🟩🟩🟥🟩',
        '🔥 12-day streak',
        'https://morse.iamcanturk.dev/daily/',
      ].join('\n'),
    )
  })

  it('links to the daily page on the real site', () => {
    expect(DAILY_URL).toBe(`${SITE.url}/daily/`)
    expect(dailyShareText(input()).split('\n').at(-1)).toBe(DAILY_URL)
  })

  it('has one glyph per line of the day', () => {
    const grid = dailyShareText(input()).split('\n')[1]!
    expect([...grid]).toHaveLength(8)
    expect(new Set([...grid])).toEqual(new Set(Object.values(LINE_GLYPH)))
  })

  it('never contains the text of a line', () => {
    // The whole point of a Wordle-style share: no spoilers for later players.
    for (const date of ['2026-10-21', '2026-10-22', '2026-12-25']) {
      const day = dailyChallenge(date)
      // The brand and the link are fixed text; what is left is every part
      // that varies, and no line of the day may appear in it. Lines are sent
      // in capitals and the variable text has none, so this cannot pass by
      // accident of case.
      const text = dailyShareText(input({ date, totalLines: day.prompts.length }))
        .replace(DAILY_URL, '')
        .replace(SITE.name, '')
      expect(text).not.toMatch(/[A-Z]{2}/)
      for (const prompt of day.prompts) expect(text).not.toContain(prompt)
    }
  })

  it('flags an unfinished run instead of passing it off as tried and failed', () => {
    const text = dailyShareText(input({ completed: false, lines: [1, 0, 0, 0, 0, 0, 0, 0] }))
    expect(text.split('\n')[0]).toBe(`${SITE.name} Daily #62 · 1/8 lines · 91% · incomplete`)
  })

  it('drops the streak line rather than printing a zero', () => {
    expect(shareStreak(0)).toBeNull()
    expect(dailyShareText(input({ streak: 0 }))).not.toContain('🔥')
    expect(shareStreak(1)).toBe('🔥 1-day streak')
  })

  it('has no undefined, NaN or Infinity in it, whatever it is given', () => {
    const text = dailyShareText(
      input({ accuracy: Number.NaN, streak: Number.POSITIVE_INFINITY, lines: [] }),
    )
    expect(text).not.toMatch(/undefined|NaN|Infinity|null/)
  })

  it('agrees with its own headline helper', () => {
    expect(dailyShareText(input()).split('\n')[0]).toBe(shareHeadline(input()))
  })
})

describe('dailySharePayload', () => {
  it('sends the link once, as url, not inside the text too', () => {
    const payload = dailySharePayload(input())
    expect(payload.url).toBe(DAILY_URL)
    expect(payload.text).not.toContain(DAILY_URL)
    expect(`${payload.text}\n${payload.url}`).toBe(dailyShareText(input()))
  })
})
