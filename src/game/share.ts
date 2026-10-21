/**
 * How every share on the site travels (DEC-035).
 *
 * A share has two forms, built from one message:
 *
 * - **The system share sheet** (`navigator.share`) gets the link only as
 *   `url`. Most share targets append the url to the text, so a text that also
 *   ends in the link posts it twice. The exception is an image share: there
 *   the link rides in the text instead (see `shareData`).
 * - **The clipboard** gets one text with the link in it, because a paste has
 *   no separate field to carry it, and a boast without a way back is a poster
 *   for nothing.
 *
 * So a `ShareMessage`'s `text` never contains its `url`. The challenge,
 * telegraph, daily and game shares all go through here (the daily builds the
 * same two forms in `dailyShare.ts`).
 */

export interface ShareMessage {
  title: string
  /** What the share says, without the link. */
  text: string
  /** The link back: passed as `url` to a share sheet, appended on the clipboard. */
  url: string
}

/**
 * What `navigator.share` gets: the link exactly once.
 *
 * Without files it goes in `url`. With an image attached, many targets keep
 * the file and the text but silently drop `url` — the image would then travel
 * without its way back, which is the one thing a share exists to carry. So
 * an image share moves the link into the text and sends no `url`.
 */
export function shareData(message: ShareMessage, files?: File[]): ShareData {
  if (files && files.length > 0) {
    return { title: message.title, text: clipboardText(message, '\n'), files }
  }
  return { title: message.title, text: message.text, url: message.url }
}

/** What the clipboard gets: the text, then the link. */
export function clipboardText(message: ShareMessage, separator: ' ' | '\n' = ' '): string {
  return `${message.text}${separator}${message.url}`
}
