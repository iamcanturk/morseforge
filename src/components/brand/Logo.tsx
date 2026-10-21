import { SITE } from '../../config/site'
import { MARK_HEIGHT, MARK_WIDTH, WORDMARK, horizontalLockup, markFor, stackedLockup } from './mark'

/**
 * The MorseForge logo: the Split M and the traced wordmark.
 *
 * All geometry comes from ./mark.ts, which is also what the favicon, the app
 * icons, the OG images and the share cards are drawn from. This file only
 * decides how the pieces sit in HTML.
 *
 * Colours are tokens, not hex: the mark is `--color-signal` and the wordmark
 * is the current text colour, so both follow the theme (phosphor on walnut,
 * inky green on paper) with no second copy of the logo per theme.
 *
 * Rendered with no client directive, so Astro turns it into static SVG and
 * ships no JavaScript for it.
 */

type Labelling = { decorative?: boolean }

/** `role="img"` + name, or hidden when the surrounding link already names it. */
function a11y(decorative: boolean | undefined) {
  return decorative
    ? ({ 'aria-hidden': true, focusable: false } as const)
    : ({ role: 'img', 'aria-label': SITE.name } as const)
}

interface LogoMarkProps extends Labelling {
  /** Rendered height in px. Below 20 px the heavier favicon strokes are used. */
  size?: number
  /** One colour (`currentColor`), for print, embossing and overlays. */
  mono?: boolean
  className?: string
}

/** The Split M alone. */
export function LogoMark({
  size = 32,
  mono = false,
  decorative = false,
  className,
}: LogoMarkProps) {
  const g = markFor(size)
  return (
    <svg
      viewBox={`0 0 ${MARK_WIDTH} ${MARK_HEIGHT}`}
      height={size}
      width={Math.round((size * MARK_WIDTH) / MARK_HEIGHT)}
      className={className}
      {...a11y(decorative)}
    >
      {!decorative && <title>{SITE.name}</title>}
      <path
        d={g.d}
        fill="none"
        stroke={mono ? 'currentColor' : 'var(--color-signal)'}
        strokeWidth={g.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface WordmarkProps {
  /** Cap height in px. */
  height?: number
  className?: string
}

/**
 * "MorseForge" as outlines, filled with the current text colour. Hidden from
 * assistive technology: whatever contains it carries the name.
 */
export function Wordmark({ height = 12, className }: WordmarkProps) {
  const scale = height / WORDMARK.capHeight
  return (
    <svg
      viewBox={`0 ${WORDMARK.top} ${WORDMARK.width} ${WORDMARK.bottom - WORDMARK.top}`}
      height={Math.round((WORDMARK.bottom - WORDMARK.top) * scale * 100) / 100}
      width={Math.round(WORDMARK.width * scale * 100) / 100}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={WORDMARK.d} fill="currentColor" />
    </svg>
  )
}

interface LogoProps extends Labelling {
  /** Height of the mark in px; the wordmark is scaled from it. */
  size?: number
  /** Stacked (mark over name) rather than side by side. */
  layout?: 'horizontal' | 'stacked'
  /** One colour throughout (`currentColor`). */
  mono?: boolean
  /** Show "LEARN MORSE. BUILD THE SIGNAL." under the lockup. */
  tagline?: boolean
  /**
   * The header's optical size: a larger wordmark for a small mark, since at
   * 20 px a half-height wordmark is under 10 px and reads as an afterthought.
   */
  compact?: boolean
  className?: string
}

/**
 * A full lockup, drawn as one SVG so the mark and the name can never drift
 * apart: the spacing is mark.ts's, not the flexbox gap of the day.
 */
export function Logo({
  size = 32,
  layout = 'horizontal',
  mono = false,
  tagline = false,
  compact = false,
  decorative = false,
  className,
}: LogoProps) {
  const lockup = layout === 'stacked' ? stackedLockup(size) : horizontalLockup(size, compact)
  const g = markFor(size)
  const ms = lockup.mark.height / MARK_HEIGHT
  const [first, second] = SITE.tagline.toUpperCase().split(/(?<=\.)\s+/)
  const width = Math.ceil(lockup.width)
  const height = Math.ceil(lockup.height)
  const svg = (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={tagline ? undefined : className}
      {...a11y(decorative || tagline)}
    >
      {!(decorative || tagline) && <title>{SITE.name}</title>}
      <g transform={`translate(${lockup.mark.x} ${lockup.mark.y}) scale(${ms})`}>
        <path
          d={g.d}
          fill="none"
          stroke={mono ? 'currentColor' : 'var(--color-signal)'}
          strokeWidth={g.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g transform={`translate(${lockup.word.x} ${lockup.word.y}) scale(${lockup.word.scale})`}>
        <path d={WORDMARK.d} fill="currentColor" />
      </g>
    </svg>
  )
  if (!tagline) return svg
  return (
    <span
      className={['inline-flex flex-col', className].filter(Boolean).join(' ')}
      {...a11y(decorative)}
    >
      {svg}
      {/* Two spans rather than one string: on a narrow screen the single line
          wrapped to "LEARN MORSE. BUILD THE / SIGNAL.", orphaning the word the
          whole line is built around. Broken at the sentence, it reads
          correctly at any width. */}
      <span className="mf-engraved mt-2.5 text-brass">
        <span className="inline-block">{first}</span> <span className="inline-block">{second}</span>
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
