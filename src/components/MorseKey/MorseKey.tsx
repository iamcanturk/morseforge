import { useId, type KeyboardEvent, type PointerEvent, type Ref } from 'react'
import type { KeyedElement, PaddleControls } from './useMorseKey'
import { PaddleKey } from './PaddleKey'
import { prettify } from '../../engine/morseEncoder'
import { canVibrate } from '../../engine/vibrationEngine'
import { DARK } from '../../styles/palette'
import { useT } from '../../i18n/react'
import { renderRich } from '../../i18n/richReact'
import { keyLabel as keyCap } from './keyCopy'
import '../../styles/pkg-c.css'

/**
 * The on-screen straight key and its signal readout (PROJECT.md §9, §15, §57).
 *
 * Presentational only — all timing lives in `useMorseKey`, so the same visuals
 * serve the telegraph screen, the sending drills and onboarding. The props are
 * a superset of the original ones, so every screen that already renders a
 * `MorseKey` gets the brass key without changing a line; `KeyStation` turns the
 * readout and hint off and draws its own tape around it.
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
  /**
   * Everything that drives the key, spread onto the button.
   *
   * Named for pointers historically, but it carries the keyboard handlers too
   * — the button has to answer for itself when it is the focused element,
   * because the window-level binding deliberately ignores events aimed at a
   * button. The type says so rather than letting the spread carry handlers
   * nothing declares.
   */
  pointerHandlers: {
    onPointerDown: (event: React.PointerEvent) => void
    onPointerUp: () => void
    onPointerLeave: () => void
    onPointerCancel: () => void
    onKeyDown?: (event: React.KeyboardEvent) => void
    onKeyUp?: (event: React.KeyboardEvent) => void
    onBlur?: () => void
  }
  /**
   * The pending code, its preview and the countdown above the key. On by
   * default, which is what every screen written before `KeyStation` expects;
   * the station prints the same things on its tape and turns this off.
   */
  readout?: boolean
  /** The "tap for a dot, hold for a dash" line under the key. On by default. */
  hint?: boolean
  /**
   * A 10ms buzz on key-down, where the device can (Android Chrome). Off by
   * default; the caller decides whether settings allow it. iOS Safari has no
   * Vibration API at all, so there it silently does nothing.
   */
  haptics?: boolean
  /** Sidetone pitch for the sound plate. Omit to leave the plate blank. */
  frequency?: number
  /** True when the sidetone is off, so the plate says so instead of a pitch. */
  muted?: boolean
  /** Lets a caller hand focus to the key, e.g. after typing a target. */
  keyRef?: Ref<HTMLButtonElement>
  /**
   * The paddle keyer's controls (`useMorseKey().paddles`). When set, the
   * paddle pair is drawn instead of the straight key, with the same readout.
   */
  paddles?: PaddleControls | null
  /** The tone is sounding, for the paddles' TX jewel. Defaults to `isDown`. */
  toneOn?: boolean
  className?: string
}

