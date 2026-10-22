import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  CONSENT_BAR_ID,
  CONSENT_EVENT,
  CONSENT_STATUS_ID,
  GA_CONFIG,
  GA_COOKIE_EXPIRES_S,
  GA_CONSENT_DEFAULT,
  type ConsentState,
  type GaPageContext,
  type GaWindow,
  browserOptsOut,
  chooseAnalytics,
  consentScript,
  cookieDomains,
  expiredGaCookies,
  gaAllowedOnPage,
  gaCookieNames,
  gaDecision,
  gtagSrc,
  pageLocation,
  readConsentState,
  revokeOnPage,
} from './ga'
import { GA_MEASUREMENT_ID } from '../config/site'
import {
  CONSENT_KEY,
  CONSENT_VERSION,
  createConsentStore,
  validateConsent,
} from '../storage/consent'
import { createMemoryDriver } from '../storage/store'

const ID = 'G-TEST000001'
const STAMP = '2026-10-22T09:30:00.000Z'
const envelope = (data: unknown, version = CONSENT_VERSION) => JSON.stringify({ version, data })
const GRANTED = envelope({ analytics: 'granted', decidedAt: STAMP })
const DENIED = envelope({ analytics: 'denied', decidedAt: STAMP })

/** A production page where GA may run, the context every other case varies. */
const PAGE: GaPageContext = { production: true, analytics: true, private: false, measurementId: ID }

describe('the measurement ID', () => {
  it('is the one Can confirmed, in GA4 form', () => {
    expect(GA_MEASUREMENT_ID).toBe('G-8YYFW16VXX')
    expect(GA_MEASUREMENT_ID).toMatch(/^G-[A-Z0-9]{10}$/)
  })
})

describe('readConsentState', () => {
  const state = (raw: string | null, optsOut = false) => readConsentState(() => raw, optsOut)

  it('reads a stored answer', () => {
    expect(state(GRANTED)).toBe('granted')
    expect(state(DENIED)).toBe('denied')
  })

  it('is undecided with nothing stored, and only then', () => {
    expect(state(null)).toBe('undecided')
  })

  it('treats Global Privacy Control or Do Not Track as "denied", without asking', () => {
    expect(state(null, true)).toBe('denied')
  })

  it('lets an answer given here win over the browser signal', () => {
    expect(state(GRANTED, true)).toBe('granted')
  })

  it.each([
    ['broken JSON', '{"version":1,'],
    ['no envelope', JSON.stringify({ analytics: 'granted', decidedAt: STAMP })],
    ['an invalid answer', envelope({ analytics: 'yes', decidedAt: STAMP })],
    ['a record with no date', envelope({ analytics: 'granted' })],
    ['an older version', envelope({ analytics: 'granted', decidedAt: STAMP }, 0)],
    ['an array', '[]'],
  ])('treats %s as no answer', (_, raw) => {
    expect(state(raw)).toBe('undecided')
    expect(state(raw, true)).toBe('denied')
  })

  it('cannot read storage that throws, and says so rather than guessing', () => {
    const blocked = () => {
      throw new Error('SecurityError')
    }
    expect(readConsentState(blocked, false)).toBe('unreadable')
  })

  it('cannot read a newer build’s record', () => {
    expect(state(envelope({ analytics: 'granted', decidedAt: STAMP }, CONSENT_VERSION + 1))).toBe(
      'unreadable',
    )
  })
})

describe('browserOptsOut', () => {
  it('honours Global Privacy Control', () => {
    expect(browserOptsOut({ globalPrivacyControl: true }, {})).toBe(true)
  })

  it('honours Do Not Track in each of its spellings', () => {
    expect(browserOptsOut({ doNotTrack: '1' }, {})).toBe(true)
    expect(browserOptsOut({ msDoNotTrack: '1' }, {})).toBe(true)
    expect(browserOptsOut({}, { doNotTrack: '1' })).toBe(true)
  })

  it('is false with no signal, or a signal that is off', () => {
    expect(browserOptsOut({}, {})).toBe(false)
    expect(browserOptsOut({ globalPrivacyControl: false, doNotTrack: '0' }, {})).toBe(false)
  })
})

