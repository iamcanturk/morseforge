import { useEffect, useState } from 'react'

/**
 * The install affordance, from a page's point of view.
 *
 * BaseLayout captures `beforeinstallprompt` with an inline script on every
 * page — it fires once, early, and a page whose island hydrates later would
 * otherwise miss it. The layout never shows anything itself. It parks a handle
 * on `window` and announces it, and a page that has earned the right to ask
 * (a finished lesson, a finished daily) offers "Install" through this module.
 *
 * The constants are imported by the layout's inline script at build time, so
 * the event names cannot drift between the two.
 */

export const INSTALL_HANDLE = '__mfInstall'
/** Fired on `window` when the browser says the app can be installed. */
export const INSTALLABLE_EVENT = 'mf:installable'
/** Fired on `window` once installed, or once the prompt has been used up. */
export const INSTALL_GONE_EVENT = 'mf:install-gone'

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

export interface InstallHandle {
  /**
   * Show the browser's install prompt. Only call from a user gesture (a click
   * handler); the browser refuses otherwise. Resolves once the user chooses.
   * The handle is single-use, as the browser's own event is.
   */
  prompt(): Promise<InstallOutcome>
}

declare global {
  interface Window {
    [INSTALL_HANDLE]?: InstallHandle | null
  }
}

/** The current handle, or null when the browser has not offered (or no window). */
export function installHandle(): InstallHandle | null {
  if (typeof window === 'undefined') return null
  return window[INSTALL_HANDLE] ?? null
}

/**
 * The handle, live: null until the browser offers installation, null again
 * after it is used or the app is installed. Never non-null on iOS Safari,
 * which has no install prompt — offer "Share → Add to Home Screen" text there.
 */
export function useInstallPrompt(): InstallHandle | null {
  const [handle, setHandle] = useState<InstallHandle | null>(null)

  useEffect(() => {
    const sync = () => setHandle(installHandle())
    sync()
    window.addEventListener(INSTALLABLE_EVENT, sync)
    window.addEventListener(INSTALL_GONE_EVENT, sync)
    return () => {
      window.removeEventListener(INSTALLABLE_EVENT, sync)
      window.removeEventListener(INSTALL_GONE_EVENT, sync)
    }
  }, [])

  return handle
}
