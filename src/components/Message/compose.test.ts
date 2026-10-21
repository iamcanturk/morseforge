import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../../storage/settings'
import { Compose, readyAnnouncement, type ShareState } from './Compose'
import type { useWire } from './useWire'

/** An idle wire: the composer only reads it while something plays. */
const wire: ReturnType<typeof useWire> = {
  playing: false,
  lit: false,
  cell: -1,
  audioFailed: false,
  send: async () => {},
  stop: () => {},
}

const render = (replyTo: string | null) =>
  renderToStaticMarkup(createElement(Compose, { settings: defaultSettings(), wire, replyTo }))

describe('replying to a message (J-17)', () => {
  it('quotes the message being answered above the form', () => {
    const html = render('MEET ME AT NOON!')
    expect(html).toContain('Replying to')
    expect(html).toContain('MEET ME AT NOON!')
    expect(html.indexOf('Replying to')).toBeLessThan(html.indexOf('Your message'))
  })

  it('renders the quoted text as text, never as markup', () => {
    const html = render('<b>HI</b>')
    expect(html).not.toContain('<b>HI</b>')
    expect(html).toContain('&lt;b&gt;HI&lt;/b&gt;')
  })

  it('offers the answers an operator sends back, as chips', () => {
    const html = render('MEET ME AT NOON!')
    for (const reply of ['R R', '73', 'OK']) {
      expect(html).toMatch(new RegExp(`<button[^>]*class="mf-chip-link"[^>]*>${reply}</button>`))
    }
  })

  it('stays a plain composer when it is not a reply', () => {
    const html = render(null)
    expect(html).not.toContain('Replying to')
    expect(html).toContain('Need an idea?')
    expect(html).toMatch(/<button[^>]*class="mf-chip-link"[^>]*>SOS<\/button>/)
  })
})

describe('the link-ready announcement (A11Y-20)', () => {
  const states: ShareState[] = ['idle', 'shared', 'copied', 'copy-failed']

  it('is one short sentence, whatever happened to the link', () => {
    for (const share of states) {
      const said = readyAnnouncement(share, [])
      expect(said).toMatch(/^Link ready/)
      expect(said.split('. ').length).toBeLessThanOrEqual(2)
      expect(said.length).toBeLessThan(60)
    }
  })

  it('names what was earned, after the link', () => {
    expect(readyAnnouncement('idle', ['CQ CQ CQ'])).toBe(
      'Link ready. Share it, copy it or open it. Earned: CQ CQ CQ.',
    )
  })

  it('is mounted, empty, before there is a link, so its first message is heard', () => {
    const html = render(null)
    expect(html).toContain('<p role="status" class="sr-only"></p>')
    expect(html).not.toContain('aria-live="polite" aria-labelledby')
  })
})
