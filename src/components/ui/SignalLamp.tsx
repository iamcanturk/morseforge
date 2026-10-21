import type { CSSProperties, JSX } from 'react'

/**
 * The receiving lamp: a 72–96 px bulb that flashes Morse (DEC-045).
 *
 * For use inside a `.mf-screen`, where `--color-signal` is the phosphor green
 * in both themes. On and off are instant, never faded: easing would blur the
 * dot/dash difference the learner is reading. The glow is a static shadow on a
 * layer whose opacity flips, so a flash costs the compositor nothing.
 *
 * Always `aria-hidden`: a screen reader announcing every flash would be
 * unusable, and the text beside it ("Receiving", "watch") carries the state.
 *
 * Styled inline rather than in a stylesheet because practice, copy and daily
 * each render it on their own page; this way it looks the same on all three
 * without any of them importing another package's CSS.
 */
export function SignalLamp({ lit, className }: { lit: boolean; className?: string }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-on={lit ? 'true' : 'false'}
      className={['relative inline-block size-18 shrink-0 rounded-full sm:size-24', className]
        .filter(Boolean)
        .join(' ')}
      style={BULB}
    >
      <span className="absolute inset-0 rounded-full" style={lit ? GLOW_ON : GLOW_OFF} />
    </span>
  )
}

const BULB: CSSProperties = {
  background:
    'radial-gradient(circle at 38% 32%, color-mix(in srgb, var(--color-signal) 14%, var(--color-screen)), var(--color-screen) 70%)',
  boxShadow:
    '0 0 0 3px var(--color-brass-deep), 0 0 0 4px rgb(0 0 0 / 0.55), 0 0 0 6px color-mix(in srgb, var(--color-brass) 35%, transparent), inset 0 2px 8px rgb(0 0 0 / 0.65)',
}

const GLOW: CSSProperties = {
  background:
    'radial-gradient(circle at 40% 35%, color-mix(in srgb, var(--color-signal) 35%, var(--color-ink)), var(--color-signal) 48%, color-mix(in srgb, var(--color-signal) 55%, var(--color-screen)) 100%)',
  boxShadow: '0 0 32px 8px color-mix(in srgb, var(--color-signal) 50%, transparent)',
}

const GLOW_ON: CSSProperties = { ...GLOW, opacity: 1 }
const GLOW_OFF: CSSProperties = { ...GLOW, opacity: 0 }
