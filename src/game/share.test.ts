import { describe, expect, it } from 'vitest'
import { clipboardText, shareData, type ShareMessage } from './share'

const message: ShareMessage = {
  title: 'MorseForge: beat 372',
  text: 'I scored 372. Can you beat it?',
  url: 'https://morse.example/challenge/?seed=k7f3&beat=372',
}

describe('shareData (DEC-035)', () => {
  it('passes the link only as url', () => {
    const data = shareData(message)
    expect(data).toEqual({ title: message.title, text: message.text, url: message.url })
    expect(data.text).not.toContain(message.url)
  })

  it('moves the link into the text when an image is attached, since targets drop url beside files', () => {
    const file = new File(['x'], 'card.png', { type: 'image/png' })
    const data = shareData(message, [file])
    expect(data).toEqual({
      title: message.title,
      text: `${message.text}\n${message.url}`,
      files: [file],
    })
    expect(data).not.toHaveProperty('url')
    expect(shareData(message, [])).toEqual(shareData(message))
  })
})

describe('clipboardText', () => {
  it('puts the link after the text, once', () => {
    expect(clipboardText(message)).toBe(`${message.text} ${message.url}`)
    expect(clipboardText(message, '\n')).toBe(`${message.text}\n${message.url}`)
    expect(clipboardText(message).split(message.url)).toHaveLength(2)
  })
})
