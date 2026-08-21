import { describe, expect, it } from 'vitest'
import {
  MORSE_TREE,
  buildTree,
  characterNodes,
  compareCodes,
  findNode,
  layoutTree,
  levelToNodeState,
  pathTo,
  treeDepth,
  walk,
} from './tree'
import { ALL_LETTERS, LETTERS, MORSE_ALPHABET } from './morseAlphabet'

describe('buildTree', () => {
  it('puts E one dot from the root and T one dash', () => {
    expect(MORSE_TREE.dot?.character).toBe('E')
    expect(MORSE_TREE.dash?.character).toBe('T')
  })

  it('leaves the root itself empty', () => {
    expect(MORSE_TREE.character).toBeNull()
    expect(MORSE_TREE.code).toBe('')
    expect(MORSE_TREE.depth).toBe(0)
  })

  it('places every letter at the node its code spells out', () => {
    for (const [character, code] of Object.entries(LETTERS)) {
      let node = MORSE_TREE
      for (const element of code) {
        const next = element === '.' ? node.dot : node.dash
        expect(next, `${character}: no ${element} branch at "${node.code}"`).not.toBeNull()
        node = next!
      }
      expect(node.character).toBe(character)
      expect(node.code).toBe(code)
    }
  })

  it('holds all 26 letters and nothing else by default', () => {
    const characters = characterNodes().map((node) => node.character)
    expect(characters).toHaveLength(26)
    expect([...characters].sort().join('')).toBe(ALL_LETTERS.join(''))
  })

  it('is 4 levels deep for A–Z', () => {
    expect(treeDepth()).toBe(4)
  })

  it('creates intermediate nodes for a character whose prefix has none', () => {
    // "$" is "...-..-": its 6-element prefix "...-.." is not a character, so
    // that node must exist with a null character rather than break the path.
    const tree = buildTree({ characters: ['$'] })
    expect(findNode('$', tree)?.code).toBe(MORSE_ALPHABET['$'])
    const prefix = walk(tree).find((node) => node.code === '...-..')
    expect(prefix).toBeDefined()
    expect(prefix?.character).toBeNull()
  })

  it('ignores characters it has no code for', () => {
    const tree = buildTree({ characters: ['E', '🚀'] })
    expect(characterNodes(tree)).toHaveLength(1)
  })

  it('accepts lowercase input', () => {
    expect(findNode('a')?.character).toBe('A')
  })
})

describe('pathTo', () => {
  it('walks root → dot → dash for A, matching PROJECT.md §3', () => {
    const path = pathTo('A')
    expect(path.map((node) => node.code)).toEqual(['', '.', '.-'])
    expect(path.at(-1)?.character).toBe('A')
  })

  it('returns a path one longer than the code, because it includes the root', () => {
    for (const [character, code] of Object.entries(LETTERS)) {
      expect(pathTo(character), character).toHaveLength(code.length + 1)
    }
  })

  it('returns nothing for a character outside the tree', () => {
    // Digits exist in the alphabet but are not in the default A–Z tree.
    expect(pathTo('5')).toEqual([])
    expect(pathTo('🚀')).toEqual([])
  })

  it('does not mistake an intermediate node for the target', () => {
    // "..-.." is É, whose prefix "..-" is U. Asking for É in a U-only tree
    // must fail rather than stopping at U.
    const tree = buildTree({ characters: ['U'] })
    expect(pathTo('É', tree)).toEqual([])
  })
})

describe('compareCodes', () => {
  it('orders dot before dash, not code-point order', () => {
    // "-" is 0x2D and "." is 0x2E, so a naive sort mirrors the whole diagram.
    expect(compareCodes('.', '-')).toBeLessThan(0)
    expect(['-', '.'].sort(compareCodes)).toEqual(['.', '-'])
  })

  it('orders siblings depth-first within a level', () => {
    expect(['--', '.-', '..', '-.'].sort(compareCodes)).toEqual(['..', '.-', '-.', '--'])
  })

  it('orders a shorter code before a longer one that shares its prefix', () => {
    expect(compareCodes('.', '..')).toBeLessThan(0)
  })
})

describe('layoutTree', () => {
  it('positions every node in the tree', () => {
    expect(layoutTree()).toHaveLength(walk().length)
  })

  it('keeps every coordinate inside the unit square', () => {
    for (const { x, y } of layoutTree()) {
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(1)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
    }
  })

  it('centres the root and puts it at the top', () => {
    const root = layoutTree().find(({ node }) => node.depth === 0)
    expect(root?.x).toBe(0.5)
    expect(root?.y).toBe(0)
  })

  it('puts y in proportion to depth', () => {
    const layout = layoutTree()
    const depth2 = layout.find(({ node }) => node.code === '..')
    expect(depth2?.y).toBeCloseTo(2 / 4, 6)
  })

  it('places E left of T, and keeps dots left of dashes at every level', () => {
    const layout = layoutTree()
    const at = (code: string) => layout.find(({ node }) => node.code === code)!.x

    expect(at('.')).toBeLessThan(at('-'))
    // Depth 2, left to right: I(..) A(.-) N(-.) M(--)
    expect(at('..')).toBeLessThan(at('.-'))
    expect(at('.-')).toBeLessThan(at('-.'))
    expect(at('-.')).toBeLessThan(at('--'))
  })

  it('never puts two nodes of the same depth in the same place', () => {
    const layout = layoutTree()
    for (let depth = 0; depth <= treeDepth(); depth++) {
      const xs = layout.filter(({ node }) => node.depth === depth).map(({ x }) => x)
      expect(new Set(xs).size, `depth ${depth} has overlapping nodes`).toBe(xs.length)
    }
  })
})

describe('levelToNodeState', () => {
  it('maps the six mastery levels onto four visual states', () => {
    expect(levelToNodeState(0)).toBe('locked')
    expect(levelToNodeState(1)).toBe('discovered')
    expect(levelToNodeState(2)).toBe('active')
    expect(levelToNodeState(3)).toBe('active')
    expect(levelToNodeState(4)).toBe('active')
    expect(levelToNodeState(5)).toBe('mastered')
  })

  it('clamps rather than falling through on an out-of-range level', () => {
    // A hand-edited progress file could produce anything.
    expect(levelToNodeState(-3)).toBe('locked')
    expect(levelToNodeState(99)).toBe('mastered')
  })
})