describe('gaDecision', () => {
  const STATES: ConsentState[] = ['granted', 'denied', 'undecided', 'unreadable']

  it('loads the tag only on "granted"', () => {
    for (const state of STATES) expect(gaDecision(PAGE, state).load).toBe(state === 'granted')
  })

  it('shows the bar only while undecided', () => {
    for (const state of STATES) expect(gaDecision(PAGE, state).banner).toBe(state === 'undecided')
  })

  it.each([
    ['under astro dev', { production: false }],
    ['with analytics={false} (/message/)', { analytics: false }],
    ['on a private page', { private: true }],
    ['without a measurement ID', { measurementId: null }],
  ])('neither loads nor asks %s, whatever was stored', (_, patch) => {
    const page = { ...PAGE, ...patch }
    expect(gaAllowedOnPage(page)).toBe(false)
    for (const state of STATES)
      expect(gaDecision(page, state)).toEqual({ load: false, banner: false })
  })

  it('neither loads nor asks when the browser sends GPC and nothing is stored', () => {
    expect(
      gaDecision(
        PAGE,
        readConsentState(() => null, true),
      ),
    ).toEqual({
      load: false,
      banner: false,
    })
  })
})

describe('the GA configuration', () => {
  it('starts with everything denied, ad signals included', () => {
    expect(GA_CONSENT_DEFAULT).toEqual({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      wait_for_update: 500,
    })
  })

  it('switches Google signals and ad personalisation off', () => {
    expect(GA_CONFIG).toEqual({
      send_page_view: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: GA_COOKIE_EXPIRES_S,
      cookie_domain: 'none',
    })
    // 13 months, give or take a day: what the privacy page promises.
    expect(GA_COOKIE_EXPIRES_S / 86_400).toBeGreaterThan(395)
    expect(GA_COOKIE_EXPIRES_S / 86_400).toBeLessThan(397)
  })

  it('loads gtag.js from Google’s one host, for this ID', () => {
    expect(gtagSrc(ID)).toBe(`https://www.googletagmanager.com/gtag/js?id=${ID}`)
  })
})

describe('pageLocation', () => {
  it('drops the fragment, which may hold a secret message', () => {
    expect(pageLocation('https://morse.iamcanturk.dev/message/#m=SOS')).toBe(
      'https://morse.iamcanturk.dev/message/',
    )
    expect(pageLocation('https://x.dev/a/?q=1#frag#more')).toBe('https://x.dev/a/?q=1')
  })

  it('leaves an address without one alone', () => {
    expect(pageLocation('https://x.dev/a/?q=1')).toBe('https://x.dev/a/?q=1')
  })
})

describe('deleting GA cookies', () => {
  const JAR = '_ga=GA1.1.123.456; theme=dark; _ga_8YYFW16VXX=GS2.1.s1; _gab=1; x_ga=2; _ga=dup'

  it('finds _ga and every _ga_<container>, and nothing else', () => {
    expect(gaCookieNames(JAR)).toEqual(['_ga', '_ga_8YYFW16VXX'])
    expect(gaCookieNames('')).toEqual([])
  })

  it('deletes only host-only cookies, never the main site’s on iamcanturk.dev', () => {
    expect(cookieDomains('morse.iamcanturk.dev')).toEqual([null])
    expect(GA_CONFIG.cookie_domain).toBe('none')
  })

  it('only the host-only cookie for localhost or an IP address', () => {
    expect(cookieDomains('localhost')).toEqual([null])
    expect(cookieDomains('127.0.0.1')).toEqual([null])
    expect(cookieDomains('[::1]')).toEqual([null])
  })

  it('expires each one host-only, at the root path, never on a parent domain', () => {
    const out = expiredGaCookies(JAR, 'morse.iamcanturk.dev')
    expect(out).toEqual([
      '_ga=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/',
      '_ga_8YYFW16VXX=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/',
    ])
    for (const line of out) expect(line).not.toContain('Domain=')
  })

  it('writes nothing when there is nothing to delete', () => {
    expect(expiredGaCookies('theme=dark', 'morse.iamcanturk.dev')).toEqual([])
  })
})

