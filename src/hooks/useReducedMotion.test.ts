import { describe, expect, it } from 'vitest'
import { resolveMotion } from './useReducedMotion'

describe('resolveMotion', () => {
  it('follows the system when the preference is "system"', () => {
    expect(resolveMotion('system', true)).toBe(true)
    expect(resolveMotion('system', false)).toBe(false)
  })

  it('suppresses motion when asked to, whatever the system says', () => {
    expect(resolveMotion('reduce', false)).toBe(true)
    expect(resolveMotion('reduce', true)).toBe(true)
  })

  it('allows motion when asked to, whatever the system says', () => {
    // Both directions matter. Someone who has turned motion on here has said
    // they want it despite the OS setting, and overriding that would make the
    // control a lie.
    expect(resolveMotion('full', true)).toBe(false)
    expect(resolveMotion('full', false)).toBe(false)
  })
})
