/**
 * Generate the brand assets in public/ from the mark's own geometry.
 *
 *   node scripts/make-brand.mjs        (or `npm run brand`)
 *
 * Writes the favicon, the apple-touch icon, the three PWA icons and the two
 * social cards. Every shape is read from src/components/brand/mark.ts (the
 * Split M and the traced wordmark), every colour from src/styles/palette.ts,
 * every name and URL from src/config/site.ts and every dot and dash from
 * MORSE_ALPHABET by way of `encode()`. Nothing is hand-copied, which is how a
 * logo ends up in three slightly different versions; change the mark or the
 * palette and rerun this.
 *
 * Text on the cards is outlined from the repo's own fonts (brand-type.mjs),
 * never <text>: librsvg, inside sharp, cannot load a woff2, so live text would
 * fall back to whatever the machine has and the cards would differ between a
 * laptop and CI.
 */

import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { register } from 'node:module'
import sharp from 'sharp'

register(pathToFileURL(join(import.meta.dirname, 'ts-resolve.mjs')))

const ROOT = resolve(import.meta.dirname, '..')
const PUBLIC = join(ROOT, 'public')

const {
  MARK_CODE,
  MARK_COLOURS,
  MARK_HEIGHT,
  MARK_WIDTH,
  WORDMARK,
  horizontalLockup,
  markFor,
  splitM,
  timing,
} = await import(join(ROOT, 'src/components/brand/mark.ts'))
const { DARK } = await import(join(ROOT, 'src/styles/palette.ts'))
const { SITE } = await import(join(ROOT, 'src/config/site.ts'))
const { encode, WORD_SEPARATOR } = await import(join(ROOT, 'src/engine/morseEncoder.ts'))
const { textPath } = await import('./brand-type.mjs')

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const round = (value) => Math.round(value * 100) / 100

function svgDocument(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`
}

/** The mark's strokes, `height` px tall, top-left at x/y. */
function markGroup(x, y, height, colour, extra = '') {
  const g = markFor(height)
  const s = height / MARK_HEIGHT
  return `<g transform="translate(${round(x)} ${round(y)}) scale(${round(s * 10000) / 10000})"><path d="${g.d}" fill="none" stroke="${colour}" stroke-width="${g.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${extra}/></g>`
}

/** The wordmark with its cap line at y, `cap` px tall. */
function wordGroup(x, y, cap, colour, extra = '') {
  const s = cap / WORDMARK.capHeight
  return `<g transform="translate(${round(x)} ${round(y)}) scale(${round(s * 100000) / 100000})"${extra}><path d="${WORDMARK.d}" fill="${colour}"/></g>`
}

/** Outlined lettering: JetBrains Mono, engraved-label style unless told otherwise. */
function label(
  text,
  { x, y, size, fill, align = 'left', weight = 500, tracking = 0.18, family = 'mono' },
) {
  const t = textPath(text, { family, weight, size, x, y, tracking, align })
  return { svg: `<path d="${t.d}" fill="${fill}"/>`, width: t.width }
}

/* -------------------------------------------------------------------------- */
/* A message as keyed elements                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A whole message at true ITU timing: one unit inside a character, three
 * between characters, seven between words. The dots and dashes come from
 * `encode()`, never from a literal here, and each character keeps its span so
 * its letter can be printed under it.
 */
function message(text) {
  const words = encode(text)
    .split(` ${WORD_SEPARATOR} `)
    .map((word) => word.split(' '))
  const letters = text
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .map((word) => [...word])
  const elements = []
  const spans = []
  let at = 0
  for (const [w, codes] of words.entries()) {
    if (w > 0) at += 7
    for (const [c, code] of codes.entries()) {
      if (c > 0) at += 3
      const start = at
      for (const segment of timing(code)) {
        if (segment.on) elements.push({ from: at, units: segment.units, letter: spans.length })
        at += segment.units
      }
      spans.push({ letter: letters[w][c], code, from: start, to: at })
    }
  }
  return { elements, spans, units: at }
}

/* -------------------------------------------------------------------------- */
/* Social card                                                                 */
/* -------------------------------------------------------------------------- */

const TAGLINE = SITE.tagline.toUpperCase().replace(/\.\s+/g, ' · ').replace(/\.$/, '')
const DOMAIN = new URL(SITE.url).host.toUpperCase()

