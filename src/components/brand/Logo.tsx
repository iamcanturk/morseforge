interface LogoMarkProps {
  /** Rendered size in px. The mark is designed to stay legible down to 16. */
  size?: number
  /** Adds the CSS bloom. Off by default so favicons and print stay crisp. */
  glow?: boolean
  className?: string
}

/**
 * The MorseForge mark: the letter M rendered as its Morse form, dash-dash.
 *
 * The two bars are intentionally unequal in length and left-aligned. Equal bars
 * read as an "=" sign — the staggered version reads as a transmission decaying,
 * which is both on-metaphor and unambiguous at 16px.
 */
export function LogoMark({ size = 32, glow = false, className }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="MorseForge"
      className={[glow ? 'glow-signal' : '', className].filter(Boolean).join(' ')}
    >
      <title>MorseForge</title>
      <rect x="6" y="16" width="52" height="12" rx="6" fill="var(--color-signal)" />
      <rect x="6" y="36" width="38" height="12" rx="6" fill="var(--color-signal-dim)" />
    </svg>
  )
}

interface LogoProps {
  size?: number
  glow?: boolean
  /** Show "LEARN MORSE. BUILD THE SIGNAL." under the wordmark. */
  tagline?: boolean
  className?: string
}

/** Full horizontal lockup: mark + wordmark (+ optional tagline). */
export function Logo({ size = 36, glow = true, tagline = false, className }: LogoProps) {
  return (
    <span className={['inline-flex items-center gap-3', className].filter(Boolean).join(' ')}>
      <LogoMark size={size} glow={glow} />
      <span className="flex flex-col leading-none">
        <span
          className="font-display font-bold tracking-[0.16em] text-white"
          style={{ fontSize: size * 0.58 }}
        >
          MORSEFORGE
        </span>
        {tagline && (
          <span
            className="font-mono tracking-[0.18em] text-signal mt-2"
            style={{ fontSize: size * 0.22 }}
          >
            LEARN MORSE. BUILD THE SIGNAL.
          </span>
        )}
      </span>
    </span>
  )
}

/**
 * Secondary motif — a miniature of the Morse binary tree: one node, a short
 * branch left (dit) and a long branch right (dah). Signal Tree nodes and
 * achievement badges derive from this, so it lives next to the logo rather
 * than in the component tree.
 */
export function SignalCore({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" className={className}>
      <path
        d="M60 10 L103 35 V85 L60 110 L17 85 V35 Z"
        fill="none"
        stroke="var(--color-signal-dim)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* dit branch — short, terminates in a dot */}
      <path
        d="M30 60 h14 l6 -6 h6"
        fill="none"
        stroke="var(--color-signal)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="30" cy="60" r="4" fill="var(--color-signal)" />
      {/* dah branch — long, terminates in a bar */}
      <path
        d="M74 60 h8 l6 -6 h6"
        fill="none"
        stroke="var(--color-signal)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="88" y="51" width="4" height="6" rx="2" fill="var(--color-signal)" />
      <circle cx="60" cy="60" r="13" fill="none" stroke="var(--color-signal)" strokeWidth="3" />
      <circle cx="60" cy="60" r="5.5" fill="var(--color-cyan)" />
    </svg>
  )
}
