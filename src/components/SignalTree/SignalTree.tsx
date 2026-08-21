import { useMemo } from 'react'
import {
  type LayoutNode,
  type NodeState,
  MORSE_TREE,
  layoutTree,
  pathTo,
  treeDepth,
} from '../../data/tree'

/**
 * The Signal Tree (PROJECT.md §2, §3, §16, §17).
 *
 * The real Morse prefix tree drawn as a circuit: dots branch left, dashes
 * branch right, and a node lights up as its character is learned. Because the
 * layout comes from the alphabet rather than from a hand-drawn diagram, what
 * the learner is looking at *is* the structure of the code.
 *
 * Purely presentational — it takes node states rather than reading storage, so
 * it can be rendered from any source and tested without a browser.
 */

const VIEWBOX = { width: 1000, height: 620 }
const PADDING = { x: 40, y: 44 }
const NODE_RADIUS = 17

const STATE_STYLE: Record<
  NodeState,
  { fill: string; stroke: string; text: string; glow: boolean }
> = {
  locked: {
    fill: 'var(--color-panel)',
    stroke: 'color-mix(in srgb, var(--color-signal-dim) 28%, transparent)',
    text: 'color-mix(in srgb, var(--color-muted) 55%, transparent)',
    glow: false,
  },
  discovered: {
    fill: 'var(--color-elevated)',
    stroke: 'var(--color-signal-dim)',
    text: 'var(--color-muted)',
    glow: false,
  },
  active: {
    fill: 'color-mix(in srgb, var(--color-signal) 16%, var(--color-panel))',
    stroke: 'var(--color-signal)',
    text: 'var(--color-ink)',
    glow: false,
  },
  mastered: {
    fill: 'color-mix(in srgb, var(--color-signal) 26%, var(--color-panel))',
    stroke: 'var(--color-signal)',
    text: '#fff',
    glow: true,
  },
}

export interface SignalTreeProps {
  /** Visual state per character. Anything missing is treated as locked. */
  states?: Readonly<Record<string, NodeState>>
  /** Overall completion 0..1, shown as the §17 power readout. */
  power?: number
  /**
   * Light the root→character path for this character, for the §3 explanation
   * ("A = START → DOT → DASH → A") and for live keying feedback.
   */
  highlight?: string | null
  /**
   * Called when a character node is picked. When omitted the tree renders as a
   * static diagram — nodes stay non-focusable so a keyboard user is not made to
   * tab through 26 inert circles (PROJECT.md §28).
   */
  onSelect?: (character: string) => void
  className?: string
}

interface Placed extends LayoutNode {
  cx: number
  cy: number
}

