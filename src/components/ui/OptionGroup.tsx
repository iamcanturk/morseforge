import { useId, useRef, type KeyboardEvent } from 'react'
import { nextIndex, tabStop } from './roving'

/**
 * Option cards: a radio group whose choices each need a sentence of
 * explanation — practice modes, teaching orders, copy text kinds.
 *
 * Same keyboard model as Segmented (one tab stop, arrows, Home/End). The hint
 * is at full opacity: the old 70–80% hints measured 3.2–3.7:1, below AA, and
 * a hint you cannot read is not a hint.
 */

export interface OptionCardOption<T extends string | number> {
  value: T
  title: string
  hint: string
  disabled?: boolean
  /** Shown in place of the hint while disabled: why it cannot be picked. */
  disabledHint?: string
}

export interface OptionGroupProps<T extends string | number> {
  /** Names the group for assistive technology. */
  label: string
  value: T | null
  options: readonly OptionCardOption<T>[]
  onChange: (value: T) => void
  /** Columns from the `sm` breakpoint up; always one column on a phone. */
  columns?: 1 | 2 | 3
  /** Use instead of `label` when a visible heading already names the group. */
  labelledBy?: string
  className?: string
}

const COLUMNS = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
} as const

export function OptionGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
  columns = 1,
  labelledBy,
  className,
}: OptionGroupProps<T>) {
  const id = useId()
  const cards = useRef<(HTMLButtonElement | null)[]>([])
  const isDisabled = (index: number) => options[index]?.disabled === true
  const selected = options.findIndex((option) => option.value === value)
  const stop = tabStop(selected, options.length, isDisabled)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = cards.current.findIndex((card) => card === event.target)
    const to = nextIndex(from < 0 ? selected : from, event.key, options.length, isDisabled)
    if (to === null) return
    event.preventDefault()
    const option = options[to]
    if (!option) return
    cards.current[to]?.focus()
    if (option.value !== value) onChange(option.value)
  }

  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className={['mf-option-group', COLUMNS[columns], className ?? ''].filter(Boolean).join(' ')}
    >
      {options.map((option, index) => {
        const hintId = `${id}-hint-${index}`
        const hint = option.disabled && option.disabledHint ? option.disabledHint : option.hint
        return (
          <button
            key={String(option.value)}
            ref={(element) => {
              cards.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={index === selected}
            aria-describedby={hintId}
            // aria-disabled rather than disabled: a disabled card's reason
            // should still be readable when a screen reader lands on it.
            aria-disabled={option.disabled || undefined}
            tabIndex={index === stop ? 0 : -1}
            className="mf-option"
            onClick={() => {
              if (!option.disabled && option.value !== value) onChange(option.value)
            }}
          >
            <span className="mf-option-title">{option.title}</span>
            <span id={hintId} className="mf-option-hint">
              {hint}
            </span>
          </button>
        )
      })}
    </div>
  )
}
