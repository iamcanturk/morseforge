import type { KeyedElement } from './useMorseKey'
import { prettify } from '../../engine/morseEncoder'

/**
 * The on-screen straight key and its signal readout (PROJECT.md §9, §15, §57).
 *
 * Presentational only — all timing lives in `useMorseKey`, so the same visuals
 * serve the telegraph screen, the sending drills and onboarding.
 */

export interface MorseKeyProps {
  isDown: boolean
  /** Elements keyed so far for the character in progress. */
  pending: string
  /** What `pending` would decode to, shown live as a hint. */
  preview: string | null
  /** Label for the bound key, e.g. "SPACE". */
  keyLabel?: string
  disabled?: boolean
  pointerHandlers: {
    onPointerDown: (event: React.PointerEvent) => void
    onPointerUp: () => void
    onPointerLeave: () => void
    onPointerCancel: () => void
  }
}

export function MorseKey({
  isDown,
  pending,
  preview,
  keyLabel = 'SPACE',
  disabled = false,
  pointerHandlers,
}: MorseKeyProps) {
  return (
    <div className="flex flex-col items-center gap-5">
      {/* The character in progress. Reserved height, so resolving a character
          does not shift the key underneath the user's finger mid-send. */}
      <div className="flex h-16 flex-col items-center justify-center gap-1">
        {pending ? (
          <>
            <span className="font-mono text-3xl tracking-[0.25em] text-cyan">
              {prettify(pending)}
            </span>
            <span className="font-mono text-xs tracking-[0.16em] text-muted">
              {preview ? `= ${preview}` : '…'}
            </span>
          </>
        ) : (
          <span className="font-mono text-xs tracking-[0.16em] text-muted">READY</span>
        )}
      </div>

      <button
        type="button"
        disabled={disabled}
        aria-label={`Morse key. Hold ${keyLabel}, or press and hold here. Short press sends a dot, long press sends a dash.`}
        aria-pressed={isDown}
        className="w-full max-w-md touch-none select-none rounded-2xl border-2 px-8 py-10 disabled:opacity-40"
        style={{
          borderColor: isDown ? 'var(--color-signal)' : 'var(--color-line)',
          background: isDown
            ? 'color-mix(in srgb, var(--color-signal) 18%, var(--color-panel))'
            : 'var(--color-panel)',
          boxShadow: isDown
            ? '0 0 32px color-mix(in srgb, var(--color-signal) 35%, transparent)'
            : 'none',
          // Only these two properties animate, per the §29 performance budget.
          transition: 'background-color 60ms linear, box-shadow 60ms linear',
        }}
        {...pointerHandlers}
      >
        <span className="flex flex-col items-center gap-3">
          <span
            className="h-3 w-3 rounded-full"
            style={{
              background: isDown ? 'var(--color-signal)' : 'var(--color-line)',
              boxShadow: isDown
                ? '0 0 14px color-mix(in srgb, var(--color-signal) 70%, transparent)'
                : 'none',
            }}
          />
          <span
            className="font-mono text-sm tracking-[0.2em]"
            style={{ color: isDown ? 'var(--color-signal)' : 'var(--color-muted)' }}
          >
            {isDown ? 'TRANSMITTING' : `HOLD ${keyLabel}`}
          </span>
        </span>
      </button>

      <p className="text-center text-xs text-muted">
        Short press sends a dot, long press sends a dash. Pause to end a character, pause longer to
        end a word.
      </p>
    </div>
  )
}

/**
 * The signal trace (PROJECT.md §15).
 *
 * Each element is drawn at its real keyed duration rather than at a nominal
 * dot/dash width, so a learner can see their own timing drift — the thing that
 * makes a fist unreadable long before the characters themselves are wrong.
 */
export function SignalTrace({
  elements,
  thresholdMs,
}: {
  elements: readonly KeyedElement[]
  thresholdMs: number
}) {
  if (elements.length === 0) {
    return (
      <div className="flex h-14 items-center justify-center rounded-lg border border-line bg-panel">
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted">NO SIGNAL</span>
      </div>
    )
  }

  return (
    <div className="flex h-14 items-center gap-1.5 overflow-hidden rounded-lg border border-line bg-panel px-3">
      {elements.map((keyed) => {
        // Width tracks the real hold, clamped so one very long press cannot
        // squeeze everything else out of the strip.
        const width = Math.min(Math.max(keyed.heldMs / thresholdMs, 0.25), 4) * 14
        return (
          <span
            key={keyed.id}
            title={`${keyed.element === '.' ? 'dot' : 'dash'} — ${Math.round(keyed.heldMs)}ms`}
            className="h-2.5 shrink-0 rounded-full"
            style={{
              width: `${width}px`,
              background: keyed.element === '.' ? 'var(--color-cyan)' : 'var(--color-signal)',
            }}
          />
        )
      })}
    </div>
  )
}
