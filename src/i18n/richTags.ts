/**
 * What a tag in a message becomes. Shared by the Astro and the React renderer
 * so the two cannot disagree.
 *
 * A caller names its tags: `{ tree: { href: '/tree/' } }` turns
 * `<tree>the tree</tree>` into a link, localised to the page's language. A
 * name the caller does not define falls back to the HTML element of the same
 * name when it is one of the inline ones below, and to its bare text
 * otherwise, so a catalog cannot put an element on the page that the
 * component did not allow.
 */

export type RichElementName =
  | 'a'
  | 'abbr'
  | 'b'
  | 'cite'
  | 'code'
  | 'em'
  | 'i'
  | 'kbd'
  | 'mark'
  | 'q'
  | 'small'
  | 'span'
  | 'strong'
  | 'sub'
  | 'sup'

export interface RichTagSpec {
  /** The element. Default `a` when `href` is set, else `span`. */
  el?: RichElementName
  href?: string
  class?: string
  rel?: string
  title?: string
  lang?: string
  target?: string
  'aria-hidden'?: 'true'
}

export type RichTags = Readonly<Record<string, RichTagSpec>>

/** Inline elements a message may use by name without the caller defining them. */
const INLINE = new Set<RichElementName>([
  'abbr',
  'b',
  'cite',
  'code',
  'em',
  'i',
  'kbd',
  'mark',
  'q',
  'small',
  'strong',
  'sub',
  'sup',
])

/** The spec for a tag name, or null to render its children bare. */
export function resolveTag(name: string, tags: RichTags | undefined): RichTagSpec | null {
  const spec = tags?.[name]
  if (spec) return { ...spec, el: spec.el ?? (spec.href !== undefined ? 'a' : 'span') }
  if (INLINE.has(name as RichElementName)) return { el: name as RichElementName }
  return null
}
