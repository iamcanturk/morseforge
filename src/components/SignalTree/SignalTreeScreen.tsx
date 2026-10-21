import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NodeSwatch, SignalTree } from './SignalTree'
import { CharacterDrill, type DrillAttempt } from './CharacterDrill'
import { characterFacts } from '../../data/characters'
import { describeElements } from '../../data/format'
import { ALL_LETTERS, LEARNING_STAGES, MORSE_ALPHABET } from '../../data/morseAlphabet'
import { type NodeState, levelToNodeState, pathTo } from '../../data/tree'
import { AudioEngine, type Playback } from '../../engine/audioEngine'
import { prettify } from '../../engine/morseEncoder'
import { buildTimeline } from '../../engine/timingEngine'
import type { Achievement } from '../../game/achievements'
import { masteryLevel } from '../../game/mastery'
import { bankActivity } from '../../storage/activity'
import {
  type ProgressRecord,
  answer,
  createProgressStore,
  emptyProgress,
  getCharacter,
  markSeen,
  overallMastery,
} from '../../storage/progress'
import {
  type SettingsRecord,
  audioOptions,
  createSettingsStore,
  defaultSettings,
  timingOptions,
} from '../../storage/settings'
import { createStatsStore } from '../../storage/stats'
import { achievementSnapshot } from '../../storage/snapshot'
import { Lamp } from '../ui/Lamp'
import { Screen } from '../ui/Screen'

/**
 * The Signal Tree screen (PROJECT.md §3, §16, §17).
 *
 * Reads progress, draws the board, and plays a character when its pad is
 * picked, with the learner's own tone, volume, speed and sound switch. Then
 * offers a drill on that one character, banked like any other practice.
 */

/** The four node states as the legend names them, in order of progress. */
const LEGEND: { state: NodeState; label: string }[] = [
  { state: 'locked', label: 'Not met' },
  { state: 'discovered', label: 'Met' },
  { state: 'active', label: 'Learning' },
  { state: 'mastered', label: 'Mastered' },
]

/**
 * Play a code as sound and as light, from the learner's settings.
 *
 * The lamp follows the same timeline as the tone, element by element, so with
 * sound switched off the tree still "plays": you watch it instead. With sound
 * off no AudioContext is ever created, so nothing can make a noise.
 */
function useTransmitter(settings: SettingsRecord) {
  const engine = useRef<AudioEngine | null>(null)
  const playback = useRef<Playback | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const [lit, setLit] = useState(false)
  const [busy, setBusy] = useState(false)

  const clear = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer)
    timers.current = []
    playback.current?.stop()
    playback.current = null
    setLit(false)
  }, [])

  // A setting changed mid-visit applies to the next tone.
  useEffect(() => {
    engine.current?.update(audioOptions(settings))
  }, [settings])

  useEffect(
    () => () => {
      clear()
      void engine.current?.dispose()
    },
    [clear],
  )

  const transmit = useCallback(
    async (code: string) => {
      clear()
      const timeline = buildTimeline(code, timingOptions(settings))
      setBusy(true)

      // Light, scheduled from the same timeline the audio uses.
      let at = 0
      for (const element of timeline) {
        const on = element.on
        timers.current.push(setTimeout(() => setLit(on), at))
        at += element.duration
      }
      const done = new Promise<void>((resolve) => {
        timers.current.push(
          setTimeout(() => {
            setLit(false)
            resolve()
          }, at),
        )
      })

      if (settings.audio.enabled) {
        // Created inside the click: browsers only start audio from a gesture.
        // Not awaited: if the browser holds the AudioContext suspended, the
        // light still runs and the button still comes back.
        engine.current ??= new AudioEngine(audioOptions(settings))
        engine.current
          .playTimeline(timeline)
          .then((started) => {
            playback.current = started
          })
          .catch(() => undefined)
      }
      try {
        await done
      } finally {
        setBusy(false)
      }
    },
    [clear, settings],
  )

  return { transmit, lit, busy }
}