/**
 * The social card: the station plate at night. The Split M in phosphor beside
 * the wordmark, the tagline in amber, and the name keyed underneath as a run
 * of round dits and dahs at true timing, each letter under its own elements,
 * the M's two dahs lit like the mark they are. The domain and an ON AIR lamp
 * on the plate's bottom edge.
 *
 * Laid out in a 630-px-tall frame and scaled, so the 1200×630 card and
 * GitHub's 1280×640 one are the same drawing. The lockup sits on the centre
 * line, so a square centre-crop (WhatsApp, some chat apps) keeps it.
 */
function socialCard(width, height) {
  const s = height / 630
  const W = width / s
  const H = 630
  const inset = 28

  // Lockup.
  const markHeight = 148
  const lockup = horizontalLockup(markHeight)
  const lx = (W - lockup.width) / 2
  const ly = 116

  // Tagline under it, centred.
  const tagline = label(TAGLINE, {
    x: W / 2,
    y: ly + markHeight + 74,
    size: 23,
    fill: DARK.amber,
    align: 'centre',
    weight: 600,
    tracking: 0.22,
  })

  // The name, keyed.
  const keyed = message(SITE.name)
  const margin = 104
  const unit = (W - margin * 2) / keyed.units
  const keyY = 448
  const elements = keyed.elements
    .map(({ from, units, letter }) => {
      const x = margin + from * unit
      const lit = keyed.spans[letter].letter === 'M' && letter === 0
      const fill = lit ? DARK.signal : DARK['signal-dim']
      const opacity = lit ? '' : ' opacity=".85"'
      return units === 1
        ? `<circle cx="${round(x + unit / 2)}" cy="${keyY}" r="${round(unit / 2)}" fill="${fill}"${opacity}/>`
        : `<rect x="${round(x)}" y="${round(keyY - unit / 2)}" width="${round(unit * 3)}" height="${round(unit)}" rx="${round(unit / 2)}" fill="${fill}"${opacity}/>`
    })
    .join('')
  const letters = keyed.spans
    .map(
      (span, i) =>
        label(span.letter, {
          x: margin + ((span.from + span.to) / 2) * unit,
          y: keyY + 40,
          size: 17,
          fill: i === 0 ? DARK.signal : DARK.muted,
          align: 'centre',
          tracking: 0,
        }).svg,
    )
    .join('')

  // Bottom edge of the plate: domain left, lamp right.
  const footY = H - inset - 30
  const domain = label(DOMAIN, { x: inset + 34, y: footY, size: 17, fill: DARK.brass })
  const lampR = 8
  const lampX = W - inset - 34 - lampR
  const lampY = footY - 6
  const onAir = label('ON AIR', {
    x: lampX - lampR - 14,
    y: footY,
    size: 17,
    fill: DARK.brass,
    align: 'right',
  })

  const defs = [
    `<radialGradient id="glow" cx="50%" cy="34%" r="62%"><stop offset="0" stop-color="${DARK.elevated}"/><stop offset=".55" stop-color="${DARK.panel}"/><stop offset="1" stop-color="${DARK.void}"/></radialGradient>`,
    `<radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${DARK.signal}" stop-opacity=".16"/><stop offset="1" stop-color="${DARK.signal}" stop-opacity="0"/></radialGradient>`,
    `<pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.1" fill="${DARK.line}"/></pattern>`,
    `<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".75" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
    `<mask id="dot-mask"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>`,
    `<linearGradient id="rule" x1="0" x2="1"><stop offset="0" stop-color="${DARK.amber}" stop-opacity="0"/><stop offset=".2" stop-color="${DARK.amber}" stop-opacity=".35"/><stop offset=".8" stop-color="${DARK.amber}" stop-opacity=".35"/><stop offset="1" stop-color="${DARK.amber}" stop-opacity="0"/></linearGradient>`,
    `<radialGradient id="lamp" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${DARK.ink}"/><stop offset=".35" stop-color="${DARK.amber}"/><stop offset="1" stop-color="${DARK['brass-deep']}"/></radialGradient>`,
    `<filter id="bloom" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${round((7 * MARK_HEIGHT) / markHeight)}"/></filter>`,
    `<filter id="lamp-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="7"/></filter>`,
  ].join('')

  const markX = lx + lockup.mark.x
  const markY = ly + lockup.mark.y
  const body = [
    `<defs>${defs}</defs>`,
    `<g transform="scale(${round(s * 10000) / 10000})">`,
    `<rect width="${W}" height="${H}" fill="${DARK.void}"/>`,
    `<rect x="${inset}" y="${inset}" width="${W - inset * 2}" height="${H - inset * 2}" rx="26" fill="url(#glow)" stroke="${DARK.line}" stroke-width="2"/>`,
    `<rect x="${inset}" y="${inset}" width="${W - inset * 2}" height="${H - inset * 2}" rx="26" fill="url(#dots)" mask="url(#dot-mask)"/>`,
    `<ellipse cx="${round(markX + lockup.mark.width / 2)}" cy="${round(markY + markHeight / 2)}" rx="${round(markHeight * 1.25)}" ry="${round(markHeight * 1.1)}" fill="url(#halo)"/>`,
    markGroup(markX, markY, markHeight, DARK.signal, ' opacity=".55" filter="url(#bloom)"'),
    markGroup(markX, markY, markHeight, DARK.signal),
    wordGroup(lx + lockup.word.x, ly + lockup.word.y, lockup.word.cap, DARK.ink),
    tagline.svg,
    elements,
    letters,
    `<rect x="${inset + 34}" y="${footY - 44}" width="${W - inset * 2 - 68}" height="1.5" fill="url(#rule)"/>`,
    domain.svg,
    onAir.svg,
    `<circle cx="${lampX}" cy="${lampY}" r="${lampR * 1.8}" fill="${DARK.amber}" opacity=".5" filter="url(#lamp-glow)"/>`,
    `<circle cx="${lampX}" cy="${lampY}" r="${lampR}" fill="url(#lamp)" stroke="${DARK['wood-deep']}" stroke-width="1.5"/>`,
    '</g>',
  ].join('')

  return svgDocument(width, height, body)
}

