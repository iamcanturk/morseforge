import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession, type SessionStatus } from './useSession'
import { SessionResult, type ResultAction } from './SessionResult'
import { PracticeSetup, type PoolChoice, type PracticeLayout } from './PracticeSetup'
import { MorseKey } from '../MorseKey/MorseKey'
import { useMorseKey } from '../MorseKey/useMorseKey'
import { useInView } from '../MorseKey/useInView'
import { releaseFocus } from '../MorseKey/releaseFocus'
import { MORSE_ALPHABET, ALL_LETTERS, LEARNING_STAGES } from '../../data/morseAlphabet'
import { prettify } from '../../engine/morseEncoder'
import { spokenCode } from '../../engine/spokenCode'
import {
  NEXT_PROMPT_DELAY_MS,
  SESSION_MODES,
  type SessionConfig,
  type SessionMode,
  type SessionSummary,
} from '../../game/session'
import {
  createSettingsStore,
  defaultSettings,
  hasLamp,
  type SettingsRecord,
} from '../../storage/settings'
import { useTransmitter, type TransmitTiming } from '../ui/transmitter'
import { SignalLamp } from '../ui/SignalLamp'
import { distinctPools, feedbackSpeech, receiveLabel } from './practice'
import { SignalTree } from '../SignalTree/SignalTree'
import { levelToNodeState, type NodeState } from '../../data/tree'
import { masteryLevel } from '../../game/mastery'
import {
  createProgressStore,
  emptyProgress,
  getCharacter,
  setMethod,
  newlyUnlocked,
  unlockForSession,
  unlockedCharacters,
  type ProgressRecord,
} from '../../storage/progress'
import type { MethodId } from '../../data/methods'
import { track } from '../../analytics/track'
import {
  DEFAULT_CHALLENGE,
  challengePool,
  challengeShare,
  newSeed,
  parseChallenge,
  seedNumber,
  versus,
  type ChallengeLink,
} from '../../game/challengeLink'
import { SITE } from '../../config/site'
import { ChallengeIntro } from '../Challenge/ChallengeIntro'
import { Screen } from '../ui/Screen'
import { Readout } from '../ui/Readout'
import { Lamp } from '../ui/Lamp'
import '../../styles/pkg-e.css'

export type { PracticeLayout } from './PracticeSetup'

/**
 * Free practice (PROJECT.md §7, §12), the timed challenge (§36, §39.4) and the
 * lesson's drill, as one screen.
 *
 * They are the same loop with a different prompt and a different stopping
 * rule: listening plays the character, reading shows the dots and dashes,
 * sending asks you to key it; a challenge stops on the clock, a drill after a
 * set number, free practice when you say so.
 */

/** A session decided by the caller: the lesson's drill, or "drill these". */
export interface PracticePreset {
  mode: SessionMode
  characters: readonly string[]
  /** How many prompts. */
  length: number
  /** Start without showing the ready screen. The caller's click counts as the gesture. */
  autoStart?: boolean
}

export interface PracticeScreenProps {
  /** The timed, link-shareable challenge instead of free practice. */
  challenge?: boolean
  /** Skip the set-up and run this session (the lesson drill). */
  preset?: PracticePreset
  /** Passed to the result screen: replaces "Again" as its main button. */
  primaryAction?: ResultAction
  /** Called once when a session finishes, with its summary. */
  onFinish?: (summary: SessionSummary) => void
  /**
   * Told whenever the screen moves between ready, running and result, so the
   * caller can show its own controls only where they make sense (the
   * lesson's "Skip the drill" is hidden while a result offers the way on).
   */
  onStatus?: (status: SessionStatus) => void
}

type PoolId = 'method' | 'stage1' | 'stage2' | 'stage3' | 'all'

/** Cumulative stage pools, labelled by their real size. */
function stagePool(stages: number): readonly string[] {
  return LEARNING_STAGES.slice(0, stages).flat()
}

