/**
 * Render the frames for the README demo animation.
 *
 * A screen recording of someone using the app is a better asset than this, and
 * it needs a human at a keyboard. This is the honest alternative: the Signal
 * Tree — the product's central idea — animating a real message at real Morse
 * timing, drawn from the application's own data rather than reconstructed.
 *
 * Nothing here is decorative licence. Node positions come from `layoutTree`,
 * the route through the tree from `pathTo`, element durations from
 * `buildTimeline`, and the colours come from `src/styles/palette.ts`, the
 * module the share cards and brand assets draw from. Change the alphabet or
 * the palette and this animation changes with it.
 *
 * Writes SVG frames only. Turning them into a GIF is ImageMagick's job and
 * happens in `npm run demo`, so nothing here shells out.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { register } from 'node:module'

register('./scripts/ts-resolve.mjs', pathToFileURL('./'))

const ROOT = resolve(import.meta.dirname, '..')
const FRAME_DIR = join(ROOT, '.demo-frames')

const { layoutTree, pathTo } = await import(join(ROOT, 'src/data/tree.ts'))
const { buildTimeline } = await import(join(ROOT, 'src/engine/timingEngine.ts'))
const { MORSE_ALPHABET } = await import(join(ROOT, 'src/data/morseAlphabet.ts'))
const { DARK, SCREEN, SCREEN_GLASS } = await import(join(ROOT, 'src/styles/palette.ts'))

/* -------------------------------------------------------------------------- */

const MESSAGE = 'MORSE'
const WPM = 12

const WIDTH = 760
const HEIGHT = 400
export const FPS = 10

/**
 * The tree is drawn on CRT glass, as it is in the app: phosphor for what has
 * been sent, amber for the element being keyed right now, and the bezel in
 * brass. Glass tokens are the same in both themes, so one rendering fits the
 * README on a light or a dark GitHub.
 */
const C = {
  glass: SCREEN_GLASS,
  node: SCREEN_GLASS.body,
  edge: SCREEN['line-strong'],
  signal: SCREEN.signal,
  live: SCREEN.amber,
  muted: SCREEN.muted,
  bezel: DARK['brass-deep'],
  plate: DARK.brass,
  casing: DARK.void,
}

/**
 * When each character is keyed, and when each of its elements lands.
 *
 * Built from the real timeline, so a dash really is three times a dot and the
 * gap between characters is the gap the app would play.
 */
function schedule(message, wpm) {
  const events = []
  let at = 0

  for (const character of message) {
    const code = MORSE_ALPHABET[character]
    if (!code) continue

    const start = at
    let offset = 0
    const steps = []
    for (const element of buildTimeline(code, { wpm })) {
      offset += element.duration
      if (element.on) steps.push(start + offset)
    }
    at = start + offset
    events.push({ character, code, start, end: at, steps })
    at += (1200 / wpm) * 3 // the character gap, at this speed
  }

  return { events, duration: at }
}

const { events, duration } = schedule(MESSAGE, WPM)
// A beat at each end so the loop does not read as clipped.
const TOTAL = duration + 1100
const FRAMES = Math.round((TOTAL / 1000) * FPS)

/* -------------------------------------------------------------------------- */

const all = layoutTree()
// Four layers is the whole alphabet. Deeper rows are punctuation, and drawing
// them makes every node too small to read at this size.
const SHOWN = all.filter((n) => n.node.depth <= 4)

const PAD_X = 30
const PAD_TOP = 34
const TREE_H = 226

