import { describe, expect, it, vi } from 'vitest'
import { IN_VIEW_THRESHOLD, isInView, watchInView } from './useInView'
import { KeyEngine, bindKeyboard } from '../../engine/keyEngine'

/** An IntersectionObserver the test drives by hand. */
function fakeObserver() {
  const made: { callback: IntersectionObserverCallback; options?: IntersectionObserverInit }[] = []
  const disconnect = vi.fn()
  class Observer {
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      made.push({ callback, options })
    }
    observe() {}
    disconnect = disconnect
  }
  const fire = (isIntersecting: boolean, intersectionRatio: number) =>
    made
      .at(-1)!
      .callback(
        [{ isIntersecting, intersectionRatio } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
  return { Observer, made, fire, disconnect }
}

const element = {} as Element

describe('isInView', () => {
  it('needs the element visible by at least the threshold', () => {
    expect(isInView({ isIntersecting: false, intersectionRatio: 0 })).toBe(false)
    expect(isInView({ isIntersecting: true, intersectionRatio: 0.1 })).toBe(false)
    expect(isInView({ isIntersecting: true, intersectionRatio: IN_VIEW_THRESHOLD })).toBe(true)
    expect(isInView({ isIntersecting: true, intersectionRatio: 1 })).toBe(true)
  })

  it('accepts a crossing reported a hair under the threshold', () => {
    expect(isInView({ isIntersecting: true, intersectionRatio: IN_VIEW_THRESHOLD - 0.001 })).toBe(
      true,
    )
  })
})

describe('watchInView', () => {
  it('reports each change and watches the threshold crossing', () => {
    const fake = fakeObserver()
    const onChange = vi.fn()
    const stop = watchInView(element, onChange, { Observer: fake.Observer })
    expect(fake.made[0]!.options?.threshold).toEqual([0, IN_VIEW_THRESHOLD])

    fake.fire(false, 0)
    fake.fire(true, 0.6)
    expect(onChange.mock.calls).toEqual([[false], [true]])

    stop()
    expect(fake.disconnect).toHaveBeenCalled()
  })

  it('keeps the key working where the browser has no observer', () => {
    const onChange = vi.fn()
    watchInView(element, onChange, { Observer: undefined })
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('Space on a page whose instrument is out of view', () => {
  /** The screen's wiring: bound only while in view, as useMorseKey does with `windowKeys`. */
  function wire() {
    const listeners = new Map<string, Set<(event: unknown) => void>>()
    const page = {
      addEventListener(type: string, handler: (event: unknown) => void) {
        listeners.set(type, (listeners.get(type) ?? new Set()).add(handler))
      },
      removeEventListener(type: string, handler: (event: unknown) => void) {
        listeners.get(type)?.delete(handler)
      },
      /** Space on the page background; true if the page's own scroll was cancelled. */
      space(type: 'keydown' | 'keyup') {
        let prevented = false
        const event = {
          key: ' ',
          repeat: false,
          target: { tagName: 'BODY', getAttribute: () => null },
          timeStamp: 0,
          preventDefault: () => {
            prevented = true
          },
        }
        for (const handler of listeners.get(type) ?? []) handler(event)
        return prevented
      },
    }
    const onKeyDown = vi.fn()
    const engine = new KeyEngine({ wpm: 20 }, { onKeyDown })
    let unbind: (() => void) | null = null
    const fake = fakeObserver()
    watchInView(
      element,
      (inView) => {
        unbind?.()
        unbind = inView ? bindKeyboard(engine, undefined, page) : null
      },
      { Observer: fake.Observer },
    )
    return { page, fake, onKeyDown }
  }

  it('scrolls the page and keys nothing while the instrument is off screen', () => {
    const { page, fake, onKeyDown } = wire()
    fake.fire(false, 0)
    expect(page.space('keydown')).toBe(false)
    expect(onKeyDown).not.toHaveBeenCalled()
  })

  it('keys again once the instrument is back in view', () => {
    const { page, fake, onKeyDown } = wire()
    fake.fire(false, 0)
    fake.fire(true, 0.8)
    expect(page.space('keydown')).toBe(true)
    expect(onKeyDown).toHaveBeenCalledTimes(1)
  })
})
