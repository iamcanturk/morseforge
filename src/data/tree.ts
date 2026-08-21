/**
 * The Morse binary tree (PROJECT.md §3, §16).
 *
 * Morse is a prefix tree: from the root, a dot goes left and a dash goes right,
 * and every character sits at the node its code spells out. E is one step left,
 * T one step right, A is left-then-right.
 *
 * The tree is **derived from the alphabet**, never hand-authored. A hand-written
 * copy would drift the moment a character changed, and the whole point of the
 * Signal Tree screen is that it shows the real structure of the code rather than
 * a decorative diagram of it.
 */

import { LETTERS, MORSE_ALPHABET } from './morseAlphabet'

export interface TreeNode {
  /** The character at this node, or null for the root and unassigned paths. */
  character: string | null
  /** Path from the root as dots and dashes. Empty string at the root. */
  code: string
  /** Distance from the root. The root is 0, E and T are 1. */
  depth: number
  /** Follow a dot from here. */
  dot: TreeNode | null
  /** Follow a dash from here. */
  dash: TreeNode | null
}

export interface BuildTreeOptions {
  /**
   * Which characters to place. Defaults to A–Z: digits sit at depth 5 and
   * double the width of the diagram for characters the MVP does not teach
   * (PROJECT.md §32).
   */
  characters?: readonly string[]
}

function createNode(code: string): TreeNode {
  return { character: null, code, depth: code.length, dot: null, dash: null }
}

/**
 * Build the tree.
 *
 * Intermediate nodes are created as needed, so a character whose prefix has no
 * character of its own still gets a path (this does not happen for A–Z, but it
 * does for punctuation, and the traversal must not depend on it).
 */
export function buildTree(options: BuildTreeOptions = {}): TreeNode {
  const characters = options.characters ?? Object.keys(LETTERS)
  const root = createNode('')

  for (const character of characters) {
    const code = MORSE_ALPHABET[character.toUpperCase()]
    if (!code) continue

    let node = root
    for (const [index, element] of [...code].entries()) {
      const branch = element === '.' ? 'dot' : 'dash'
      let next = node[branch]
      if (!next) {
        next = createNode(code.slice(0, index + 1))
        node[branch] = next
      }
      node = next
    }
    node.character = character.toUpperCase()
  }

  return root
}

/** The A–Z tree, built once. */
export const MORSE_TREE: TreeNode = buildTree()

/**
 * Walk from the root to a character, returning every node passed through.
 *
 * This is what renders "A = START → DOT → DASH → A" on the tree screen, and
 * what highlights the live path while the user is keying.
 *
 * Returns an empty array when the character is not in the tree — callers render
 * nothing rather than a partial path.
 */
export function pathTo(character: string, root: TreeNode = MORSE_TREE): TreeNode[] {
  const code = MORSE_ALPHABET[character.toUpperCase()]
  if (!code) return []

  const path: TreeNode[] = [root]
  let node = root

  for (const element of code) {
    const next = element === '.' ? node.dot : node.dash
    if (!next) return [] // character is not in this tree
    path.push(next)
    node = next
  }

  return node.character === character.toUpperCase() ? path : []
}

/** Find the node holding a character, or null. */
export function findNode(character: string, root: TreeNode = MORSE_TREE): TreeNode | null {
  return pathTo(character, root).at(-1) ?? null
}

/** Depth-first walk over every node, root first. */
export function walk(root: TreeNode = MORSE_TREE): TreeNode[] {
  const nodes: TreeNode[] = []
  const visit = (node: TreeNode) => {
    nodes.push(node)
    if (node.dot) visit(node.dot)
    if (node.dash) visit(node.dash)
  }
  visit(root)
  return nodes
}

/** Every node holding a character, in depth-first order. */
export function characterNodes(root: TreeNode = MORSE_TREE): TreeNode[] {
  return walk(root).filter((node) => node.character !== null)
}

/** How deep the tree goes. The A–Z tree is 4. */
export function treeDepth(root: TreeNode = MORSE_TREE): number {
  return Math.max(...walk(root).map((node) => node.depth))
}

/**
 * How a node is presented on the Signal Tree (PROJECT.md §16).
 *
 * Derived from progress rather than stored on the node: the tree is structure,
 * and progress is state that changes underneath it.
 */
export type NodeState = 'locked' | 'discovered' | 'active' | 'mastered'

/**
 * Map a mastery level (0–5) onto the four visual states.
 *
 * Levels 2–4 collapse into one "active" look on purpose: the tree answers
 * "where am I?", and three shades of half-learned is noise at 26 nodes. The
 * per-character detail belongs on the character screen, not the map.
 */
export function levelToNodeState(level: number): NodeState {
  if (level <= 0) return 'locked'
  if (level === 1) return 'discovered'
  if (level >= 5) return 'mastered'
  return 'active'
}

/** Lay the tree out for rendering. */
export interface LayoutNode {
  node: TreeNode
  /** 0..1 across the width of the diagram. */
  x: number
  /** 0..1 down the diagram, proportional to depth. */
  y: number
}

/**
 * Order two codes dot-before-dash, shallow-before-deep.
 *
 * Exported because the tree layout and any list of characters shown alongside
 * it have to agree on order, or the diagram and the legend disagree.
 */
export function compareCodes(a: string, b: string): number {
  const rank = (element: string) => (element === '.' ? 0 : 1)
  const shared = Math.min(a.length, b.length)

  for (let i = 0; i < shared; i++) {
    const difference = rank(a[i]!) - rank(b[i]!)
    if (difference !== 0) return difference
  }

  return a.length - b.length
}

/**
 * Position every node for an SVG render.
 *
 * Nodes are spread evenly within their depth level rather than by classic
 * binary-tree bisection: at depth 4 the A–Z tree is sparse (12 of 16 slots),
 * and bisection leaves visible gaps where a slot happens to be empty. Even
 * spacing per level reads as a circuit rather than as a broken diagram.
 */
export function layoutTree(root: TreeNode = MORSE_TREE): LayoutNode[] {
  const maxDepth = treeDepth(root)
  const byDepth = new Map<number, TreeNode[]>()

  for (const node of walk(root)) {
    const level = byDepth.get(node.depth) ?? []
    level.push(node)
    byDepth.set(node.depth, level)
  }

  const layout: LayoutNode[] = []
  for (const [depth, nodes] of byDepth) {
    // Order by code so the left half of the diagram is dots and the right half
    // is dashes — the property that makes the tree teachable at a glance.
    // This needs an explicit comparator: in code-point order "-" (0x2D) sorts
    // before "." (0x2E), which would silently mirror the whole diagram.
    const ordered = [...nodes].sort((a, b) => compareCodes(a.code, b.code))
    ordered.forEach((node, index) => {
      layout.push({
        node,
        x: ordered.length === 1 ? 0.5 : (index + 0.5) / ordered.length,
        y: maxDepth === 0 ? 0 : depth / maxDepth,
      })
    })
  }

  return layout
}
