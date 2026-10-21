import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decodeMessageLink, encodeMessageLink } from '../../game/messageLink'
import { MESSAGE_KEY, isPageAnchor } from './MessageDesk'

/**
 * The page's inline script decides, before anything is painted, whether a
 * message is waiting (and so whether the pitch for writing one is hidden). It
 * runs before any module loads, so it carries its own test for `m=`; these
 * pin that test to the links the composer builds and to the anchors the page
 * itself uses.
 */
const page = readFileSync(
  fileURLToPath(new URL('../../pages/message.astro', import.meta.url)),
  'utf8',
)
const source = /dataset\.message = (\/.+?\/)\.test\(location\.hash\)/.exec(page)?.[1]
const inline = new RegExp(source?.slice(1, -1) ?? '(?!)')

describe('the /message/ inline script', () => {
  it('tests the hash for the m= key, exactly as the island does', () => {
    expect(source).toBe(String(MESSAGE_KEY))
  })

  it('marks every link the composer builds as incoming', () => {
    for (const wpm of [null, 20]) {
      const result = encodeMessageLink('MEET AT NINE', { wpm })
      if (!result.ok) throw new Error('expected a link')
      expect(inline.test(result.hash)).toBe(true)
    }
    expect(inline.test('#wpm=20&m=SGk')).toBe(true)
  })

  it('leaves the skip link and other anchors on the composer, as the island does', () => {
    for (const hash of ['', '#', '#main', '#faq', '#top', '#SOS', '#xm=1']) {
      expect(inline.test(hash)).toBe(false)
      // The island agrees: none of these is a message, broken or otherwise.
      expect(decodeMessageLink(hash)).toEqual({ ok: false, problem: 'none' })
    }
  })
})

describe('isPageAnchor', () => {
  const none = () => false
  const read = (hash: string, ids: (id: string) => boolean = none) =>
    isPageAnchor(hash, decodeMessageLink(hash), ids)

  it('treats the skip link and other anchors as navigation', () => {
    for (const hash of ['#main', '#faq', '#top', '#SOS', '#wpm=20', '#xm=1']) {
      expect(read(hash)).toBe(true)
    }
  })

  it('never treats an m= link as navigation, broken or whole', () => {
    const link = encodeMessageLink('HI')
    if (!link.ok) throw new Error('expected a link')
    expect(read(link.hash)).toBe(false)
    expect(read('#m=!!!')).toBe(false)
    expect(read('#m=')).toBe(false)
  })

  it('leaves an empty hash to the desk', () => {
    expect(read('')).toBe(false)
    expect(read('#')).toBe(false)
  })

  it('reads a bare payload as a message unless it names an element', () => {
    const link = encodeMessageLink('HI')
    if (!link.ok) throw new Error('expected a link')
    const bare = `#${link.hash.slice('#m='.length)}`
    expect(decodeMessageLink(bare).ok).toBe(true)
    expect(read(bare)).toBe(false)
    expect(read(bare, (id) => id === bare.slice(1))).toBe(true)
  })
})
