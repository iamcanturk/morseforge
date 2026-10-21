/**
 * The words for the key's settings values, in the page's language. The values
 * themselves stay in `src/storage/settings.ts`.
 */

import type { KeyerKind } from '../../engine/keyEngine'
import type { KeyerPreset, SignalMode } from '../../storage/settings'
import type { MessageKey } from '../../i18n/keys'
import type { Translator } from '../../i18n/translator'
import { keyName } from './keyName'

const SIGNAL: Record<SignalMode, MessageKey> = {
  sound: 'terms.signalSound',
  lamp: 'terms.signalLamp',
  both: 'terms.signalBoth',
}

const KEYER: Record<KeyerKind, MessageKey> = {
  straight: 'terms.keyerStraight',
  iambicA: 'terms.keyerIambicA',
  iambicB: 'terms.keyerIambicB',
}

const PRESET: Record<KeyerPreset, MessageKey> = {
  learning: 'terms.presetLearning',
  relaxed: 'terms.presetRelaxed',
  standard: 'terms.presetStandard',
  manual: 'terms.presetManual',
}

export const signalLabel = (t: Translator, mode: SignalMode): string => t.raw(SIGNAL[mode])
export const keyerLabel = (t: Translator, kind: KeyerKind): string => t.raw(KEYER[kind])
export const presetLabel = (t: Translator, preset: KeyerPreset): string => t.raw(PRESET[preset])

/** A bound key as the key's own plates print it, in the page's language. */
export function keyLabel(t: Translator, key: string): string {
  if (key === ' ') return t('terms.keySpace')
  if (key === 'Control') return t('terms.keyCtrl')
  if (key === 'ControlLeft') return t('terms.keyCtrlLeft')
  if (key === 'ControlRight') return t('terms.keyCtrlRight')
  return keyName(key)
}

/**
 * The commit key as the drills print it under the key: the key's name in
 * capitals, with Control spelled out rather than abbreviated.
 */
export function commitLabel(t: Translator, key: string | null | undefined): string {
  const bound = key ?? 'Control'
  return bound === 'Control' ? t('terms.keyControl') : bound.toUpperCase()
}
