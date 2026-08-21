import { useMemo, useRef } from 'react'
import { useAutoLoop } from './useAutoLoop'
import { playheadAt } from '../MorsePlayer/MorsePlayer'
import { buildTimeline, timelineDuration } from '../../engine/timingEngine'
import { encode, prettify } from '../../engine/morseEncoder'
import { MORSE_TREE, layoutTree } from '../../data/tree'
import { LEARNING_STAGES } from '../../data/morseAlphabet'

/**
 * Silent, looping demos of the three things this app does.
 *
 * Driven by the same timing engine the product uses, so the rhythm on the
 * landing page is genuinely Morse rather than a designer's approximation of it.
 * Nothing here plays audio — see the note in `useAutoLoop`.
 */

const DEMO_WPM = 11

/**
 * How many elements have been keyed by `elapsed`.
 *
 * Pure so it can be tested: the animation frames themselves are hard to observe,
 * but this is where an off-by-one would show as the trace filling a beat early.
 */
export function elementsSent(
  timeline: readonly { duration: number; on: boolean }[],
  elapsed: number,
): number {
  let offset = 0
  let count = 0
  for (const element of timeline) {
    offset += element.duration
    if (offset > elapsed) break
    if (element.on) count += 1
  }
  return count
}

/**
 * How many curriculum stages are lit by `elapsed`.
 *
 * Clamped, because `useAutoLoop` returns elapsed across the whole cycle
 * including the pause between passes — so without a ceiling the last beat would
 * ask for more stages than exist.
 */
export function revealedStages(elapsed: number, beatMs: number, total: number): number {
  return Math.min(Math.floor(elapsed / beatMs) + 1, total)
}

function Panel({
  title,
  caption,
  href,
  children,
  demoRef,
}: {
  title: string
  caption: string
  href: string
  children: React.ReactNode
  demoRef: React.RefObject<HTMLAnchorElement | null>
}) {
  return (
    <a
      href={href}
      ref={demoRef}
      className="group block rounded-xl border border-line bg-panel p-5 transition-colors hover:border-signal-dim"
    >
      <div className="flex h-28 items-center justify-center">{children}</div>
      <h3 className="mt-4 font-display text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{caption}</p>
    </a>
  )
}

/** A key sending a character, with the trace and the decode appearing. */
export function KeyDemo() {
  const ref = useRef<HTMLAnchorElement>(null)
  const word = 'SOS'

  const timeline = useMemo(() => buildTimeline(encode(word), { wpm: DEMO_WPM }), [])
  const durationMs = useMemo(() => timelineDuration(timeline), [timeline])
  const { elapsed, reducedMotion } = useAutoLoop(ref, { durationMs })

  const head = playheadAt(timeline, elapsed)
  const down = !reducedMotion && head.on

  const sent = useMemo(
    () =>
      reducedMotion
        ? timeline.filter((element) => element.on).length
        : elementsSent(timeline, elapsed),
    [timeline, elapsed, reducedMotion],
  )

  const elements = useMemo(() => timeline.filter((element) => element.on), [timeline])

  return (
    <Panel
      demoRef={ref}
      href="/telegraph/"
      title="Send it yourself"
      caption="Your keyboard becomes a straight key. Tap for a dot, hold for a dash."
    >
      <div className="flex w-full flex-col items-center gap-3">
        <div
          className="h-9 w-32 rounded-lg border-2"
          aria-hidden="true"
          style={{
            borderColor: down ? 'var(--color-signal)' : 'var(--color-line)',
            background: down
              ? 'color-mix(in srgb, var(--color-signal) 22%, var(--color-panel))'
              : 'var(--color-elevated)',
            boxShadow: down
              ? '0 0 24px color-mix(in srgb, var(--color-signal) 40%, transparent)'
              : 'none',
          }}
        />
        <div className="flex h-3 items-center gap-1" aria-hidden="true">
          {elements.map((element, index) => (
            <span
              key={index}
              className="h-1.5 rounded-full"
              style={{
                width: element.type === 'dash' ? '18px' : '6px',
                background: index < sent ? 'var(--color-signal)' : 'var(--color-line)',
              }}
            />
          ))}
        </div>
      </div>
    </Panel>
  )
}

