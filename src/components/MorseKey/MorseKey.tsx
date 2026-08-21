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
  /** 0..1 toward auto-commit. Ignored when `autoCommit` is false. */
  commitProgress: number
  autoCommit: boolean
  /** Label for the bound key, e.g. "SPACE". */
  keyLabel?: string
  /** Label for the manual commit key, e.g. "CTRL". */
  commitLabel?: string
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
  commitProgress,
  autoCommit,
  keyLabel = 'SPACE',
  commitLabel = 'CTRL',
  disabled = false,
  pointerHandlers,
}: MorseKeyProps) {
  const showCountdown = autoCommit && pending !== '' && !isDown

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Reserved height, so resolving a character never shifts the key out
          from under the user's finger mid-send. */}
      <div className="flex h-24 w-full max-w-md flex-col items-center justify-center gap-2">
        {pending ? (
          <>
            <span className="font-mono text-3xl tracking-[0.25em] text-cyan">
              {prettify(pending)}
            </span>
            <span className="font-mono text-xs tracking-[0.16em] text-muted">
              {preview ? `= ${preview}` : 'NOT A CHARACTER YET'}
            </span>

            {/* The countdown is the only way the user can learn how long a
                pause they are allowed. Without it the character just vanishes
                and the app reads as broken. */}
            <span
              aria-hidden="true"
              className="mt-1 h-0.5 w-40 overflow-hidden rounded-full"
              style={{ background: 'var(--color-line)' }}
            >
              {showCountdown && (
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${(1 - commitProgress) * 100}%`,
                    background:
                      commitProgress > 0.75 ? 'var(--color-amber)' : 'var(--color-signal-dim)',
                  }}
                />
              )}
            </span>
          </>
        ) : (
          <span className="font-mono text-xs tracking-[0.16em] text-muted">READY</span>
        )}
      </div>

      <button
        type="button"
        disabled={disabled}
        // Names both inputs rather than assuming a keyboard: the same control
        // is a Space bar on a laptop and a thumb on a phone.
        aria-label={`Morse key. Press and hold this button, or hold the ${keyLabel} key. A short press sends a dot, a long press sends a dash.`}
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
            {isDown ? (
              'TRANSMITTING'
            ) : (
              <>
                {/* A phone has no Space bar and no Ctrl key. Swapping the copy
                    by pointer type in CSS keeps both variants in the prerendered
                    HTML, so there is no hydration mismatch and no flash of the
                    wrong instruction. */}
                <span className="pointer-coarse:hidden">HOLD {keyLabel}</span>
                <span className="hidden pointer-coarse:inline">HOLD TO SEND</span>
              </>
            )}
          </span>
        </span>
      </button>

      <p className="max-w-md text-center text-xs leading-relaxed text-muted">
        Tap for a dot, hold for a dash.{' '}
        {autoCommit ? (
          'Pause to finish the character — the bar above shows how long you have.'
        ) : (
          <>
            Take as long as you like, then
            <span className="pointer-coarse:hidden"> press {commitLabel} </span>
            <span className="hidden pointer-coarse:inline"> use the button below </span>
            to finish the character.
          </>
        )}
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
