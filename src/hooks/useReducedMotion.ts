import { useEffect, useState } from 'react'
import { createSettingsStore, type MotionPreference } from '../storage/settings'

/**
 * Whether to suppress motion, taking both the app setting and the OS into
 * account (PROJECT.md §28).
 *
 * There are two sources and they are not interchangeable. The OS setting is
 * all-or-nothing across every app; the app setting exists because someone may
 * want the signal pulses here while suppressing motion elsewhere, or the
 * reverse. Reading only one of them — which is what everything here did before
 * — means the setting on the settings page does nothing.
 */

/** Pure, so the precedence can be tested without a browser. */
export function resolveMotion(preference: MotionPreference, systemPrefersReduce: boolean): boolean {
  // An explicit choice wins over the OS, in both directions. Someone who has
  // turned motion on here has said they want it despite the system setting.
  if (preference === 'reduce') return true
  if (preference === 'full') return false
  return systemPrefersReduce
}

export function useReducedMotion(): boolean {
  // Starts false and is corrected after mount: these components are prerendered
  // in Node, where neither matchMedia nor localStorage exists, and rendering
  // different markup on the client would tear hydration.
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const store = createSettingsStore()
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')

    const apply = () => setReduced(resolveMotion(store.read().motion, query.matches))

    apply()
    query.addEventListener('change', apply)
    const unsubscribe = store.subscribe(apply)

    return () => {
      query.removeEventListener('change', apply)
      unsubscribe()
    }
  }, [])

  return reduced
}
