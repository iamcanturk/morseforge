import { describe, expect, it } from 'vitest'
import { NETWORK_COPY, NETWORK_STAGES, NETWORK_VIEWBOX, networkLayout } from './network'
import { ALL_LETTERS, LEARNING_STAGES } from '../../data/morseAlphabet'
import { FACTS } from '../../config/facts'
import { LANDING } from '../../config/landing'

describe('networkLayout', () => {
  const { nodes, edges } = networkLayout()

  it('draws every letter once, plus the start node', () => {
    const letters = nodes.flatMap((node) => (node.character ? [node.character] : []))
    expect(letters.sort()).toEqual([...ALL_LETTERS].sort())
    expect(nodes.filter((node) => node.code === '')).toHaveLength(1)
  })

  it('joins each node to its parent by the element that leads there', () => {
    expect(edges).toHaveLength(nodes.length - 1)
    for (const edge of edges) expect(edge.to.code).toBe(edge.from.code + edge.element)
  })

  it('puts the dot branch left of the dash branch, as the copy says', () => {
    const byCode = new Map(nodes.map((node) => [node.code, node]))
    for (const node of nodes) {
      const dot = byCode.get(node.code + '.')
      const dash = byCode.get(node.code + '-')
      if (dot && dash) expect(dot.x).toBeLessThan(dash.x)
    }
  })

  it('stays inside the drawing, with no two nodes overlapping', () => {
    for (const node of nodes) {
      expect(node.x).toBeGreaterThan(21)
      expect(node.x).toBeLessThan(NETWORK_VIEWBOX.width - 21)
      expect(node.y + 21).toBeLessThan(NETWORK_VIEWBOX.height)
    }
    for (const a of nodes)
      for (const b of nodes)
        if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(42)
  })

  it('lights each letter with the lesson stage that teaches it', () => {
    for (const node of nodes) {
      if (!node.character) continue
      expect(LEARNING_STAGES[node.stage - 1]).toContain(node.character)
    }
    expect(NETWORK_STAGES.map((stage) => stage.order)).toEqual(LEARNING_STAGES.map((_, i) => i + 1))
  })
})

describe('the layer captions', () => {
  it('say "Layer", so they never clash with the seven lesson stages', () => {
    expect(NETWORK_STAGES.map((stage) => stage.label)).toEqual(
      LEARNING_STAGES.map((_, index) => `Layer ${index + 1}`),
    )
    for (const stage of NETWORK_STAGES) expect(stage.label).not.toMatch(/stage/i)
  })
})

describe('the network copy', () => {
  it('computes its numbers', () => {
    expect(LANDING.network.heading).toBe(`${FACTS.letterCount} letters. 4 levels. One tree.`)
    expect(NETWORK_COPY.description).toContain('4 levels deep')
  })
})
