/**
 * The words for the session modes and the teaching orders, in the page's
 * language. `src/game/session.ts` and `src/data/methods.ts` hold the logic;
 * what each is called and why it exists is copy, so it comes from the catalog,
 * with every letter and figure filled in from the data.
 */

import { ALL_DIGITS, ALL_LETTERS, LEARNING_STAGES } from '../../data/morseAlphabet'
import { METHODS, MIN_UNLOCK_ATTEMPTS, type MethodId } from '../../data/methods'
import type { SessionMode } from '../../game/session'
import type { MessageKey } from '../../i18n/keys'
import type { Translator } from '../../i18n/translator'

const MODE_KEYS = {
  listening: { label: 'modes.listeningLabel', prompt: 'modes.listeningPrompt' },
  recognition: { label: 'modes.recognitionLabel', prompt: 'modes.recognitionPrompt' },
  sending: { label: 'modes.sendingLabel', prompt: 'modes.sendingPrompt' },
} as const satisfies Record<SessionMode, { label: MessageKey; prompt: MessageKey }>

export function modeCopy(t: Translator, mode: SessionMode): { label: string; prompt: string } {
  const keys = MODE_KEYS[mode]
  return { label: t(keys.label), prompt: t(keys.prompt) }
}

export interface MethodCopy {
  name: string
  summary: string
  rationale: string
}

const percent = (accuracy: number | null) => Math.round((accuracy ?? 0) * 100)

export function methodCopy(t: Translator, id: MethodId): MethodCopy {
  const method = METHODS[id]
  switch (id) {
    case 'signal':
      return {
        name: t('methods.signalName'),
        summary: t('methods.signalSummary'),
        rationale: t('methods.signalRationale', { first: t.list(LEARNING_STAGES[0]!) }),
      }
    case 'koch': {
      const first = t.list(method.order.slice(0, method.startingCount))
      const value = percent(method.unlockAccuracy)
      return {
        name: t('methods.kochName'),
        summary: t('methods.kochSummary', { percent: value }),
        rationale: t('methods.kochRationale', { first, percent: value }),
      }
    }
    case 'alphabetical':
      return {
        name: t('methods.alphabeticalName'),
        summary: t('methods.alphabeticalSummary', {
          firstLetter: ALL_LETTERS[0]!,
          lastLetter: ALL_LETTERS.at(-1)!,
          firstDigit: ALL_DIGITS[0]!,
          lastDigit: ALL_DIGITS.at(-1)!,
        }),
        rationale: t('methods.alphabeticalRationale', {
          firstThree: t.list(ALL_LETTERS.slice(0, 3)),
        }),
      }
  }
}

/** "More join after a session at 90% accuracy…", or null for a method that never unlocks on score. */
export function unlockRule(t: Translator, id: MethodId): string | null {
  const accuracy = METHODS[id].unlockAccuracy
  if (accuracy === null) return null
  return t('methods.unlockRule', { percent: percent(accuracy), attempts: MIN_UNLOCK_ATTEMPTS })
}
