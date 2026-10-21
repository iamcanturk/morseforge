import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DAILY_CARD,
  dailyCardModel,
  drawDailyCard,
  stampFor,
  type DailyCardInput,
} from './dailyCard'
import { DAILY_URL } from '../../game/dailyShare'
import { LINES, dailyChallenge } from '../../game/dailyChallenge'
import { SITE } from '../../config/site'

const input = (overrides: Partial<DailyCardInput> = {}): DailyCardInput => ({
  date: '2026-10-21',
  lines: [1, 1, 1, 0.85, 1, 1, 0.4, 1],
  accuracy: 0.914,
  passMark: 0.8,
  streak: 12,
  completed: true,
  totalLines: 8,
  wpm: 20,
  ...overrides,
})

describe('dailyCardModel', () => {
  it('puts lines over the bar in the screen and the facts in the fields', () => {
    const model = dailyCardModel(input())
    expect(model.big).toBe('7/8')
    expect(model.fields).toEqual([
      { label: 'ACCURACY', value: '91%' },
      { label: 'CLEAN LINES', value: '6/8' },
      { label: 'STREAK', value: '12 DAYS' },
      { label: 'SPEED', value: '20 WPM' },
    ])
    expect(model.subtitle).toContain('No. 62')
    expect(model.title).toBe(`${SITE.name.toUpperCase()} DAILY WIRE`)
  })

  it('has one square per line of the day, from the exported LINES', () => {
    expect(dailyCardModel(input({ totalLines: undefined })).tones).toHaveLength(LINES)
  })

  it('prints the daily link without its scheme', () => {
    expect(`https://${dailyCardModel(input()).url}/`).toBe(DAILY_URL)
  })

  it('stamps a pass, a day on the wire, or an unfinished run, and never "failed"', () => {
    expect(dailyCardModel(input()).stamp).toEqual({ text: 'PASSED', tone: 'passed' })
    expect(dailyCardModel(input({ accuracy: 0.5 })).stamp).toEqual({
      text: 'ON THE WIRE',
      tone: 'short',
    })
    expect(dailyCardModel(input({ completed: false })).stamp.tone).toBe('incomplete')
    // An unfinished run is never stamped as passed, however high the answered part.
    expect(stampFor({ completed: false }, true).text).toBe('INCOMPLETE')
  })

  it('drops a zero streak and a missing speed instead of printing them', () => {
    const labels = dailyCardModel(input({ streak: 0, wpm: Number.NaN })).fields.map((f) => f.label)
    expect(labels).toEqual(['ACCURACY', 'CLEAN LINES'])
  })

  it('says 1 DAY, not 1 DAYS', () => {
    expect(dailyCardModel(input({ streak: 1 })).fields[2]).toEqual({
      label: 'STREAK',
      value: '1 DAY',
    })
  })

  it('names the numbers in its accessible text', () => {
    expect(dailyCardModel(input()).alt).toBe(
      `${SITE.name} Daily number 62: 7 of 8 lines over the bar, 91% accuracy, 12-day streak.`,
    )
    expect(dailyCardModel(input({ completed: false })).alt).toMatch(/, incomplete\.$/)
  })

  it('never carries the text of a line', () => {
    const day = dailyChallenge('2026-10-21')
    const model = dailyCardModel(input({ totalLines: day.prompts.length }))
    const printed = [model.title, model.subtitle, model.big, model.tapeText, model.alt]
      .concat(model.fields.flatMap((f) => [f.label, f.value]))
      .join(' ')
      .replace(SITE.name.toUpperCase(), '')
    for (const prompt of day.prompts.filter((p) => p.length > 3)) {
      expect(printed).not.toContain(prompt)
    }
  })
})

/* A recording 2D context: enough of the API for the card, nothing drawn. */
function fakeCanvas() {
  const text: string[] = []
  const numbers: number[] = []
  const gradient = { addColorStop: () => undefined }
  const ctx = new Proxy({ letterSpacing: '0px' } as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key in target) return target[key]
      if (key === 'measureText') return (s: string) => ({ width: s.length * 12 })
      if (key === 'createRadialGradient' || key === 'createLinearGradient') {
        return (...args: number[]) => (numbers.push(...args), gradient)
      }
      if (key === 'fillText') {
        return (s: string, ...args: number[]) => {
          text.push(s)
          numbers.push(...args)
        }
      }
      return (...args: unknown[]) => {
        for (const arg of args) if (typeof arg === 'number') numbers.push(arg)
      }
    },
    set(target, key, value) {
      target[key] = value
      return true
    },
  })
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement
  return { canvas, text, numbers }
}

describe('drawDailyCard', () => {
  const original = (globalThis as { Path2D?: unknown }).Path2D
  beforeEach(() => {
    ;(globalThis as { Path2D?: unknown }).Path2D = class {
      constructor(public d: string) {}
    }
  })
  afterEach(() => {
    ;(globalThis as { Path2D?: unknown }).Path2D = original
  })

  it('sizes the canvas to the card and prints every part of the model', () => {
    const { canvas, text } = fakeCanvas()
    const model = dailyCardModel(input())
    drawDailyCard(canvas, model)
    expect([canvas.width, canvas.height]).toEqual([DAILY_CARD.width, DAILY_CARD.height])
    for (const part of [model.title, model.subtitle, model.big, model.stamp.text, model.url]) {
      expect(text).toContain(part)
    }
    for (const field of model.fields)
      expect(text).toEqual(expect.arrayContaining([field.label, field.value]))
  })

  it('never passes NaN or Infinity to the canvas', () => {
    const { canvas, numbers } = fakeCanvas()
    drawDailyCard(canvas, dailyCardModel(input({ accuracy: Number.NaN, lines: [], streak: 0 })))
    expect(numbers.length).toBeGreaterThan(0)
    expect(numbers.every(Number.isFinite)).toBe(true)
  })

  it('does nothing without a 2D context', () => {
    const canvas = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement
    expect(() => drawDailyCard(canvas, dailyCardModel(input()))).not.toThrow()
    expect(canvas.width).toBe(0)
  })
})