export function MorseKey({
  isDown,
  pending,
  preview,
  commitProgress,
  autoCommit,
  keyLabel: keyLabelProp,
  commitLabel: commitLabelProp,
  disabled = false,
  pointerHandlers,
  readout = true,
  hint = true,
  haptics = false,
  frequency,
  muted = false,
  keyRef,
  paddles = null,
  toneOn = isDown,
  className,
}: MorseKeyProps) {
  const t = useT()
  const keyLabel = keyLabelProp ?? keyCap(t, ' ')
  const commitLabel = commitLabelProp ?? keyCap(t, 'Control')
  const showCountdown = autoCommit && pending !== '' && !isDown

  const onPointerDown = (event: PointerEvent) => {
    pointerHandlers.onPointerDown(event)
    // Inside the gesture, or browsers refuse it. Android Chrome buzzes; iOS
    // Safari does not implement `navigator.vibrate`, so iPhones get nothing,
    // and desktops ignore it. Only touch: a mouse click has nothing to feel.
    if (haptics && !disabled && event.pointerType === 'touch' && canVibrate()) {
      navigator.vibrate(10)
    }
  }

  // The button answers Space and Enter itself while it has focus. The
  // window-level binding sees the same keyup, finds it aimed at a button and
  // resets the engine, which disarmed the gap timers the release had just set:
  // with the key focused, no character ever finished. Stopping the event here
  // keeps it from reaching the window; the button has already handled it.
  const onKeyDown = (event: KeyboardEvent) => {
    pointerHandlers.onKeyDown?.(event)
    if (pointerHandlers.onKeyDown && (event.key === ' ' || event.key === 'Enter'))
      event.stopPropagation()
  }
  const onKeyUp = (event: KeyboardEvent) => {
    pointerHandlers.onKeyUp?.(event)
    if (pointerHandlers.onKeyUp && (event.key === ' ' || event.key === 'Enter'))
      event.stopPropagation()
  }

  return (
    <div className={['flex flex-col items-center gap-3', className ?? ''].join(' ')}>
      {readout && (
        // Reserved height, so resolving a character never shifts the key out
        // from under the user's finger mid-send. `role="status"` on the
        // wrapper rather than on the readout: a live region has to exist
        // before its content does, or the announcement is dropped. This is
        // the only feedback a screen-reader user gets that an element
        // registered at all.
        // One line, always the same height (audit follow-up from the lesson):
        // the old three-row block reserved ~120px above the key and pushed it
        // below the fold at 1440×900. The fuse is drawn along the line's
        // bottom edge instead of on a row of its own.
        <div
          role="status"
          className="relative flex h-11 w-full max-w-md items-center justify-center gap-3"
        >
          {pending ? (
            <>
              <PendingSpeech pending={pending} preview={preview} />
              <span
                aria-hidden="true"
                className="font-mono text-h3 leading-none tracking-code text-cyan"
              >
                {prettify(pending)}
              </span>
              <span aria-hidden="true" className="mf-engraved">
                {preview ? t('key.preview', { preview }) : t('key.notACharacter')}
              </span>
              <Fuse
                progress={commitProgress}
                active={showCountdown}
                className="absolute inset-x-0 bottom-0 mx-auto w-40"
              />
            </>
          ) : (
            <span className="mf-engraved">{t('key.ready')}</span>
          )}
        </div>
      )}

      {paddles ? (
        <PaddleKey
          paddles={paddles}
          toneOn={toneOn}
          disabled={disabled}
          haptics={haptics}
          frequency={frequency}
          muted={muted}
          keyRef={keyRef}
        />
      ) : (
        <button
          ref={keyRef}
          type="button"
          disabled={disabled}
          // Names both inputs rather than assuming a keyboard: the same control
          // is a Space bar on a laptop and a thumb on a phone.
          aria-label={t('key.label', { key: keyLabel })}
          // No `aria-pressed`: that makes it a latching toggle ("toggle button,
          // not pressed"), and a straight key springs back. What was keyed is
          // read out by the status line instead (A11Y-21).
          data-down={isDown}
          className="kc-key group relative w-full max-w-xl touch-none select-none rounded-bezel px-2 pt-3 pb-4 disabled:opacity-45 sm:px-4"
          {...pointerHandlers}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          // A long press is a dash, not a request for the context menu or, on
          // iOS, the callout (the CSS side is in pkg-c.css).
          onContextMenu={(event) => event.preventDefault()}
        >
          <BrassKey isDown={isDown} />

          {/* The key's own plates. Text lives in HTML, not in the SVG, so it
            keeps to the 12px floor at every width the drawing scales to. */}
          <span className="mt-2 flex items-center justify-between gap-3 px-2 sm:px-6">
            <span className="flex items-center gap-2" aria-hidden="true">
              <span className="mf-lamp" data-on={isDown} data-tone="amber" />
              <span className={['mf-engraved', isDown ? 'text-amber' : ''].join(' ')}>
                {t('key.tx')}
              </span>
            </span>

            <span
              aria-hidden="true"
              className={['kc-nameplate mf-engraved', isDown ? 'text-amber' : 'text-brass'].join(
                ' ',
              )}
            >
              {isDown ? (
                t('key.transmitting')
              ) : (
                <>
                  {/* A phone has no Space bar and no Ctrl key. Swapping the copy
                    by pointer type in CSS keeps both variants in the
                    prerendered HTML, so there is no hydration mismatch and no
                    flash of the wrong instruction. */}
                  <span className="pointer-coarse:hidden">{t('key.hold', { key: keyLabel })}</span>
                  <span className="hidden pointer-coarse:inline">{t('key.holdToSend')}</span>
                </>
              )}
            </span>

            <span className="mf-engraved tabular-nums" aria-hidden="true">
              {muted ? t('key.soundOff') : frequency ? t('key.hertz', { frequency }) : ''}
            </span>
          </span>
        </button>
      )}

      {hint && (
        <p className="max-w-md text-center text-sm leading-relaxed text-muted">
          <KeyingLead paddles={paddles} />{' '}
          {autoCommit
            ? t('key.pauseHint')
            : renderRich(t.rich('key.manualHint', { key: commitLabel }), POINTER_TAGS)}
        </p>
      )}
    </div>
  )
}

