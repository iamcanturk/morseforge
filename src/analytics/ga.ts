/**
 * Google Analytics 4, behind consent (TASK-039, Consent Mode v2).
 *
 * The rules, all of which fail closed:
 *
 * - Nothing from Google is requested, and no `_ga` cookie exists, until the
 *   visitor accepts. gtag.js is not in any page's HTML; the loader below
 *   injects it after "Accept", or on a later page once that answer is stored.
 *   (Consent Mode's "advanced" setup, which loads the tag first and sends
 *   cookieless pings while consent is denied, is exactly what this is not.)
 * - Ad signals are never asked about and never granted: `ad_storage`,
 *   `ad_user_data` and `ad_personalization` stay denied, and Google signals
 *   and ad personalisation are switched off in the config as well.
 * - Global Privacy Control or Do Not Track counts as "denied" without asking.
 *   An explicit choice in Settings still wins, since it is the more specific
 *   statement of what this person wants from this site.
 * - Production builds only, like the Cloudflare beacon, and never on a page
 *   with `analytics={false}` (`/message/`, whose message lives in the URL
 *   fragment) or a private one (the author's panel and video studio).
 * - The fragment is stripped from `page_location` everywhere anyway.
 * - Storage that cannot be read, or a record from a newer build, means no
 *   tag and no bar: no answer could be read, so none is assumed.
 *
 * The anonymous counters in track.ts are a separate thing with a separate
 * switch, and nothing here touches them.
 *
 * The loader is an inline script, not a bundled module or an island: the plan,
 * the blog and the word pages ship no JavaScript, and a consent bar is not a
 * reason to change that. An inline script cannot import, so its source is a
 * string built here, and ga.test.ts runs it in a sandbox against the pure
 * functions below. If the two ever disagree, that test fails.
 */

import { GA_MEASUREMENT_ID } from '../config/site'
import {
  CONSENT_KEY,
  CONSENT_VERSION,
  DECIDED_AT_PATTERN,
  type ConsentChoice,
  type ConsentRecord,
  consentRecord,
  createConsentStore,
  validateConsent,
} from '../storage/consent'
import { doNotTrack } from './track'

/** Fired on `window` after a choice is stored outside the bar, so the loader applies it. */
export const CONSENT_EVENT = 'morseforge:consent'

/**
 * What the loader concluded:
 * - `granted`, `denied`: a stored answer, or GPC/DNT standing in for "denied";
 * - `undecided`: no answer and no browser signal, so the bar asks;
 * - `unreadable`: storage blocked, or a record from a newer build.
 */
export type ConsentState = ConsentChoice | 'undecided' | 'unreadable'

/** The privacy signals a browser may send, in every spelling we honour. */
export interface PrivacySignals {
  globalPrivacyControl?: boolean
  doNotTrack?: string | null
  msDoNotTrack?: string | null
}

/** Whether the browser has already said no: Global Privacy Control, or Do Not Track. */
export function browserOptsOut(
  nav: PrivacySignals = navigator as PrivacySignals,
  win: PrivacySignals = window as unknown as PrivacySignals,
): boolean {
  return nav.globalPrivacyControl === true || doNotTrack(nav, win)
}

/**
 * The state the loader acts on, from the stored string. `read` may throw
 * (blocked storage), which is `unreadable`.
 *
 * A stored answer wins over the browser's signal, because it can only have
 * been made here, on purpose. With no usable answer, the signal decides, and
 * only with neither is the visitor asked.
 */
