import { useId, type PointerEvent, type Ref } from 'react'
import type { Paddle } from '../../engine/keyEngine'
import { prettify } from '../../engine/morseEncoder'
import { canVibrate } from '../../engine/vibrationEngine'
import { DARK } from '../../styles/palette'
import type { MessageKey } from '../../i18n/keys'
import { useT } from '../../i18n/react'
import { keyLabel as keyCap, keyerLabel } from './keyCopy'
import type { PaddleControls } from './useMorseKey'
import '../../styles/pkg-c.css'
import '../../styles/pkg-iambic.css'

/**
 * The on-screen iambic paddle (issue #43): two brass levers with bakelite
 * finger pieces, one button each, so two thumbs can squeeze them at once.
 *
 * Presentational, like `MorseKey`: the keyer in `useMorseKey` does all the
 * timing, and this only reports which paddle is down. The pieces it is built
 * from (the bezel, the nameplate, the TX jewel, the palette) are the straight
 * key's, so the two keys read as the same desk.
 */

const ELEMENT: Readonly<Record<Paddle, '.' | '-'>> = { dit: '.', dah: '-' }
const NAME: Readonly<Record<Paddle, MessageKey>> = { dit: 'key.dit', dah: 'key.dah' }
const PADDLE_LABEL: Readonly<Record<Paddle, MessageKey>> = {
  dit: 'key.ditPaddle',
  dah: 'key.dahPaddle',
}

export interface PaddleKeyProps {
  paddles: PaddleControls
  /** The tone is on: lights the TX jewel. */
  toneOn: boolean
  disabled?: boolean
  haptics?: boolean
  frequency?: number
  muted?: boolean
  /** Given to the left paddle, so a caller can hand the keyboard to the key. */
  keyRef?: Ref<HTMLButtonElement>
  className?: string
}

