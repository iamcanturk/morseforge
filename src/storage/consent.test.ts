import { describe, expect, it } from 'vitest'
import { BACKUP_SECTIONS, createBackupStores, exportAll, importAll, resetAll } from './backup'
import {
  CONSENT_KEY,
  CONSENT_VERSION,
  consentRecord,
  createConsentStore,
  validateConsent,
} from './consent'
import { defaultSettings } from './settings'
import { createMemoryDriver } from './store'

const T0 = Date.UTC(2026, 9, 22, 9, 30)
const STAMP = new Date(T0).toISOString()

describe('validateConsent', () => {
  it('accepts a whole record of either answer', () => {
    expect(validateConsent({ analytics: 'granted', decidedAt: STAMP })).toEqual({
      analytics: 'granted',
      decidedAt: STAMP,
    })
    expect(validateConsent({ analytics: 'denied', decidedAt: STAMP })?.analytics).toBe('denied')
  })

  it('keeps only the two fields it knows', () => {
    expect(validateConsent({ analytics: 'denied', decidedAt: STAMP, ads: 'granted' })).toEqual({
      analytics: 'denied',
      decidedAt: STAMP,
    })
  })

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['an array', [{ analytics: 'granted', decidedAt: STAMP }]],
    ['a string', 'granted'],
    ['no answer', { decidedAt: STAMP }],
    ['an unknown answer', { analytics: 'yes', decidedAt: STAMP }],
    ['a boolean answer', { analytics: true, decidedAt: STAMP }],
    ['no date', { analytics: 'granted' }],
    ['a numeric date', { analytics: 'granted', decidedAt: T0 }],
    // Date.parse would accept both of these and invent a date.
    ['a date that is not ISO', { analytics: 'granted', decidedAt: '1' }],
    ['a local date', { analytics: 'granted', decidedAt: '2026-10-22 09:30' }],
    ['an impossible date', { analytics: 'granted', decidedAt: '2026-13-45T99:99:99Z' }],
  ])('rejects %s, with no default filled in', (_, value) => {
    expect(validateConsent(value)).toBeNull()
  })
})

describe('the consent store', () => {
  it('has no default: nothing stored reads as null, not as an answer', () => {
    expect(createConsentStore(createMemoryDriver()).read()).toBeNull()
  })

  it('round-trips a choice in a versioned envelope', () => {
    const driver = createMemoryDriver()
    const store = createConsentStore(driver)
    store.write(consentRecord('granted', T0))
    expect(JSON.parse(driver.getItem(CONSENT_KEY)!)).toEqual({
      version: CONSENT_VERSION,
      data: { analytics: 'granted', decidedAt: STAMP },
    })
    expect(store.read()).toEqual({ analytics: 'granted', decidedAt: STAMP })
  })

  it('reads a damaged record as no answer', () => {
    const driver = createMemoryDriver()
    driver.setItem(CONSENT_KEY, JSON.stringify({ version: 1, data: { analytics: 'maybe' } }))
    const store = createConsentStore(driver)
    expect(store.read()).toBeNull()
    driver.setItem(CONSENT_KEY, '{"version":1,')
    expect(store.read()).toBeNull()
  })

  it('reads a record from a newer build as no answer, and will not write over it', () => {
    const driver = createMemoryDriver()
    const newer = JSON.stringify({ version: CONSENT_VERSION + 1, data: { analytics: 'denied' } })
    driver.setItem(CONSENT_KEY, newer)
    const store = createConsentStore(driver)
    expect(store.read()).toBeNull()
    expect(store.write(consentRecord('granted', T0))).toBe(false)
    expect(driver.getItem(CONSENT_KEY)).toBe(newer)
  })
})

describe('consent and the backup', () => {
  function withConsent() {
    const driver = createMemoryDriver()
    const stores = createBackupStores(driver)
    createConsentStore(driver).write(consentRecord('granted', T0))
    return { driver, stores }
  }

  it('is not exported: a backup carries progress, not a yes given in another browser', () => {
    const { stores } = withConsent()
    const file = exportAll(stores, T0)
    expect(Object.keys(file)).not.toContain(CONSENT_KEY)
    expect(JSON.stringify(file)).not.toContain('decidedAt')
  })

  it('is not imported, even from a file that has it', () => {
    const driver = createMemoryDriver()
    const stores = createBackupStores(driver)
    const file = {
      ...exportAll(stores, T0),
      [CONSENT_KEY]: { analytics: 'granted', decidedAt: STAMP },
    }
    const result = importAll(JSON.stringify(file), stores, T0)
    expect(result.restored).toEqual([...BACKUP_SECTIONS])
    expect(driver.getItem(CONSENT_KEY)).toBeNull()
  })

  it('survives "Erase everything", as the counters choice does', () => {
    const { driver, stores } = withConsent()
    stores.settings.write({ ...defaultSettings(), counters: false })
    resetAll(stores)
    expect(createConsentStore(driver).read()).toEqual({ analytics: 'granted', decidedAt: STAMP })
    expect(stores.settings.read().counters).toBe(false)
  })
})
