/**
 * The hero instrument, in the browser (TASK-001 §5.1–5.2; flow audit P2).
 *
 * Vanilla TypeScript on the framework-agnostic engine, so the first thing a
 * visitor touches ships no React. It owns the DOM of `SignalHero.astro` and
 * nothing else; every rule it applies lives in `hero.ts`.
 *
 * Three promises it keeps:
 * - Space keys the instrument while focus is inside it, or while nothing has
 *   focus and the station is at least a quarter on screen (the rule every
 *   keyed screen follows). Anywhere else on the page it scrolls.
 * - The AudioContext is created on the first press (a user gesture), and never
 *   at all when Settings → Sound is off.
 * - What the visitor does is real: correct sends are recorded as sending
 *   answers, elements are banked through `bankActivity` (which pays the
 *   one-time first-signal XP), and /learn/ picks up where the drill stops.
 */

import { track } from '../../analytics/track'
import { AudioEngine } from '../../engine/audioEngine'
import { KeyEngine, bindKeyboard } from '../../engine/keyEngine'
import { LiveDecoder } from '../../engine/morseDecoder'
import { bankActivity } from '../../storage/activity'
import { answer, createProgressStore, unlockTaught } from '../../storage/progress'
import { createSettingsStore } from '../../storage/settings'
import { achievementSnapshot } from '../../storage/snapshot'
import { createStatsStore } from '../../storage/stats'
import {
  HERO_TARGETS,
  HERO_IN_VIEW_THRESHOLD,
  advance,
  codeOf,
  commitSignal,
  doneHeadline,
  doneStop,
  hasSentBefore,
  initialHero,
  instructionFor,
  keysFromPage,
  nextStop,
  shouldCommit,
  targetOf,
  wrongMessage,
  type HeroState,
} from './hero'

/** How long the "signal detected" moment holds before the next step. */
const DETECTED_MS = 1500
/** A little longer when an achievement slip has something to say. */
const AWARD_MS = 2400
/** Characters the tape keeps; older ones scroll off the left. */
const TAPE_LIMIT = 24

type View = 'drill' | 'done' | 'welcome'

const FREE_INSTRUCTION = 'Free key · anything you send prints on the tape'

