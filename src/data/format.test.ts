import { describe, expect, it } from 'vitest'
import {
  capitalise,
  describeElements,
  formatMinutes,
  formatSeconds,
  joinList,
  numberWord,
  plural,
} from './format'
import { CURRICULUM_TOTAL_MINUTES } from './curriculum'

describe('formatMinutes', () => {
  it('writes the plan total the way the pages say it', () => {
    expect(formatMinutes(CURRICULUM_TOTAL_MINUTES)).toBe('2 hours 15 minutes')
  })

  it('drops the empty half', () => {
    expect(formatMinutes(120)).toBe('2 hours')
    expect(formatMinutes(60)).toBe('1 hour')
    expect(formatMinutes(45)).toBe('45 minutes')
    expect(formatMinutes(1)).toBe('1 minute')
    expect(formatMinutes(0)).toBe('0 minutes')
  })

  it('rounds to whole minutes and refuses nonsense', () => {
    expect(formatMinutes(89.6)).toBe('1 hour 30 minutes')
    expect(() => formatMinutes(-1)).toThrow(RangeError)
    expect(() => formatMinutes(Number.NaN)).toThrow(RangeError)
  })
})

describe('formatSeconds', () => {
  it('rounds to one decimal', () => {
    expect(formatSeconds(1620)).toBe('1.6')
    expect(formatSeconds(5580)).toBe('5.6')
    expect(formatSeconds(7140)).toBe('7.1')
    expect(formatSeconds(2000)).toBe('2.0')
  })
})

describe('joinList', () => {
  it('joins without an Oxford comma', () => {
    expect(joinList([])).toBe('')
    expect(joinList(['A'])).toBe('A')
    expect(joinList(['A', 'B'])).toBe('A and B')
    expect(joinList(['A', 'B', 'C'])).toBe('A, B and C')
    expect(joinList(['A', 'B', 'C'], 'or')).toBe('A, B or C')
  })
})

describe('numberWord and capitalise', () => {
  it('spells small numbers and leaves large ones as digits', () => {
    expect(numberWord(0)).toBe('zero')
    expect(numberWord(7)).toBe('seven')
    expect(numberWord(20)).toBe('twenty')
    expect(numberWord(26)).toBe('26')
    expect(numberWord(-1)).toBe('-1')
    expect(numberWord(1.5)).toBe('1.5')
    expect(capitalise(numberWord(2))).toBe('Two')
  })
})

describe('plural', () => {
  it('agrees with the count', () => {
    expect(plural(1, 'dot')).toBe('1 dot')
    expect(plural(3, 'dot')).toBe('3 dots')
    expect(plural(2, 'dash', 'dashes')).toBe('2 dashes')
  })
})

describe('describeElements', () => {
  it('explains a code in words', () => {
    expect(describeElements('.')).toBe('one dot')
    expect(describeElements('.----')).toBe('one dot and four dashes')
    expect(describeElements('.....')).toBe('five dots')
    expect(describeElements('-----')).toBe('five dashes')
    expect(describeElements('-....')).toBe('one dash and four dots')
  })
})
