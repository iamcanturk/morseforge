/**
 * The visitor's answer about Google Analytics (TASK-039).
 *
 * One record, `{ analytics, decidedAt }`, and deliberately no default: "has
 * not chosen" is a state of its own, and it is the only one in which the
 * consent bar is shown. A default of "denied" would hide the bar for good; a
 * default of "granted" would be no consent at all.
 *
 * Kept apart from the settings record, for three reasons:
 *
 * - It is not in a backup. Consent is given in a browser, at a moment, by an
 *   affirmative act. A backup restored on a new phone, or a file someone else
 *   handed over, must not carry a "yes" that was never given there.
 * - "Erase everything" does not touch it, as it keeps the counters choice:
 *   erasing data is a privacy action, and it must not bring the question back,
 *   or worse, leave an old "yes" standing on a reset settings record.
 *   (`resetAll` clears the four backup stores only, so this one survives.)
 * - The inline loader on every page reads it before any island exists, so its
 *   shape has to be small enough to check by hand there (src/analytics/ga.ts).
 */

import { type StorageDriver, type Store, isRecord, sharedStore } from './store'

export const CONSENT_KEY = 'morseforge_consent'
export const CONSENT_VERSION = 1

export const CONSENT_CHOICES = ['granted', 'denied'] as const
export type ConsentChoice = (typeof CONSENT_CHOICES)[number]

export interface ConsentRecord {
  /** Google Analytics: allowed or not. Ad features are never asked about; they stay off. */
  analytics: ConsentChoice
  /** When the choice was made, as an ISO 8601 UTC timestamp. */
  decidedAt: string
}

/**
 * The only timestamp shape accepted: what `Date#toISOString` writes.
 *
 * Stricter than `Date.parse`, which takes "1" or "May" and invents a date. A
 * consent record is evidence of a choice; one whose date is a guess is not.
 */
export const DECIDED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

/** A whole, trustworthy record, or null. Nothing is filled in from a default. */
export function validateConsent(value: unknown): ConsentRecord | null {
  if (!isRecord(value)) return null
  const analytics = value['analytics']
  const decidedAt = value['decidedAt']
  if (analytics !== 'granted' && analytics !== 'denied') return null
  if (typeof decidedAt !== 'string' || !DECIDED_AT_PATTERN.test(decidedAt)) return null
  if (!Number.isFinite(Date.parse(decidedAt))) return null
  return { analytics, decidedAt }
}

/** A record of a choice made now. */
export function consentRecord(analytics: ConsentChoice, now: number = Date.now()): ConsentRecord {
  return { analytics, decidedAt: new Date(now).toISOString() }
}

/**
 * The shared store. Reads as null when nothing usable is stored: never chosen,
 * a damaged record, or one from a newer build.
 */
export function createConsentStore(driver?: StorageDriver): Store<ConsentRecord | null> {
  return sharedStore<ConsentRecord | null>(
    {
      key: CONSENT_KEY,
      version: CONSENT_VERSION,
      validate: validateConsent,
      createDefault: () => null,
    },
    driver,
  )
}
