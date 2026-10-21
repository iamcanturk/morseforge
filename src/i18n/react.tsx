/**
 * `useT()` for React islands.
 *
 * An island root takes an `i18n` prop (`IslandMessages`, built on the server
 * by `t.island(name)`) and wraps itself in `withI18n`, so every component
 * under it can call `useT()` without the prop being passed down. Nothing here
 * imports a catalog: the strings arrive with the page, in its language only.
 */

import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from 'react'
import type { IslandMessages } from './islands'
import { createTranslator, type Translator } from './translator'

const I18nContext = createContext<Translator | null>(null)

export function I18nProvider({ value, children }: { value: IslandMessages; children: ReactNode }) {
  const translator = useMemo(
    () => createTranslator(value.locale, value.messages),
    [value.locale, value.messages],
  )
  return <I18nContext.Provider value={translator}>{children}</I18nContext.Provider>
}

/** The translator for the island this component is rendered in. */
export function useT(): Translator {
  const translator = useContext(I18nContext)
  if (!translator) {
    throw new Error(
      'useT() was called outside an island that received its messages. Pass `i18n={t.island(...)}` from the page and wrap the root in withI18n().',
    )
  }
  return translator
}

/** Props an island root adds: its message slice. */
export interface WithI18nProps {
  i18n: IslandMessages
}

/**
 * Wrap an island root so it takes `i18n` and provides it to everything below.
 * The wrapped component's own props are unchanged.
 */
export function withI18n<P extends object>(Component: ComponentType<P>) {
  function WithI18n({ i18n, ...props }: P & WithI18nProps) {
    return (
      <I18nProvider value={i18n}>
        <Component {...(props as P)} />
      </I18nProvider>
    )
  }
  WithI18n.displayName = `WithI18n(${Component.displayName ?? Component.name ?? 'Island'})`
  return WithI18n
}
