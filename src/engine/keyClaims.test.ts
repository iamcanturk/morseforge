import { beforeEach, describe, expect, it } from 'vitest'
import { KeyClaims, claimPress, guardClaimedKeys, keyClaims } from './keyClaims'
import { KeyEngine, bindKeyboard, inertKeyer } from './keyEngine'
import { createKeyer } from './keyer'

const space = { key: ' ', code: 'Space' }
const repeat = { ...space, repeat: true }

describe('the claim rule (TASK-040)', () => {
  it('leaves a press nobody claimed alone, repeats and keyup included', () => {
    // Out of view, or aimed at a button: Space scrolls, or presses the button.
    const claims = new KeyClaims()
    expect(claims.keyDown(space)).toBe(false)
    expect(claims.keyDown(repeat)).toBe(false)
    expect(claims.keyUp(space)).toBe(false)
  })

  it('cancels every repeat of a claimed press, and its keyup', () => {
    const claims = new KeyClaims()
    expect(claims.keyDown(space)).toBe(false) // the instrument handles this one
    claims.claim(space)
    for (let i = 0; i < 10; i += 1) expect(claims.keyDown(repeat)).toBe(true)
    expect(claims.keyUp(space)).toBe(true)
  })

  it('ends the claim with the keyup, so the next press starts unclaimed', () => {
    const claims = new KeyClaims()
    claims.claim(space)
    claims.keyUp(space)
    expect(claims.isClaimed(space)).toBe(false)
    expect(claims.keyDown(repeat)).toBe(false)
    expect(claims.keyUp(space)).toBe(false)
  })

  it('drops a claim whose keyup was lost when the key goes down afresh', () => {
    // Released over another window: no keyup. The next press must not inherit
    // the old claim, or Space would stop scrolling once the instrument is gone.
    const claims = new KeyClaims()
    claims.claim(space)
    expect(claims.keyDown(space)).toBe(false)
    expect(claims.isClaimed(space)).toBe(false)
    expect(claims.keyDown(repeat)).toBe(false)
  })

  it('forgets everything on clear, as on a window blur', () => {
    const claims = new KeyClaims()
    claims.claim(space)
    claims.claim({ key: '[', code: 'BracketLeft' })
    claims.clear()
    expect(claims.keyDown(repeat)).toBe(false)
    expect(claims.keyUp({ key: '[', code: 'BracketLeft' })).toBe(false)
  })

  it('tells keys apart, so a claimed paddle does not claim Space', () => {
    const claims = new KeyClaims()
    claims.claim({ key: '[', code: 'BracketLeft' })
    expect(claims.keyDown(repeat)).toBe(false)
    expect(claims.keyDown({ key: '[', code: 'BracketLeft', repeat: true })).toBe(true)
  })

  it('names a key by its physical code, so a keyup with another key value still ends it', () => {
    // Shift pressed mid-hold changes `key` on some layouts, never `code`.
    const claims = new KeyClaims()
    claims.claim({ key: '[', code: 'BracketLeft' })
    expect(claims.keyUp({ key: '{', code: 'BracketLeft' })).toBe(true)
  })

  it('falls back to the key value when the event has no code', () => {
    const claims = new KeyClaims()
    claims.claim({ key: ' ', code: '' })
    expect(claims.keyDown({ key: ' ', repeat: true })).toBe(true)
    expect(claims.keyUp({ key: ' ' })).toBe(true)
  })
})

describe('claimPress', () => {
  it('cancels the keydown it claims', () => {
    const claims = new KeyClaims()
    let prevented = false
    claimPress({ ...space, preventDefault: () => (prevented = true) }, claims)
    expect(prevented).toBe(true)
    expect(claims.isClaimed(space)).toBe(true)
  })
})

/** A stand-in for `window`; listeners run in the order added, as capture runs first. */
function fakeWindow() {
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
    /** Dispatch, and say whether anything cancelled the default action. */
    dispatch(type: string, event: Record<string, unknown> = {}) {
      let prevented = false
      const full = {
        key: ' ',
        code: 'Space',
        repeat: false,
        target: null,
        timeStamp: 0,
        ...event,
        preventDefault: () => {
          prevented = true
        },
      }
      for (const handler of listeners.get(type) ?? []) handler(full)
      return prevented
    },
    count() {
      return [...listeners.values()].reduce((sum, set) => sum + set.size, 0)
    },
  }
}

const button = { tagName: 'BUTTON', isContentEditable: false, getAttribute: () => null }

