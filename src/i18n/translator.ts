/**
 * `t()`: the one function every component calls for a string.
 *
 * It is built from a locale and a message table. On the server that table is
 * the whole catalog; in a React island it is only the namespaces that island
 * was handed (`islands.ts`), so the browser never downloads another
 * language's strings, or the rest of this one's. This file imports no
 * catalog, which is what keeps it safe to bundle.
 *
 * Besides messages, the translator carries the few locale-aware formatters
 * the copy needs: lists ("E and T"), number words ("seven"), and where a link
 * goes in this language (`href`).
 */

import { joinList } from '../data/format'
import { spokenCode } from '../engine/spokenCode'
import { localizePath, type LocaleDef } from './locales'
import {
  formatMessage,
  isPlural,
  selectPlural,
  type Message,
  type MessageParams,
  type ParamValue,
} from './message'
import { fillRich, parseRich, type RichNode } from './rich'
import type { MessageKey, Messages } from './keys'

/** The arguments after the key: none, or the params object the message needs. */
export type ParamsArg<K extends MessageKey> = [MessageParams<Messages[K]>] extends [never]
  ? []
  : [params: MessageParams<Messages[K]>]

/** The serialisable part of a locale, which is all an island needs to know about it. */
export type LocaleInfo = Pick<LocaleDef, 'code' | 'path' | 'lang' | 'dir'>

/** A table of resolved messages: strings and plural forms only, no markers. */
export type MessageTable = Readonly<Partial<Record<MessageKey, Message>>>

export interface Translator {
  <K extends MessageKey>(key: K, ...params: ParamsArg<K>): string
  /**
   * A message with inline tags, as a tree for `Rich.astro` or `renderRich`.
   * The tags are parsed before the params are filled, so a value is always text.
   */
  rich<K extends MessageKey>(key: K, ...params: ParamsArg<K>): RichNode[]
  /** The message with the given key, untyped. For keys chosen at run time. */
  raw(key: MessageKey, params?: Readonly<Record<string, ParamValue>>): string
  readonly locale: LocaleInfo
  /** A site path in this language. Paths that are never translated pass through. */
  href(path: string): string
  /** "E and T", "E, T and I"; `or` for "sound, lamp or both". */
  list(items: readonly string[], conjunction?: 'and' | 'or'): string
  /** "seven" for small counts, digits otherwise, in this language. */
  numberWord(value: number): string
  /** Upper-cases the first letter by this language's rules. */
  capitalise(text: string): string
  /** "one dot and one dash", from a code. */
  describeElements(code: string): string
  /**
   * A code read aloud, for a screen reader: ".-" is "dot dash", and a word
   * gap says "break". The engine decides the words; this says them.
   */
  spokenCode(code: string): string
  /** Whether the table has this key, for a component that can do without it. */
  has(key: MessageKey): boolean
}

const listFormats = new Map<string, Intl.ListFormat>()

function listFormat(lang: string, type: 'conjunction' | 'disjunction'): Intl.ListFormat {
  const id = `${lang}:${type}`
  let format = listFormats.get(id)
  if (!format) {
    format = new Intl.ListFormat(lang, { style: 'long', type })
    listFormats.set(id, format)
  }
  return format
}

/** Called once per missing key, so a gap in an island's bundle is loud in development. */
let reportMissing: (key: string, locale: string) => void = (key, locale) => {
  if (typeof console !== 'undefined') {
    console.error(`[i18n] "${key}" is not in the ${locale} message table this component received.`)
  }
}

/** For tests that want missing keys to throw. */
export function onMissingMessage(handler: (key: string, locale: string) => void): void {
  reportMissing = handler
}

export function createTranslator(locale: LocaleInfo, messages: MessageTable): Translator {
  const table = messages as Readonly<Record<string, Message>>
  const isEnglish = locale.code === 'en'
  const words = (table['format.numberWords'] as string | undefined)?.split('|') ?? []

  const raw = (key: string, params?: Readonly<Record<string, ParamValue>>): string => {
    const message = table[key]
    if (message === undefined) {
      reportMissing(key, locale.code)
      return key
    }
    return formatMessage(message, params, locale.lang)
  }

  const rich = (key: string, params?: Readonly<Record<string, ParamValue>>): RichNode[] => {
    const message = table[key]
    if (message === undefined) {
      reportMissing(key, locale.code)
      return [key]
    }
    let template: string
    if (isPlural(message)) {
      const count = params?.count
      if (typeof count !== 'number') {
        throw new TypeError('A plural message needs a numeric `count` param.')
      }
      template = selectPlural(message, count, locale.lang)
    } else {
      template = message
    }
    return fillRich(parseRich(template), params)
  }

  const numberWord = (value: number): string =>
    Number.isInteger(value) && value >= 0 && value < words.length && words[value]
      ? words[value]!
      : value.toLocaleString(locale.lang)

  const list = (items: readonly string[], conjunction: 'and' | 'or' = 'and'): string => {
    // English keeps the site's own joiner, which is what every page was
    // written against (no Oxford comma, `or` spelled as the copy spells it).
    if (isEnglish) return joinList(items, conjunction)
    return listFormat(locale.lang, conjunction === 'or' ? 'disjunction' : 'conjunction').format(
      items,
    )
  }

  const translate = ((key: string, params?: Readonly<Record<string, ParamValue>>) =>
    raw(key, params)) as Translator

  const describeElements = (code: string): string => {
    const dots = [...code].filter((element) => element === '.').length
    const dashes = code.length - dots
    const dotText = dots > 0 ? raw('format.dots', { count: dots, word: numberWord(dots) }) : ''
    const dashText =
      dashes > 0 ? raw('format.dashes', { count: dashes, word: numberWord(dashes) }) : ''
    const ordered = code.startsWith('-') ? [dashText, dotText] : [dotText, dashText]
    return ordered.filter(Boolean).join(` ${raw('format.and')} `)
  }

  return Object.assign(translate, {
    raw,
    rich: rich as Translator['rich'],
    locale,
    href: (path: string) => localizePath(path, locale as LocaleDef),
    list,
    numberWord,
    capitalise: (text: string) => text.charAt(0).toLocaleUpperCase(locale.lang) + text.slice(1),
    describeElements,
    spokenCode: (code: string) => {
      const words: Readonly<Record<string, MessageKey>> = {
        dot: 'format.dotWord',
        dash: 'format.dashWord',
        break: 'format.breakWord',
      }
      return spokenCode(code)
        .split(' ')
        .filter(Boolean)
        .map((word) => (words[word] ? raw(words[word]!) : word))
        .join(' ')
    },
    has: (key: MessageKey) => table[key] !== undefined,
  })
}