export function SignalTreeScreen() {
  const store = useMemo(() => createProgressStore(), [])
  const statsStore = useMemo(() => createStatsStore(), [])
  const settingsStore = useMemo(() => createSettingsStore(), [])

  // Progress starts empty rather than being read during render: this component
  // is prerendered at build time, where there is no localStorage, and rendering
  // different markup on the client than the server would tear the hydration.
  const [progress, setProgress] = useState<ProgressRecord>(emptyProgress)
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)
  const [ready, setReady] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [earned, setEarned] = useState<Achievement[]>([])
  const [bonusXp, setBonusXp] = useState(0)
  const inspector = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setProgress(store.read())
    setReady(true)
    return store.subscribe(setProgress)
  }, [store])

  useEffect(() => {
    setSettings(settingsStore.read())
    return settingsStore.subscribe(setSettings)
  }, [settingsStore])

  const { transmit, lit, busy } = useTransmitter(settings)

  const states = useMemo<Record<string, NodeState>>(() => {
    const now = Date.now()
    return Object.fromEntries(
      ALL_LETTERS.map((character) => {
        const entry = getCharacter(progress, character, now)
        return [character, levelToNodeState(masteryLevel(entry.skills, entry.seen))]
      }),
    )
  }, [progress])

  const power = useMemo(() => overallMastery(progress, ALL_LETTERS), [progress])
  const firstVisit = ready && ALL_LETTERS.every((letter) => states[letter] === 'locked')
  const firstStage = LEARNING_STAGES[0] ?? []

  const select = useCallback(
    (character: string) => {
      setSelected(character)
      setEarned([])
      setBonusXp(0)
      // Opening a character counts as meeting it (§5 level 1 "Seen"), which is
      // what lights the pad before any attempt has been made.
      store.update((current) => markSeen(current, character, Date.now()))
      const code = MORSE_ALPHABET[character]
      if (code) void transmit(code)
    },
    [store, transmit],
  )

  /** Picked from a button rather than the board: bring the inspector into view on a phone. */
  const selectAndShow = useCallback(
    (character: string) => {
      select(character)
      if (window.matchMedia('(max-width: 1023px)').matches) {
        const reduce = prefersStill()
        inspector.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
      }
    },
    [select],
  )

  /**
   * Record a drill answer and bank it.
   *
   * The answer goes to progress (it is real evidence for that skill) and the
   * activity to stats, so the streak counts the day and a first keyed element
   * pays First Signal. No XP per answer: the drill names its own answer, so
   * paying for it would make XP farmable, and then it would be a fake number.
   * Lifetime accuracy is left alone for the same reason.
   */
  const recordAttempt = useCallback(
    ({ character, skill, correct, elements }: DrillAttempt) => {
      const now = Date.now()
      const since = achievementSnapshot(store.read(), statsStore.read(), now)
      store.update((current) => answer(current, character, skill, correct, now))
      const result = bankActivity({ answers: 1, elements, now, since })
      if (result.earned.length > 0) setEarned((current) => [...current, ...result.earned])
      if (result.xp > 0) setBonusXp((current) => current + result.xp)
    },
    [store, statsStore],
  )

  const code = selected ? (MORSE_ALPHABET[selected] ?? null) : null
  const facts = selected ? characterFacts(selected) : undefined
  const path = selected ? pathTo(selected) : []

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <section
        className="mf-instrument -mx-3 min-w-0 p-2 sm:mx-0 sm:p-6"
        aria-label="Morse code tree"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pt-3 sm:px-0 sm:pt-0">
          <span className="mf-engraved flex items-center gap-2">
            <Lamp on={lit} tone="cyan" />
            Signal tree · {ALL_LETTERS[0]}–{ALL_LETTERS.at(-1)}
          </span>
          {/* On the glass, like the board: the pads are drawn from the board's
              own styles, so in either theme the key matches what it explains. */}
          <ul
            className="mf-screen mf-screen-flush grid w-full grid-cols-2 gap-x-4 gap-y-2 rounded-chip px-3 py-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center"
            aria-label="Legend"
          >
            {LEGEND.map(({ state, label }) => (
              <li key={state} className="flex items-center gap-2 text-sm text-ink">
                <NodeSwatch state={state} />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <SignalTree
          states={states}
          power={power}
          highlight={selected}
          onSelect={select}
          beacons={firstVisit ? firstStage : []}
          className="min-w-0"
        />
      </section>

      <aside
        ref={inspector}
        className="mf-instrument p-5 sm:p-6"
        aria-labelledby="tree-inspector-title"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="tree-inspector-title" className="mf-engraved">
            {selected ? 'Node' : 'Start here'}
          </h2>
          {selected && <span className="mf-engraved">Tap any pad to switch</span>}
        </div>

        {selected && code ? (
          <div>
            <p className="sr-only" aria-live="polite">
              {selected}: {facts?.spelled ?? ''}
            </p>
            <Screen grid className="mt-4 px-5 pt-5 pb-4">
              <div className="relative z-[3] flex items-center justify-between gap-4">
                <span className="font-display text-[4.5rem] leading-none font-bold text-signal mf-phosphor">
                  {selected}
                </span>
                <Lamp on={lit} tone="cyan" size="lg" />
              </div>
              <p className="relative z-[3] mt-4">
                <CodePulses code={code} />
              </p>
              {facts && (
                <p className="relative z-[3] mt-1 font-mono text-sm text-muted">
                  “{facts.spoken}” · {describeElements(code)}
                </p>
              )}
            </Screen>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void transmit(code)}
                disabled={busy}
                className="mf-btn mf-btn-audio mf-btn-sm"
              >
                <Lamp on={busy} tone="cyan" />
                {busy ? 'Sending…' : settings.audio.enabled ? 'Play again' : 'Flash again'}
              </button>
              {!settings.audio.enabled && (
                <a
                  href="/settings/#signal"
                  className="text-sm text-muted underline underline-offset-4"
                >
                  Sound is off in settings
                </a>
              )}
            </div>

            <div className="mt-6">
              <h3 className="mf-engraved">Path from the root</h3>
              <ol className="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-label tracking-label">
                {path.map((node, index) => (
                  <li key={node.code || 'root'} className="flex items-center gap-1.5">
                    {index > 0 && (
                      <span aria-hidden="true" className="text-muted">
                        →
                      </span>
                    )}
                    <span
                      className={[
                        'rounded-chip border px-2 py-1',
                        index === path.length - 1
                          ? 'border-cyan text-cyan'
                          : 'border-line-strong text-ink',
                      ].join(' ')}
                    >
                      {index === 0
                        ? 'START'
                        : `${node.code.at(-1) === '.' ? 'DOT' : 'DASH'}${node.character ? ` ${node.character}` : ''}`}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {facts && (facts.mirror || facts.planDay !== null) && (
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                {facts.mirror && (
                  <div>
                    <dt className="mf-engraved">Mirror</dt>
                    <dd className="mt-1 text-ink">
                      <button
                        type="button"
                        onClick={() => select(facts.mirror!)}
                        className="font-mono underline underline-offset-4"
                      >
                        {facts.mirror}
                      </button>{' '}
                      <span className="text-muted">dots and dashes swapped</span>
                    </dd>
                  </div>
                )}
                {facts.planDay !== null && (
                  <div>
                    <dt className="mf-engraved">7-day plan</dt>
                    <dd className="mt-1 text-ink">
                      <a
                        href="/learn-morse-code-in-7-days/"
                        className="underline underline-offset-4"
                      >
                        Day {facts.planDay}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            )}

            <CharacterDrill
              character={selected}
              settings={settings}
              onPlay={() => transmit(code)}
              playing={busy}
              onAttempt={recordAttempt}
            />

            {(earned.length > 0 || bonusXp > 0) && (
              <ul className="mt-5 grid gap-3" aria-label="Just earned">
                {bonusXp > 0 && (
                  <li className="mf-tape mf-slip flex items-center justify-between gap-3">
                    <span>First signal</span>
                    <span className="font-bold">+{bonusXp} XP</span>
                  </li>
                )}
                {earned.map((achievement) => (
                  <li key={achievement.id} className="mf-tape mf-slip flex items-start gap-3">
                    <span aria-hidden="true" className="text-xl">
                      {achievement.icon}
                    </span>
                    <span className="min-w-0 flex-1 tracking-normal">
                      <span className="block font-bold">{achievement.title}</span>
                      <span className="block text-sm">{achievement.description}</span>
                    </span>
                    <span className="mf-stamp mf-stamp-in shrink-0 text-sm text-paper-ink">
                      Received
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <p className="font-display text-h3 font-bold text-ink">Start at the core.</p>
            <p className="mt-2 text-muted">
              {firstStage
                .map((letter) => `${letter} is ${describeElements(MORSE_ALPHABET[letter] ?? '')}`)
                .join(', ')}
              . Every other letter grows from those two: a dot to the left, a dash to the right.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {firstStage.map((letter) => (
                <button
                  key={letter}
                  type="button"
                  onClick={() => selectAndShow(letter)}
                  className="mf-btn mf-btn-secondary"
                >
                  <span className="font-display text-lg">{letter}</span>
                  <span className="font-mono tracking-code text-cyan">
                    {prettify(MORSE_ALPHABET[letter] ?? '')}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-5 text-sm text-muted">
              Pick any pad to hear it, see its path from the root, and drill it right here.
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}

/**
 * A code drawn as pulses, dots round and dashes three times as long, the way
 * it sounds. A typographic middle dot is a speck at any size; this is the
 * shape of the signal. Read out as words for a screen reader.
 */
function CodePulses({ code }: { code: string }) {
  return (
    <span
      className="flex items-center gap-2"
      aria-label={[...code].map((m) => (m === '.' ? 'dot' : 'dash')).join(' ')}
      role="img"
    >
      {[...code].map((mark, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={['block h-3 rounded-full bg-cyan', mark === '.' ? 'w-3' : 'w-9'].join(' ')}
        />
      ))}
    </span>
  )
}

/** Whether motion is off, by the app setting or, failing that, the OS. */
function prefersStill(): boolean {
  const setting = document.documentElement.dataset.motion
  if (setting === 'reduce') return true
  if (setting === 'full') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
