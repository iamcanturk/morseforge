/**
 * Keyboard maths for single-choice groups (WAI-ARIA radio group pattern).
 *
 * Shared by Segmented and OptionGroup (ThemeToggle's inline script mirrors it),
 * and kept free of React and the DOM so the rules are tested rather than
 * clicked through: arrows move and select, wrapping at the ends; Home and End
 * jump; disabled options are stepped over, never landed on.
 */

/** The keys a radio group answers to. Anything else is left to the browser. */
export const ROVING_KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
] as const

export type RovingKey = (typeof ROVING_KEYS)[number]

export function isRovingKey(key: string): key is RovingKey {
  return (ROVING_KEYS as readonly string[]).includes(key)
}

/**
 * The index a key press moves to, or null if it moves nowhere (an unrelated
 * key, or every option disabled).
 *
 * `current` may be -1 when nothing is selected yet: forward then lands on the
 * first enabled option and backward on the last, as if starting just outside
 * the group.
 */
export function nextIndex(
  current: number,
  key: string,
  count: number,
  isDisabled: (index: number) => boolean = () => false,
): number | null {
  if (!isRovingKey(key) || count <= 0) return null

  const enabled = (index: number) => !isDisabled(index)
  const first = () => {
    for (let index = 0; index < count; index++) if (enabled(index)) return index
    return null
  }
  const last = () => {
    for (let index = count - 1; index >= 0; index--) if (enabled(index)) return index
    return null
  }

  if (key === 'Home') return first()
  if (key === 'End') return last()

  const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1
  if (current < 0 || current >= count) return step === 1 ? first() : last()

  for (let offset = 1; offset <= count; offset++) {
    const index = (((current + step * offset) % count) + count) % count
    if (enabled(index)) return index
  }
  return null
}

/**
 * Which option holds the single tab stop: the selected one, or the first
 * enabled one when nothing is selected, so the group is still reachable.
 */
export function tabStop(
  selected: number,
  count: number,
  isDisabled: (index: number) => boolean = () => false,
): number {
  if (selected >= 0 && selected < count && !isDisabled(selected)) return selected
  return nextIndex(-1, 'Home', count, isDisabled) ?? -1
}