/* -------------------------------------------------------------------------- */
/* Favicon                                                                     */
/* -------------------------------------------------------------------------- */

/** The favicon's grid: drawn in 16 px pixels, the size a tab strip shows it at. */
const FAVICON_PX = 16
/** The mark's width inside the tile, in favicon pixels: two pixels of tile either side. */
const FAVICON_MARK_PX = 12
/** Stem width in favicon pixels, so each stem is two whole pixel columns (2-3 and 12-13). */
const FAVICON_STEM_PX = 2

/**
 * The favicon: the app icon's dark rounded tile with the Split M in phosphor,
 * the same at every size and on every tab strip (DEC-043). The tile fills the
 * square, so the icon is as large as its neighbours in the strip, and phosphor
 * on the dark ground reads on a light strip and a dark one alike; there is no
 * colour-scheme swap that can guess the strip wrong.
 *
 * The geometry is the Split M at favicon weight: stems exactly two pixels wide
 * on whole pixel columns at 16 px, the vertex gap one stem wide. A faint ring
 * keeps the tile's edge visible on the darkest strips.
 */
function faviconSvg() {
  const side = FAVICON_PX
  const radius = round(side * 0.2237)
  const g = splitM(MARK_CODE, (FAVICON_STEM_PX * MARK_WIDTH) / FAVICON_MARK_PX, 52)
  const scale = FAVICON_MARK_PX / MARK_WIDTH
  const x = (side - FAVICON_MARK_PX) / 2
  const y = (side - MARK_HEIGHT * scale) / 2
  const ring = 0.5
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" role="img" aria-label="${SITE.name}">`,
    `<title>${SITE.name}</title>`,
    `<defs><linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${DARK.elevated}"/><stop offset="1" stop-color="${DARK.void}"/></linearGradient></defs>`,
    `<rect width="${side}" height="${side}" rx="${radius}" fill="url(#ground)"/>`,
    `<rect x="${ring / 2}" y="${ring / 2}" width="${side - ring}" height="${side - ring}" rx="${round(radius - ring / 2)}" fill="none" stroke="${DARK.ink}" stroke-opacity=".14" stroke-width="${ring}"/>`,
    `<g transform="translate(${round(x)} ${round(y)}) scale(${round(scale * 10000) / 10000})"><path d="${g.d}" fill="none" stroke="${MARK_COLOURS.dark.mark}" stroke-width="${round(g.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/></g>`,
    '</svg>\n',
  ].join('')
}

