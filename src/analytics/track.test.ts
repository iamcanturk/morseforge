import { describe, expect, it } from 'vitest'
import { ENDPOINT, beaconUrl, doNotTrack } from './track'

describe('beaconUrl', () => {
  it('carries the event name', () => {
    expect(beaconUrl('daily_start')).toBe(`${ENDPOINT}?n=daily_start`)
  })

  it('carries a short label alongside it', () => {
    expect(beaconUrl('daily_finish', 'pass')).toBe(`${ENDPOINT}?n=daily_finish&v=pass`)
  })

  it('drops anything that is not a plain short label', () => {
    // The value is the one field a caller could put something personal in by
    // accident, so it is whitelisted rather than escaped. An address, a name
    // or a copied message cannot make it into a URL.
    for (const value of [
      'someone@example.com',
      'HELLO WORLD',
      'a'.repeat(40),
      '../../etc/passwd',
      '<script>',
      '',
    ]) {
      expect(beaconUrl('copy_finish', value), value).toBe(`${ENDPOINT}?n=copy_finish`)
    }
  })

  it('keeps ordinary mode and method names', () => {
    for (const value of ['listening', 'koch', 'code-groups', 'pass', 'fail', '60s']) {
      expect(beaconUrl('practice_start', value)).toContain(`v=${value}`)
    }
  })

  it('never points anywhere but the origin', () => {
    expect(beaconUrl('install').startsWith('/')).toBe(true)
    expect(beaconUrl('install')).not.toContain('//')
  })
})

describe('doNotTrack', () => {
  it('is honoured in each of the spellings browsers have used', () => {
    expect(doNotTrack({ doNotTrack: '1' }, {})).toBe(true)
    expect(doNotTrack({}, { doNotTrack: '1' })).toBe(true)
    expect(doNotTrack({ msDoNotTrack: '1' }, {})).toBe(true)
  })

  it('is false when nothing was set', () => {
    expect(doNotTrack({}, {})).toBe(false)
    expect(doNotTrack({ doNotTrack: null }, { doNotTrack: null })).toBe(false)
  })

  it('does not read "0" as a request not to be tracked', () => {
    expect(doNotTrack({ doNotTrack: '0' }, {})).toBe(false)
  })
})