const FIXED_POOLS: readonly PoolChoice<Exclude<PoolId, 'method'>>[] = [
  { id: 'stage1', label: stagePool(1).join(' '), characters: stagePool(1) },
  { id: 'stage2', label: `First ${stagePool(2).length}`, characters: stagePool(2) },
  { id: 'stage3', label: `First ${stagePool(3).length}`, characters: stagePool(3) },
  { id: 'all', label: `All ${ALL_LETTERS.length}`, characters: ALL_LETTERS },
]

/** A "drill these" run: enough prompts per character to mean something. */
const DRILL_PER_CHARACTER = 5
const DRILL_MIN = 10

/** How long feedback stays up. A miss has something to read, so it stays longer. */
const FEEDBACK_MS = { correct: 600, wrong: 1600 } as const

/**
 * Restarting the shake without remounting the field (A-01): two identical
 * animations under two names, alternated, because an animation only restarts
 * when its name changes. The remount it replaces threw focus out of the
 * field on every miss, and again when the miss cleared.
 */
function shakeClass(feedback: Feedback | null): string | undefined {
  if (!feedback || feedback.correct) return undefined
  return feedback.id % 2 === 0 ? 'pe-shake-alt' : 'mf-shake'
}

/** HUD values: a little smaller on a phone, where three plates share 390px, and never wrapped. */
const HUD = 'whitespace-nowrap text-2xl sm:text-readout'

interface Feedback {
  id: number
  correct: boolean
  expected: string
  given: string
}

