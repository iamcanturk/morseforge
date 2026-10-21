import type { CSSProperties } from 'react'
import { prettify } from '../../engine/morseEncoder'
import { describeElements } from '../../data/format'
import type { MessageCell } from '../../game/messageLink'

/**
 * A message printed on paper tape: one cell per character, the code on top
 * and the letter's slot underneath.
 *
 * The tape wraps the way a telegram does, between words. A word too long for
 * the line (the composer allows one of up to the full message cap) breaks
 * between its letters instead, never inside a letter's code, so every cell
 * keeps its size and stays a tap target. Letters of one word sit closer
 * together than words do, so a broken word still reads as one.
 *
 * With `onTap`, every cell is a button that sends that one character: the
 * per-letter "what was that one?" a beginner needs most.
 */

export interface TapeProps {
  cells: readonly MessageCell[]
  /** Per cell: show the letter in its slot. Missing means hidden. */
  shown?: readonly boolean[]
  /** Cell sounding now, or -1. */
  active?: number
  /** Make each letter a button that plays it. */
  onTap?: (cell: MessageCell) => void
  /** Strike the letters in one after another, as a reveal. */
  strike?: boolean
  /** Accessible name for the whole tape. */
  label: string
  className?: string
}

function words(cells: readonly MessageCell[]): MessageCell[][] {
  const out: MessageCell[][] = [[]]
  for (const cell of cells) {
    if (cell.space) out.push([])
    else out[out.length - 1]!.push(cell)
  }
  return out.filter((word) => word.length > 0)
}

export function Tape({
  cells,
  shown = [],
  active = -1,
  onTap,
  strike = false,
  label,
  className,
}: TapeProps) {
  const total = cells.filter((cell) => !cell.space).length
  let ordinal = 0

  return (
    <div
      className={['mf-tape mfm-tape min-w-0', className ?? ''].filter(Boolean).join(' ')}
      role="group"
      aria-label={label}
    >
      <ul className="flex min-w-0 flex-wrap gap-x-5 gap-y-3" role="list">
        {words(cells).map((word) => (
          <li key={word[0]!.index} className="flex min-w-0 max-w-full flex-wrap gap-1">
            {word.map((cell) => {
              ordinal += 1
              const isShown = shown[cell.index] === true
              const isActive = active === cell.index
              const name = isShown
                ? `${cell.character}, ${describeElements(cell.code)}`
                : `Character ${ordinal} of ${total}, ${describeElements(cell.code)}`
              const body = (
                <>
                  <span className="mfm-code" aria-hidden="true">
                    {prettify(cell.code)}
                  </span>
                  <span className="mfm-slot" aria-hidden="true">
                    {isShown ? (
                      <span
                        className={strike ? 'mf-strike inline-block' : 'inline-block'}
                        style={
                          strike
                            ? ({ animationDelay: `${ordinal * 70}ms` } as CSSProperties)
                            : undefined
                        }
                      >
                        {cell.character}
                      </span>
                    ) : (
                      <span className="mfm-blank" />
                    )}
                  </span>
                </>
              )

              return onTap ? (
                <button
                  key={cell.index}
                  type="button"
                  className="mfm-cell"
                  data-active={isActive}
                  aria-label={`Play ${name}`}
                  onClick={() => onTap(cell)}
                >
                  {body}
                </button>
              ) : (
                <span
                  key={cell.index}
                  className="mfm-cell"
                  data-active={isActive}
                  role="img"
                  aria-label={name}
                >
                  {body}
                </span>
              )
            })}
          </li>
        ))}
      </ul>
    </div>
  )
}
