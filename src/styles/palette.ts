/**
 * The "Signal Office" palette, as data.
 *
 * global.css is the source the browser reads. This is the copy for everything
 * that cannot read a CSS variable: the canvas share cards, the PWA manifest,
 * `<meta name="theme-color">`, the inline theme script and the brand-asset
 * generator. Those used to carry their own hex values, and each one drifted
 * the first time the palette changed.
 *
 * palette.test.ts holds the two copies together and re-measures every text
 * pair against WCAG, so a colour tweak that quietly drops a pair below 4.5:1
 * fails a test instead of shipping.
 */

export type Hex = `#${string}`

/** Every token global.css declares as `--color-*`, by its CSS name. */
export interface Palette {
  void: Hex
  panel: Hex
  elevated: Hex
  /** Decorative hairline only. Not a control boundary: it is ~1.5:1. */
  line: Hex
  /** Control boundaries. Clears 3:1 (WCAG 1.4.11) on every surface. */
  'line-strong': Hex
  /** CRT glass. The same in both themes. */
  screen: Hex
  paper: Hex
  'paper-ink': Hex
  'paper-muted': Hex
  /** Metal accent that is also safe as text. */
  brass: Hex
  /** Decoration only: gradient stops, screws. Never text. */
  'brass-deep': Hex
  wood: Hex
  'wood-deep': Hex
  signal: Hex
  'signal-dim': Hex
  amber: Hex
  cyan: Hex
  danger: Hex
  ink: Hex
  muted: Hex
}

/** Dark: the night-shift office. Walnut, ebonite, brass and phosphor. */
export const DARK: Palette = {
  void: '#0c0a07',
  panel: '#16120d',
  elevated: '#201a13',
  line: '#3a3024',
  'line-strong': '#7a6a52',
  screen: '#07100a',
  paper: '#e8dcc0',
  'paper-ink': '#1e1a13',
  'paper-muted': '#5c5141',
  brass: '#d4ae6a',
  'brass-deep': '#7d5f2e',
  wood: '#3b2616',
  'wood-deep': '#1f140b',
  signal: '#5df28f',
  'signal-dim': '#3fb872',
  amber: '#ffb547',
  cyan: '#7fd3ec',
  danger: '#ff6b57',
  ink: '#f3ead7',
  muted: '#ab9f8a',
}

/**
 * Light: a telegram form. Not an inversion — the phosphor colours that glow on
 * walnut are illegible on paper, so every signal colour is a darker, inkier
 * relative of its dark self, picked by hand until it clears 4.5:1.
 */
export const LIGHT: Palette = {
  ...DARK,
  void: '#f5eedf',
  panel: '#ece2cd',
  elevated: '#e2d5ba',
  line: '#cbbb9b',
  'line-strong': '#7f6b4c',
  paper: '#efe4c8',
  brass: '#6e5020',
  'brass-deep': '#b08a4a',
  wood: '#8a6440',
  'wood-deep': '#5a3e24',
  signal: '#1a6436',
  // Light "dim" cannot be lighter (it would fail contrast) or much darker (it
  // would read as stronger than the primary), so it is quieter by saturation.
  'signal-dim': '#3f5e4b',
  amber: '#8a4b00',
  cyan: '#1b5a72',
  danger: '#a3261b',
  ink: '#1e1a13',
  muted: '#5c5141',
}

/**
 * The tokens `.mf-screen` re-declares, in both themes.
 *
 * A phosphor readout has to look like phosphor whatever the page around it is
 * doing, so CRT glass keeps the dark signal colours even on the light theme.
 */
export const SCREEN = {
  signal: DARK.signal,
  'signal-dim': DARK['signal-dim'],
  amber: DARK.amber,
  cyan: DARK.cyan,
  danger: DARK.danger,
  ink: DARK.ink,
  muted: DARK.muted,
  line: '#1d3324',
  'line-strong': '#4d7a5c',
} as const satisfies Partial<Record<keyof Palette, Hex>>

/** The three stops of the glass gradient: centre, body (`screen`), rim. */
export const SCREEN_GLASS = { centre: '#0d1d12', body: DARK.screen, rim: '#030604' } as const

/**
 * Browser chrome and PWA colours. The page background, so the status bar and
 * the splash screen are continuous with the page instead of a band of black.
 */
export const THEME_COLOR = { dark: DARK.void, light: LIGHT.void } as const

/**
 * Where the theme choice (`system`, `dark` or `light`) is kept. A bare string
 * rather than a versioned store: it is read by a blocking inline script before
 * first paint, which has to stay a few lines long.
 */
export const THEME_KEY = 'morseforge_theme'

export const THEME_CHOICES = ['system', 'dark', 'light'] as const
export type ThemeChoice = (typeof THEME_CHOICES)[number]

/* -------------------------------------------------------------------------- */
/* Contrast (WCAG 2.x)                                                         */
/* -------------------------------------------------------------------------- */

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Relative luminance of a #rrggbb colour, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) throw new Error(`Not a #rrggbb colour: ${hex}`)
  const [r, g, b] = match.slice(1).map((part) => channel(parseInt(part, 16)))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** WCAG contrast ratio between two colours, 1 to 21. Order does not matter. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}
