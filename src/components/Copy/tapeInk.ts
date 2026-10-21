import type { CSSProperties } from 'react'
import { LIGHT } from '../../styles/palette'

/**
 * Inks for marks printed on paper tape.
 *
 * The tape is paper in both themes, so the phosphor colours of the dark theme
 * (a pale red on cream measures about 2.4:1) cannot mark it. The light
 * theme's inks were picked to read on telegram paper; they are used for tape
 * in both themes, taken from the palette rather than retyped, and
 * tapeInk.test.ts measures them on both paper stocks.
 */
export const TAPE_INK = {
  hit: LIGHT['paper-ink'],
  miss: LIGHT.danger,
  extra: LIGHT.amber,
  clean: LIGHT.signal,
  quiet: LIGHT['paper-muted'],
} as const

/** The inks as custom properties, for a tape element's `style`. */
export const TAPE_INK_VARS = {
  '--tape-hit': TAPE_INK.hit,
  '--tape-miss': TAPE_INK.miss,
  '--tape-extra': TAPE_INK.extra,
  '--tape-clean': TAPE_INK.clean,
  '--tape-quiet': TAPE_INK.quiet,
} as CSSProperties