/* -------------------------------------------------------------------------- */
/* App icons                                                                   */
/* -------------------------------------------------------------------------- */

/** The ground of every icon: lit a little from above, falling to the void. */
function iconGround(size, { radius = 0 } = {}) {
  return [
    `<defs><linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${DARK.elevated}"/><stop offset="1" stop-color="${DARK.void}"/></linearGradient></defs>`,
    `<rect width="${size}" height="${size}" rx="${round(radius)}" fill="url(#ground)"/>`,
    radius
      ? `<rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${round(radius - 1)}" fill="none" stroke="${DARK.ink}" stroke-opacity=".08" stroke-width="2"/>`
      : '',
  ].join('')
}

/**
 * The mark centred on the icon, `share` of its width. Half the width reads as
 * a letter on a home screen without crowding the corners.
 */
function iconMark(size, share = 0.5) {
  const width = size * share
  const height = (width * MARK_HEIGHT) / MARK_WIDTH
  return markGroup((size - width) / 2, (size - height) / 2, height, MARK_COLOURS.dark.mark)
}

/** `any` icons: the rounded tile on transparency, as the app icon is drawn. */
function tileIconSvg(size) {
  return svgDocument(size, size, iconGround(size, { radius: size * 0.2237 }) + iconMark(size))
}

/** Full-bleed: iOS and maskable launchers cut their own shape. */
function bleedIconSvg(size, share = 0.5) {
  return svgDocument(size, size, iconGround(size) + iconMark(size, share))
}

/**
 * How far the mark's ink reaches from its centre, as a share of its width: the
 * box corner, which the round joins at the top of the stems nearly fill. A
 * maskable icon may be cut to a circle of radius 40% of the icon.
 */
function reachPerWidth() {
  return Math.hypot(MARK_WIDTH / 2, MARK_HEIGHT / 2) / MARK_WIDTH
}

/* -------------------------------------------------------------------------- */
/* Write                                                                       */
/* -------------------------------------------------------------------------- */

const written = []

function record(path) {
  written.push({ path: relative(ROOT, path), bytes: statSync(path).size })
}

/**
 * Rasterise to PNG. `opaque` drops the alpha channel: an image with a solid
 * background gains nothing from one, and iOS expects a touch icon without it.
 */
async function png(svg, path, { width, height, opaque = false }) {
  mkdirSync(dirname(path), { recursive: true })
  let image = sharp(Buffer.from(svg)).resize(width, height)
  if (opaque) image = image.flatten({ background: DARK.void })
  await image.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(path)
  record(path)
}

const favicon = join(PUBLIC, 'favicon.svg')
writeFileSync(favicon, faviconSvg())
record(favicon)

await png(bleedIconSvg(180), join(PUBLIC, 'apple-touch-icon.png'), {
  width: 180,
  height: 180,
  opaque: true,
})

for (const size of [192, 512]) {
  await png(tileIconSvg(size), join(PUBLIC, 'icons', `icon-${size}.png`), {
    width: size,
    height: size,
  })
}

// Maskable: the mark must sit inside the 40% safe circle; check, don't hope.
{
  const size = 512
  const share = 0.5
  const reach = reachPerWidth() * share * size
  if (reach > size * 0.4) throw new Error(`Maskable mark reaches ${reach}px, past the safe zone`)
  await png(bleedIconSvg(size, share), join(PUBLIC, 'icons', 'icon-maskable-512.png'), {
    width: size,
    height: size,
    opaque: true,
  })
}

await png(socialCard(1200, 630), join(PUBLIC, 'og', 'default.png'), {
  width: 1200,
  height: 630,
  opaque: true,
})
await png(socialCard(1280, 640), join(PUBLIC, 'og', 'github-social.png'), {
  width: 1280,
  height: 640,
  opaque: true,
})

for (const { path, bytes } of written) {
  console.log(`${path.padEnd(34)} ${(bytes / 1024).toFixed(1).padStart(7)} KB`)
}
