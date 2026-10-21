import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ALL_LETTERS, MORSE_ALPHABET } from '../../data/morseAlphabet'
import {
  type LayoutNode,
  type NodeState,
  MORSE_TREE,
  layoutTree,
  pathTo,
  treeDepth,
} from '../../data/tree'
import { Lamp } from '../ui/Lamp'
import { releaseFocus } from '../MorseKey/releaseFocus'
import type { MessageKey } from '../../i18n/keys'
import { useT } from '../../i18n/react'
import '../../styles/pkg-g.css'

/**
 * The Signal Tree (PROJECT.md §2, §3, §16, §17), drawn as a circuit board.
 *
 * The real Morse prefix tree: dots branch left, dashes branch right, and every
 * character sits at the node its code spells out. It is etched onto a CRT
 * board — copper traces between pads, and each pad a lamp that lights as its
 * character is learned. Because the layout comes from the alphabet rather than
 * a hand-drawn diagram, what the learner looks at *is* the structure of the
 * code.
 *
 * Purely presentational: it takes node states rather than reading storage, so
 * it can be rendered from any source (the tree page, the lesson, practice, the
 * telegraph) and tested without a browser.
 */

const VIEWBOX = { width: 1000, height: 640 }
const PADDING = { x: 44, y: 56 }
/** 20 units is 13–15px on a phone, where the tree is drawn at its minimum width. */
const NODE_RADIUS = 20
/**
 * The invisible hit area. Depth-4 pads are about 77 units apart, so 34 is as
 * large as it can be without neighbours overlapping: 44px or more at the
 * minimum rendered width, which is the touch-target floor (§28).
 */
const HIT_RADIUS = 34
/** Corner chamfer on a trace, PCB-style. */
const CHAMFER = 12

/** Order of "how lit" a node is. A rise between renders plays the halo (D4). */
const RANK: Record<NodeState, number> = { locked: 0, discovered: 1, active: 2, mastered: 3 }

/**
 * How each state looks on the glass.
 *
 * Everything here resolves inside `.mf-screen`, where the signal, amber, ink
 * and muted tokens are the phosphor values in both themes. Stroke weight,
 * dashing and fill carry the state as well as hue does, so the four states
 * stay distinguishable without colour (§28): dashed hollow pad, thin solid
 * pad, ringed lamp, and a lit lamp with dark lettering.
 *
 * Learning is amber, as it is everywhere else (DEC-043): amber is the token
 * for "in progress", and the A–Z lamps under the board already used it, so a
 * green ring above an amber lamp said the same thing two ways.
 */
const STATE_STYLE: Readonly<
  Record<
    NodeState,
    { fill: string; stroke: string; text: string; width: number; dashed: boolean; glow: boolean }
  >
> = {
  locked: {
    fill: 'var(--color-screen)',
    stroke: 'var(--color-line-strong)',
    // Full muted, never faded: the dashed pad already says "not yet".
    text: 'var(--color-muted)',
    width: 1.5,
    dashed: true,
    glow: false,
  },
  discovered: {
    fill: 'var(--color-screen)',
    stroke: 'var(--color-signal-dim)',
    text: 'var(--color-ink)',
    width: 2,
    dashed: false,
    glow: false,
  },
  active: {
    fill: 'color-mix(in srgb, var(--color-amber) 20%, var(--color-screen))',
    stroke: 'var(--color-amber)',
    text: 'var(--color-ink)',
    width: 3,
    dashed: false,
    glow: false,
  },
  mastered: {
    fill: 'var(--color-signal)',
    stroke: 'var(--color-signal)',
    text: 'var(--color-screen)',
    width: 3,
    dashed: false,
    glow: true,
  },
}

/**
 * Which trace colour wins where siblings share a segment: drawn last, on top.
 *
 * The path being keyed (`live`) is drawn in the screen's ink, the colour of
 * the beam itself: "you are here" must not borrow amber, which now means a
 * letter in progress, nor cyan, which reveals an answer.
 */