const px = (x) => PAD_X + x * (WIDTH - PAD_X * 2)
const py = (depth) => PAD_TOP + (depth / 4) * TREE_H

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function frame(elapsed) {
  // ImageMagick's built-in SVG renderer drops everything drawn after a gradient
  // definition, so the glass is flat fills: the body, then three
  // stacked ellipses that stand in for the lighter centre.
  const parts = [
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${C.casing}"/>`,
    `<rect x="6" y="6" width="${WIDTH - 12}" height="${HEIGHT - 12}" rx="14" fill="${C.glass.body}" ` +
      `stroke="${C.bezel}" stroke-width="3"/>`,
    ...[0.46, 0.38, 0.3].map(
      (scale) =>
        `<ellipse cx="${WIDTH / 2}" cy="${HEIGHT * 0.46}" rx="${WIDTH * scale}" ry="${HEIGHT * scale * 0.9}" ` +
        `fill="${C.glass.centre}" opacity="0.28"/>`,
    ),
  ]

  const active = events.find((e) => elapsed >= e.start && elapsed <= e.end)
  const done = events.filter((e) => elapsed > e.end)
  const learned = new Set(done.map((e) => e.code))

  const onPath = new Set()
  if (active) {
    const reached = active.steps.filter((t) => elapsed >= t).length
    const route = pathTo(active.character)
    for (let i = 1; i <= reached && i < route.length; i++) onPath.add(route[i].code)
  }

  // Edges first, so the nodes sit on top of them.
  for (const entry of SHOWN) {
    if (entry.node.depth === 0) continue
    const parent = SHOWN.find((n) => n.node.code === entry.node.code.slice(0, -1))
    if (!parent) continue
    const lit = onPath.has(entry.node.code)
    parts.push(
      `<line x1="${px(parent.x).toFixed(1)}" y1="${py(parent.node.depth).toFixed(1)}" ` +
        `x2="${px(entry.x).toFixed(1)}" y2="${py(entry.node.depth).toFixed(1)}" ` +
        `stroke="${lit ? C.live : C.edge}" stroke-width="${lit ? 2.4 : 1}"/>`,
    )
  }

  for (const entry of SHOWN) {
    const { node } = entry
    const x = px(entry.x)
    const y = py(node.depth)
    const isRoot = node.depth === 0
    const lit = onPath.has(node.code)
    const known = learned.has(node.code)

    const radius = isRoot ? 9 : 11
    const fill = known ? C.signal : lit ? C.live : C.node

    if (known || lit) {
      parts.push(
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius + 7}" fill="${fill}" opacity="0.18"/>`,
      )
    }
    parts.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius}" ` +
        `fill="${isRoot ? C.live : fill}" stroke="${known || lit ? fill : C.edge}" stroke-width="1.6"/>`,
    )

    if (node.character) {
      parts.push(
        `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" ` +
          `font-family="Menlo, monospace" font-size="11" font-weight="700" ` +
          `fill="${known || lit ? C.glass.rim : C.muted}">${escape(node.character)}</text>`,
      )
    }
  }

  // The message, filling in as each character completes.
  const baseline = PAD_TOP + TREE_H + 64
  const spacing = 40
  const startX = WIDTH / 2 - ((MESSAGE.length - 1) * spacing) / 2

  MESSAGE.split('').forEach((character, index) => {
    const isDone = index < done.length
    const isActive = active !== undefined && index === done.length
    parts.push(
      `<text x="${(startX + index * spacing).toFixed(1)}" y="${baseline}" text-anchor="middle" ` +
        `font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" ` +
        `fill="${isDone ? C.signal : isActive ? C.live : C.edge}">${escape(character)}</text>`,
    )
  })

  // The code being sent, so the picture says what it is doing.
  const pretty = active
    ? active.code.replace(/\./g, '·').replace(/-/g, '−').split('').join(' ')
    : ''
  parts.push(
    `<text x="${WIDTH / 2}" y="${baseline + 32}" text-anchor="middle" ` +
      `font-family="Menlo, monospace" font-size="15" letter-spacing="3" fill="${C.live}">${escape(pretty)}</text>`,
  )

  parts.push(
    `<text x="${WIDTH / 2}" y="${HEIGHT - 18}" text-anchor="middle" ` +
      `font-family="Menlo, monospace" font-size="11" letter-spacing="2.5" fill="${C.plate}">` +
      `MORSEFORGE · morse.iamcanturk.dev</text>`,
  )

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${parts.join('')}</svg>`
}

rmSync(FRAME_DIR, { recursive: true, force: true })
mkdirSync(FRAME_DIR, { recursive: true })

for (let i = 0; i < FRAMES; i++) {
  writeFileSync(join(FRAME_DIR, `f${String(i).padStart(4, '0')}.svg`), frame((i / FPS) * 1000))
}

console.log(`${FRAMES} frames at ${FPS}fps in ${FRAME_DIR} (${Math.round(TOTAL)}ms of Morse)`)
