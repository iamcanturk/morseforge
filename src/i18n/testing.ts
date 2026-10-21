/**
 * For tests that render a React component: wrap it in the provider an island
 * root would give it, with the English messages of that island.
 */

import { createElement, type ReactElement } from 'react'
import type { Island } from './islands'
import { I18nProvider } from './react'
import { translatorFor } from './server'

export function inIsland(element: ReactElement, island: Island, locale = 'en'): ReactElement {
  return createElement(I18nProvider, {
    value: translatorFor(locale).island(island),
    children: element,
  })
}
