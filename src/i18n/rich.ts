/**
 * Inline markup inside a message, as a tree, never as HTML.
 *
 * A sentence that bolds a word or links a phrase keeps the whole sentence in
 * one message, because a translator has to be able to move the link: "read
 * <tree>the Morse tree</tree> first" may need the link at the other end in
 * another language. Tags have no attributes. The caller says what each name
 * becomes (`tree` → a link to `/tree/`), so a catalog can never inject an
 * element, a URL or a class.
 *
 *   parseRich('Hold <kbd>Space</kbd> for a dash')
 *   → ['Hold ', { tag: 'kbd', children: ['Space'] }, ' for a dash']
 *
 * Placeholders are filled after parsing, inside the text nodes only, so a
 * value that happens to contain `<` stays text.
 */

import { interpolate, type ParamValue } from './message'

export interface RichElement {
  tag: string
  children: RichNode[]
}

export type RichNode = string | RichElement

const TAG = /<(\/?)([A-Za-z][\w-]*)>/g

/**
 * Parse a message into text and elements. An unmatched closing tag is kept as
 * text and an unclosed opening tag closes at the end of the string, so a typo
 * in a translation shows up as a visible tag rather than as lost words.
 */
export function parseRich(text: string): RichNode[] {
  const root: RichElement = { tag: '', children: [] }
  const stack: RichElement[] = [root]
  let last = 0
  for (const match of text.matchAll(TAG)) {
    const at = match.index ?? 0
    const top = stack.at(-1)!
    if (at > last) top.children.push(text.slice(last, at))
    last = at + match[0].length
    const [, closing, name] = match
    if (!closing) {
      const element: RichElement = { tag: name!, children: [] }
      top.children.push(element)
      stack.push(element)
      continue
    }
    if (stack.length > 1 && top.tag === name) {
      stack.pop()
    } else {
      top.children.push(match[0])
    }
  }
  if (last < text.length) stack.at(-1)!.children.push(text.slice(last))
  return root.children
}

/** Fill placeholders in every text node of a parsed tree. */
export function fillRich(
  nodes: readonly RichNode[],
  params: Readonly<Record<string, ParamValue>> = {},
): RichNode[] {
  return nodes.map((node) =>
    typeof node === 'string'
      ? interpolate(node, params)
      : { tag: node.tag, children: fillRich(node.children, params) },
  )
}

/** The text a tree shows, tags removed: what a reader sees. */
export function richText(nodes: readonly RichNode[]): string {
  return nodes.map((node) => (typeof node === 'string' ? node : richText(node.children))).join('')
}

/** The tag names a message uses, for the catalog test that compares languages. */
export function richTags(text: string): string[] {
  const names = new Set<string>()
  for (const match of text.matchAll(TAG)) if (!match[1]) names.add(match[2]!)
  return [...names].sort()
}

/** A message with its tags removed. */
export function stripTags(text: string): string {
  return richText(parseRich(text))
}
