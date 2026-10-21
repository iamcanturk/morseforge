/**
 * The English catalog: the source of truth every other language is checked
 * against. Its keys are the keys; its placeholders are the placeholders.
 *
 * One file per area of the site, each a namespace (`lesson.*`, `header.*`).
 * A React island receives whole namespaces, so keep a namespace to one area
 * and do not reach into another area's from a component.
 */

import { crumbs, faq, footer, format, header, layout, nav, switcher, theme } from './chrome'
import { challenge, methods, modes, practice, result, share } from './practice'
import { lesson } from './lesson'
import { achievements, nextAction, stats } from './stats'
import { challengePage, practicePage } from './pagesPractice'
import { learnPage } from './pagesLearn'
import { tree, treePage } from './tree'
import { key, telegraph, telegraphPage, terms } from './key'
import { settings } from './settings'
import { defender, games, gamesPage, runner } from './games'

export const EN_MESSAGES = {
  ...layout,
  ...header,
  ...nav,
  ...footer,
  ...theme,
  ...faq,
  ...crumbs,
  ...switcher,
  ...format,
  ...modes,
  ...methods,
  ...practice,
  ...result,
  ...challenge,
  ...share,
  ...lesson,
  ...achievements,
  ...practicePage,
  ...challengePage,
  ...learnPage,
  ...tree,
  ...treePage,
  ...nextAction,
  ...stats,
  ...terms,
  ...key,
  ...telegraph,
  ...telegraphPage,
  ...settings,
  ...games,
  ...defender,
  ...runner,
  ...gamesPage,
} as const

export type EnMessages = typeof EN_MESSAGES