export function readConsentState(read: () => string | null, optsOut: boolean): ConsentState {
  let raw: string | null
  try {
    raw = read()
  } catch {
    return 'unreadable'
  }
  let envelope: unknown = null
  if (raw !== null) {
    try {
      envelope = JSON.parse(raw)
    } catch {
      envelope = null
    }
  }
  if (
    typeof envelope === 'object' &&
    envelope !== null &&
    !Array.isArray(envelope) &&
    typeof (envelope as { version?: unknown }).version === 'number'
  ) {
    const { version, data } = envelope as { version: number; data?: unknown }
    // A newer build's record: this build cannot tell what it says.
    if (version > CONSENT_VERSION) return 'unreadable'
    const record = version === CONSENT_VERSION ? validateConsent(data) : null
    if (record) return record.analytics
  }
  return optsOut ? 'denied' : 'undecided'
}

/** What a page knows at build time about whether GA may run on it at all. */
export interface GaPageContext {
  /** `import.meta.env.PROD`: never under `astro dev`. */
  production: boolean
  /** BaseLayout's `analytics` prop. False on `/message/`. */
  analytics: boolean
  /** BaseLayout's `private` prop: the author's own tools. */
  private: boolean
  measurementId: string | null
}

/** Whether the loader and the bar are on this page at all. */
export function gaAllowedOnPage(page: GaPageContext): boolean {
  return page.production && page.analytics && !page.private && Boolean(page.measurementId)
}

/** The two things the loader can do with a state: load the tag, and show the bar. */
export function gaDecision(
  page: GaPageContext,
  state: ConsentState,
): { load: boolean; banner: boolean } {
  if (!gaAllowedOnPage(page)) return { load: false, banner: false }
  return { load: state === 'granted', banner: state === 'undecided' }
}

/** The tag's URL. */
export const gtagSrc = (id: string): string =>
  `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`

/**
 * Consent Mode v2 defaults, set before anything else is queued. Everything
 * denied; only `analytics_storage` is ever updated, and only after an answer.
 */
export const GA_CONSENT_DEFAULT = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  wait_for_update: 500,
} as const

/**
 * The `config` fields besides `page_location`. GA4 never logs or stores IP
 * addresses, so there is no `anonymize_ip` to set.
 *
 * `cookie_expires` is 13 months rather than gtag's two years: the ceiling the
 * French regulator (CNIL) sets for audience-measurement cookies, and the
 * figure the privacy page states.
 */
export const GA_COOKIE_EXPIRES_S = 13 * 30.5 * 24 * 60 * 60

/*
 * `cookie_domain: 'none'` keeps the cookie on morse.iamcanturk.dev alone.
 * gtag's automatic domain would write it to iamcanturk.dev, shared with the
 * author's main site, so a "no" here could only be honoured by deleting that
 * site's cookie too — and a "yes" here would quietly cover both.
 */
export const GA_CONFIG = {
  send_page_view: true,
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
  cookie_expires: GA_COOKIE_EXPIRES_S,
  cookie_domain: 'none',
} as const

/**
 * The page's address without its fragment. The secret-message page keeps its
 * message after the `#` and never loads GA, but nothing else should report a
 * fragment either: it is the one part of a URL a server never sees.
 */
export function pageLocation(href: string): string {
  const hash = href.indexOf('#')
  return hash === -1 ? href : href.slice(0, hash)
}

/** The GA cookie names present in a `document.cookie` string: `_ga` and `_ga_<container>`. */
export function gaCookieNames(cookie: string): string[] {
  const names = cookie
    .split(';')
    .map((pair) => pair.split('=')[0]!.trim())
    .filter((name) => name === '_ga' || name.startsWith('_ga_'))
  return [...new Set(names)]
}

/**
 * The domains a GA cookie written by this site can live on: host-only, since
 * GA_CONFIG sets `cookie_domain: 'none'`.
 *
 * A `_ga` that `document.cookie` shows on a parent domain belongs to another
 * site under iamcanturk.dev; it is visible here but not ours to delete, so a
 * revoke on MorseForge leaves it alone.
 */
export function cookieDomains(_hostname: string): (string | null)[] {
  return [null]
}

