import { useEffect, useId, useRef, useState } from 'react'

/** Small shared controls for the settings screen. */

export function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-line py-5 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <span className="font-display text-sm font-semibold text-ink">{label}</span>
          {hint && <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">{hint}</p>}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-7 w-12 rounded-full border transition-colors"
      style={{
        borderColor: checked ? 'var(--color-signal)' : 'var(--color-line)',
        background: checked
          ? 'color-mix(in srgb, var(--color-signal) 25%, transparent)'
          : 'var(--color-elevated)',
      }}
    >
      <span
        className="absolute top-1 h-4 w-4 rounded-full transition-all"
        style={{
          left: checked ? '26px' : '6px',
          background: checked ? 'var(--color-signal)' : 'var(--color-muted)',
        }}
      />
    </button>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (next: number) => void
  label: string
  format: (value: number) => string
}) {
  const id = useId()
  return (
    <div className="flex w-56 items-center gap-3">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="flex-1 accent-[var(--color-signal)]"
      />
      <span className="w-16 text-right font-mono text-xs text-signal">{format(value)}</span>
    </div>
  )
}

export function Choice<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (next: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className="rounded-lg border px-3 py-1.5 font-mono text-xs tracking-[0.1em] transition-colors"
            style={{
              borderColor: selected ? 'var(--color-signal)' : 'var(--color-line)',
              color: selected ? 'var(--color-signal)' : 'var(--color-muted)',
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Human-readable name for a key value, since " " and "Control" read badly. */
export function keyName(key: string): string {
  if (key === ' ') return 'SPACE'
  if (key.length === 1) return key.toUpperCase()
  return key.toUpperCase()
}

/**
 * Captures the next key pressed and reports it (PROJECT.md §10).
 *
 * Listens on the window with capture, not on the button: the whole point is to
 * intercept keys that are otherwise bound to something else, and by the time an
 * event reaches the button the app's own key handlers have already acted on it.
 */
export function KeyCapture({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (next: string) => void
  label: string
}) {
  const [listening, setListening] = useState(false)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!listening) return

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      // Escape cancels rather than binding, or there would be no way out of
      // the capture without binding something.
      if (event.key !== 'Escape') onChange(event.key)
      setListening(false)
      button.current?.focus()
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [listening, onChange])

  return (
    <button
      ref={button}
      type="button"
      aria-label={`${label}. Currently ${keyName(value)}. Activate, then press a key to rebind.`}
      onClick={() => setListening((on) => !on)}
      className="min-w-28 rounded-lg border px-4 py-2 font-mono text-xs tracking-[0.12em] transition-colors"
      style={{
        borderColor: listening ? 'var(--color-amber)' : 'var(--color-line)',
        color: listening ? 'var(--color-amber)' : 'var(--color-ink)',
      }}
    >
      {listening ? 'PRESS A KEY' : keyName(value)}
    </button>
  )
}
