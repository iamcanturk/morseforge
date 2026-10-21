import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { DARK, LIGHT, SCREEN, SCREEN_GLASS, THEME_COLOR, contrast, type Palette } from './palette'

/**
 * Two guarantees, both of which fail silently without a test.
 *
 * 1. palette.ts and global.css say the same thing. A canvas share card or a
 *    manifest colour that drifted from the page is visible to everyone except
 *    the person who changed the CSS.
 * 2. Every text colour clears WCAG AA on every surface it can sit on, in both
 *    themes. A contrast regression has no other symptom than people quietly
 *    not being able to read something.
 */

const css = readFileSync(new URL('./global.css', import.meta.url), 'utf8')

/** `--color-*: #hex` declarations inside the first block that opens with `opener`. */
function colours(opener: string): Record<string, string> {
  const start = css.indexOf(opener)
  if (start < 0) throw new Error(`No block opening with ${opener} in global.css`)
  const body = css.slice(start + opener.length, css.indexOf('}', start))
  const found: Record<string, string> = {}
  for (const match of body.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    found[match[1]!] = match[2]!.toLowerCase()
  }
  return found
}

const THEME = colours('@theme static {')
const LIGHT_CSS = colours("[data-theme='light'] {")
const SCREEN_CSS = colours(".mf-screen,\n  [data-theme='light'] .mf-screen {")

const SURFACES = ['void', 'panel', 'elevated'] as const
const TEXT = ['ink', 'muted', 'signal', 'signal-dim', 'amber', 'cyan', 'danger', 'brass'] as const

describe('palette.ts matches global.css', () => {
  it('dark is the @theme block, token for token', () => {
    expect(THEME).toEqual(DARK)
  })

  it('light overrides exactly the tokens that differ, with the same values', () => {
    for (const [token, value] of Object.entries(LIGHT_CSS)) {
      expect(LIGHT[token as keyof Palette], token).toBe(value)
    }
    // Anything light does not override must be inherited unchanged from dark,
    // or palette.ts claims a light value the browser never shows.
    for (const token of Object.keys(DARK) as (keyof Palette)[]) {
      if (!(token in LIGHT_CSS)) expect(LIGHT[token], token).toBe(DARK[token])
    }
  })

  it('CRT glass re-declares the phosphor tokens', () => {
    expect(SCREEN_CSS).toEqual(SCREEN)
  })

  it('the browser chrome colour is the page background', () => {
    expect(THEME_COLOR).toEqual({ dark: DARK.void, light: LIGHT.void })
  })
})

describe('contrast, measured', () => {
  for (const [name, palette] of [
    ['dark', DARK],
    ['light', LIGHT],
  ] as const) {
    describe(name, () => {
      it.each(TEXT.flatMap((text) => SURFACES.map((surface) => [text, surface] as const)))(
        '%s on %s clears 4.5:1',
        (text, surface) => {
          expect(contrast(palette[text], palette[surface])).toBeGreaterThanOrEqual(4.5)
        },
      )

      // WCAG 1.4.11: the edge of an input, chip or toggle is how you find it.
      it.each(SURFACES)('line-strong on %s clears 3:1', (surface) => {
        expect(contrast(palette['line-strong'], palette[surface])).toBeGreaterThanOrEqual(3)
      })

      it.each(SURFACES)('the amber focus ring on %s clears 3:1', (surface) => {
        expect(contrast(palette.amber, palette[surface])).toBeGreaterThanOrEqual(3)
      })

      it('button labels (void on signal, amber) clear 4.5:1', () => {
        expect(contrast(palette.void, palette.signal)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(palette.void, palette.amber)).toBeGreaterThanOrEqual(4.5)
      })

      it('tape text clears 4.5:1 on paper', () => {
        expect(contrast(palette['paper-ink'], palette.paper)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(palette['paper-muted'], palette.paper)).toBeGreaterThanOrEqual(4.5)
      })
    })
  }

  it.each(TEXT.filter((token) => token !== 'cyan'))(
    'light %s also reads on telegram paper',
    (token) => {
      expect(contrast(LIGHT[token], LIGHT.paper)).toBeGreaterThanOrEqual(4.5)
    },
  )

  describe('inside CRT glass', () => {
    const glass = Object.values(SCREEN_GLASS)
    const screenText = ['ink', 'muted', 'signal', 'signal-dim', 'amber', 'cyan', 'danger'] as const

    // Every stop of the gradient, because text can land anywhere on it.
    it.each(screenText)('%s clears 4.5:1 across the glass', (token) => {
      for (const stop of glass) expect(contrast(SCREEN[token], stop)).toBeGreaterThanOrEqual(4.5)
    })

    it('the screen control edge clears 3:1', () => {
      for (const stop of glass) {
        expect(contrast(SCREEN['line-strong'], stop)).toBeGreaterThanOrEqual(3)
      }
    })
  })
})

describe('contrast()', () => {
  it('is 21 for black on white and symmetric', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5)
  })

  it('is 1 for a colour on itself', () => {
    expect(contrast('#5df28f', '#5df28f')).toBe(1)
  })

  it('rejects anything that is not #rrggbb', () => {
    expect(() => contrast('red', '#000000')).toThrow()
  })
})