/**
 * What a screen reader hears for the character in progress.
 *
 * Read from the raw code rather than the prettified form: `prettify` swaps the
 * glyphs but does not separate them, so splitting its output on spaces read a
 * whole character as one mark.
 */
export function PendingSpeech({ pending, preview }: { pending: string; preview: string | null }) {
  const t = useT()
  const code = t.spokenCode(pending)
  return (
    <span className="sr-only">
      {preview ? t('key.pendingPreview', { code, preview }) : t('key.pendingNone', { code })}
    </span>
  )
}

/** The keyboard and the touch variants of a hint, swapped by pointer type in CSS. */
export const POINTER_TAGS = {
  desk: { el: 'span', class: 'pointer-coarse:hidden' },
  touch: { el: 'span', class: 'hidden pointer-coarse:inline' },
} as const

/**
 * The commit countdown: a thin amber fuse burning down toward the moment the
 * character is printed.
 *
 * The countdown is the only way the user can learn how long a pause they are
 * allowed. Without it the character just vanishes and the app reads as broken
 * — which is exactly why hiding it from assistive tech was the wrong fix. It
 * is a progressbar. Scaled rather than resized: it updates on every frame of
 * the countdown, and animating `width` would run layout each time.
 */
export function Fuse({
  progress,
  active,
  className,
}: {
  progress: number
  active: boolean
  className?: string
}) {
  const t = useT()
  const left = active ? 1 - progress : 0
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(left * 100)}
      aria-label={t('key.fuse')}
      className={['kc-fuse', className ?? ''].join(' ')}
      data-late={active && progress > 0.75}
    >
      <span className="kc-fuse-burn" style={{ transform: `scaleX(${left})` }} />
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* The drawing                                                                 */
/* -------------------------------------------------------------------------- */

/** Where the lever turns, in drawing units. The rotation is about this point. */
const PIVOT = { x: 342, y: 96 } as const
/**
 * How far the lever dips when pressed. Small, because a real key travels a
 * millimetre or two; at the knob this is still about ten drawing units, which
 * reads clearly at phone size. Sized so the contacts just meet.
 */
const TRAVEL_DEG = -2.4

/**
 * A brass straight key on a walnut base, drawn in about 1.5 KB of SVG.
 *
 * The same object in both themes, like the CRT glass: it is a physical thing
 * on the desk, and brass does not turn brown because the lights came on. Its
 * colours are the dark palette's, read from palette.ts, never typed.
 *
 * Down is a transform on the lever group with no transition at all — a key is
 * up or down, and easing the change blurs the boundary the learner is timing
 * against. The spark at the contact and the TX jewel are opacity flips.
 */