describe('revokeOnPage', () => {
  it('denies, sets the opt-out flag and deletes the cookies', () => {
    const calls: unknown[][] = []
    const written: string[] = []
    const win = {
      gtag: (...args: unknown[]) => void calls.push(args),
      location: { hostname: 'morse.iamcanturk.dev' },
    } as GaWindow
    const doc = {
      get cookie() {
        return '_ga=1; _ga_ABC=2'
      },
      set cookie(value: string) {
        written.push(value)
      },
    }
    revokeOnPage(win, doc, ID)
    expect(calls).toEqual([['consent', 'update', { analytics_storage: 'denied' }]])
    expect(win[`ga-disable-${ID}`]).toBe(true)
    expect(written).toEqual(expiredGaCookies('_ga=1; _ga_ABC=2', 'morse.iamcanturk.dev'))
  })
})

describe('chooseAnalytics', () => {
  it('stores a dated answer that reads back as valid', () => {
    const driver = createMemoryDriver()
    const store = createConsentStore(driver)
    const record = chooseAnalytics('denied', store, Date.parse(STAMP))
    expect(record).toEqual({ analytics: 'denied', decidedAt: STAMP })
    expect(validateConsent(JSON.parse(driver.getItem(CONSENT_KEY)!).data)).toEqual(record)
  })
})

/* ---- The inline loader, run as the browser runs it ---------------------- */

interface World {
  /** What the page shows and does. */
  banner: () => boolean
  reserved: () => string | undefined
  scripts: string[]
  dataLayer: () => unknown[][]
  status: () => string
  storage: Map<string, string>
  cookieWrites: string[]
  jar: Map<string, string>
  global: Record<string, unknown>
  click: (choice: 'granted' | 'denied') => void
  fire: (type: string, event?: Record<string, unknown>) => void
}

interface Setup {
  stored?: string | null
  gpc?: boolean
  dnt?: string
  storageThrows?: boolean
  href?: string
  cookies?: Record<string, string>
}