type TraceTone = 'copper' | 'energised' | 'lit' | 'highlight' | 'live'
const TRACE_ORDER: TraceTone[] = ['copper', 'energised', 'lit', 'highlight', 'live']
const TRACE_STYLE: Record<TraceTone, { stroke: string; width: number; opacity: number }> = {
  copper: { stroke: 'var(--color-brass-deep)', width: 2.5, opacity: 0.8 },
  energised: { stroke: 'var(--color-signal-dim)', width: 2.5, opacity: 1 },
  lit: { stroke: 'var(--color-signal)', width: 3, opacity: 1 },
  highlight: { stroke: 'var(--color-cyan)', width: 4, opacity: 1 },
  live: { stroke: 'var(--color-ink)', width: 4, opacity: 1 },
}

/**
 * A pad drawn exactly as the board draws that state, for a legend. It reads
 * the board's own style table and must sit on CRT glass (inside `.mf-screen`),
 * where the tokens resolve to the phosphor values the board uses. A legend on
 * the cream panel drew inky light-theme greens that matched nothing on the
 * board (visual audit V-11).
 */
export function NodeSwatch({ state, size = 18 }: { state: NodeState; size?: number }) {
  const style = STATE_STYLE[state]
  // The board's pad is radius 20 in a 1000-unit board; here it fills the box.
  const r = 7
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {style.glow && <circle cx="10" cy="10" r="9.5" fill={style.stroke} opacity="0.25" />}
      <circle
        cx="10"
        cy="10"
        r={r}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={Math.max(1.25, style.width * 0.6)}
        strokeDasharray={style.dashed ? '2.5 2.5' : undefined}
      />
    </svg>
  )
}

/** Human names for the states, matching the legend on the tree page. */
const STATE_LABEL: Record<NodeState, MessageKey> = {
  locked: 'tree.stateLocked',
  discovered: 'tree.stateDiscovered',
  active: 'tree.stateActive',
  mastered: 'tree.stateMastered',
}

export interface SignalTreeProps {
  /** Visual state per character. Anything missing is treated as locked. */
  states?: Readonly<Record<string, NodeState>>
  /**
   * Overall completion 0..1. When given, the "Network power" gauge is drawn
   * under the board: the percentage plus one lamp per letter.
   */
  power?: number
  /**
   * Light the root→character path for this character, for the §3 explanation
   * ("A = START → DOT → DASH → A") and for answer feedback.
   */
  highlight?: string | null
  /**
   * A partial code being keyed right now, e.g. ".-" while the user is mid
   * character. Lights the prefix path from the root.
   *
   * Separate from `highlight` because they mean opposite things: `highlight`
   * reveals an answer, this shows where the learner currently *is*. Colouring
   * them the same would make "here is the answer" and "here is you" identical.
   */
  livePath?: string
  /**
   * Called when a character node is picked. When omitted the tree renders as a
   * static diagram — nodes stay non-focusable so a keyboard user is not made to
   * tab through 26 inert pads (PROJECT.md §28).
   */
  onSelect?: (character: string) => void
  /**
   * Characters to ring in amber as "start here", e.g. E and T on a first
   * visit. Static: a ring, not a pulse.
   */
  beacons?: readonly string[]
  className?: string
}

interface Placed extends LayoutNode {
  cx: number
  cy: number
}

/**
 * Edge fades for the board's own horizontal scroll.
 *
 * On a phone the tree is wider than the screen and always will be: squeezing
 * twelve depth-4 pads into 375px makes them unreadable, and rotating the tree
 * to fit would teach the wrong thing (dots left, dashes right). So it scrolls,
 * starts centred on the root, and says so: a fade appears on whichever side
 * has more to see, and disappears once there is nothing left that way. Without
 * it, people simply never found the T half of the tree.
 */
