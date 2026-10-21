import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { NodeState } from '../../data/tree'
import { NodeSwatch, SignalTree } from './SignalTree'
import { inIsland } from '../../i18n/testing'

const render = (props: Parameters<typeof SignalTree>[0]) =>
  renderToStaticMarkup(inIsland(createElement(SignalTree, props), 'tree'))

/** The `<g>` of one pad, by its accessible name's first letter. */
const pad = (html: string, character: string) =>
  new RegExp(`<g[^>]*aria-label="${character}, [^"]*"[^>]*>([\\s\\S]*?)</g>`).exec(html)?.[1] ?? ''

describe('the tree as a tab stop (A11Y-23)', () => {
  it('is not one before anything says the board overflows', () => {
    // The server render, and a desk-width board: it fits, so there is nothing to pan.
    const html = render({})
    expect(html).not.toContain('tabindex="0"')
    expect(html).not.toContain('role="region"')
  })

  it('leaves a pickable board to its pads, which carry their own roving tab stop', () => {
    const html = render({ onSelect: () => {} })
    expect(html).not.toContain('role="region"')
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
  })
})

describe('"learning" on the board (V-11, DEC-043)', () => {
  const states: Record<string, NodeState> = { E: 'mastered', I: 'active', T: 'discovered' }

  it('rings a letter in progress in amber, as the A–Z lamps under it do', () => {
    const html = render({ states, power: 0.2 })
    expect(pad(html, 'I')).toContain('stroke="var(--color-amber)"')
    expect(pad(html, 'E')).not.toContain('var(--color-amber)')
    expect(pad(html, 'T')).not.toContain('var(--color-amber)')
  })

  it('draws the path being keyed in the beam colour, not in amber or cyan', () => {
    const html = render({ states, livePath: '.' })
    expect(pad(html, 'E')).toContain('stroke="var(--color-ink)"')
    expect(pad(html, 'T')).not.toContain('stroke="var(--color-ink)"')
  })

  it('gives the legend the same pad the board draws', () => {
    const swatch = (state: NodeState) => renderToStaticMarkup(createElement(NodeSwatch, { state }))
    expect(swatch('active')).toContain('stroke="var(--color-amber)"')
    expect(swatch('locked')).toContain('stroke-dasharray')
    expect(swatch('mastered')).toContain('fill="var(--color-signal)"')
  })
})