/** The tree filling in, stage by stage. */
export function TreeDemo() {
  const ref = useRef<HTMLAnchorElement>(null)

  // One stage of the curriculum per beat, so the demo shows the real unlock
  // order rather than lighting random nodes.
  const stages = LEARNING_STAGES
  const beatMs = 900
  const durationMs = stages.length * beatMs

  const { elapsed, reducedMotion } = useAutoLoop(ref, { durationMs, pauseMs: 1200 })
  const revealed = reducedMotion ? stages.length : revealedStages(elapsed, beatMs, stages.length)

  const lit = useMemo(() => {
    const set = new Set<string>()
    for (const stage of stages.slice(0, revealed)) for (const character of stage) set.add(character)
    return set
  }, [stages, revealed])

  const layout = useMemo(() => layoutTree(MORSE_TREE), [])
  const byCode = useMemo(() => new Map(layout.map((entry) => [entry.node.code, entry])), [layout])

  const width = 260
  const height = 96
  const place = (x: number, y: number) => ({ cx: 8 + x * (width - 16), cy: 6 + y * (height - 12) })

  const power = Math.round((lit.size / 26) * 100)

  return (
    <Panel
      demoRef={ref}
      href="/tree/"
      title="Watch the network come online"
      caption="Every letter sits where its own code spells it out. Master one and the node lights."
    >
      <div className="flex w-full flex-col items-center gap-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" aria-hidden="true">
          {layout.map((entry) => {
            if (entry.node.depth === 0) return null
            const parent = byCode.get(entry.node.code.slice(0, -1))
            if (!parent) return null
            const a = place(parent.x, parent.y)
            const b = place(entry.x, entry.y)
            const on = entry.node.character !== null && lit.has(entry.node.character)
            return (
              <line
                key={`t${entry.node.code}`}
                x1={a.cx}
                y1={a.cy}
                x2={b.cx}
                y2={b.cy}
                stroke={on ? 'var(--color-signal-dim)' : 'var(--color-line)'}
                strokeWidth={0.7}
              />
            )
          })}
          {layout.map((entry) => {
            const { cx, cy } = place(entry.x, entry.y)
            const isRoot = entry.node.depth === 0
            const on = isRoot || (entry.node.character !== null && lit.has(entry.node.character))
            return (
              <circle
                key={`n${entry.node.code || 'root'}`}
                cx={cx}
                cy={cy}
                r={isRoot ? 3 : 2.2}
                fill={
                  on ? (isRoot ? 'var(--color-cyan)' : 'var(--color-signal)') : 'var(--color-line)'
                }
              />
            )
          })}
        </svg>
        <span className="font-mono text-[10px] tracking-[0.16em] text-signal">
          ⚡ {power}% POWER
        </span>
      </div>
    </Panel>
  )
}

/** The signal lamp, flashing a word. */
export function LampDemo() {
  const ref = useRef<HTMLAnchorElement>(null)
  const word = 'CQ'

  const morse = useMemo(() => encode(word), [])
  const timeline = useMemo(() => buildTimeline(morse, { wpm: DEMO_WPM }), [morse])
  const durationMs = useMemo(() => timelineDuration(timeline), [timeline])
  const { elapsed, reducedMotion } = useAutoLoop(ref, { durationMs })

  const lit = !reducedMotion && playheadAt(timeline, elapsed).on

  return (
    <Panel
      demoRef={ref}
      href="/morse-code-translator/"
      title="Hear it, or see it"
      caption="Real CW audio at any speed, and a signal lamp for reading it by light."
    >
      <div className="flex w-full flex-col items-center gap-3">
        <div
          aria-hidden="true"
          className="h-12 w-32 rounded-lg border"
          style={{
            borderColor: lit ? 'var(--color-signal)' : 'var(--color-line)',
            background: lit ? 'var(--color-signal)' : 'var(--color-void)',
            boxShadow: lit
              ? '0 0 30px color-mix(in srgb, var(--color-signal) 55%, transparent)'
              : 'none',
          }}
        />
        <span className="font-mono text-xs tracking-[0.2em] text-cyan">{prettify(morse)}</span>
      </div>
    </Panel>
  )
}

export function FeatureDemos() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <KeyDemo />
      <TreeDemo />
      <LampDemo />
    </div>
  )
}