function useScrollEdges() {
  const ref = useRef<HTMLDivElement | null>(null)
  // Starts false, as on the server: a desk-width board never scrolls, and a
  // phone learns that it does within a frame of mounting.
  const [edges, setEdges] = useState({ left: false, right: false, scrollable: false })

  const measure = useCallback(() => {
    const element = ref.current
    if (!element) return
    const max = element.scrollWidth - element.clientWidth
    const scrollable = max > 2
    const left = element.scrollLeft > 2
    const right = element.scrollLeft < max - 2
    setEdges((current) =>
      current.left === left && current.right === right && current.scrollable === scrollable
        ? current
        : { left, right, scrollable },
    )
  }, [])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    // Start on the root, so E and T are both in view before any scrolling.
    const max = element.scrollWidth - element.clientWidth
    if (max > 0) element.scrollLeft = max / 2
    measure()

    element.addEventListener('scroll', measure, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    return () => {
      element.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [measure])

  return { ref, edges }
}

/**
 * Nodes whose state rose since the last render, each with a fresh key so the
 * one-shot halo replays. Changes in the first moments after mount are the
 * stored progress arriving, not something the learner just did, so they are
 * ignored — otherwise every lit node would flare on every page load.
 */
function useRisenNodes(states: Readonly<Record<string, NodeState>>) {
  const previous = useRef<Readonly<Record<string, NodeState>> | null>(null)
  const armedAt = useRef<number | null>(null)
  const [halos, setHalos] = useState<Readonly<Record<string, number>>>({})

  useEffect(() => {
    armedAt.current = performance.now() + 600
  }, [])

  useEffect(() => {
    const before = previous.current
    previous.current = states
    if (!before || armedAt.current === null || performance.now() < armedAt.current) return
    const risen = Object.keys(states).filter(
      (character) => RANK[states[character] ?? 'locked'] > RANK[before[character] ?? 'locked'],
    )
    if (risen.length === 0) return
    setHalos((current) => {
      const next = { ...current }
      for (const character of risen) next[character] = (next[character] ?? 0) + 1
      return next
    })
  }, [states])

  return halos
}

/** A PCB trace from a parent pad down to a child: down, chamfer, across, chamfer, down. */
function tracePath(parent: Placed, child: Placed): string {
  const midY = parent.cy + (child.cy - parent.cy) * 0.5
  const dx = child.cx - parent.cx
  const sign = dx >= 0 ? 1 : -1
  const c = Math.min(CHAMFER, Math.abs(dx) / 2)
  return [
    `M ${parent.cx} ${parent.cy}`,
    `V ${midY - c}`,
    `L ${parent.cx + sign * c} ${midY}`,
    `H ${child.cx - sign * c}`,
    `L ${child.cx} ${midY + c}`,
    `V ${child.cy}`,
  ].join(' ')
}

export function SignalTree({
  states = {},
  power,
  highlight = null,
  livePath,
  onSelect,
  beacons = [],
  className,
}: SignalTreeProps) {
  const t = useT()
  const uid = useId().replace(/:/g, '')
  const glowId = `mf-tree-glow-${uid}`
  const titleId = `mf-tree-title-${uid}`
  const descId = `mf-tree-desc-${uid}`
  const hintId = `mf-tree-hint-${uid}`
  const { ref: scroller, edges } = useScrollEdges()
  const halos = useRisenNodes(states)

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

  /** Every prefix of the code being keyed, including the root. */
  const liveCodes = useMemo(() => {
    const codes = new Set<string>()
    if (!livePath) return codes
    codes.add('')
    for (let length = 1; length <= livePath.length; length++) codes.add(livePath.slice(0, length))
    return codes
  }, [livePath])

  const stateFor = (character: string | null): NodeState =>
    character ? (states[character] ?? 'locked') : 'active'

  const traces = useMemo(() => {
    const list: { code: string; d: string; tone: TraceTone }[] = []
    for (const entry of placed) {
      if (entry.node.depth === 0) continue
      const parent = byCode.get(entry.node.code.slice(0, -1))
      if (!parent) continue
      const code = entry.node.code
      const childState = states[entry.node.character ?? ''] ?? 'locked'
      const parentState =
        parent.node.depth === 0 ? 'mastered' : (states[parent.node.character ?? ''] ?? 'locked')
      const tone: TraceTone =
        liveCodes.has(code) && liveCodes.has(parent.node.code)
          ? 'live'
          : highlightedCodes.has(code) && highlightedCodes.has(parent.node.code)
            ? 'highlight'
            : childState === 'mastered' && parentState === 'mastered'
              ? 'lit'
              : RANK[childState] >= RANK.discovered
                ? 'energised'
                : 'copper'
      list.push({ code, d: tracePath(parent, entry), tone })
    }
    return list.sort((a, b) => TRACE_ORDER.indexOf(a.tone) - TRACE_ORDER.indexOf(b.tone))
  }, [placed, byCode, states, liveCodes, highlightedCodes])

  /* Keyboard: one tab stop for the whole board, arrows walk the tree itself —
     left follows a dot, right a dash, up goes back towards the root. Tabbing
     through 26 pads one by one was the old behaviour. */
  const selectable = Boolean(onSelect)
  const highlightCode = highlight ? MORSE_ALPHABET[highlight.toUpperCase()] : undefined
  // The first pad in tree order (E) unless a letter is already picked.
  const defaultFocus =
    highlightCode && byCode.has(highlightCode)
      ? highlightCode
      : (placed.find((entry) => entry.node.depth === 1)?.node.code ?? '')
  const [focusCode, setFocusCode] = useState<string | null>(null)
  const tabCode = focusCode ?? defaultFocus
  const nodeRefs = useRef(new Map<string, SVGGElement>())

  const moveFocus = (code: string) => {
    const target = byCode.get(code)
    if (!target || target.node.character === null) return false
    setFocusCode(code)
    nodeRefs.current.get(code)?.focus()
    return true
  }

  const onNodeKeyDown = (event: KeyboardEvent, code: string, character: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      // Space is the Morse key everywhere else in the app, so it must not
      // also scroll the page here.
      event.preventDefault()
      onSelect?.(character)
      return
    }
    const target =
      event.key === 'ArrowLeft'
        ? `${code}.`
        : event.key === 'ArrowRight'
          ? `${code}-`
          : event.key === 'ArrowUp'
            ? code.slice(0, -1)
            : event.key === 'ArrowDown'
              ? `${code}.`
              : event.key === 'Home'
                ? '.'
                : null
    if (target === null) return
    event.preventDefault()
    moveFocus(target)
  }

  const depth = treeDepth(MORSE_TREE)
  const masteredCount = ALL_LETTERS.filter((letter) => states[letter] === 'mastered').length
  const learningCount = ALL_LETTERS.filter((letter) => states[letter] === 'active').length
  const powerPercent =
    power === undefined ? null : Math.round(Math.min(Math.max(power, 0), 1) * 100)
  const root = byCode.get('')

  return (
    <figure className={['m-0', className ?? ''].join(' ')}>
      <div
        className="mf-screen mf-grid mf-tree-board"
        data-more-left={edges.left}
        data-more-right={edges.right}
      >
        <div
          ref={scroller}
          className="mf-tree-scroll"
          // A static diagram has nothing focusable inside, so when it is wider
          // than its frame the scroll box itself takes focus, or a keyboard
          // user could never pan it. When it fits, it is not a tab stop at all:
          // a stop that does nothing is noise (A11Y-23). Space on the focused
          // region pans it; the key binding leaves focusable regions alone.
          {...(selectable || !edges.scrollable
            ? {}
            : { tabIndex: 0, role: 'region', 'aria-label': t('tree.scrollable') })}
        >
          <svg
            viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
            className="block h-auto w-full min-w-[660px]"
            // A group when it holds buttons: `role=img` makes its children
            // presentational, which hid every pad from a screen reader.
            role={selectable ? 'group' : 'img'}
            aria-labelledby={`${titleId} ${descId}`}
            aria-describedby={selectable ? hintId : undefined}
          >
            <title id={titleId}>{t('tree.title')}</title>
            <desc id={descId}>
              {t('tree.description', {
                depth,
                mastered: masteredCount,
                total: ALL_LETTERS.length,
              })}
            </desc>

            <defs>
              <radialGradient id={glowId}>
                <stop offset="0%" stopColor="var(--color-signal)" stopOpacity="0.55" />
                <stop offset="55%" stopColor="var(--color-signal)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--color-signal)" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Branch legend at the root: the one rule the whole tree follows. */}
            {root && (
              <g aria-hidden="true" className="mf-tree-branch-label">
                <text x={root.cx - 64} y={root.cy} textAnchor="end" dominantBaseline="central">
                  {t('tree.dotBranch')}
                </text>
                <text x={root.cx + 64} y={root.cy} textAnchor="start" dominantBaseline="central">
                  {t('tree.dashBranch')}
                </text>
              </g>
            )}

            {/* Traces under the pads. */}
            <g fill="none" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
              {traces.map(({ code, d, tone }) => (
                <path
                  key={`trace-${code}`}
                  d={d}
                  stroke={TRACE_STYLE[tone].stroke}
                  strokeWidth={TRACE_STYLE[tone].width}
                  opacity={TRACE_STYLE[tone].opacity}
                />
              ))}
            </g>

            {/* Vias where a trace splits into its dot and dash branches. */}
            <g aria-hidden="true">
              {placed
                .filter((entry) => entry.node.dot || entry.node.dash)
                .map((entry) => {
                  const child =
                    byCode.get(entry.node.code + '.') ?? byCode.get(entry.node.code + '-')
                  if (!child) return null
                  const midY = entry.cy + (child.cy - entry.cy) * 0.5
                  return (
                    <circle
                      key={`via-${entry.node.code || 'root'}`}
                      cx={entry.cx}
                      cy={midY}
                      r={4.5}
                      fill="var(--color-screen)"
                      stroke="var(--color-brass-deep)"
                      strokeWidth={2}
                    />
                  )
                })}
            </g>

            <g>
              {placed.map((entry) => {
                const { character, code, depth: nodeDepth } = entry.node
                const isRoot = nodeDepth === 0
                const state = stateFor(character)
                const style = STATE_STYLE[state]
                const lit = highlightedCodes.has(code)
                const live = liveCodes.has(code)
                const canSelect = selectable && character !== null
                const isBeacon = character !== null && beacons.includes(character)
                const label = character
                  ? t('tree.padLabel', {
                      character,
                      code: t.spokenCode(code),
                      state: t.raw(STATE_LABEL[state]),
                    })
                  : undefined

                if (isRoot) {
                  return (
                    <g key="node-root" aria-hidden="true">
                      <circle
                        cx={entry.cx}
                        cy={entry.cy}
                        r={NODE_RADIUS + 10}
                        fill="none"
                        stroke="var(--color-signal-dim)"
                        strokeWidth={1.5}
                        strokeDasharray="2 5"
                      />
                      <circle
                        cx={entry.cx}
                        cy={entry.cy}
                        r={NODE_RADIUS + 2}
                        fill="var(--color-screen)"
                        stroke={live ? 'var(--color-ink)' : 'var(--color-signal)'}
                        strokeWidth={3}
                      />
                      <circle
                        cx={entry.cx}
                        cy={entry.cy}
                        r={7}
                        fill={live ? 'var(--color-ink)' : 'var(--color-cyan)'}
                      />
                    </g>
                  )
                }

                const ring = live ? 'var(--color-ink)' : lit ? 'var(--color-cyan)' : null

                return (
                  <g
                    key={`node-${code}`}
                    ref={(element) => {
                      if (element) nodeRefs.current.set(code, element)
                      else nodeRefs.current.delete(code)
                    }}
                    className={canSelect ? 'mf-tree-node' : undefined}
                    data-state={state}
                    {...(canSelect
                      ? {
                          role: 'button',
                          tabIndex: code === tabCode ? 0 : -1,
                          'aria-label': label,
                          'aria-pressed': highlight === character,
                          onClick: (event: MouseEvent<SVGGElement>) => {
                            setFocusCode(code)
                            onSelect?.(character!)
                            // A tap or a click leaves focus on the pad, and the
                            // next Space, meant for the key, would answer with
                            // this pad again. Give focus back to the page;
                            // keyboard users keep their place (detail is 0).
                            releaseFocus(event)
                          },
                          onFocus: () => setFocusCode(code),
                          onKeyDown: (event: KeyboardEvent) =>
                            onNodeKeyDown(event, code, character!),
                        }
                      : // Still a diagram worth reading without `onSelect`: each
                        // pad says what it is and how far along it is.
                        { role: 'img', 'aria-label': label })}
                  >
                    {canSelect && (
                      <circle cx={entry.cx} cy={entry.cy} r={HIT_RADIUS} fill="transparent" />
                    )}
                    {style.glow && (
                      <circle
                        cx={entry.cx}
                        cy={entry.cy}
                        r={NODE_RADIUS + 22}
                        fill={`url(#${glowId})`}
                        aria-hidden="true"
                      />
                    )}
                    {isBeacon && (
                      <circle
                        cx={entry.cx}
                        cy={entry.cy}
                        r={NODE_RADIUS + 9}
                        fill="none"
                        stroke="var(--color-amber)"
                        strokeWidth={2.5}
                        strokeDasharray="6 4"
                      />
                    )}
                    {ring && (
                      <circle
                        cx={entry.cx}
                        cy={entry.cy}
                        r={NODE_RADIUS + 7}
                        fill="none"
                        stroke={ring}
                        strokeWidth={3}
                      />
                    )}
                    {halos[character ?? ''] !== undefined && (
                      <circle
                        key={`halo-${halos[character ?? '']}`}
                        className="mf-halo mf-tree-halo"
                        cx={entry.cx}
                        cy={entry.cy}
                        r={NODE_RADIUS + 6}
                        fill="none"
                        stroke="var(--color-signal)"
                        strokeWidth={4}
                      />
                    )}
                    {canSelect && (
                      <circle
                        className="mf-tree-focus"
                        cx={entry.cx}
                        cy={entry.cy}
                        r={NODE_RADIUS + 12}
                        fill="none"
                        stroke="var(--color-amber)"
                        strokeWidth={3}
                      />
                    )}
                    <circle
                      className="mf-tree-pad"
                      cx={entry.cx}
                      cy={entry.cy}
                      r={NODE_RADIUS}
                      fill={style.fill}
                      stroke={ring ?? style.stroke}
                      strokeWidth={ring ? 3 : style.width}
                      strokeDasharray={style.dashed && !ring ? '4 4' : undefined}
                    />
                    <text
                      x={entry.cx}
                      y={entry.cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="mf-tree-label"
                      // A lit (mastered) pad keeps its dark lettering: cyan on green is unreadable.
                      fill={ring && state !== 'mastered' ? ring : style.text}
                    >
                      {character}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>
        </div>

        <span aria-hidden="true" className="mf-tree-fade mf-tree-fade-left" />
        <span aria-hidden="true" className="mf-tree-fade mf-tree-fade-right" />
        {selectable && (
          <span id={hintId} className="sr-only">
            {t('tree.keysHint')}
          </span>
        )}
      </div>

      {powerPercent !== null && (
        <figcaption className="mf-panel mt-4 grid gap-4 p-4 sm:p-5 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] md:items-center md:gap-6">
          <div>
            <span className="mf-engraved flex items-center gap-2">
              <Lamp on={powerPercent > 0} />
              {t('tree.networkPower')}
            </span>
            <p className="mt-2 font-mono text-readout text-signal tabular-nums">
              {t('tree.percent', { value: powerPercent })}
            </p>
            {/* Scaled rather than resized: a transform runs on the compositor
                and touches nothing else on the page. */}
            <span
              className="mt-3 block h-1.5 overflow-hidden rounded-full bg-line"
              aria-hidden="true"
            >
              <span
                className="mf-tree-power-fill block h-full w-full origin-left rounded-full bg-signal"
                style={{ transform: `scaleX(${powerPercent / 100})` }}
              />
            </span>
            <p className="mt-2 text-sm text-muted">
              {t('tree.masteredOf', { mastered: masteredCount, total: ALL_LETTERS.length })}
              {learningCount > 0 ? t('tree.learningSuffix', { count: learningCount }) : ''}
            </p>
          </div>

          {/* One lamp per letter: green when mastered, amber while learning. */}
          <ol aria-hidden="true" className="grid grid-cols-13 gap-x-1 gap-y-3 xl:grid-cols-26">
            {ALL_LETTERS.map((letter) => {
              const state = states[letter] ?? 'locked'
              return (
                <li key={letter} className="flex flex-col items-center gap-1.5" data-state={state}>
                  <Lamp
                    on={state === 'mastered' || state === 'active'}
                    tone={state === 'mastered' ? 'signal' : 'amber'}
                  />
                  <span
                    className={[
                      'font-mono text-label',
                      state === 'locked' ? 'text-muted' : 'text-ink',
                    ].join(' ')}
                  >
                    {letter}
                  </span>
                </li>
              )
            })}
          </ol>
        </figcaption>
      )}
    </figure>
  )
}