export function mountStation(root: HTMLElement): () => void {
  const find = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector)
    if (!element) throw new Error(`station: missing ${selector}`)
    return element
  }

  const key = find<HTMLButtonElement>('[data-key]')
  const glyph = find('[data-glyph]')
  const targetCode = find('[data-target-code]')
  const sentCode = find('[data-sent-code]')
  const stepLabel = find('[data-step-label]')
  const stepPrefix = find('[data-step-prefix]')
  const instruction = find('[data-instruction]')
  const note = find('[data-note]')
  const xpLine = find('[data-xp]')
  const award = find('[data-award]')
  const flash = find('[data-flash]')
  const halo = find('[data-halo]')
  const tape = find('[data-tape]')
  const tapePending = find('[data-tape-pending]')
  const fuse = find('[data-fuse]')
  const tx = find('[data-tx]')
  const live = find('[data-live]')
  const doneHeadlineEl = find('[data-done-headline]')
  const doneWord = find('[data-done-word]')
  const doneDetail = find('[data-done-detail]')
  const doneLink = find<HTMLAnchorElement>('[data-done-link]')
  const welcomeDetail = find('[data-welcome-detail]')
  const welcomeLink = find<HTMLAnchorElement>('[data-welcome-link]')
  const plateDrill = find('[data-plate-drill]')
  const stepLamps = [...root.querySelectorAll<HTMLElement>('[data-step-lamp]')]
  // The hero's own call to action, outside the instrument: its href follows
  // the view, and in the welcome view so does its label (J-07, DEC-044).
  const cta = root.closest('.hero')?.querySelector<HTMLAnchorElement>('[data-hero-cta]') ?? null
  const ctaBack = cta?.querySelector<HTMLElement>('[data-cta-back]') ?? null
  const ctaHref = cta?.getAttribute('href') ?? '/learn/'

  const settings = createSettingsStore().read()
  const progressStore = createProgressStore()
  const statsStore = createStatsStore()
  const bindings = settings.keys
  const soundOn = settings.audio.enabled && settings.audio.volume > 0

  find('[data-sound-on]').hidden = !soundOn
  find('[data-sound-off]').hidden = soundOn

  let state: HeroState = initialHero()
  let view: View = hasSentBefore(statsStore.read()) ? 'welcome' : 'drill'
  let tapeText = ''
  /** Elements keyed but not yet banked. Banked on a detection, a free commit, or leaving. */
  let unbanked = 0
  let sentOnce = false
  let momentTimer: ReturnType<typeof setTimeout> | null = null
  let audio: AudioEngine | null = null
  const decoder = new LiveDecoder()

  /* ---------------------------------------------------------------- render */

  const replay = (element: HTMLElement, className: string) => {
    element.classList.remove(className)
    // Reading a layout property restarts a CSS animation on the same element.
    void element.offsetWidth
    element.classList.add(className)
  }

  /** Draw a code as elements: a dot one unit wide, a dash three (see pkg-b.css). */
  const drawCode = (container: HTMLElement, code: string) => {
    container.replaceChildren(
      ...[...code].map((element) => {
        const mark = document.createElement('span')
        mark.className = 'code-el'
        mark.dataset.el = element === '.' ? 'dot' : 'dash'
        return mark
      }),
    )
  }

  const announce = (message: string) => {
    live.textContent = message
  }

  function renderTape(struck = false) {
    const text = tapeText.slice(-TAPE_LIMIT)
    tape.replaceChildren()
    if (text) {
      const head = struck ? text.slice(0, -1) : text
      if (head) tape.append(head)
      if (struck) {
        const last = document.createElement('span')
        last.className = 'mf-strike'
        last.textContent = text.slice(-1)
        tape.append(last)
      }
    }
    drawCode(tapePending, decoder.pending)
  }

  function renderPending() {
    drawCode(sentCode, decoder.pending)
    renderTape()
  }

  function render() {
    root.dataset.view = view
    root.dataset.phase = state.phase
    // The E/T hint (hidden by CSS outside the drill) describes the key only
    // while it is the first-timer's drill.
    if (view === 'drill') key.setAttribute('aria-describedby', 'hero-key-hint')
    else key.removeAttribute('aria-describedby')

    if (view === 'drill') {
      const target = targetOf(state) ?? HERO_TARGETS.at(-1) ?? ''
      glyph.textContent = target
      drawCode(targetCode, codeOf(target))
      stepPrefix.hidden = false
      stepLabel.textContent = `Step ${Math.min(state.step + 1, HERO_TARGETS.length)} of ${HERO_TARGETS.length}`
      instruction.textContent = instructionFor(target)
      plateDrill.textContent = instructionFor(target)
      cta?.setAttribute('href', ctaHref)
    } else {
      stepPrefix.hidden = view !== 'done'
      stepLabel.textContent = view === 'done' ? 'Complete' : 'Station open'
      instruction.textContent = FREE_INSTRUCTION
      note.textContent = ''
    }

    stepLamps.forEach((lamp, index) => {
      lamp.querySelector('.mf-lamp')?.setAttribute('data-on', String(index < state.sent.length))
    })

    if (view === 'done') {
      // DEC-044: after E, T and A, the lesson opens on hearing them.
      const stop = doneStop(progressStore.read(), Date.now())
      doneHeadlineEl.textContent = doneHeadline(state.sent)
      doneWord.textContent = state.sent
      doneDetail.textContent = `Next: ${stop.detail}`
      doneLink.href = stop.href
      doneLink.textContent = `${stop.label} →`
      cta?.setAttribute('href', stop.href)
    } else if (view === 'welcome') {
      const stop = nextStop(progressStore.read(), Date.now())
      welcomeDetail.textContent = `Next: ${stop.detail}`
      welcomeLink.href = stop.href
      welcomeLink.textContent = `${stop.label} →`
      cta?.setAttribute('href', stop.href)
      if (ctaBack) ctaBack.textContent = stop.label
    }
    renderPending()
  }

  /* ------------------------------------------------------------- the fuse */

  function startFuse() {
    fuse.style.setProperty('--fuse-ms', `${engine.thresholds.characterGapMs}ms`)
    replay(fuse, 'is-burning')
  }

  function stopFuse() {
    fuse.classList.remove('is-burning')
  }

  /* -------------------------------------------------------------- banking */

  /** Bank the elements keyed so far. Returns what `bankActivity` paid. */
  function bank(now: number, since?: ReturnType<typeof achievementSnapshot>) {
    if (unbanked === 0) return null
    // No cache workaround needed: the stores re-check storage on read and
    // re-read before they write, so another tab's progress is never lost.
    const result = bankActivity({ elements: unbanked, now, ...(since ? { since } : {}) })
    unbanked = 0
    return result
  }

  function onDetected(target: string, now: number) {
    const since = achievementSnapshot(progressStore.read(), statsStore.read(), now)
    const sent = [...state.sent]
    progressStore.update((record) =>
      unlockTaught(answer(record, target, 'sending', true, now), sent),
    )
    const result = bank(now, since)

    xpLine.textContent = result && result.xp > 0 ? `+${result.xp} XP` : ''
    const earned = result?.earned[0]
    award.textContent = earned ? `Achievement · ${earned.title}` : ''
    if (result && result.xp > 0) replay(xpLine, 'mf-rise-hold')

    replay(flash, 'mf-flash')
    replay(halo, 'is-lit')
    note.textContent = ''
    tapeText = state.sent
    render()
    renderTape(true)

    const next = targetOf(advance(state))
    announce(
      [
        `Signal detected: ${target}.`,
        result && result.xp > 0 ? `Plus ${result.xp} XP.` : '',
        earned ? `Achievement: ${earned.title}.` : '',
        next ? `Next, send ${next}: ${instructionFor(next).toLowerCase()}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    )
    momentTimer = setTimeout(leaveMoment, earned ? AWARD_MS : DETECTED_MS)
  }

  function onWrong(target: string) {
    const message = state.attempt ? wrongMessage(state.attempt, target) : ''
    note.textContent = message
    drawCode(sentCode, '')
    replay(glyph, 'mf-shake')
    render()
    announce(message)
  }

  /** Commit whatever is pending: a drill answer, or a free character. */
  function commit() {
    const code = decoder.pending
    if (!code) return
    const now = Date.now()
    stopFuse()

    if (!sentOnce) {
      sentOnce = true
      track('hero_send')
    }

    if (view === 'drill' && state.phase !== 'done') {
      decoder.clearPending()
      const target = targetOf(state)
      state = commitSignal(state, code)
      if (!target) return
      if (state.phase === 'detected') onDetected(target, now)
      else onWrong(target)
      return
    }

    const character = decoder.commitCharacter()
    bank(now)
    if (character) {
      tapeText += character
      renderTape(true)
      drawCode(tapePending, '')
      announce(character)
    }
  }

  /** Close the moment on screen and move the machine on. */
  function leaveMoment() {
    if (momentTimer !== null) clearTimeout(momentTimer)
    momentTimer = null
    if (state.phase !== 'detected' && state.phase !== 'wrong') return
    state = advance(state)
    if (state.phase === 'done') {
      view = 'done'
      tapeText = `${state.sent} `
      const stop = doneStop(progressStore.read(), Date.now())
      announce(`${doneHeadline(state.sent)}. Next: ${stop.detail}`)
    }
    render()
  }

  /* --------------------------------------------------------------- the key */

  // No aria-pressed: the key is momentary, not a toggle (A-21). The status
  // line and the TX lamp carry the press.
  function setDown(down: boolean) {
    root.dataset.down = String(down)
    tx.dataset.on = String(down)
  }

  function startTone() {
    if (!soundOn) return
    // Created here, inside the press, because browsers only let an
    // AudioContext start from a user gesture.
    audio ??= new AudioEngine({
      frequency: settings.audio.frequency,
      volume: settings.audio.volume,
    })
    void audio.keyDown().catch(() => {})
  }

  /**
   * The time the input event happened, not the time its handler ran. The
   * first press creates the AudioContext, which can block the main thread
   * long enough that a quick tap, timed at handler time, reads as a dash.
   * Timing the hold by the events' own timestamps keeps a dot a dot.
   */
  let eventTime: number | null = null
  const clock = {
    now: () => eventTime ?? performance.now(),
    setTimeout: (fn: () => void, ms: number) => window.setTimeout(fn, ms),
    clearTimeout: (handle: number) => window.clearTimeout(handle),
  }
  const stamp = (event: Event) => {
    eventTime = event.timeStamp
    // Cleared on the next task, not a microtask: a microtask would run
    // between this capture listener and the handlers that read the clock.
    window.setTimeout(() => {
      eventTime = null
    }, 0)
  }
  for (const type of [
    'keydown',
    'keyup',
    'pointerdown',
    'pointerup',
    'lostpointercapture',
  ] as const) {
    root.addEventListener(type, stamp, { capture: true })
  }

  const engine = new KeyEngine(
    {
      wpm: settings.timing.wpm,
      dotDashThresholdMs: settings.timing.dotDashThresholdMs,
      characterGapMs: settings.timing.characterGapMs,
      wordGapMs: settings.timing.wordGapMs,
      // Always on here: the drill commits instantly when it can, and the free
      // key needs the gap. A manual-commit preference is for the telegraph.
      autoCommit: true,
    },
    {
      onKeyDown: () => {
        stopFuse()
        // Pressing again ends the moment early: an eager learner should not
        // have to wait out the celebration to send the next letter.
        if (state.phase === 'detected' || state.phase === 'wrong') leaveMoment()
        startTone()
        setDown(true)
      },
      onKeyUp: () => {
        audio?.keyUp()
        setDown(false)
      },
      // A hold dropped without a release (`bindKeyboard`'s own blur listener
      // resets the engine before `cancelHold` runs): the tone stops here.
      onCancel: () => {
        audio?.keyUp()
        setDown(false)
      },
      onElement: (element) => {
        unbanked += 1
        decoder.pushElement(element)
        if (view === 'drill' && shouldCommit(decoder.pending, targetOf(state))) {
          // The engine arms its gap timers after this callback returns; drop
          // them, since this character is already decided.
          queueMicrotask(() => engine.reset())
          commit()
          return
        }
        renderPending()
        startFuse()
      },
      onCharacterGap: () => {
        if (decoder.pending) commit()
      },
      onWordGap: () => {
        if (view === 'drill' || !tapeText || tapeText.endsWith(' ')) return
        tapeText += ' '
        renderTape()
      },
    },
    clock,
  )

  /** Let go of a hold the browser never told us ended (blur, tab switch). */
  function cancelHold() {
    // Not gated on `engine.isPressed`: when the station itself has focus,
    // bindKeyboard's blur listener has already reset the engine, and the
    // early return left the tone sounding.
    if (engine.isPressed) engine.reset()
    audio?.keyUp()
    setDown(false)
  }

  /** Escape: drop the character in progress, keep what is on the tape. */
  function cancelPending() {
    cancelHold()
    engine.reset()
    decoder.clearPending()
    stopFuse()
    renderPending()
  }

  const isKeyingKey = (name: string) => name === bindings.key || name === bindings.alternative

  // The key button answers for itself: `bindKeyboard` deliberately ignores
  // events aimed at a button, so a focused key would otherwise be deaf.
  // Handled here and stopped: on reaching the station, `bindKeyboard` would see
  // a keyup aimed at a button and reset the engine, cancelling the gap timer
  // that ends the character.
  key.addEventListener('keydown', (event) => {
    if (!isKeyingKey(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) engine.press()
  })
  key.addEventListener('keyup', (event) => {
    if (!isKeyingKey(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    engine.release()
  })

  key.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    // Stops the long-press menu, text selection and the delayed mouse events;
    // focus is given back explicitly so Space works from here on.
    event.preventDefault()
    // No ring for a pointer press: the key is visibly pressed already.
    key.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
    key.setPointerCapture(event.pointerId)
    engine.press()
  })
  key.addEventListener('pointerup', () => engine.release())
  key.addEventListener('pointercancel', cancelHold)
  key.addEventListener('lostpointercapture', () => {
    if (engine.isPressed) engine.release()
  })
  key.addEventListener('contextmenu', (event) => event.preventDefault())

  // Space anywhere on the instrument's face, once it has focus. Scoped to
  // this element, so the page scrolls normally everywhere else.
  const unbind = bindKeyboard(
    engine,
    { key: bindings.key, alternative: bindings.alternative },
    root,
  )

  const onRootKey = (event: KeyboardEvent) => {
    if (event.key === (bindings.cancel ?? 'Escape')) cancelPending()
  }
  root.addEventListener('keydown', onRootKey)

  // Space typed at the page, with nothing focused, keys the station while it
  // is at least a quarter on screen (J-03), as /telegraph/ and /learn/ do; out
  // of view it scrolls as always. A ten-line observer rather than the shared
  // React hook, so the landing still ships no React.
  let inView = false
  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (entries) => {
            const entry = entries.at(-1)
            if (!entry) return
            inView =
              entry.isIntersecting && entry.intersectionRatio >= HERO_IN_VIEW_THRESHOLD - 0.005
          },
          { threshold: [0, HERO_IN_VIEW_THRESHOLD] },
        )
      : null
  observer?.observe(root)
  const pageKeys = [bindings.key, bindings.alternative].filter((name): name is string =>
    Boolean(name),
  )
  const onPageKey = (event: KeyboardEvent) => {
    const active = document.activeElement
    // A click on the page focuses #main (tabindex=-1, the skip-link target),
    // which is still "the page" rather than a control that owns Space.
    const focusOnPage =
      !active ||
      active === document.body ||
      active === document.documentElement ||
      (active instanceof HTMLElement && active.id === 'main')
    if (!keysFromPage(event, pageKeys, { focusOnPage, inView })) return
    event.preventDefault()
    // Focus moves to the face without scrolling, so the release (and every
    // press after it) reaches the station's own listeners.
    root.focus({ preventScroll: true })
    engine.press(event.timeStamp)
  }
  document.addEventListener('keydown', onPageKey)

  const onFocusIn = () => {
    root.dataset.focused = 'true'
    setDown(engine.isPressed)
  }
  const onFocusOut = (event: FocusEvent) => {
    if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return
    root.dataset.focused = 'false'
    cancelHold()
    setDown(false)
  }
  root.addEventListener('focusin', onFocusIn)
  root.addEventListener('focusout', onFocusOut)

  // A click on the face (not on a link or button) focuses it, so Space keys.
  root.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return
    root.focus({ preventScroll: true })
  })

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-replay]')) {
    button.addEventListener('click', () => {
      state = initialHero()
      view = 'drill'
      tapeText = ''
      note.textContent = ''
      render()
      key.focus({ preventScroll: true })
      announce(
        `Your first signal. Send ${targetOf(state)}: ${instructionFor(targetOf(state) ?? '')}.`,
      )
    })
  }

  // "Send it" links elsewhere on the page jump here and hand over the key.
  const focusLinks = [...document.querySelectorAll<HTMLAnchorElement>('a[data-focus-key]')]
  const focusKey = () => requestAnimationFrame(() => key.focus({ preventScroll: true }))
  for (const link of focusLinks) link.addEventListener('click', focusKey)

  const onBlur = () => cancelHold()
  const onHidden = () => {
    if (document.visibilityState === 'hidden') {
      cancelHold()
      bank(Date.now())
    }
  }
  const onPageHide = () => bank(Date.now())
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onHidden)
  window.addEventListener('pagehide', onPageHide)

  root.dataset.ready = 'true'
  render()

  return () => {
    unbind()
    engine.reset()
    audio?.stopAll()
    root.removeEventListener('keydown', onRootKey)
    document.removeEventListener('keydown', onPageKey)
    observer?.disconnect()
    root.removeEventListener('focusin', onFocusIn)
    root.removeEventListener('focusout', onFocusOut)
    for (const link of focusLinks) link.removeEventListener('click', focusKey)
    window.removeEventListener('blur', onBlur)
    document.removeEventListener('visibilitychange', onHidden)
    window.removeEventListener('pagehide', onPageHide)
  }
}