/** The `document.cookie` assignments that delete every GA cookie present. */
export function expiredGaCookies(cookie: string, hostname: string): string[] {
  const out: string[] = []
  for (const name of gaCookieNames(cookie)) {
    for (const domain of cookieDomains(hostname)) {
      out.push(
        `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ''}`,
      )
    }
  }
  return out
}

/**
 * The window properties this module touches: gtag, the host, and GA's own
 * opt-out flag (`ga-disable-<ID>`), which is an arbitrary property name.
 */
export interface GaWindow {
  gtag?: (...args: unknown[]) => void
  location: { hostname: string }
  [flag: string]: unknown
}

/** Where a cookie string is read and written; `document` in the browser. */
export interface CookieJar {
  cookie: string
}

/**
 * Stop GA on this page and delete its cookies: the consent update, then
 * GA's documented opt-out flag, which stops even the cookieless pings Consent
 * Mode would otherwise still send from an already-loaded tag.
 */
export function revokeOnPage(
  // The real window has no index signature for the opt-out flag, hence the cast.
  win: GaWindow = window as unknown as GaWindow,
  doc: CookieJar = document,
  id: string | null = GA_MEASUREMENT_ID,
): void {
  if (typeof win.gtag === 'function') win.gtag('consent', 'update', { analytics_storage: 'denied' })
  if (id) win[`ga-disable-${id}`] = true
  for (const assignment of expiredGaCookies(doc.cookie, win.location.hostname)) {
    doc.cookie = assignment
  }
}

/**
 * Store a choice made in Settings and apply it on this page.
 *
 * "Not allowed" is applied here directly, so a revoke never depends on the
 * loader being present. "Allowed" is the loader's job: it alone knows whether
 * this page may load the tag (production, not `/message/`, not private), so
 * this only tells it to look again.
 */
export function chooseAnalytics(
  choice: ConsentChoice,
  store = createConsentStore(),
  now: number = Date.now(),
): ConsentRecord {
  const record = consentRecord(choice, now)
  store.write(record)
  if (typeof window !== 'undefined') {
    if (choice === 'denied') revokeOnPage()
    window.dispatchEvent(new Event(CONSENT_EVENT))
  }
  return record
}

/** What the loader says after a choice in the bar, for the status region. */
export interface ConsentScriptCopy {
  saved: Readonly<Record<ConsentChoice, string>>
}

/** Ids the bar's markup and the loader share. */
export const CONSENT_BAR_ID = 'mf-consent'
export const CONSENT_STATUS_ID = 'mf-consent-status'

/**
 * The loader, as the source of an inline script, for one measurement ID.
 *
 * Mirrors `readConsentState`, `gaDecision` (on a page where GA is allowed),
 * `expiredGaCookies` and `pageLocation`; ga.test.ts holds it to them.
 */
