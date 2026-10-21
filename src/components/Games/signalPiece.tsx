import type { CSSProperties } from 'react'
import { MORSE_ALPHABET } from '../../data/morseAlphabet'

/**
 * What a Signal Defender piece shows (DEC-027).
 *
 * A falling signal carries its Morse code and nothing else. The letter is the
 * answer, so printing it would turn the game into typing what is on screen —
 * a score, XP and recognition evidence for copying a glyph, which is a fake
 * number. The letter appears only once it has been knocked down.
 */

/**
 * Where a piece is drawn across the field, from the rules' 0..1.
 *
 * The rules keep a signal between a tenth and nine tenths of the width; a code
 * is several times wider than a letter, so on a phone a code centred that close
 * to the edge was clipped by the glass. The drawn band is narrowed so the
 * widest code (a digit, five dashes) still fits whole at 390px.
 */
export const fieldX = (x: number): number => 0.5 + (x - 0.5) * 0.66

/**
 * The code is drawn, not typeset: it is the only thing there is to read, and
 * a text middle dot is a speck at any size a phone can fit. A dot is one unit
 * round, a dash three units long, one unit apart: the proportions the code is
 * timed in, as the alphabet's pips draw it. The unit follows the field's width
 * (`cqw`), so it reads at a glance on a phone without crowding a desk, and
 * `bg-current` lets the danger tint near the floor reach it.
 */
const ROW_CLASS = 'flex items-center gap-[0.35em] text-[clamp(1.25rem,6.5cqw,1.75rem)]'
const ELEMENT_CLASS = {
  '.': 'block size-[0.35em] rounded-full bg-current',
  '-': 'block h-[0.35em] w-[1.05em] rounded-full bg-current',
} as const

/** "dash dot dash": the sequence, for a screen reader, since the drawing is silent. */
export const spokenCode = (code: string): string =>
  [...code].map((element) => (element === '-' ? 'dash' : 'dot')).join(' ')

export function SignalPiece({
  character,
  x,
  y,
  danger,
}: {
  character: string
  /** 0..1 across, as the rules hold it. */
  x: number
  /** 0..1 down, already mapped onto the glass. */
  y: number
  danger: boolean
}) {
  const code = MORSE_ALPHABET[character] ?? ''
  return (
    <div
      className="gm-piece gm-signal"
      data-state={danger ? 'danger' : undefined}
      style={{ '--x': fieldX(x), '--y': y } as CSSProperties}
    >
      <span className={ROW_CLASS} aria-hidden="true">
        {[...code].map((element, index) => (
          <span
            key={index}
            data-el={element === '-' ? 'dah' : 'dit'}
            className={ELEMENT_CLASS[element === '-' ? '-' : '.']}
          />
        ))}
      </span>
      <span className="sr-only">{spokenCode(code)}</span>
    </div>
  )
}

/**
 * A knocked-down signal: the ring, the letter it was, and the points.
 *
 * Positioned by an outer element and animated by an inner one. The rise is a
 * transform animation, and on the same element it replaced the positioning
 * transform, so the points used to float up from the field's top-left corner.
 */
export function SignalReveal({
  character,
  x,
  y,
  points,
}: {
  character: string
  x: number
  y: number
  points: number
}) {
  const at = { '--x': fieldX(x), '--y': y } as CSSProperties
  return (
    <span aria-hidden="true">
      <span className="gm-burst" style={at} />
      <span className="gm-piece" style={at}>
        <span className="gm-glyph mf-rise block text-signal">{character}</span>
      </span>
      <span className="gm-points -translate-y-7" style={at}>
        <span className="mf-rise block font-mono text-base text-amber">+{points}</span>
      </span>
    </span>
  )
}
