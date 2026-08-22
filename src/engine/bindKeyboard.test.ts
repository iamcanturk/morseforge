import { describe, expect, it, vi } from 'vitest'
import { KeyEngine, bindKeyboard } from './keyEngine'

/** A stand-in for `window` that lets a test dispatch by hand. */
function fakeTarget() {
  const listeners = new Map<string, Set<(event: unknown) => void>>()
  return {
    addEventListener(type: string, handler: (event: unknown) => void) {
      const set = listeners.get(type) ?? new Set()
      set.add(handler)
      listeners.set(type, set)
    },
    removeEventListener(type: string, handler: (event: unknown) => void) {
      listeners.get(type)?.delete(handler)
    },
    dispatch(type: string, event: Record<string, unknown>) {
      const prevented = { value: false }
      const full = {
        preventDefault: () => {
          prevented.value = true
        },
        target: null,
        repeat: false,
        ...event,
      }
      for (const handler of listeners.get(type) ?? []) handler(full)
      return prevented.value
    },
    count() {
      return [...listeners.values()].reduce((sum, set) => sum + set.size, 0)
    },
  }
}

/** A DOM-free stand-in for an element. */
const element = (tagName: string, attrs: Record<string, string> = {}) => ({
  tagName,
  isContentEditable: false,
  getAttribute: (name: string) => attrs[name] ?? null,
})

function setup() {
  let now = 0
  const engine = new KeyEngine(
    { wpm: 20 },
    {},
    // An injected clock, so nothing here depends on wall time.
    { now: () => now, setTimeout: () => 0, clearTimeout: () => {} },
  )
  const target = fakeTarget()
  const onSubmit = vi.fn()
  const unbind = bindKeyboard(engine, undefined, target as never, onSubmit)
  return { engine, target, onSubmit, unbind, advance: (ms: number) => (now += ms) }
}

describe('keying', () => {
  it('presses and releases on the bound key', () => {
    const { engine, target, advance } = setup()
    target.dispatch('keydown', { key: ' ' })
    expect(engine.isPressed).toBe(true)
    advance(60)
    target.dispatch('keyup', { key: ' ' })
    expect(engine.isPressed).toBe(false)
  })

  it('ignores auto-repeat, which would read as a burst of dots', () => {
    const { engine, target } = setup()
    target.dispatch('keydown', { key: ' ' })
    target.dispatch('keydown', { key: ' ', repeat: true })
    expect(engine.isPressed).toBe(true)
  })

  it('prevents the default so holding Space does not scroll the page', () => {
    const { target } = setup()
    expect(target.dispatch('keydown', { key: ' ' })).toBe(true)
  })

  it('unbinds everything it added', () => {
    const { target, unbind } = setup()
    expect(target.count()).toBeGreaterThan(0)
    unbind()
    expect(target.count()).toBe(0)
  })
})

describe('events aimed at something interactive', () => {
  // The listener is on `window`, so it sees every key event on the page, and a
  // preventDefault in the bubble phase still cancels the activation. Without
  // this, binding the key to Space meant no button or link anywhere on the page
  // could be activated from the keyboard — on the telegraph, where the key is
  // bound for the whole life of the page, that included the skip link.
  const interactive = [
    element('BUTTON'),
    element('A'),
    element('INPUT'),
    element('TEXTAREA'),
    element('SELECT'),
    element('SUMMARY'),
    element('G', { role: 'button' }),
    element('DIV', { role: 'link' }),
    element('SPAN', { role: 'switch' }),
    { tagName: 'DIV', isContentEditable: true, getAttribute: () => null },
  ]

  it('leaves the default alone, so the button still activates', () => {
    for (const target of interactive) {
      const { target: bus } = setup()
      expect(bus.dispatch('keydown', { key: ' ', target }), String(target.tagName)).toBe(false)
    }
  })

  it('does not start keying', () => {
    for (const target of interactive) {
      const { engine, target: bus } = setup()
      bus.dispatch('keydown', { key: ' ', target })
      expect(engine.isPressed, String(target.tagName)).toBe(false)
    }
  })

  it('leaves Enter alone too, since that is how a link is followed', () => {
    const { target, engine } = setup()
    expect(target.dispatch('keydown', { key: 'Enter', target: element('A') })).toBe(false)
    expect(engine.isPressed).toBe(false)
  })

  it('does not fire submit either', () => {
    const { target, onSubmit } = setup()
    target.dispatch('keydown', { key: 'Control', target: element('BUTTON') })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('still keys when focus is on the page background', () => {
    const { engine, target } = setup()
    target.dispatch('keydown', { key: ' ', target: element('BODY') })
    expect(engine.isPressed).toBe(true)
  })

  it('still keys when the event has no target at all', () => {
    const { engine, target } = setup()
    target.dispatch('keydown', { key: ' ' })
    expect(engine.isPressed).toBe(true)
  })

  it('releases a hold if focus lands on a button mid-press', () => {
    // Otherwise the tone hangs: the keyup never reaches the engine.
    const { engine, target } = setup()
    target.dispatch('keydown', { key: ' ' })
    expect(engine.isPressed).toBe(true)
    target.dispatch('keyup', { key: ' ', target: element('BUTTON') })
    expect(engine.isPressed).toBe(false)
  })
})

describe('the other bindings', () => {
  it('resets on the cancel key', () => {
    const { engine, target } = setup()
    target.dispatch('keydown', { key: ' ' })
    target.dispatch('keydown', { key: 'Escape' })
    expect(engine.isPressed).toBe(false)
  })

  it('fires submit on the submit key', () => {
    const { target, onSubmit } = setup()
    target.dispatch('keydown', { key: 'Control' })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('ignores keys it was not given', () => {
    const { engine, target } = setup()
    expect(target.dispatch('keydown', { key: 'q' })).toBe(false)
    expect(engine.isPressed).toBe(false)
  })
})