export function PracticeScreen({
  challenge = false,
  preset,
  primaryAction,
  onFinish,
  onStatus,
}: PracticeScreenProps) {
  const settingsStore = useMemo(() => createSettingsStore(), [])
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)

  const [mode, setMode] = useState<SessionMode>('listening')
  const [poolId, setPoolId] = useState<PoolId>('method')
  const [unlockNotice, setUnlockNotice] = useState<string | null>(null)
  const [layout, setLayout] = useState<PracticeLayout>('flat')
  const [guess, setGuess] = useState('')
  /** "Drill these N characters" from a result (P10). Overrides everything else. */
  const [drill, setDrill] = useState<PracticePreset | null>(null)

  /**
   * What just happened, held long enough to be read.
   *
   * A wrong answer used to flash a red border for 260ms and move on, so the
   * learner never found out what the character actually was, which is the one
   * thing they needed.
   */
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const answerCount = useRef(0)

  /**
   * The challenge described by the URL (PROJECT.md §36).
   *
   * Read after mount rather than during render: this page is prerendered, so
   * there is no query string at build time, and reading one during render
   * would tear hydration on any link that carries parameters.
   */
  const [link, setLink] = useState<ChallengeLink>(DEFAULT_CHALLENGE)
  /** The seed this run uses: the link's, or a fresh one per run. */
  const [runSeed, setRunSeed] = useState<string | null>(null)
  useEffect(() => {
    if (challenge) setLink(parseChallenge(window.location.search))
  }, [challenge])

  const input = useRef<HTMLInputElement>(null)
  /**
   * The screen's outer frame. Set-up, running session and result all render
   * inside it at the same place, so on Start its position is where the
   * session's instrument will be (V-01).
   */
  const frame = useRef<HTMLDivElement>(null)
  /** The key and its buttons, watched so Space keys only while they are on screen. */
  const keyDesk = useRef<HTMLDivElement>(null)

  const progressStore = useMemo(() => createProgressStore(), [])
  const [progress, setProgress] = useState<ProgressRecord>(emptyProgress)

  useEffect(() => {
    setSettings(settingsStore.read())
    return settingsStore.subscribe(setSettings)
  }, [settingsStore])

  useEffect(() => {
    setProgress(progressStore.read())
    return progressStore.subscribe(setProgress)
  }, [progressStore])

  useEffect(
    () => () => {
      if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current)
    },
    [],
  )

  const methodCharacters = useMemo(() => unlockedCharacters(progress), [progress])

  const pools = useMemo<readonly PoolChoice<PoolId>[]>(
    () => [
      {
        id: 'method',
        label: `My method (${methodCharacters.length})`,
        characters: methodCharacters,
      },
      ...distinctPools(FIXED_POOLS, methodCharacters),
    ],
    [methodCharacters],
  )
  // A pool can drop out of the list when the method grows into it; the
  // characters are then the method's own, so "My method" is the same choice.
  const pool = pools.find((entry) => entry.id === poolId) ?? pools[0]!

  // A preset's identity can change every render (an inline object); its
  // contents are what matter.
  const presetKey = preset
    ? `${preset.mode}|${preset.characters.join('')}|${preset.length}|${preset.autoStart ?? false}`
    : ''
  const presetRef = useRef(preset)
  presetRef.current = preset
  const fixed = useMemo(() => drill ?? presetRef.current ?? null, [drill, presetKey])
  const timed = challenge && drill === null

  const config = useMemo<SessionConfig>(() => {
    if (timed) {
      return {
        mode: 'listening',
        characters: challengePool(link),
        durationMs: link.time * 1000,
        target: link.count,
        seed: runSeed === null ? null : seedNumber(runSeed),
      }
    }
    if (fixed) {
      return {
        mode: fixed.mode,
        characters: fixed.characters,
        durationMs: null,
        target: Math.max(1, Math.round(fixed.length)),
        seed: null,
      }
    }
    return { mode, characters: pool.characters, durationMs: null, target: null, seed: null }
  }, [timed, fixed, link, runSeed, mode, pool])

  const session = useSession(config)
  const { current, promptId, status, submit, holdClock, releaseClock } = session

  /**
   * When the last answer went in, while the next listening prompt waits for
   * its feedback to be read out (A-06). Null before the first prompt of a
   * run, which has nothing to wait for.
   */
  const answeredAt = useRef<number | null>(null)
  /** The wait before the next prompt, so "Play again" can cut it short. */
  const pendingPrompt = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Starting is queued to the next render. A start that changes the config
   * (a fresh seed, a drill pool) must run after React has rebuilt it, or the
   * session would start on the previous one.
   */
  const [startToken, setStartToken] = useState(0)
  const { start } = session
  const startedToken = useRef(0)
  useEffect(() => {
    if (startToken === 0 || startedToken.current === startToken) return
    startedToken.current = startToken
    answeredAt.current = null
    // Bring the instrument's top into view first, then start, then focus the
    // field without letting focus choose the scroll position. Focus alone
    // scrolled just far enough to show the field, which left the prompt and
    // the score under the sticky header (V-01). The header's height comes
    // from the page's scroll-padding, so this needs no number of its own.
    // The jump is instant, not smooth: the first prompt goes out at once, and
    // a lamp that is still sliding into place while it flashes is a lamp
    // that cannot be read.
    const view = frame.current
    if (view) {
      const top = view.getBoundingClientRect().top
      const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
      if (top < padding || top > window.innerHeight / 2) {
        view.scrollIntoView({ block: 'start', behavior: 'instant' })
      }
    }
    start()
    setTimeout(() => input.current?.focus({ preventScroll: true }), 50)
  }, [startToken, start])
  const queueStart = useCallback(() => setStartToken((n) => n + 1), [])

  const beginChallenge = useCallback(() => {
    track('challenge_start', `${link.time}s`)
    setUnlockNotice(null)
    setDrill(null)
    // A link's seed is the run; without one, every run gets its own.
    setRunSeed(link.seed ?? newSeed())
    queueStart()
  }, [link, queueStart])

  const beginPractice = useCallback(() => {
    track('practice_start', config.mode)
    setUnlockNotice(null)
    queueStart()
  }, [config.mode, queueStart])

  // A preset that asks for it starts straight away; the caller's click was
  // the gesture that lets audio play.
  const autoStarted = useRef('')
  useEffect(() => {
    if (!preset?.autoStart || autoStarted.current === presetKey) return
    autoStarted.current = presetKey
    queueStart()
  }, [preset?.autoStart, presetKey, queueStart])

  /**
   * Every listening prompt goes out through the Signal setting (A-03,
   * DEC-045): as a tone, as a lamp flashing each element with the tone's
   * exact timing, or both. Sound off used to mean a silent "?" and nothing
   * to answer.
   */
  const transmitter = useTransmitter(settings)
  const { transmit, stop: stopTransmit } = transmitter
  const playingPrompt = transmitter.busy
  const lamp = config.mode === 'listening' && hasLamp(settings)

  // A shared challenge sets its own speed, with no personal spacing: that is
  // part of what makes it the same challenge for both people.
  const wpm = timed ? link.wpm : settings.timing.wpm
  const farnsworthWpm = timed ? link.wpm : settings.timing.farnsworthWpm
  const timing = useMemo<TransmitTiming>(() => ({ wpm, farnsworthWpm }), [wpm, farnsworthWpm])

  const play = useCallback(
    (character: string) => {
      const code = MORSE_ALPHABET[character]
      if (code) void transmit(code, timing)
    },
    [transmit, timing],
  )
  // Read through a ref by the prompt effect, so a settings change mid-run
  // (another tab) applies to the next prompt instead of replaying this one.
  const playRef = useRef(play)
  playRef.current = play

  // Send the prompt as it appears, in listening mode. The AudioContext is
  // already unlocked by then: the user pressed Start. After an answer it waits
  // NEXT_PROMPT_DELAY_MS, so a screen reader can say "T, correct" before the
  // next tone starts under it (A-06). The clock is held for that wait and
  // released as the prompt goes out: the pause is the screen's, not the
  // learner's, and a timed run must not lose it.
  useEffect(() => {
    if (status !== 'running' || current === null) return
    if (config.mode !== 'listening') return
    const character = current
    const since = answeredAt.current
    const wait =
      since === null ? 0 : Math.max(0, NEXT_PROMPT_DELAY_MS - (performance.now() - since))
    const send = () => {
      pendingPrompt.current = null
      releaseClock()
      playRef.current(character)
    }
    if (wait === 0) {
      send()
      return
    }
    const timer = setTimeout(send, wait)
    pendingPrompt.current = timer
    return () => {
      clearTimeout(timer)
      if (pendingPrompt.current === timer) pendingPrompt.current = null
    }
  }, [promptId, current, status, config.mode, releaseClock])

  /** "Play again": sends the prompt now, cutting any wait short. */
  const replay = useCallback(() => {
    if (current === null) return
    if (pendingPrompt.current !== null) {
      clearTimeout(pendingPrompt.current)
      pendingPrompt.current = null
    }
    releaseClock()
    play(current)
  }, [current, play, releaseClock])

  const answer = useCallback(
    (given: string) => {
      const expected = current ?? ''
      const correct = submit(given)
      if (config.mode === 'listening') {
        // An answer ends the prompt: a guess typed mid-character should not
        // leave the rest of it sounding into the pause.
        stopTransmit()
        answeredAt.current = performance.now()
        holdClock()
      }
      answerCount.current += 1
      setFeedback({
        id: answerCount.current,
        correct,
        expected,
        given: given.trim().toUpperCase(),
      })
      setGuess('')
      // One timer at a time (B11). The old one was never cancelled, so a
      // quick right answer inside a miss's window had its feedback wiped by
      // the miss's timer.
      if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current)
      feedbackTimer.current = setTimeout(
        () => setFeedback(null),
        correct ? FEEDBACK_MS.correct : FEEDBACK_MS.wrong,
      )
      input.current?.focus()
    },
    [submit, current, config.mode, stopTransmit, holdClock],
  )

  /** Mastery-derived node states, so the tree shows progress while you drill. */
  const nodeStates = useMemo<Record<string, NodeState>>(() => {
    const now = Date.now()
    return Object.fromEntries(
      ALL_LETTERS.map((character) => {
        const entry = getCharacter(progress, character, now)
        return [character, levelToNodeState(masteryLevel(entry.skills, entry.seen))]
      }),
    )
  }, [progress])

  const treeLayout = layout === 'tree' && !challenge && fixed === null
  const keyShown = status === 'running' && (treeLayout || config.mode === 'sending')
  // As on the telegraph (DEC-028): with the tree and the guide below, Space
  // pages down once the key is out of view, instead of keying a prompt the
  // learner cannot see.
  const keyInView = useInView(keyDesk, { enabled: keyShown })

  const key = useMorseKey({
    wpm: settings.timing.wpm,
    dotDashThresholdMs: settings.timing.dotDashThresholdMs,
    characterGapMs: settings.timing.characterGapMs,
    wordGapMs: settings.timing.wordGapMs,
    autoCommit: settings.timing.autoCommit,
    bindings: settings.keys,
    frequency: settings.audio.frequency,
    volume: settings.audio.enabled ? settings.audio.volume : 0,
    // In tree layout the key is always live: keying a character back is a
    // legitimate way to say you recognised it, not only a sending exercise.
    disabled: status !== 'running' || (!treeLayout && config.mode !== 'sending'),
    windowKeys: keyInView,
    onCharacter: (sent) => answer(sent),
  })

  const { reset: resetKey } = key
  useEffect(() => {
    resetKey()
  }, [promptId, resetKey])

  /**
   * Unlock the next step (a character for Koch, a stage otherwise) when a
   * finished session clears the bar.
   *
   * Checked once per finished session rather than per answer: accuracy over a
   * whole session is the measure Koch describes, and unlocking mid-session
   * would introduce a character the learner has never seen into a run they are
   * being scored on. Only "My method" sessions count: a challenge, a drill or
   * a fixed pool says nothing about the learner's own order.
   *
   * "Once" is enforced by the ref, keyed on the summary object. The unlock
   * itself changes `progress`, which re-runs this effect with the same
   * summary; without the guard one good session cascaded through every stage
   * to all 36 characters.
   */
  const summary = session.summary
  const unlockedFor = useRef<typeof summary>(null)
  const ownsPool = poolId === 'method' && !challenge && fixed === null
  useEffect(() => {
    if (status !== 'finished' || !summary || !ownsPool) return
    if (unlockedFor.current === summary) return
    unlockedFor.current = summary

    const before = progressStore.read()
    const after = unlockForSession(before, summary)
    if (after === before) return
    progressStore.write(after)
    setUnlockNotice(newlyUnlocked(before, after).join(' ') || null)
  }, [status, summary, ownsPool, progressStore])

  useEffect(() => {
    onStatus?.(status)
  }, [status, onStatus])

  // A run can end on the clock in the middle of a character; the result
  // screen should not be read to the rest of it.
  useEffect(() => {
    if (status !== 'running') stopTransmit()
  }, [status, stopTransmit])

  // Tell the caller once per finished session (the lesson banks its stage).
  const reportedFor = useRef<typeof summary>(null)
  useEffect(() => {
    if (status !== 'finished' || !summary || reportedFor.current === summary) return
    reportedFor.current = summary
    onFinish?.(summary)
  }, [status, summary, onFinish])

  /* ------------------------------------------------------------- finished */

  if (status === 'finished' && session.summary) {
    const result = session.summary
    const playedLink: ChallengeLink = { ...link, seed: runSeed ?? link.seed }
    const characters = challengePool(link)

    const startDrill = (weak: readonly string[]) => {
      setUnlockNotice(null)
      setDrill({
        mode: config.mode,
        characters: weak,
        length: Math.max(DRILL_MIN, weak.length * DRILL_PER_CHARACTER),
      })
      track('practice_start', 'drill')
      queueStart()
    }

    const leaveDrill: ResultAction = {
      label: challenge
        ? 'Back to the challenge'
        : preset
          ? 'Back to the stage drill'
          : 'Back to set-up',
      onClick: () => {
        setDrill(null)
        session.reset()
      },
    }
    // The caller's way on (the lesson's "Next stage") stays the main button
    // after a "drill these" run too; going back becomes the quieter choice.
    // Losing it left a learner with no way forward but redoing the stage.
    const main = drill ? (primaryAction ?? leaveDrill) : primaryAction
    const back = drill && primaryAction ? leaveDrill : undefined

    return (
      <div ref={frame}>
        <SessionResult
          summary={result}
          challenge={timed}
          time={link.time}
          unlocked={unlockNotice}
          earned={session.earned}
          versus={timed ? versus(link, result.score) : null}
          primaryAction={main}
          secondaryAction={back}
          againLabel={drill ? 'Drill again' : timed ? 'Play again' : 'Again'}
          onAgain={() => {
            setUnlockNotice(null)
            if (timed) beginChallenge()
            else queueStart()
          }}
          onDrill={startDrill}
          share={
            timed && playedLink.seed !== null
              ? challengeShare({
                  challenge: playedLink,
                  score: result.score,
                  correct: result.correct,
                  total: result.total,
                  accuracy: result.accuracy,
                  siteUrl: SITE.url,
                  siteName: SITE.name,
                })
              : fixed !== null
                ? null
                : undefined
          }
          shareBlurb={
            timed
              ? `The link carries this exact run: the same ${characters.length} letters in the same order at ${link.wpm} WPM${result.score > 0 ? `, with your ${result.score} to beat` : ''}. Nothing is stored anywhere.`
              : undefined
          }
        />
      </div>
    )
  }

  /* ----------------------------------------------------------------- idle */

  if (status === 'idle') {
    if (challenge && drill === null) {
      return (
        <div ref={frame}>
          <ChallengeIntro link={link} onStart={beginChallenge} signal={settings.signal} />
        </div>
      )
    }

    if (fixed) {
      // A preset that waits for the learner: one line and a button, no form.
      return (
        <div ref={frame}>
          <section aria-labelledby="ready-heading" className="mf-instrument p-5 sm:p-8">
            <h2 id="ready-heading" className="mf-engraved flex items-center gap-2">
              <span className="mf-lamp" data-on="true" aria-hidden="true" />
              Ready · {SESSION_MODES[fixed.mode].label} · {fixed.length} prompts
            </h2>
            <p className="mt-4 font-mono text-label tracking-code text-muted">
              {fixed.characters.join(' ')}
            </p>
            <button
              type="button"
              onClick={beginPractice}
              className="mf-btn mf-btn-primary mf-btn-lg mf-btn-block mt-6"
            >
              Start
            </button>
          </section>
        </div>
      )
    }

    return (
      <div ref={frame}>
        <PracticeSetup
          mode={mode}
          onMode={setMode}
          pools={pools}
          poolId={poolId}
          onPool={setPoolId}
          layout={layout}
          onLayout={setLayout}
          progress={progress}
          onMethod={(next: MethodId) => {
            track('method_change', next)
            progressStore.update((record) => setMethod(record, next))
            setPoolId('method')
          }}
          onStart={beginPractice}
          signal={settings.signal}
        />
      </div>
    )
  }

  /* -------------------------------------------------------------- running */

  const seconds = session.remaining === null ? null : Math.ceil(session.remaining / 1000)
  const code = current ? MORSE_ALPHABET[current] : null
  const correctSoFar = session.attempts.filter((a) => a.correct).length
  const answered = session.attempts.length
  const urgent = seconds !== null && seconds <= 10
  const showForm = !treeLayout && config.mode !== 'sending'

  return (
    <div ref={frame}>
      <section aria-label="Practice session" className="mf-instrument p-4 sm:p-6">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-stretch gap-3">
          <Readout
            label="Right"
            value={
              <span className={HUD}>
                {correctSoFar}
                <span className="text-muted">/{answered}</span>
              </span>
            }
            tone="signal"
          />
          {seconds !== null ? (
            <div
              role="timer"
              // Announced every ten seconds rather than every tick: a per-second
              // live region would talk over the character being played, which
              // is the thing the user is trying to hear.
              aria-live={seconds % 10 === 0 ? 'polite' : 'off'}
              aria-label={`${seconds} seconds left${urgent ? ', hurry' : ''}`}
            >
              <Readout
                label={urgent ? 'Time !' : 'Time'}
                value={<span className={HUD}>{seconds}s</span>}
                tone={urgent ? 'danger' : 'ink'}
                lamp={urgent}
                className="h-full"
              />
            </div>
          ) : config.target !== null ? (
            <Readout
              label="Prompt"
              value={
                <span className={HUD}>
                  {Math.min(answered + 1, config.target)}
                  <span className="text-muted">/{config.target}</span>
                </span>
              }
            />
          ) : (
            <Readout
              label="Accuracy"
              value={
                <span className={HUD}>
                  {answered === 0 ? '—' : `${Math.round((correctSoFar / answered) * 100)}%`}
                </span>
              }
            />
          )}
          <button
            type="button"
            onClick={session.stop}
            className="mf-btn mf-btn-danger self-center border border-line-strong"
          >
            End
          </button>
        </div>

        <Screen grid className="pe-prompt mt-4 grid grid-rows-[auto_1fr_auto] gap-4 p-4 sm:p-6">
          <div className="relative z-[3] flex items-center justify-between gap-3">
            <span className="mf-engraved flex items-center gap-2">
              {/* RX stays lit for the whole transmission, not per element:
                blinking with the dots would read the answer out visually.
                With Signal = Lamp or Both, reading it out visually is the
                point, and the big lamp below does it; this one only says a
                transmission is under way. */}
              <Lamp
                on={config.mode === 'listening' ? playingPrompt : true}
                tone={config.mode === 'listening' ? 'cyan' : 'signal'}
                label={playingPrompt ? 'Receiving' : undefined}
              />
              {config.mode === 'listening'
                ? receiveLabel(settings.signal)
                : config.mode === 'recognition'
                  ? 'Read'
                  : 'TX · send'}
            </span>
            <div className="min-h-6 text-right">
              {/* What a screen reader hears, in words (A-02, A-11): the answer
                and, on a miss, what it was and how it sounds. Keyed per
                answer, so two identical results in a row are both read. */}
              <span aria-live="polite" className="sr-only">
                {feedback && <span key={feedback.id}>{feedbackSpeech(feedback)}</span>}
              </span>
              {feedback &&
                (feedback.correct ? (
                  <span aria-hidden="true" className="font-mono text-control text-signal uppercase">
                    ✓ {feedback.expected} · correct
                  </span>
                ) : (
                  <span aria-hidden="true" className="font-mono text-control text-danger uppercase">
                    ✕ {feedback.given ? `You said ${feedback.given}` : 'Missed'}
                    {config.mode === 'sending' && (
                      <>
                        {' · it was '}
                        <span className="text-ink">{feedback.expected}</span>{' '}
                        <span className="text-cyan tracking-code">
                          {prettify(MORSE_ALPHABET[feedback.expected] ?? '')}
                        </span>
                      </>
                    )}
                  </span>
                ))}
            </div>
          </div>

          <div className="relative z-[3] grid place-items-center gap-4 text-center">
            {/* The receiving lamp, outside the prompt and the correction: the
              next character can start flashing while a miss is still on
              screen, and the lamp must be there to show it. */}
            {lamp && <SignalLamp lit={transmitter.lit} />}

            {feedback && !feedback.correct && config.mode === 'listening' ? (
              // The correction, big: being told is the entire point of a miss.
              // Only when listening, where the screen has nothing else to show;
              // reading and sending keep the next prompt up. The live region
              // above says all of it, so this is for the eye only.
              <div key={feedback.id} className="grid justify-items-center gap-2" aria-hidden="true">
                <span className="mf-engraved">It was</span>
                <span className="font-display text-glyph font-bold text-ink">
                  {feedback.expected}
                </span>
                <span className="font-mono text-[clamp(2.25rem,7vw,3.5rem)] leading-none tracking-code text-cyan">
                  {prettify(MORSE_ALPHABET[feedback.expected] ?? '')}
                </span>
              </div>
            ) : (
              <div
                key={feedback?.id ?? 'prompt'}
                className={
                  feedback?.correct
                    ? 'pe-pulse grid justify-items-center gap-4'
                    : 'grid justify-items-center gap-4'
                }
              >
                {config.mode === 'listening' && (
                  <span
                    className="font-display text-glyph font-bold text-signal mf-phosphor"
                    aria-hidden="true"
                  >
                    {feedback?.correct ? feedback.expected : '?'}
                  </span>
                )}
                {config.mode === 'recognition' && code && (
                  <>
                    <span
                      className="font-mono text-[clamp(2.5rem,9vw,4.5rem)] tracking-code text-cyan"
                      aria-hidden="true"
                    >
                      {prettify(code)}
                    </span>
                    <span className="sr-only">{spokenCode(code)}</span>
                  </>
                )}
                {config.mode === 'sending' && current && (
                  <span className="font-display text-glyph font-bold text-signal mf-phosphor">
                    {current}
                  </span>
                )}
              </div>
            )}

            {/* Read mode's miss, as a moment rather than a footnote (V-21):
              the character and its code, big, under the next prompt while
              the field shakes. The line is always there, so the prompt does
              not jump when it fills. */}
            {config.mode === 'recognition' && (
              <p className="min-h-8 font-mono text-h3 leading-none" aria-hidden="true">
                {feedback && !feedback.correct && (
                  <>
                    <span className="text-danger">✕</span>{' '}
                    <span className="font-display font-bold text-ink">{feedback.expected}</span>
                    <span className="text-muted"> = </span>
                    <span className="tracking-code text-cyan">
                      {prettify(MORSE_ALPHABET[feedback.expected] ?? '')}
                    </span>
                  </>
                )}
              </p>
            )}

            {/* Always there in listening mode, including while a correction is
              up: in the timed challenge, hiding it cost seconds (B11). Its
              name is its visible text (A-17); the RX lamp shows when it is
              sending. */}
            {config.mode === 'listening' && current && (
              <button type="button" onClick={replay} className="mf-btn pe-screen-btn">
                <span aria-hidden="true">▶</span> Play again
              </button>
            )}
          </div>

          {showForm ? (
            <form
              className="relative z-[3] grid grid-cols-[minmax(0,1fr)_auto] gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (guess.trim()) answer(guess)
              }}
            >
              <label htmlFor="practice-answer" className="sr-only">
                What character was that?
              </label>
              {/* Never remounted: the field keeps focus through a miss (A-01). */}
              <div className={shakeClass(feedback)}>
                <input
                  id="practice-answer"
                  ref={input}
                  value={guess}
                  // Only the last character typed: a learner who types "AB" meant
                  // B, and making them clear the field first breaks the rhythm.
                  onChange={(event) => setGuess(event.target.value.slice(-1))}
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="send"
                  maxLength={1}
                  placeholder="?"
                  className="mf-input-answer"
                />
              </div>
              <button
                type="submit"
                disabled={guess.trim() === ''}
                className="mf-btn mf-btn-primary min-h-[72px] px-6"
              >
                Enter
              </button>
            </form>
          ) : (
            <span />
          )}
        </Screen>

        {treeLayout && (
          <div className="mt-6">
            <SignalTree
              states={nodeStates}
              // Highlighted only during feedback. Lighting the target while the
              // prompt is still up would answer the question for them.
              highlight={feedback ? feedback.expected : null}
              // The path being keyed right now, so the learner watches themselves
              // walk the tree rather than being told about it afterwards.
              livePath={key.state.pending}
              onSelect={answer}
              className="min-w-0"
            />
            <p className="mt-3 text-center text-sm text-muted">
              Tap a node, or key it and watch the path light up as you go.
            </p>
          </div>
        )}

        {(treeLayout || config.mode === 'sending') && (
          <div ref={keyDesk} className="mt-6">
            <MorseKey
              isDown={key.state.isDown}
              pending={key.state.pending}
              preview={key.state.preview}
              commitProgress={key.state.commitProgress}
              autoCommit={settings.timing.autoCommit}
              keyLabel={settings.keys.key === ' ' ? 'SPACE' : settings.keys.key.toUpperCase()}
              commitLabel={(settings.keys.submit ?? 'Control').toUpperCase()}
              pointerHandlers={key.pointerHandlers}
            />
            <button
              type="button"
              onClick={(event) => {
                // A click leaves focus here, and Space aimed at a button is not
                // a key press: give focus back so the next character keys.
                releaseFocus(event)
                key.commitCharacter()
              }}
              disabled={key.state.pending === ''}
              className="mf-btn mf-btn-secondary mf-btn-block mx-auto mt-5 max-w-md"
            >
              Finish character
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
