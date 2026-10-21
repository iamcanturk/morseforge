/**
 * The English content catalog.
 *
 * It points at the copy where it already lives, rather than moving it: the
 * registry in `src/config/pages.ts`, the FAQs in `src/data/faq.ts` and the
 * landing copy in `src/config/landing.ts` keep their tests, their comments and
 * their history. This file only gathers them into the shape `catalog.ts` asks
 * every language for.
 */

import { LANDING } from '../../config/landing'
import { PAGES, characterPage, wordPage, type PagePath } from '../../config/pages'
import { CURRICULUM } from '../../data/curriculum'
import { PAGE_FAQ, characterFaq, wordFaq } from '../../data/faq'
import {
  CURRICULUM_COPY_FIELDS,
  PAGE_COPY_FIELDS,
  type ContentCatalog,
  type CurriculumCopy,
  type PageCopy,
} from '../catalog'

function copyOf(page: PageCopy): PageCopy {
  return Object.fromEntries(PAGE_COPY_FIELDS.map((field) => [field, page[field]])) as PageCopy
}

const pages = Object.fromEntries(PAGES.map((page) => [page.path, copyOf(page)])) as {
  readonly [P in PagePath]: PageCopy
}

const curriculum: readonly CurriculumCopy[] = CURRICULUM.map(
  (day) =>
    Object.fromEntries(
      CURRICULUM_COPY_FIELDS.map((field) => [field, day[field]]),
    ) as CurriculumCopy,
)

export const EN_CONTENT = {
  pages,
  faq: PAGE_FAQ,
  landing: LANDING,
  curriculum,
  wordPage,
  wordFaq,
  characterPage,
  characterFaq,
} satisfies ContentCatalog
