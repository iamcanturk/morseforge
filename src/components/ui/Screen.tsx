import type { ComponentPropsWithoutRef, ReactNode } from 'react'

/**
 * CRT glass: scanlines, vignette, and the phosphor palette in both themes.
 *
 * Inside a Screen, `text-signal`, `text-ink` and friends resolve to the dark
 * phosphor values even when the page is light, because a readout that turns
 * dark green on cream stops being a screen (DEC-008, Q6a).
 *
 * The scanlines and vignette are pseudo-elements stacked above the content
 * (z-index 2) and ignore the pointer, so nothing inside needs a z-index to be
 * clickable. Content that must sit above the scanlines — an input caret, say —
 * can take `relative z-[3]`.
 */

export interface ScreenProps extends ComponentPropsWithoutRef<'div'> {
  /** The radar / circuit graticule behind the content. */
  grid?: boolean
  /** Play the one-shot power-on when mounted. Honours both motion settings. */
  powerOn?: boolean
  /** No outer bezel ring, for a screen set into something already framed. */
  flush?: boolean
  children?: ReactNode
}

export function Screen({ grid, powerOn, flush, className, children, ...rest }: ScreenProps) {
  return (
    <div
      {...rest}
      className={[
        'mf-screen',
        grid ? 'mf-grid' : '',
        powerOn ? 'mf-power-on' : '',
        flush ? 'mf-screen-flush' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}
