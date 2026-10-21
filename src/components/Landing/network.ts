/**
 * The landing's network section (TASK-001 §5.2 section 4, §5.3): the drawing,
 * derived from the alphabet, and the words that belong to the figure itself.
 * The section's heading and lead are page copy, in `LANDING.network`
 * (config/landing.ts). Every figure is computed.
 */

import { LEARNING_STAGES, MORSE_ALPHABET } from '../../data/morseAlphabet'
import { MORSE_TREE, layoutTree, treeDepth, type TreeNode } from '../../data/tree'
import { prettify } from '../../engine/morseEncoder'

export const NETWORK_COPY = {
  /** What the drawing shows, for anyone who cannot see it. */
  description: `The Morse code tree. From the start, a dot branches left and a dash branches right, ${treeDepth(MORSE_TREE)} levels deep. Each letter sits at the end of its own code: ${LEARNING_STAGES.map((stage) => stage.join(' ')).join(', then ')}.`,
  dot: `${prettify(MORSE_ALPHABET.E ?? '')} left`,
  dash: `${prettify(MORSE_ALPHABET.T ?? '')} right`,
} as const

export const NETWORK_VIEWBOX = { width: 640, height: 430 } as const

const MARGIN_X = 28
const TOP = 34
const ROW = 84
/** Every other node on the widest row drops this far, so the circles never touch. */
const STAGGER = 30

export interface NetworkNode {
  code: string
  character: string | null
  depth: number
  x: number
  y: number
  /**
   * The order the drawing lights up in: 0 for the start node, then the lesson
   * stage that teaches the character, counted from 1.
   */
  stage: number
}

export interface NetworkEdge {
  from: NetworkNode
  to: NetworkNode
  /** The element that leads from `from` to `to`. */
  element: '.' | '-'
}

const stageOf = (character: string | null): number => {
  if (!character) return 0
  const index = LEARNING_STAGES.findIndex((stage) => stage.includes(character))
  return index < 0 ? 0 : index + 1
}

/** Nodes and edges in viewBox units, from `layoutTree`. Pure. */
export function networkLayout(root: TreeNode = MORSE_TREE): {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
} {
  const width = NETWORK_VIEWBOX.width - MARGIN_X * 2
  const layout = layoutTree(root)
  const rowSize = new Map<number, number>()
  for (const { node } of layout) rowSize.set(node.depth, (rowSize.get(node.depth) ?? 0) + 1)
  // Only a crowded row staggers; the A–Z tree has one, the 12-letter bottom row.
  const crowded = (depth: number) => (rowSize.get(depth) ?? 0) > 8

  const seen = new Map<number, number>()
  const nodes = layout.map(({ node, x }): NetworkNode => {
    const index = seen.get(node.depth) ?? 0
    seen.set(node.depth, index + 1)
    const drop = crowded(node.depth) ? (index % 2 === 1 ? STAGGER / 2 : -STAGGER / 2) : 0
    return {
      code: node.code,
      character: node.character,
      depth: node.depth,
      x: MARGIN_X + x * width,
      y: TOP + node.depth * ROW + drop,
      stage: stageOf(node.character),
    }
  })

  const byCode = new Map(nodes.map((node) => [node.code, node]))
  const edges: NetworkEdge[] = []
  for (const node of nodes) {
    if (node.code === '') continue
    const parent = byCode.get(node.code.slice(0, -1))
    if (parent) edges.push({ from: parent, to: node, element: node.code.at(-1) as '.' | '-' })
  }
  return { nodes, edges }
}

/**
 * The tree's letter layers, as the power lamps under the drawing name them.
 *
 * "Layer", not "Stage" (J-15): these are the tree's four letter layers
 * (`LEARNING_STAGES`), while the lesson has seven stages, digits included.
 * Calling both "Stage 3" put S U R W D K G O here and S U R W on /learn/.
 */
export const NETWORK_STAGES = LEARNING_STAGES.map((stage, index) => ({
  /** Matches `NetworkNode.stage` for the characters it teaches. */
  order: index + 1,
  label: `Layer ${index + 1}`,
  characters: stage.join(' '),
}))