export function SignalTree({
  states = {},
  power,
  highlight = null,
  onSelect,
  className,
}: SignalTreeProps) {
  const placed = useMemo<Placed[]>(() => {
    const innerWidth = VIEWBOX.width - PADDING.x * 2
    const innerHeight = VIEWBOX.height - PADDING.y * 2
    return layoutTree(MORSE_TREE).map((entry) => ({
      ...entry,
      cx: PADDING.x + entry.x * innerWidth,
      cy: PADDING.y + entry.y * innerHeight,
    }))
  }, [])

  const byCode = useMemo(() => new Map(placed.map((entry) => [entry.node.code, entry])), [placed])

  /** Codes on the highlighted path, for both nodes and the edges between them. */
  const highlightedCodes = useMemo(() => {
    if (!highlight) return new Set<string>()
    return new Set(pathTo(highlight).map((node) => node.code))
  }, [highlight])

  const stateFor = (character: string | null): NodeState =>
    character ? (states[character] ?? 'locked') : 'active'

  const depth = treeDepth(MORSE_TREE)
  const powerPercent = power === undefined ? null : Math.round(power * 100)

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
        className="h-auto w-full"
        role="img"
        aria-labelledby="signal-tree-title signal-tree-desc"
      >
        <title id="signal-tree-title">Morse signal tree</title>
        <desc id="signal-tree-desc">
          {`The Morse code binary tree across ${depth} levels. From the centre, a dot branches left and a dash branches right. ${
            Object.values(states).filter((s) => s === 'mastered').length
          } of 26 characters are mastered.`}
        </desc>

        {/* Traces first so nodes sit on top of them. */}
        <g>
          {placed.map((entry) => {
            if (entry.node.depth === 0) return null
            const parent = byCode.get(entry.node.code.slice(0, -1))
            if (!parent) return null

            const lit =
              highlightedCodes.has(entry.node.code) && highlightedCodes.has(parent.node.code)
            const state = stateFor(entry.node.character)
            const energised = state === 'mastered' || state === 'active'

            return (
              <line
                key={`trace-${entry.node.code}`}
                x1={parent.cx}
                y1={parent.cy}
                x2={entry.cx}
                y2={entry.cy}
                stroke={
                  lit
                    ? 'var(--color-cyan)'
                    : energised
                      ? 'var(--color-signal-dim)'
                      : 'color-mix(in srgb, var(--color-line) 90%, transparent)'
                }
                strokeWidth={lit ? 3 : 2}
                strokeLinecap="round"
              />
            )
          })}
        </g>

        <g>
          {placed.map((entry) => {
            const { character, code, depth: nodeDepth } = entry.node
            const state = stateFor(character)
            const style = STATE_STYLE[state]
            const lit = highlightedCodes.has(code)

            // The root is the power core rather than a character.
            const isRoot = nodeDepth === 0
            const selectable = Boolean(onSelect) && character !== null

            return (
              <g
                key={`node-${code || 'root'}`}
                {...(selectable
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': `${character}, Morse ${code}, ${state}`,
                      style: { cursor: 'pointer' },
                      onClick: () => onSelect?.(character!),
                      onKeyDown: (event: React.KeyboardEvent) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        // Space is the Morse key everywhere else in the app, so
                        // it must not also scroll the page here.
                        event.preventDefault()
                        onSelect?.(character!)
                      },
                    }
                  : {})}
              >
                {selectable && (
                  // A generous invisible hit area: the 17px circles are well
                  // under the 44px touch target minimum (§28).
                  <circle cx={entry.cx} cy={entry.cy} r={24} fill="transparent" />
                )}
                {(style.glow || lit) && (
                  <circle
                    cx={entry.cx}
                    cy={entry.cy}
                    r={NODE_RADIUS + 7}
                    fill={lit ? 'var(--color-cyan)' : 'var(--color-signal)'}
                    opacity={lit ? 0.22 : 0.14}
                  />
                )}
                <circle
                  cx={entry.cx}
                  cy={entry.cy}
                  r={isRoot ? NODE_RADIUS + 4 : NODE_RADIUS}
                  fill={isRoot ? 'var(--color-panel)' : style.fill}
                  stroke={lit ? 'var(--color-cyan)' : isRoot ? 'var(--color-signal)' : style.stroke}
                  strokeWidth={lit || isRoot ? 3 : 2}
                />
                {isRoot ? (
                  <circle cx={entry.cx} cy={entry.cy} r={6} fill="var(--color-cyan)" />
                ) : (
                  <text
                    x={entry.cx}
                    y={entry.cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={16}
                    fontWeight={600}
                    fill={lit ? 'var(--color-cyan)' : style.text}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {character}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {powerPercent !== null && (
        <figcaption className="mt-4 flex items-center gap-3 font-mono text-xs tracking-[0.18em] text-muted">
          <span
            className="h-1.5 flex-1 overflow-hidden rounded-full"
            style={{ background: 'var(--color-line)' }}
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${powerPercent}%`,
                background: 'var(--color-signal)',
                transition: 'width 400ms ease-out',
              }}
            />
          </span>
          <span style={{ color: 'var(--color-signal)' }}>⚡ {powerPercent}% POWER</span>
        </figcaption>
      )}
    </figure>
  )
}
