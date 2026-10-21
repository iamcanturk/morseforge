import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MorseKey } from './MorseKey'
import { inIsland } from '../../i18n/testing'

const noop = () => {}
const handlers = {
  onPointerDown: noop,
  onPointerUp: noop,
  onPointerLeave: noop,
  onPointerCancel: noop,
}

const render = (isDown: boolean) =>
  renderToStaticMarkup(
    inIsland(
      createElement(MorseKey, {
        isDown,
        pending: isDown ? '.' : '',
        preview: isDown ? 'E' : null,
        commitProgress: 0,
        autoCommit: true,
        pointerHandlers: handlers,
      }),
      'telegraph',
    ),
  )

describe('the on-screen Morse key (A11Y-21)', () => {
  it('is a plain button, never a toggle, up or down', () => {
    for (const isDown of [false, true]) {
      const html = render(isDown)
      expect(html).toMatch(/<button[^>]*aria-label="Morse key\./)
      expect(html).not.toContain('aria-pressed')
    }
  })

  it('still marks its state for the drawing, outside the accessibility tree', () => {
    expect(render(true)).toContain('data-down="true"')
    expect(render(false)).toContain('data-down="false"')
  })
})