function run(setup: Setup = {}, script = consentScript(ID, { saved: SAVED })): World {
  const storage = new Map<string, string>()
  if (setup.stored != null) storage.set(CONSENT_KEY, setup.stored)
  const jar = new Map(Object.entries(setup.cookies ?? {}))
  const cookieWrites: string[] = []
  const scripts: string[] = []
  const listeners: Record<string, ((event: unknown) => void)[]> = {}
  const dataset: Record<string, string> = {}

  const button = (choice: string) => {
    const handlers: (() => void)[] = []
    return {
      getAttribute: (name: string) => (name === 'data-consent-choice' ? choice : null),
      addEventListener: (_: string, handler: () => void) => handlers.push(handler),
      click: () => handlers.forEach((handler) => handler()),
    }
  }
  const buttons = { granted: button('granted'), denied: button('denied') }
  const bar = {
    hidden: true,
    querySelectorAll: () => [buttons.granted, buttons.denied],
  }
  const status = { textContent: '' }

  const href = setup.href ?? 'https://morse.iamcanturk.dev/practice/#main'
  const sandbox: Record<string, unknown> = {
    location: { href, hostname: new URL(href).hostname },
    navigator: {
      globalPrivacyControl: setup.gpc,
      doNotTrack: setup.dnt ?? null,
    },
    localStorage: {
      getItem: (key: string) => {
        if (setup.storageThrows) throw new Error('SecurityError')
        return storage.get(key) ?? null
      },
      setItem: (key: string, value: string) => {
        if (setup.storageThrows) throw new Error('SecurityError')
        storage.set(key, value)
      },
    },
    document: {
      documentElement: { dataset },
      getElementById: (id: string) =>
        id === CONSENT_BAR_ID ? bar : id === CONSENT_STATUS_ID ? status : null,
      createElement: () => ({ async: false, src: '' }),
      head: { appendChild: (element: { src: string }) => scripts.push(element.src) },
      get cookie() {
        return [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
      },
      set cookie(value: string) {
        cookieWrites.push(value)
        const name = value.split('=')[0]!
        if (/Max-Age=0/.test(value)) jar.delete(name)
        else jar.set(name, value.split(';')[0]!.slice(name.length + 1))
      },
    },
    addEventListener: (type: string, handler: (event: unknown) => void) =>
      (listeners[type] ??= []).push(handler),
    dispatchEvent: (event: { type: string }) => {
      for (const handler of listeners[event.type] ?? []) handler(event)
      return true
    },
    Event: class {
      constructor(public type: string) {}
    },
  }
  sandbox['window'] = sandbox
  runInNewContext(script, sandbox)

  return {
    banner: () => !bar.hidden,
    reserved: () => dataset['consent'],
    scripts,
    dataLayer: () =>
      ((sandbox['dataLayer'] as ArrayLike<unknown>[] | undefined) ?? []).map((entry) =>
        Array.from(entry),
      ),
    status: () => status.textContent,
    storage,
    cookieWrites,
    jar,
    global: sandbox,
    click: (choice) => buttons[choice].click(),
    fire: (type, event = {}) => {
      for (const handler of listeners[type] ?? []) handler({ type, ...event })
    },
  }
}

const SAVED = { granted: 'Allowed.', denied: 'Not allowed.' }
const TAG = gtagSrc(ID)

describe('the inline loader', () => {
  describe('agrees with readConsentState and gaDecision on every stored value', () => {
    const STORED: (string | null)[] = [
      null,
      GRANTED,
      DENIED,
      '{"version":1,',
      envelope({ analytics: 'yes', decidedAt: STAMP }),
      envelope({ analytics: 'granted', decidedAt: '1' }),
      envelope({ analytics: 'granted', decidedAt: STAMP }, 0),
      envelope({ analytics: 'granted', decidedAt: STAMP }, CONSENT_VERSION + 1),
      '[]',
      'null',
    ]
    for (const stored of STORED) {
      for (const optsOut of [false, true]) {
        it(`${stored ?? 'nothing stored'}, ${optsOut ? 'with' : 'without'} GPC`, () => {
          const world = run({ stored, gpc: optsOut })
          const expected = gaDecision(
            PAGE,
            readConsentState(() => stored, optsOut),
          )
          expect(world.banner()).toBe(expected.banner)
          expect(world.reserved()).toBe(expected.banner ? 'ask' : undefined)
          expect(world.scripts).toEqual(expected.load ? [TAG] : [])
        })
      }
    }
  })

  it('counts Do Not Track as "denied" too', () => {
    const world = run({ dnt: '1' })
    expect(world.banner()).toBe(false)
    expect(world.scripts).toEqual([])
  })

  it('shows nothing and loads nothing when storage is blocked', () => {
    const world = run({ storageThrows: true })
    expect(world.banner()).toBe(false)
    expect(world.scripts).toEqual([])
  })

  it('requests nothing and touches no cookie before a choice', () => {
    const world = run({ cookies: { theme: 'dark' } })
    expect(world.banner()).toBe(true)
    expect(world.scripts).toEqual([])
    expect(world.dataLayer()).toEqual([])
    expect(world.cookieWrites).toEqual([])
  })

  it('on Accept: stores a valid record, then queues Consent Mode before config, then loads', () => {
    const world = run()
    world.click('granted')

    const saved = JSON.parse(world.storage.get(CONSENT_KEY)!)
    expect(saved.version).toBe(CONSENT_VERSION)
    expect(validateConsent(saved.data)?.analytics).toBe('granted')

    expect(world.banner()).toBe(false)
    expect(world.reserved()).toBeUndefined()
    expect(world.scripts).toEqual([TAG])
    const layer = world.dataLayer()
    expect(layer[0]).toEqual(['consent', 'default', GA_CONSENT_DEFAULT])
    expect(layer.map((entry) => entry.slice(0, 2))).toEqual([
      ['consent', 'default'],
      ['set', 'ads_data_redaction'],
      ['js', expect.anything()],
      ['consent', 'update'],
      ['config', ID],
    ])
    expect(layer[3]).toEqual(['consent', 'update', { analytics_storage: 'granted' }])
    expect(layer[4]![2]).toEqual({
      page_location: 'https://morse.iamcanturk.dev/practice/',
      ...GA_CONFIG,
    })
    expect(world.status()).toBe(SAVED.granted)
  })

  it('on Reject: stores it, loads nothing, and leaves no GA cookie', () => {
    const world = run({ cookies: { _ga: 'GA1.1.1', theme: 'dark' } })
    world.click('denied')
    expect(validateConsent(JSON.parse(world.storage.get(CONSENT_KEY)!).data)?.analytics).toBe(
      'denied',
    )
    expect(world.banner()).toBe(false)
    expect(world.scripts).toEqual([])
    expect(world.dataLayer()).toEqual([])
    expect([...world.jar.keys()]).toEqual(['theme'])
    expect(world.status()).toBe(SAVED.denied)
  })

  it('deletes exactly the cookies expiredGaCookies names, on every domain', () => {
    const cookies = { _ga: 'a', _ga_8YYFW16VXX: 'b', theme: 'dark' }
    const world = run({ cookies })
    const before = world.global['document'] as { cookie: string }
    const expected = expiredGaCookies(before.cookie, 'morse.iamcanturk.dev')
    world.click('denied')
    expect(world.cookieWrites).toEqual(expected)
  })

  it('on a revoke from Settings: denies, sets the opt-out flag and deletes the cookies', () => {
    const world = run({ stored: GRANTED, cookies: { _ga: 'a', _ga_8YYFW16VXX: 'b' } })
    expect(world.scripts).toEqual([TAG])
    world.storage.set(CONSENT_KEY, DENIED)
    world.fire(CONSENT_EVENT)
    expect(world.dataLayer().at(-1)).toEqual(['consent', 'update', { analytics_storage: 'denied' }])
    expect(world.global[`ga-disable-${ID}`]).toBe(true)
    expect([...world.jar.keys()]).toEqual([])
    expect(world.scripts).toEqual([TAG])
  })

  it('follows a choice made in another tab', () => {
    const world = run()
    world.storage.set(CONSENT_KEY, GRANTED)
    world.fire('storage', { key: CONSENT_KEY })
    expect(world.banner()).toBe(false)
    expect(world.scripts).toEqual([TAG])
  })

  it('loads the tag once, however often it is told', () => {
    const world = run({ stored: GRANTED })
    world.fire(CONSENT_EVENT)
    world.fire('storage', { key: CONSENT_KEY })
    expect(world.scripts).toEqual([TAG])
  })

  it('does no cookie work on a page load that is already "denied"', () => {
    const world = run({ stored: DENIED, cookies: { _ga: 'from-another-site' } })
    expect(world.cookieWrites).toEqual([])
  })

  it('never reports a fragment', () => {
    const world = run({ stored: GRANTED, href: 'https://morse.iamcanturk.dev/x/?a=1#m=SECRET' })
    const config = world.dataLayer().find((entry) => entry[0] === 'config')!
    expect(JSON.stringify(config)).not.toContain('SECRET')
    expect((config[2] as { page_location: string }).page_location).toBe(
      'https://morse.iamcanturk.dev/x/?a=1',
    )
  })

  it('cannot be closed early by a message in the catalog', () => {
    const script = consentScript(ID, { saved: { granted: '</script><b>', denied: 'x' } })
    expect(script).not.toContain('</script')
    expect(run({}, script).banner()).toBe(true)
  })
})
