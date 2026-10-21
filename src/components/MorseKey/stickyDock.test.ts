import { describe, expect, it } from 'vitest'
import {
  STICKY_EXTRA,
  STICKY_GAP_PX,
  publishStickyDock,
  stickyExtra,
  type DockEnvironment,
} from './stickyDock'

/** A dock whose stickiness and height a test can change, and a root that records its style. */
function fake(initial: { sticky: boolean; height: number }) {
  const dock = { ...initial }
  const style = new Map<string, string>()
  let onChange: (() => void) | null = null
  let watching = false
  const env: DockEnvironment<typeof dock> = {
    root: {
      style: {
        setProperty: (name: string, value: string | null) => void style.set(name, value ?? ''),
        removeProperty: (name: string) => {
          const before = style.get(name) ?? ''
          style.delete(name)
          return before
        },
      },
    },
    isSticky: (element) => element.sticky,
    height: (element) => element.height,
    watch: (_element, change) => {
      onChange = change
      watching = true
      return () => {
        watching = false
        onChange = null
      }
    },
  }
  return {
    dock,
    env,
    style,
    change: (next: Partial<typeof dock>) => {
      Object.assign(dock, next)
      onChange?.()
    },
    watching: () => watching,
  }
}

describe('the value published for the dock', () => {
  it('is its height, rounded up, plus the gap, while it sticks', () => {
    expect(stickyExtra(true, 141.2)).toBe(`${142 + STICKY_GAP_PX}px`)
  })

  it('is nothing when it does not stick or has no size', () => {
    expect(stickyExtra(false, 141)).toBeNull()
    expect(stickyExtra(true, 0)).toBeNull()
    expect(stickyExtra(true, Number.NaN)).toBeNull()
  })
})

describe('publishing the dock into the scroll padding (A11Y-04)', () => {
  it('sets the property while the dock sticks, so a focused key clears the tape', () => {
    const f = fake({ sticky: true, height: 140 })
    publishStickyDock(f.dock, f.env)
    expect(f.style.get(STICKY_EXTRA)).toBe(`${140 + STICKY_GAP_PX}px`)
  })

  it('follows the dock as it grows', () => {
    const f = fake({ sticky: true, height: 140 })
    publishStickyDock(f.dock, f.env)
    f.change({ height: 180 })
    expect(f.style.get(STICKY_EXTRA)).toBe(`${180 + STICKY_GAP_PX}px`)
  })

  it('removes it when the dock stops sticking: a wide or a short screen (A11Y-13)', () => {
    const f = fake({ sticky: true, height: 140 })
    publishStickyDock(f.dock, f.env)
    f.change({ sticky: false })
    expect(f.style.has(STICKY_EXTRA)).toBe(false)
  })

  it('never sets it for a dock that does not stick', () => {
    const f = fake({ sticky: false, height: 140 })
    publishStickyDock(f.dock, f.env)
    expect(f.style.has(STICKY_EXTRA)).toBe(false)
  })

  it('clears it and stops watching when the dock goes away', () => {
    const f = fake({ sticky: true, height: 140 })
    const stop = publishStickyDock(f.dock, f.env)
    stop()
    expect(f.style.has(STICKY_EXTRA)).toBe(false)
    expect(f.watching()).toBe(false)
  })
})