export function PaddleKey({
  paddles,
  toneOn,
  disabled = false,
  haptics = false,
  frequency,
  muted = false,
  keyRef,
  className,
}: PaddleKeyProps) {
  const t = useT()
  const kind = keyerLabel(t, paddles.kind)
  return (
    <div
      role="group"
      aria-label={t('key.paddles', { kind })}
      className={['w-full max-w-xl', className ?? ''].join(' ')}
    >
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {paddles.order.map((paddle, index) => (
          <PaddleButton
            key={paddle}
            paddle={paddle}
            side={index === 0 ? 'left' : 'right'}
            down={paddles.held[paddle]}
            keyLabel={keyCap(t, paddles.keys[paddle])}
            handlers={paddles.handlers[paddle]}
            disabled={disabled}
            haptics={haptics}
            buttonRef={index === 0 ? keyRef : undefined}
          />
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 px-2 sm:px-6" aria-hidden="true">
        <span className="flex items-center gap-2">
          <span className="mf-lamp" data-on={toneOn} data-tone="amber" />
          <span className={['mf-engraved', toneOn ? 'text-amber' : ''].join(' ')}>
            {t('key.tx')}
          </span>
        </span>
        <span
          className={['kc-nameplate mf-engraved', toneOn ? 'text-amber' : 'text-brass'].join(' ')}
        >
          {toneOn ? t('key.transmitting') : kind}
        </span>
        <span className="mf-engraved tabular-nums">
          {muted ? t('key.soundOff') : frequency ? t('key.hertz', { frequency }) : ''}
        </span>
      </div>
    </div>
  )
}

function PaddleButton({
  paddle,
  side,
  down,
  keyLabel,
  handlers,
  disabled,
  haptics,
  buttonRef,
}: {
  buttonRef?: Ref<HTMLButtonElement> | undefined
  paddle: Paddle
  side: 'left' | 'right'
  down: boolean
  keyLabel: string
  handlers: PaddleControls['handlers'][Paddle]
  disabled: boolean
  haptics: boolean
}) {
  const t = useT()
  const onPointerDown = (event: PointerEvent) => {
    handlers.onPointerDown(event)
    if (haptics && !disabled && event.pointerType === 'touch' && canVibrate()) navigator.vibrate(10)
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={disabled}
      aria-label={t.raw(PADDLE_LABEL[paddle], { key: keyLabel })}
      data-down={down}
      data-side={side}
      className="kc-key ik-paddle flex touch-none flex-col items-center rounded-bezel px-1 pt-2 pb-3 select-none disabled:opacity-45 sm:px-3"
      // The key handlers stop what they answer, so the window binding never
      // sees a key this paddle has already taken, as on the straight key.
      {...handlers}
      onPointerDown={onPointerDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <PaddleLever down={down} side={side} />
      <span className="mt-1 flex items-center gap-2" aria-hidden="true">
        <span className={['mf-engraved', down ? 'text-amber' : 'text-brass'].join(' ')}>
          {t.raw(NAME[paddle])}
        </span>
        <span className="font-mono text-h3 leading-none text-cyan">
          {prettify(ELEMENT[paddle])}
        </span>
        <kbd className="mf-kbd pointer-coarse:hidden">{keyLabel}</kbd>
      </span>
    </button>
  )
}

/**
 * One lever of the paddle, seen from the operator's side: the walnut base, a
 * brass arm from the centre post, and a bakelite finger piece. Drawn for the
 * left lever and mirrored for the right, so the pair meets at the post.
 *
 * Pressed, the lever swings toward the post, as a squeezed paddle does. Like
 * the straight key, a transform with no transition: a paddle is down or up.
 */
function PaddleLever({ down, side }: { down: boolean; side: 'left' | 'right' }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const brass = `${id}-brass`
  const wood = `${id}-wood`
  const bakelite = `${id}-bakelite`
  const glow = `${id}-glow`

  return (
    <svg
      viewBox="0 0 240 150"
      className="block h-auto w-full max-w-[15rem]"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={brass} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={DARK.brass} />
          <stop offset="0.6" stopColor={DARK.brass} />
          <stop offset="1" stopColor={DARK['brass-deep']} />
        </linearGradient>
        <linearGradient id={wood} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={DARK.wood} />
          <stop offset="1" stopColor={DARK['wood-deep']} />
        </linearGradient>
        <radialGradient id={bakelite} cx="0.35" cy="0.2" r="0.95">
          <stop offset="0" stopColor={DARK.elevated} />
          <stop offset="0.65" stopColor={DARK.void} />
        </radialGradient>
        <filter id={glow} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      <g transform={side === 'right' ? 'translate(240 0) scale(-1 1)' : undefined}>
        {/* Walnut base, square where it meets the other half at the post. */}
        <path d="M24 118H240V148H24Q12 148 12 136V130Q12 118 24 118Z" fill={`url(#${wood})`} />
        <rect x="12" y="118" width="228" height="6" fill={DARK.ink} opacity="0.07" />

        {/* The fixed contact the lever swings onto, and its spark. */}
        <rect x="196" y="60" width="8" height="30" rx="2" fill={DARK.muted} />
        <g opacity={down ? 1 : 0}>
          <circle cx="194" cy="75" r="9" fill={DARK.cyan} filter={`url(#${glow})`} />
          <circle cx="194" cy="75" r="2.2" fill={DARK.ink} />
        </g>

        {/* Centre post, half of it: the other lever's drawing has the rest. */}
        <rect x="212" y="38" width="28" height="84" rx="4" fill={`url(#${brass})`} />
        <circle cx="226" cy="56" r="4" fill={DARK['brass-deep']} />
        <circle cx="226" cy="104" r="4" fill={DARK['brass-deep']} />

        {/* The lever: arm and finger piece, one group, one transform. */}
        <g transform={down ? 'translate(8 0)' : undefined}>
          <rect x="96" y="70" width="98" height="10" rx="3" fill={`url(#${brass})`} />
          <path d="M100 71h92" stroke={DARK.ink} strokeOpacity="0.25" strokeWidth="1.2" />
          <rect x="44" y="18" width="58" height="96" rx="22" fill={`url(#${bakelite})`} />
          <rect
            x="44"
            y="18"
            width="58"
            height="96"
            rx="22"
            fill="none"
            stroke={DARK['line-strong']}
            strokeOpacity="0.7"
          />
          <path
            d="M56 34Q60 26 72 25"
            fill="none"
            stroke={DARK.ink}
            strokeOpacity="0.4"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <rect x="94" y="62" width="10" height="26" rx="3" fill={`url(#${brass})`} />
        </g>
      </g>
    </svg>
  )
}
