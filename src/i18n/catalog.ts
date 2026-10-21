/**
 * What a language has to provide, as one type derived from English.
 *
 * Two parts, through one mechanism:
 *
 *   - `messages`: every interface string, keyed like `lesson.hint`. Plain data,
 *     because a React island receives a slice of it as a prop.
 *   - `content`: the registry's copy (titles, descriptions, H1s, intros), the
 *     FAQs and the landing page. These run on the server only and quote
 *     figures, so they are written as TypeScript that interpolates `FACTS`,
 *     exactly as the English in `src/config/pages.ts` and `src/data/faq.ts` is.
 *
 * Every key English has, a language must list. Each entry is either the
 * translation or `UNTRANSLATED`, which renders the English and is counted by
 * the coverage report. Leaving an entry out does not compile.
 */

import type { LandingCopy } from '../config/landing'
import type { CharacterPageMeta, PageEntry, PagePath, WordPageMeta } from '../config/pages'
import type { CharacterFacts } from '../data/characters'
import type { CurriculumDay } from '../data/curriculum'
import type { FaqItem, FaqPath } from '../data/faq'
import type { MorseWord } from '../data/words'
import type { Untranslated } from './define'
import type { MessageKey, Messages } from './keys'
import type { PluralMessage } from './message'

/** A message's translated shape: any string for a string, any plural forms for a plural. */
export type Translated<M> = M extends string ? string : PluralMessage

export type MessageCatalog = {
  readonly [K in MessageKey]: Translated<Messages[K]> | Untranslated
}

/** The per-language fields of a registry entry. Structure (path, group, parent) is shared. */
export type PageCopy = Pick<
  PageEntry,
  'title' | 'description' | 'h1' | 'intro' | 'navLabel' | 'hint' | 'llmsSummary'
>

export const PAGE_COPY_FIELDS = [
  'title',
  'description',
  'h1',
  'intro',
  'navLabel',
  'hint',
  'llmsSummary',
] as const satisfies readonly (keyof PageCopy)[]

/** The per-language fields of a plan day. Characters, words and minutes are shared. */
export type CurriculumCopy = Pick<CurriculumDay, 'title' | 'summary' | 'rationale' | 'drill'>

export const CURRICULUM_COPY_FIELDS = [
  'title',
  'summary',
  'rationale',
  'drill',
] as const satisfies readonly (keyof CurriculumCopy)[]

export interface ContentCatalog {
  pages: { readonly [P in PagePath]: PageCopy | Untranslated }
  faq: { readonly [P in FaqPath]: readonly FaqItem[] | Untranslated }
  landing: LandingCopy | Untranslated
  /** The learning plan, one entry per day in plan order. */
  curriculum: readonly (CurriculumCopy | Untranslated)[]
  /** Title, description and answer for a word page. */
  wordPage: ((word: MorseWord) => WordPageMeta) | Untranslated
  wordFaq: ((word: MorseWord) => FaqItem[]) | Untranslated
  /** Title and description for a character page. */
  characterPage: ((facts: CharacterFacts) => CharacterPageMeta) | Untranslated
  characterFaq: ((facts: CharacterFacts) => FaqItem[]) | Untranslated
}

export interface LocaleCatalog {
  messages: MessageCatalog
  content: ContentCatalog
}

/** A content catalog with every fallback applied: what the pages read. */
export interface ResolvedContent {
  pages: Readonly<Record<string, PageCopy>>
  faq: Readonly<Record<string, readonly FaqItem[]>>
  landing: LandingCopy
  curriculum: readonly CurriculumDay[]
  wordPage: (word: MorseWord) => WordPageMeta
  wordFaq: (word: MorseWord) => FaqItem[]
  characterPage: (facts: CharacterFacts) => CharacterPageMeta
  characterFaq: (facts: CharacterFacts) => FaqItem[]
}
