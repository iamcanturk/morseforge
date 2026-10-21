/**
 * The pure half of the message player: which tape cell is sounding, and at
 * what speed.
 *
 * Kept out of the component so the one piece with real logic — keeping the
 * lit cell in step with the tone — is tested without a browser or a clock.
 */

import type { TimedElement, TimingOptions } from '../../engine/timingEngine'
import type { MessageCell } from '../../game/messageLink'
import { WPM_PRESETS, type SettingsRecord } from '../../storage/settings'

/**
 * For every element of a message's timeline, the index of the tape cell it
 * belongs to.
 *
 * A cell owns its own dots and dashes and the silence after each of them, so
 * the highlight holds through a character's internal gaps and through the gap
 * before the next one, instead of blinking off between beats. Elements before
 * the first tone (there are none today) map to -1.
 */
export function cellOwners(
  timeline: readonly TimedElement[],
  cells: readonly MessageCell[],
): number[] {
  // Each sent cell, repeated once per element it keys.
  const keyed: number[] = []
  for (const cell of cells) {
    for (let i = 0; i < cell.code.length; i++) keyed.push(cell.index)
  }

  let tones = 0
  let owner = -1
  return timeline.map((element) => {
    if (element.on) {
      owner = keyed[tones] ?? owner
      tones += 1
    }
    return owner
  })
}

/** The Morse string for a row of cells, in the encoder's format. */
export function cellsToMorse(cells: readonly MessageCell[]): string {
  const words: string[][] = [[]]
  for (const cell of cells) {
    if (cell.space) words.push([])
    else if (cell.code) words[words.length - 1]!.push(cell.code)
  }
  return words
    .filter((word) => word.length > 0)
    .map((word) => word.join(' '))
    .join(' / ')
}

/** The three sending speeds the desk offers, from the settings presets. */
export const SPEEDS = [
  { value: WPM_PRESETS.beginner, label: 'Slow' },
  { value: WPM_PRESETS.normal, label: 'Normal' },
  { value: WPM_PRESETS.advanced, label: 'Fast' },
] as const

export type Speed = (typeof SPEEDS)[number]['value']

/** The offered speed nearest to `wpm`. */
export function nearestSpeed(wpm: number): Speed {
  let best: Speed = SPEEDS[1].value
  for (const speed of SPEEDS) {
    if (Math.abs(speed.value - wpm) < Math.abs(best - wpm)) best = speed.value
  }
  return best
}

/**
 * Timing for a message at a chosen character speed.
 *
 * The listener's own Farnsworth spacing still applies — it is the setting
 * that gives a learner time to think between characters — but never above the
 * character speed, where it would mean nothing.
 */
export function messageTiming(wpm: number, settings: SettingsRecord): TimingOptions {
  return { wpm, farnsworthWpm: Math.min(wpm, settings.timing.farnsworthWpm) }
}