export function consentScript(id: string, copy: ConsentScriptCopy): string {
  const config = {
    key: CONSENT_KEY,
    version: CONSENT_VERSION,
    pattern: DECIDED_AT_PATTERN.source,
    id,
    src: gtagSrc(id),
    event: CONSENT_EVENT,
    bar: CONSENT_BAR_ID,
    status: CONSENT_STATUS_ID,
    consentDefault: GA_CONSENT_DEFAULT,
    config: GA_CONFIG,
    saved: copy.saved,
  }
  // `<` escaped so no string in the config can close the script element.
  const json = JSON.stringify(config).replace(/</g, '\\u003c')
  return `(() => {
  const C = ${json}
  const root = document.documentElement
  const bar = document.getElementById(C.bar)
  const status = document.getElementById(C.status)
  const iso = new RegExp(C.pattern)
  const flag = 'ga-disable-' + C.id
  let loaded = false
  let deciding = false

  const optsOut = () => {
    try {
      return (
        navigator.globalPrivacyControl === true ||
        navigator.doNotTrack === '1' ||
        window.doNotTrack === '1' ||
        navigator.msDoNotTrack === '1'
      )
    } catch {
      return true
    }
  }

  const read = () => {
    let raw
    try {
      raw = localStorage.getItem(C.key)
    } catch {
      return 'unreadable'
    }
    let envelope = null
    if (raw !== null) {
      try {
        envelope = JSON.parse(raw)
      } catch {
        envelope = null
      }
    }
    if (
      envelope &&
      typeof envelope === 'object' &&
      !Array.isArray(envelope) &&
      typeof envelope.version === 'number'
    ) {
      if (envelope.version > C.version) return 'unreadable'
      const data = envelope.version === C.version ? envelope.data : null
      if (
        data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        (data.analytics === 'granted' || data.analytics === 'denied') &&
        typeof data.decidedAt === 'string' &&
        iso.test(data.decidedAt) &&
        Number.isFinite(Date.parse(data.decidedAt))
      )
        return data.analytics
    }
    return optsOut() ? 'denied' : 'undecided'
  }

  // Host-only, matching cookie_domain: 'none' (see cookieDomains).
  const domains = () => ['']

  const forget = () => {
    const names = new Set(
      document.cookie
        .split(';')
        .map((pair) => pair.split('=')[0].trim())
        .filter((name) => name === '_ga' || name.startsWith('_ga_')),
    )
    for (const name of names)
      for (const domain of domains())
        document.cookie =
          name +
          '=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/' +
          (domain ? '; Domain=' + domain : '')
  }

  const load = () => {
    window[flag] = false
    if (loaded) {
      window.gtag('consent', 'update', { analytics_storage: 'granted' })
      return
    }
    loaded = true
    window.dataLayer = window.dataLayer || []
    // \`arguments\`, not an array: gtag.js reads its commands in that shape.
    window.gtag = function gtag() {
      window.dataLayer.push(arguments)
    }
    window.gtag('consent', 'default', C.consentDefault)
    window.gtag('set', 'ads_data_redaction', true)
    window.gtag('js', new Date())
    window.gtag('consent', 'update', { analytics_storage: 'granted' })
    const href = location.href
    const hash = href.indexOf('#')
    window.gtag(
      'config',
      C.id,
      Object.assign({ page_location: hash === -1 ? href : href.slice(0, hash) }, C.config),
    )
    const tag = document.createElement('script')
    tag.async = true
    tag.src = C.src
    document.head.appendChild(tag)
  }

  const deny = () => {
    if (loaded) {
      window.gtag('consent', 'update', { analytics_storage: 'denied' })
      window[flag] = true
    }
    forget()
  }

  const show = (on) => {
    if (bar) bar.hidden = !on
    if (on) root.dataset.consent = 'ask'
    else delete root.dataset.consent
  }

  // On the first run a "denied" needs no work: nothing was loaded and nothing set.
  // Later runs follow a choice made elsewhere (Settings, another tab).
  const apply = (first) => {
    const state = read()
    show(state === 'undecided')
    if (state === 'granted') load()
    else if (state === 'denied' && !first) deny()
  }

  const decide = (choice) => {
    try {
      localStorage.setItem(
        C.key,
        JSON.stringify({
          version: C.version,
          data: { analytics: choice, decidedAt: new Date().toISOString() },
        }),
      )
    } catch {
      // Not saved: the choice still holds for this page, and the bar asks again next time.
    }
    show(false)
    if (choice === 'granted') load()
    else deny()
    if (status) status.textContent = C.saved[choice]
    deciding = true
    window.dispatchEvent(new Event(C.event))
    deciding = false
  }

  if (bar)
    for (const button of bar.querySelectorAll('[data-consent-choice]'))
      button.addEventListener('click', () =>
        decide(button.getAttribute('data-consent-choice') === 'granted' ? 'granted' : 'denied'),
      )
  window.addEventListener(C.event, () => {
    if (!deciding) apply(false)
  })
  window.addEventListener('storage', (event) => {
    if (event.key === C.key || event.key === null) apply(false)
  })
  apply(true)
})()`
}