export function BrassKey({ isDown, className }: { isDown: boolean; className?: string }) {
  // Gradient ids must be unique per instance and valid inside `url(#…)`.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const brass = `${id}-brass`
  const sheen = `${id}-sheen`
  const wood = `${id}-wood`
  const bakelite = `${id}-bakelite`
  const shadow = `${id}-shadow`
  const glow = `${id}-glow`

  return (
    <svg
      viewBox="0 40 480 158"
      className={['block h-auto w-full', className ?? ''].join(' ')}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={brass} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={DARK.brass} />
          <stop offset="0.55" stopColor={DARK.brass} />
          <stop offset="1" stopColor={DARK['brass-deep']} />
        </linearGradient>
        <linearGradient id={sheen} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={DARK.ink} stopOpacity="0.55" />
          <stop offset="0.45" stopColor={DARK.ink} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={wood} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={DARK.wood} />
          <stop offset="1" stopColor={DARK['wood-deep']} />
        </linearGradient>
        <radialGradient id={bakelite} cx="0.4" cy="0.25" r="0.9">
          <stop offset="0" stopColor={DARK.elevated} />
          <stop offset="0.6" stopColor={DARK.void} />
        </radialGradient>
        <radialGradient id={shadow} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={DARK.void} stopOpacity="0.55" />
          <stop offset="1" stopColor={DARK.void} stopOpacity="0" />
        </radialGradient>
        <filter id={glow} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      {/* Cast shadow on the desk. */}
      <ellipse cx="240" cy="186" rx="232" ry="12" fill={`url(#${shadow})`} />

      {/* Walnut base: top bevel, front face, grain. */}
      <rect x="16" y="132" width="448" height="50" rx="12" fill={`url(#${wood})`} />
      <rect x="16" y="132" width="448" height="9" rx="4.5" fill={DARK.ink} opacity="0.07" />
      <g fill="none" stroke={DARK['brass-deep']} strokeOpacity="0.3" strokeWidth="1">
        <path d="M34 154c80-5 150 6 226-1s132-4 188 2" />
        <path d="M30 166c96 4 170-7 252-1s118 5 164-2" />
        <path d="M58 175c70-3 140 3 210 0" />
      </g>

      {/* TX jewel, set in the front face. */}
      <circle cx="44" cy="158" r="9" fill={`url(#${brass})`} />
      <circle cx="44" cy="158" r="5.5" fill={DARK.void} />
      <circle cx="44" cy="158" r="5.5" fill={DARK.amber} opacity={isDown ? 1 : 0.18} />
      <circle
        cx="44"
        cy="158"
        r="8"
        fill={DARK.amber}
        filter={`url(#${glow})`}
        opacity={isDown ? 0.9 : 0}
      />

      {/* Brass bed plate and its two screws. */}
      <rect x="70" y="122" width="300" height="12" rx="3" fill={`url(#${brass})`} />
      <rect x="70" y="122" width="300" height="12" rx="3" fill={`url(#${sheen})`} />
      <circle cx="82" cy="128" r="2.5" fill={DARK['brass-deep']} />
      <circle cx="358" cy="128" r="2.5" fill={DARK['brass-deep']} />

      {/* Binding posts, and the cord leaving the desk. */}
      <path
        d="M442 116c26 0 30 22 38 40"
        fill="none"
        stroke={DARK.void}
        strokeWidth="6"
        strokeLinecap="round"
      />
      {[412, 442].map((x) => (
        <g key={x}>
          <rect x={x - 8} y="118" width="16" height="16" rx="2" fill={`url(#${brass})`} />
          <rect x={x - 11} y="106" width="22" height="13" rx="3" fill={`url(#${brass})`} />
          <rect x={x - 11} y="106" width="22" height="13" rx="3" fill={`url(#${sheen})`} />
          <path
            d={`M${x - 6} 108v9M${x - 2} 108v9M${x + 2} 108v9M${x + 6} 108v9`}
            stroke={DARK['brass-deep']}
            strokeWidth="1"
          />
        </g>
      ))}

      {/* Trunnion: the post the lever pivots in. */}
      <rect x="322" y="84" width="40" height="40" rx="6" fill={`url(#${brass})`} />
      <rect x="322" y="84" width="40" height="40" rx="6" fill={`url(#${sheen})`} />

      {/* Return spring, between bed and lever. */}
      <path
        d="M292 122l12-3-12-3 12-3-12-3 12-3-12-3 12-3"
        fill="none"
        stroke={DARK.brass}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* Lower contact, fixed to the bed. */}
      <rect x="171" y="110" width="10" height="13" rx="1.5" fill={DARK.muted} />
      <rect x="169" y="108" width="14" height="4" rx="1.5" fill={DARK.ink} opacity="0.8" />

      {/* The lever, knob and upper contact: one group, one transform. */}
      <g transform={isDown ? `rotate(${TRAVEL_DEG} ${PIVOT.x} ${PIVOT.y})` : undefined}>
        <rect x="171" y="99" width="10" height="5" rx="1.5" fill={DARK.muted} />
        <path
          d="M74 90L330 87Q342 86 354 87L392 89Q398 90 398 94.5Q398 99 392 100L354 102Q342 103 330 102L74 100Q69 100 69 95Q69 90 74 90Z"
          fill={`url(#${brass})`}
        />
        <path
          d="M74 90L330 87Q342 86 354 87L392 89Q398 90 398 94.5Q398 99 392 100L354 102Q342 103 330 102L74 100Q69 100 69 95Q69 90 74 90Z"
          fill={`url(#${sheen})`}
        />
        {/* Tension nut and the rear stop. */}
        <rect x="284" y="76" width="18" height="12" rx="2" fill={`url(#${brass})`} />
        <path d="M288 78v8M292 78v8M296 78v8" stroke={DARK['brass-deep']} strokeWidth="1" />
        <rect x="378" y="80" width="12" height="9" rx="2" fill={`url(#${brass})`} />
        {/* Knob: stem, skirt and the bakelite cap with a single highlight. */}
        <rect x="80" y="72" width="14" height="19" rx="2" fill={DARK.void} />
        <rect x="52" y="80" width="70" height="7" rx="3.5" fill={`url(#${brass})`} />
        <path d="M56 81.5h62" stroke={DARK.ink} strokeOpacity="0.14" strokeWidth="1" />
        <path
          d="M56 66Q56 50 87 50Q118 50 118 66V70Q118 76 112 76H62Q56 76 56 70Z"
          fill={`url(#${bakelite})`}
          stroke={DARK['line-strong']}
          strokeOpacity="0.7"
          strokeWidth="1"
        />
        <path
          d="M65 59Q87 52 109 59"
          fill="none"
          stroke={DARK.ink}
          strokeOpacity="0.4"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </g>

      {/* Pivot bearing, drawn over the lever so it reads as the axle. */}
      <circle cx={PIVOT.x} cy={PIVOT.y} r="8" fill={DARK['brass-deep']} />
      <circle cx={PIVOT.x} cy={PIVOT.y} r="4.5" fill={`url(#${brass})`} />
      <path
        d={`M${PIVOT.x - 3} ${PIVOT.y + 2}l6-4`}
        stroke={DARK['brass-deep']}
        strokeWidth="1.2"
      />

      {/* The spark where the contacts meet. Static blur; only opacity flips. */}
      <g opacity={isDown ? 1 : 0}>
        <circle cx="176" cy="106" r="9" fill={DARK.cyan} filter={`url(#${glow})`} />
        <circle cx="176" cy="106" r="2.2" fill={DARK.ink} />
      </g>
    </svg>
  )
}

