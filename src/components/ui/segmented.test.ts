import { describe, expect, it } from 'vitest'
import { isRovingKey, nextIndex, tabStop } from './roving'

describe('nextIndex', () => {
  it('moves forward and back with either axis', () => {
    expect(nextIndex(1, 'ArrowRight', 4)).toBe(2)
    expect(nextIndex(1, 'ArrowDown', 4)).toBe(2)
    expect(nextIndex(1, 'ArrowLeft', 4)).toBe(0)
    expect(nextIndex(1, 'ArrowUp', 4)).toBe(0)
  })

  it('wraps at both ends', () => {
    expect(nextIndex(3, 'ArrowRight', 4)).toBe(0)
    expect(nextIndex(0, 'ArrowLeft', 4)).toBe(3)
  })

  it('jumps with Home and End', () => {
    expect(nextIndex(2, 'Home', 4)).toBe(0)
    expect(nextIndex(0, 'End', 4)).toBe(3)
  })

  it('steps over disabled options, never onto them', () => {
    const disabled = (index: number) => index === 1 || index === 3
    expect(nextIndex(0, 'ArrowRight', 4, disabled)).toBe(2)
    expect(nextIndex(2, 'ArrowRight', 4, disabled)).toBe(0)
    expect(nextIndex(0, 'ArrowLeft', 4, disabled)).toBe(2)
    expect(nextIndex(2, 'End', 4, (index) => index === 3)).toBe(2)
    expect(nextIndex(2, 'Home', 4, (index) => index === 0)).toBe(1)
  })

  it('enters from outside when nothing is selected', () => {
    expect(nextIndex(-1, 'ArrowRight', 3)).toBe(0)
    expect(nextIndex(-1, 'ArrowLeft', 3)).toBe(2)
  })

  it('goes nowhere for other keys, an empty group, or all disabled', () => {
    expect(nextIndex(0, 'Enter', 3)).toBeNull()
    expect(nextIndex(0, ' ', 3)).toBeNull()
    expect(nextIndex(0, 'ArrowRight', 0)).toBeNull()
    expect(nextIndex(0, 'ArrowRight', 3, () => true)).toBeNull()
  })

  it('stays put on a single enabled option', () => {
    expect(nextIndex(1, 'ArrowRight', 3, (index) => index !== 1)).toBe(1)
  })
})

describe('tabStop', () => {
  it('is the selected option', () => {
    expect(tabStop(2, 4)).toBe(2)
  })

  it('falls back to the first enabled option, so the group stays reachable', () => {
    expect(tabStop(-1, 4)).toBe(0)
    expect(tabStop(-1, 4, (index) => index === 0)).toBe(1)
    expect(tabStop(0, 4, (index) => index === 0)).toBe(1)
  })

  it('is -1 when nothing can take focus', () => {
    expect(tabStop(-1, 0)).toBe(-1)
    expect(tabStop(-1, 2, () => true)).toBe(-1)
  })
})

describe('isRovingKey', () => {
  it('knows its keys', () => {
    expect(isRovingKey('Home')).toBe(true)
    expect(isRovingKey('Tab')).toBe(false)
  })
})
