import { describe, expect, it } from 'vitest'
import {
  cleanMessage,
  localDate,
  messageSize,
  telegramDescription,
  telegramMessageUrl,
  telegramShare,
  telegramText,
  telegraphUrl,
  wrapLines,
} from './telegramCard'
import { encode, prettify } from '../../engine/morseEncoder'
import { SITE } from '../../config/site'
import {
  MESSAGE_MAX,
  MESSAGE_PATH,
  decodeMessageLink,
  encodeMessageLink,
} from '../../game/messageLink'

describe('telegramText', () => {
  it('carries the message, its Morse derived by encode(), and the link', () => {
    const text = telegramText('  hello   world ', SITE.url)
    const lines = text.split('\n')
    expect(lines[0]).toBe('HELLO WORLD STOP')
    expect(lines[1]).toBe(prettify(encode('HELLO WORLD')))
    expect(text).toContain(`${SITE.url}/telegraph/`)
  })
})

describe('telegramShare (DEC-035)', () => {
  it('passes the link that plays the message only as url, never inside the text', () => {
    const share = telegramShare(' cq  de forge ', SITE.url)
    expect(share.url).toBe(telegramMessageUrl('CQ DE FORGE', SITE.url))
    expect(share.text).not.toContain('http')
    expect(share.text.split('\n').slice(0, 2)).toEqual([
      'CQ DE FORGE STOP',
      prettify(encode('CQ DE FORGE')),
    ])
  })

  it('falls back to the telegraph as its url when the message cannot travel in a link', () => {
    const share = telegramShare('E'.repeat(MESSAGE_MAX + 1), SITE.url)
    expect(share.url).toBe(telegraphUrl(SITE.url))
    expect(share.text).not.toContain('http')
  })

  it('leaves the clipboard text carrying the links', () => {
    const share = telegramShare('SOS', SITE.url)
    expect(telegramText('SOS', SITE.url)).toContain(share.url)
  })
})

describe('telegraphUrl', () => {
  it('points at the telegraph with or without a trailing slash on the site', () => {
    expect(telegraphUrl('https://example.test')).toBe('https://example.test/telegraph/')
    expect(telegraphUrl('https://example.test/')).toBe('https://example.test/telegraph/')
  })
})

describe('cleanMessage', () => {
  it('trims, single-spaces and upper-cases', () => {
    expect(cleanMessage(' cq  cq\tcq ')).toBe('CQ CQ CQ')
  })
})

describe('wrapLines', () => {
  it('wraps on word gaps within the budget', () => {
    expect(wrapLines('THE QUICK BROWN FOX', 10, 3)).toEqual(['THE QUICK', 'BROWN FOX'])
  })

  it('breaks a word longer than a line', () => {
    expect(wrapLines('ABCDEFGHIJKL', 5, 3)).toEqual(['ABCDE', 'FGHIJ', 'KL'])
  })

  it('ends in an ellipsis when it runs out of lines', () => {
    const lines = wrapLines('ONE TWO THREE FOUR FIVE SIX', 7, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1]?.endsWith('…')).toBe(true)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(7)
  })

  it('returns nothing for an empty message or an impossible budget', () => {
    expect(wrapLines('', 10, 3)).toEqual([])
    expect(wrapLines('ABC', 0, 3)).toEqual([])
  })

  it('fits every size class inside its own line budget', () => {
    for (const message of ['SOS', 'HELLO FROM THE NIGHT DESK', 'A'.repeat(120)]) {
      const size = messageSize(message)
      for (const line of wrapLines(message, size.perLine, 3)) {
        expect(line.length).toBeLessThanOrEqual(size.perLine)
      }
    }
  })
})

describe('messageSize', () => {
  it('sets short messages bigger', () => {
    expect(messageSize('SOS').px).toBeGreaterThan(messageSize('HELLO FROM THE DESK').px)
    expect(messageSize('HELLO FROM THE DESK').px).toBeGreaterThan(messageSize('A'.repeat(60)).px)
  })
})

describe('telegramDescription', () => {
  it('reads the message out', () => {
    expect(telegramDescription('hi there')).toContain('"HI THERE"')
  })
})

describe('localDate', () => {
  it('formats the local calendar day', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('the message link in the share', () => {
  it('adds a /message/ link that decodes back to the telegram', () => {
    const url = telegramMessageUrl(' cq  de forge ', SITE.url)
    expect(url).not.toBeNull()
    expect(url!.startsWith(`${SITE.url}${MESSAGE_PATH}#`)).toBe(true)
    const decoded = decodeMessageLink(new URL(url!).hash)
    expect(decoded).toEqual({ ok: true, message: { text: 'CQ DE FORGE', wpm: null } })
    expect(telegramText(' cq  de forge ', SITE.url)).toContain(`Hear it in Morse: ${url}`)
  })

  it('builds the same link the message page would', () => {
    const own = encodeMessageLink('SOS', { origin: SITE.url })
    expect(own.ok && own.url).toBe(telegramMessageUrl('sos', `${SITE.url}/`))
  })

  it('shares without the link past the message cap', () => {
    const long = 'E'.repeat(MESSAGE_MAX + 1)
    expect(telegramMessageUrl(long, SITE.url)).toBeNull()
    expect(telegramText(long, SITE.url)).not.toContain(MESSAGE_PATH)
    expect(telegramText(long, SITE.url)).toContain(`${SITE.url}/telegraph/`)
    expect(telegramMessageUrl('E'.repeat(MESSAGE_MAX), SITE.url)).not.toBeNull()
  })

  it('shares without the link when a character cannot travel in one', () => {
    expect(telegramMessageUrl('HI 🙂', SITE.url)).toBeNull()
    expect(telegramText('HI 🙂', SITE.url)).not.toContain(MESSAGE_PATH)
  })
})