describe('a held key through bindKeyboard and the guard', () => {
  beforeEach(() => keyClaims.clear())

  function setup() {
    const target = fakeWindow()
    guardClaimedKeys(target as never, keyClaims)
    const engine = new KeyEngine(
      { wpm: 20 },
      {},
      { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    )
    const unbind = bindKeyboard(engine, undefined, target as never)
    return { target, engine, unbind }
  }

  it('cancels the first keydown, every repeat and the keyup of a dash', () => {
    // The bug: only the first keydown was cancelled, and each repeat scrolled.
    const { target, engine } = setup()
    expect(target.dispatch('keydown')).toBe(true)
    for (let i = 0; i < 10; i += 1) expect(target.dispatch('keydown', { repeat: true })).toBe(true)
    expect(engine.isPressed).toBe(true)
    expect(target.dispatch('keyup')).toBe(true)
    expect(engine.isPressed).toBe(false)
  })

  it('keeps cancelling the hold if focus lands on a button mid-press', () => {
    // The press was the instrument's: its keyup must not click the button.
    const { target } = setup()
    target.dispatch('keydown')
    expect(target.dispatch('keydown', { repeat: true, target: button })).toBe(true)
    expect(target.dispatch('keyup', { target: button })).toBe(true)
  })

  it('leaves Space on a focused button alone, so the button still activates', () => {
    const { target, engine } = setup()
    expect(target.dispatch('keydown', { target: button })).toBe(false)
    expect(target.dispatch('keydown', { target: button, repeat: true })).toBe(false)
    expect(target.dispatch('keyup', { target: button })).toBe(false)
    expect(engine.isPressed).toBe(false)
  })

  it('leaves the next press alone once the instrument stops listening', () => {
    // Scrolled out of view: the binding goes, and Space scrolls again.
    const { target, unbind } = setup()
    target.dispatch('keydown')
    target.dispatch('keyup')
    unbind()
    expect(target.dispatch('keydown')).toBe(false)
    expect(target.dispatch('keydown', { repeat: true })).toBe(false)
    expect(target.dispatch('keyup')).toBe(false)
  })

  it('stops cancelling after a blur, when no keyup will come', () => {
    const { target } = setup()
    target.dispatch('keydown')
    target.dispatch('blur')
    expect(keyClaims.isClaimed(space)).toBe(false)
  })

  it('claims the paddle keys on a paddle keyer, but never Ctrl', () => {
    // Ctrl doubles as a paddle on the USB adapter and stays the browser's.
    const target = fakeWindow()
    guardClaimedKeys(target as never, keyClaims)
    const keyer = createKeyer(
      'iambicB',
      { wpm: 20 },
      {},
      { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    )
    bindKeyboard(keyer, { key: ' ', dit: '[', dah: 'ControlRight' }, target as never)
    const dit = { key: '[', code: 'BracketLeft' }
    expect(target.dispatch('keydown', dit)).toBe(true)
    expect(target.dispatch('keydown', { ...dit, repeat: true })).toBe(true)
    expect(target.dispatch('keyup', dit)).toBe(true)
    const ctrl = { key: 'Control', code: 'ControlRight', ctrlKey: true }
    expect(target.dispatch('keydown', ctrl)).toBe(false)
    expect(target.dispatch('keydown', { ...ctrl, repeat: true })).toBe(false)
    expect(target.dispatch('keyup', ctrl)).toBe(false)
  })

  it('removes its listeners', () => {
    const target = fakeWindow()
    const unguard = guardClaimedKeys(target as never, keyClaims)
    expect(target.count()).toBe(3)
    unguard()
    expect(target.count()).toBe(0)
  })
})

describe('a locked instrument: claimed but inert (TASK-040)', () => {
  // The lesson locks the key for ~700 ms after a correct send. Unbinding it
  // then let a quick extra Space scroll the page a screen behind the lock.
  beforeEach(() => keyClaims.clear())

  function setup() {
    const target = fakeWindow()
    guardClaimedKeys(target as never, keyClaims)
    let keyed = 0
    const engine = new KeyEngine(
      { wpm: 20 },
      { onKeyDown: () => (keyed += 1), onElement: () => (keyed += 1) },
      { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    )
    const unbind = bindKeyboard(inertKeyer(engine), undefined, target as never)
    return { target, engine, unbind, keyed: () => keyed }
  }

  it('cancels the whole held press and keys nothing', () => {
    const { target, engine, keyed } = setup()
    expect(target.dispatch('keydown')).toBe(true)
    for (let i = 0; i < 10; i += 1) expect(target.dispatch('keydown', { repeat: true })).toBe(true)
    expect(target.dispatch('keyup')).toBe(true)
    expect(engine.isPressed).toBe(false)
    expect(keyed()).toBe(0)
  })

  it('still leaves a focused button, link or field alone', () => {
    const { target } = setup()
    expect(target.dispatch('keydown', { target: button })).toBe(false)
    expect(target.dispatch('keydown', { target: button, repeat: true })).toBe(false)
    expect(target.dispatch('keyup', { target: button })).toBe(false)
  })

  it('keeps cancelling a press claimed while locked after the lock ends', () => {
    // The step moves on mid-hold and the binding goes: the rest of that hold
    // is still the instrument's, and must not scroll either.
    const { target, unbind } = setup()
    target.dispatch('keydown')
    unbind()
    expect(target.dispatch('keydown', { repeat: true })).toBe(true)
    expect(target.dispatch('keyup')).toBe(true)
    expect(target.dispatch('keydown')).toBe(false)
  })

  it('answers to the same keys as the keyer it stands in for', () => {
    const keyer = createKeyer(
      'iambicA',
      { wpm: 20 },
      {},
      { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    )
    const inert = inertKeyer(keyer)
    expect(inert.kind).toBe('iambicA')
    inert.press(0, 'dit')
    expect(keyer.isPressed).toBe(false)
  })
})
