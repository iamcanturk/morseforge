import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { nextIndex, tabStop } from './roving'

/**
 * A single-choice row of segments: an ARIA radio group with a roving tab stop.
 *
 * Replaces the `aria-pressed` chip rows, which announced each choice as an
 * independent toggle and could not be operated with arrow keys. One tab stop
 * for the whole group, arrows to move (selecting as they go), Home and End to
 * jump — the pattern screen-reader users already know from native radios.
 *
 * The options are real `<button>`s on purpose: the straight key's keyboard
 * binding ignores Space on interactive elements, so pressing Space on a
 * segment selects it instead of keying a dit.
 */

export interface SegmentedOption<T extends string | number> {
  value: T
  label: ReactNode
  /** Accessible name when `label` is an icon or otherwise not plain text. */
  ariaLabel?: string
  disabled?: boolean
}

export interface SegmentedProps<T extends string | number> {
  /** Names the group for assistive technology. */
  label: string
  value: T | null
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  /** Stretch to the container, segments sharing the width equally. */
  block?: boolean
  /** Use instead of `label` when a visible heading already names the group. */
  labelledBy?: string
  className?: string
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  block = false,
  labelledBy,
  className,
}: SegmentedProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const isDisabled = (index: number) => options[index]?.disabled === true
  const selected = options.findIndex((option) => option.value === value)
  const stop = tabStop(selected, options.length, isDisabled)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = buttons.current.findIndex((button) => button === event.target)
    const to = nextIndex(from < 0 ? selected : from, event.key, options.length, isDisabled)
    if (to === null) return
    event.preventDefault()
    const option = options[to]
    if (!option) return
    buttons.current[to]?.focus()
    if (option.value !== value) onChange(option.value)
  }

  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      // Read by the phone grid in global.css: 2 and 3 options share a row,
      // 4 make a 2 × 2, so no option is left alone on a line.
      data-count={options.length}
      className={[
        'mf-segmented',
        size === 'sm' ? 'mf-segmented-sm' : '',
        block ? 'mf-segmented-block' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {options.map((option, index) => (
        <button
          key={String(option.value)}
          ref={(element) => {
            buttons.current[index] = element
          }}
          type="button"
          role="radio"
          aria-checked={index === selected}
          aria-label={option.ariaLabel}
          tabIndex={index === stop ? 0 : -1}
          disabled={option.disabled}
          className="mf-segment"
          onClick={() => {
            if (option.value !== value) onChange(option.value)
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