/* -------------------------------------------------------------------------- */
/* The trace                                                                   */
/* -------------------------------------------------------------------------- */

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
  className,
}: {
  elements: readonly KeyedElement[]
  thresholdMs: number
  className?: string
}) {
  const t = useT()
  return (
    <div
      className={[
        'mf-screen mf-screen-flush mf-grid flex h-14 items-center gap-1.5 overflow-hidden px-4',
        className ?? '',
      ].join(' ')}
    >
      {elements.length === 0 ? (
        <span className="mf-engraved mx-auto">{t('key.noSignal')}</span>
      ) : (
        // Newest on the right, like the tape, so the strip reads the same way
        // as everything else on the desk. Older elements fall off the left.
        <span className="ml-auto flex items-center gap-1.5">
          {elements.map((keyed) => {
            // Width tracks the real hold, clamped so one very long press
            // cannot squeeze everything else out of the strip. Set once per
            // element, never animated.
            const width = Math.min(Math.max(keyed.heldMs / thresholdMs, 0.25), 4) * 14
            return (
              <span
                key={keyed.id}
                title={t('key.traceTitle', {
                  element: keyed.element === '.' ? t('format.dotWord') : t('format.dashWord'),
                  ms: Math.round(keyed.heldMs),
                })}
                className={[
                  'h-2.5 shrink-0 rounded-full',
                  keyed.element === '.' ? 'bg-cyan' : 'bg-signal',
                ].join(' ')}
                style={{ width: `${width}px` }}
              />
            )
          })}
        </span>
      )}
    </div>
  )
}

/**
 * The first sentence of every keying hint: how this key makes a dot and a
 * dash. A phone has no bracket keys, so the paddle copy names the keys only
 * where there is a keyboard (swapped by pointer type in CSS, as above).
 */
export function KeyingLead({ paddles }: { paddles: PaddleControls | null | undefined }) {
  const t = useT()
  if (!paddles) return <>{t('key.tapLead')}</>
  return (
    <>
      <span className="pointer-coarse:hidden">
        {t('key.paddleLeadDesk', {
          dit: keyCap(t, paddles.keys.dit),
          dah: keyCap(t, paddles.keys.dah),
        })}
      </span>
      <span className="hidden pointer-coarse:inline">{t('key.paddleLeadTouch')}</span>
    </>
  )
}
