/**
 * What a message is, and how one becomes a string.
 *
 * A message is either a string with `{name}` placeholders, or a set of plural
 * forms keyed by `Intl.PluralRules` category and chosen by the `count` param:
 *
 *   'Stage {n}, {characters}: {status}'
 *   { one: '{count} character', other: '{count} characters' }
 *
 * Both are plain data, so a catalog slice can be handed to a React island as a
 * prop. Inline markup (`<strong>`, a link) is spelled as tags inside the string
 * and rendered by `rich.ts`; it is never parsed as HTML.
 *
 * The placeholder names are read from the English string's own type, so
 * `t('lesson.stageStatus', { n: 1 })` fails to compile when `characters` or
 * `status` is missing. That is how a figure is kept out of the catalog: the
 * sentence has a slot, and the call site fills it from `FACTS`.
 */

/** The plural categories `Intl.PluralRules` can return. `other` is always required. */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

export type PluralMessage = { readonly other: string } & {
  readonly [C in Exclude<PluralCategory, 'other'>]?: string
}

export type Message = string | PluralMessage

/** A value a placeholder accepts. */
export type ParamValue = string | number

/** `'a {x} b {y}'` → `'x' | 'y'`. */
export type PlaceholderNames<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | PlaceholderNames<Rest>
  : never

/** Every placeholder a message uses; a plural message also takes `count`. */
export type MessagePlaceholders<M> = M extends string
  ? PlaceholderNames<M>
  : M extends PluralMessage
    ? 'count' | PlaceholderNames<Extract<M[keyof M], string>>
    : never

/** The params object a message needs, or `never` when it takes none. */
export type MessageParams<M> = [MessagePlaceholders<M>] extends [never]
  ? never
  : { readonly [P in MessagePlaceholders<M>]: P extends 'count' ? number : ParamValue }

export function isPlural(message: Message): message is PluralMessage {
  return typeof message === 'object' && message !== null && typeof message.other === 'string'
}

const PLACEHOLDER = /\{([A-Za-z][\w]*)\}/g

/** The placeholder names in a message, sorted. For the catalog tests. */
export function placeholdersOf(message: Message): string[] {
  const texts = isPlural(message) ? Object.values(message) : [message]
  const names = new Set<string>()
  for (const text of texts) {
    for (const match of String(text).matchAll(PLACEHOLDER)) names.add(match[1]!)
  }
  if (isPlural(message)) names.add('count')
  return [...names].sort()
}

const pluralRules = new Map<string, Intl.PluralRules>()

function rulesFor(lang: string): Intl.PluralRules {
  let rules = pluralRules.get(lang)
  if (!rules) {
    rules = new Intl.PluralRules(lang)
    pluralRules.set(lang, rules)
  }
  return rules
}

/** The form of a plural message that `count` selects in `lang`. */
export function selectPlural(message: PluralMessage, count: number, lang: string): string {
  const category = rulesFor(lang).select(count) as PluralCategory
  return message[category] ?? message.other
}

/**
 * Fill a message's placeholders.
 *
 * A placeholder with no value is left as written, `{name}`, rather than
 * becoming "undefined": a gap a reader can see and a test can find.
 */
export function interpolate(
  text: string,
  params: Readonly<Record<string, ParamValue>> = {},
): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name]
    return value === undefined ? whole : String(value)
  })
}

/** A message as a finished string in `lang`. */
export function formatMessage(
  message: Message,
  params: Readonly<Record<string, ParamValue>> | undefined,
  lang: string,
): string {
  if (!isPlural(message)) return interpolate(message, params)
  const count = params?.count
  if (typeof count !== 'number') {
    throw new TypeError('A plural message needs a numeric `count` param.')
  }
  return interpolate(selectPlural(message, count, lang), params)
}
