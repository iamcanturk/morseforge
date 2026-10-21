/**
 * Text as outlines, from the two self-hosted fonts in public/fonts.
 *
 * Shared by trace-wordmark.mjs (the wordmark the site ships as path data) and
 * make-brand.mjs (the lettering on the OG cards). librsvg, which sharp uses to
 * rasterise, cannot load a woff2, so live <text> would fall back to whatever
 * the machine has and the cards would differ between a laptop and CI. Outlines
 * from the repo's own font files are the same everywhere.
 *
 * Both files are variable fonts (Space Grotesk wght 300-700, JetBrains Mono
 * 400-800) whose default instances are the lightest. fontkitten (here through
 * Astro) can read them but cannot instance a variable WOFF2: its WOFF2 glyphs
 * skip the gvar deltas. So this loads a copy patched in three small places,
 * and fails loudly if a patch no longer matches the installed version.
 *
 * fontkitten does no GPOS layout; callers pass pair kerning by hand.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')

function patch(source, find, replace) {
  if (!source.includes(find)) {
    throw new Error(`fontkitten changed; this patch no longer applies:\n${find.slice(0, 120)}`)
  }
  return source.replace(find, replace)
}

async function loadFontkitten() {
  // ESM-only package, so resolve it the ESM way rather than with require.
  const entry = new URL(import.meta.resolve('fontkitten'))
  const inflate = import.meta.resolve('tiny-inflate')
  let source = readFileSync(entry, 'utf8')
  source = patch(
    source,
    'import inflate from "tiny-inflate";',
    `import inflate from ${JSON.stringify(inflate)};`,
  )
  // 1. Let a caller choose the instance (`font.__coords`).
  source = patch(
    source,
    'let variationCoords = this.#variationCoords;',
    'let variationCoords = this.__coords ?? this.#variationCoords;',
  )
  // 2. The table-wide transform pass must decode the default instance.
  source = patch(
    source,
    'TTFGlyph.prototype._decodeComposite.call({ _font: this }',
    'TTFGlyph.prototype._decodeComposite.call({ _font: { _variationProcessor: null } }',
  )
  // 3. WOFF2 glyphs: apply the gvar deltas to a copy of the decoded points.
  source = patch(
    source,
    `	_decode() {
		return this._font._transformedGlyphs[this.id];
	}`,
    `	_decode() {
		const base = this._font._transformedGlyphs[this.id];
		const vp = this._font.__coords ? this._font._variationProcessor : null;
		if (!vp || !base) return base;
		const glyph = { numberOfContours: base.numberOfContours };
		if (base.points) {
			glyph.points = base.points.map((p) => p.copy());
			const pts = glyph.points.slice();
			for (let i = 0; i < 4; i++) pts.push(new Point(false, true, 0, 0));
			vp.transformPoints(this.id, pts);
		}
		if (base.components) {
			glyph.components = base.components.map((c) => Object.assign(new Component(c.glyphID, c.dx, c.dy), c));
			const pts = glyph.components.map((c) => new Point(true, true, c.dx, c.dy));
			for (let i = 0; i < 4; i++) pts.push(new Point(false, true, 0, 0));
			vp.transformPoints(this.id, pts);
			glyph.components.forEach((c, i) => { c.dx = pts[i].x; c.dy = pts[i].y; });
		}
		return glyph;
	}`,
  )
  const dir = mkdtempSync(join(tmpdir(), 'fontkitten-'))
  const file = join(dir, 'fontkitten.mjs')
  writeFileSync(file, source)
  try {
    return await import(pathToFileURL(file).href)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const { create } = await loadFontkitten()

const FILES = {
  grotesk: 'space-grotesk-700.woff2',
  mono: 'jetbrains-mono-400.woff2',
}

const fonts = new Map()

/** A font instance: `family` is 'grotesk' or 'mono', `weight` on its wght axis. */
export function font(family, weight) {
  const key = `${family}@${weight}`
  if (!fonts.has(key)) {
    const f = create(readFileSync(join(ROOT, 'public/fonts', FILES[family])))
    if (f.variationAxes?.wght) f.__coords = [weight]
    fonts.set(key, f)
  }
  return fonts.get(key)
}

const r = (v) => Math.round(v * 100) / 100

/**
 * Lay out `text` as one path. Baseline at `y`; `x` is the left, right or
 * centre of the advance box per `align`. `tracking` in em, `kern` maps a pair
 * ("Fo") to font units. Returns the path, the advance width and the cap height.
 */
export function textPath(
  text,
  {
    family = 'grotesk',
    weight = 700,
    size = 100,
    x = 0,
    y = 0,
    tracking = 0,
    kern = {},
    align = 'left',
  } = {},
) {
  const f = font(family, weight)
  const s = size / f.unitsPerEm
  const glyphs = [...text].map((ch) => f.glyphForCodePoint(ch.codePointAt(0)))
  const advances = glyphs.map((g, i) => {
    if (i === glyphs.length - 1) return g.advanceWidth * s
    return (g.advanceWidth + (kern[text[i] + text[i + 1]] ?? 0)) * s + tracking * size
  })
  const width = advances.reduce((a, b) => a + b, 0)
  let pen = align === 'centre' ? x - width / 2 : align === 'right' ? x - width : x
  const parts = []
  const KEYS = {
    moveTo: 'M',
    lineTo: 'L',
    quadraticCurveTo: 'Q',
    bezierCurveTo: 'C',
    closePath: 'Z',
  }
  for (const [i, g] of glyphs.entries()) {
    for (const { command, args } of g.path.commands) {
      const points = []
      for (let k = 0; k < args.length; k += 2)
        points.push(`${r(pen + args[k] * s)} ${r(y - args[k + 1] * s)}`)
      parts.push(KEYS[command] + points.join(' '))
    }
    pen += advances[i]
  }
  return { d: parts.join(''), width, cap: f.capHeight * s, glyphs, scale: s }
}
