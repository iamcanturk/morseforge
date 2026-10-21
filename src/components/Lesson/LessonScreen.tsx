import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MorseKey } from '../MorseKey/MorseKey'
import { useInView } from '../MorseKey/useInView'
import { useMorseKey } from '../MorseKey/useMorseKey'
import { SignalTree } from '../SignalTree/SignalTree'
import { PracticeScreen } from '../Practice/PracticeScreen'
import { releaseFocus } from '../MorseKey/releaseFocus'
import { MorsePlayer } from '../MorsePlayer/MorsePlayer'
import { Lamp } from '../ui/Lamp'
import { Readout } from '../ui/Readout'
import { Screen } from '../ui/Screen'
import { useInstallPrompt } from '../ui/install'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import {
  HEAR_FIRST_HASH,
  LESSON_ORDER,
  LESSON_STAGES,
  STEP_COPY,
  TEACH_STEPS,
  commitOnTarget,
  courseProgress,
  drillPreset,
  entryPosition,
  nextPosition,
  poolThroughStage,
  stageDay,
  stageStart,
  stageStatuses,
  targetCode,
  type LessonPosition,
  type StageStatus,
} from './lesson'
import { track } from '../../analytics/track'
import { prettify } from '../../engine/morseEncoder'
import { spokenCode } from '../../engine/spokenCode'
import { UNKNOWN_CHARACTER } from '../../engine/morseDecoder'
import type { Achievement } from '../../game/achievements'
import { XP, xpForAnswer } from '../../game/progression'
import { bankActivity } from '../../storage/activity'
import {
  answer as recordAnswer,
  createProgressStore,
  emptyProgress,
  markSeen,
  newlyUnlocked,
  unlockedCharacters,
  unlockTaught,
  type ProgressRecord,
} from '../../storage/progress'
import { createSettingsStore, defaultSettings, type SettingsRecord } from '../../storage/settings'
import { achievementSnapshot } from '../../storage/snapshot'
import { createStatsStore } from '../../storage/stats'

/**
 * The guided lesson (PROJECT.md §4.1, §45, §46, §48).
 *
 * Teach a character three ways — see it, hear it, send it — then drill
 * everything taught so far. §46's loop is show, try, fail, try again; the drill
 * is the "try" and it comes straight after the teaching rather than being a
 * separate screen the learner has to go and find.
 *
 * Phases: `teach` (see, hear, send per character) → `cleared` (the stage is
 * banked and celebrated) → `drill` (the practice screen on this stage's pool)
 * → the next stage, or `complete` after the last one. A learner who has
 * already finished arrives at `complete` instead of being re-taught the last
 * character.
 */

export interface NextStep {
  href: string
  label: string
  hint: string
}

export interface LessonScreenProps {
  /** Where to go after the course: built from the page registry by the page. */
  nextSteps?: readonly NextStep[]
}

type Phase = 'teach' | 'cleared' | 'drill' | 'complete'

/** How long "That is E" stays up before the next step. The key is off meanwhile. */
const ADVANCE_DELAY_MS = 900

interface SendFeedback {
  correct: boolean
  /** What the learner keyed, as a code. */
  code: string
  /** What it decoded to. */
  sent: string
  /** XP this send banked, including a first-signal bonus. */
  xp: number
  firstSignal: boolean
  /** Re-keys the flash and the rising XP. */
  id: number
}

interface StageReport {
  stage: number
  xp: number
  unlocked: string[]
  /** Characters practice draws from now, under the learner's method. */
  pool: number
  /** Whether that pool holds everything taught so far. Not under Koch, early on. */
  covered: boolean
  sends: number
}

/** "S U R W", or "0–9" for a run of digits. */
function stageLabel(characters: readonly string[]): string {
  if (characters.length > 4 && characters.every((c) => /\d/.test(c))) {
    return `${characters[0]}–${characters.at(-1)}`
  }
  return characters.join(' ')
}

const STATUS_TEXT: Record<StageStatus, string> = {
  done: 'done',
  current: 'in progress',
  todo: 'not started',
}

/** Every stage of the course, so the learner always knows how far there is to go. */
function StageRail({ statuses }: { statuses: readonly StageStatus[] }) {
  return (
    <ol aria-label="Course stages" className="grid grid-cols-7 gap-1.5 sm:gap-2">
      {LESSON_STAGES.map((characters, index) => {
        const status = statuses[index] ?? 'todo'
        return (
          <li
            key={index}
            data-status={status}
            aria-current={status === 'current' ? 'step' : undefined}
            className="group flex min-w-0 flex-col items-center gap-1 rounded-chip border border-line-strong bg-void px-1 py-2 data-[status=current]:border-amber data-[status=done]:bg-elevated"
          >
            <span className="flex items-center gap-1.5">
              <Lamp on={status !== 'todo'} tone={status === 'current' ? 'amber' : 'signal'} />
              <span
                aria-hidden="true"
                className="font-mono text-label text-muted tabular-nums group-data-[status=current]:text-ink"
              >
                {index + 1}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="hidden max-w-full truncate font-mono text-label text-muted sm:block"
            >
              {stageLabel(characters).replaceAll(' ', '')}
            </span>
            <span className="sr-only">
              Stage {index + 1}, {stageLabel(characters)}: {STATUS_TEXT[status]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** See · Hear · Send, as plates: done is lit, current is amber, to come is dark. */
function StepPlates({ step }: { step: LessonPosition['step'] }) {
  const current = TEACH_STEPS.indexOf(step)
  return (
    <ol aria-label="Steps for this character" className="grid grid-cols-3 gap-2">
      {TEACH_STEPS.map((entry, index) => {
        const status: StageStatus =
          index < current ? 'done' : index === current ? 'current' : 'todo'
        return (
          <li
            key={entry}
            data-status={status}
            aria-current={status === 'current' ? 'step' : undefined}
            className="group flex items-center justify-center gap-2 rounded-chip border border-line-strong px-2 py-2 data-[status=current]:border-amber data-[status=current]:bg-elevated"
          >
            <Lamp on={status !== 'todo'} tone={status === 'current' ? 'amber' : 'signal'} />
            <span className="font-mono text-control text-muted uppercase group-data-[status=current]:text-ink">
              {STEP_COPY[entry].label}
            </span>
            <span className="sr-only">: {STATUS_TEXT[status]}</span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * START → · → − → A: where a character sits, without the full tree.
 *
 * Used on a phone, where the tree would scroll sideways, and for digits, which
 * sit a layer below the letters the tree diagram draws.
 */
function PathRibbon({ character, code }: { character: string; code: string }) {
  return (
    <ol
      aria-label={`Path from the start: ${spokenCode(code)}, then ${character}`}
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-3"
    >
      <li className="mf-engraved">Start</li>
      {[...code].map((element, index) => (
        <li key={index} aria-hidden="true" className="flex items-center gap-2">
          <span className="text-muted">→</span>
          <span className="mf-kbd h-9 min-w-9 px-2.5">
            <span
              className={[
                'block h-2.5 rounded-full bg-ink',
                element === '.' ? 'w-2.5' : 'w-7',
              ].join(' ')}
            />
          </span>
        </li>
      ))}
      <li aria-hidden="true" className="flex items-center gap-2">
        <span className="text-muted">→</span>
        <span className="font-display text-h2 font-bold text-signal">{character}</span>
      </li>
    </ol>
  )
}

/**
 * The code as phosphor pulses: a dot is a round blip, a dash three times as
 * long, which is the timing ratio itself. A middle-dot glyph at text size was
 * a speck next to a 136px letter.
 */
function CodePulses({ code }: { code: string }) {
  return (
    <span role="img" aria-label={`Code: ${spokenCode(code)}`} className="flex items-center gap-3">
      {[...code].map((element, index) => (
        <span
          key={index}
          className={[
            'block h-3.5 rounded-full bg-signal',
            element === '.' ? 'w-3.5' : 'w-11',
          ].join(' ')}
        />
      ))}
    </span>
  )
}

/** Newly earned achievements, as telegram slips inside the lesson (no global toast). */
function AchievementSlips({ earned }: { earned: readonly Achievement[] }) {
  if (earned.length === 0) return null
  return (
    <ul aria-label="Achievements received" className="grid gap-3">
      {earned.map((achievement) => (
        <li key={achievement.id} className="mf-tape mf-slip flex items-center gap-4 pr-8">
          <span aria-hidden="true" className="text-h3 tracking-normal">
            {achievement.icon}
          </span>
          <span className="min-w-0 flex-1 tracking-normal">
            <span className="block font-display text-base font-bold">{achievement.title}</span>
            <span className="block text-sm text-paper-muted">{achievement.description}</span>
          </span>
          <span className="font-mono text-label text-paper-muted uppercase">Received</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The loading state at the lesson's final height, so nothing jumps on arrival.
 *
 * Built from the "See it" step's own boxes, because on a phone the page intro
 * now sits right under the lesson (DEC-044): any difference in height would
 * move it as the island wakes up. The heading and the step copy are drawn as
 * bars over their real text, so they wrap exactly as the real ones will.
 */
function LessonSkeleton() {
  const bar = 'rounded-chip bg-elevated text-transparent [box-decoration-break:clone]'
  return (
    <section aria-busy="true" aria-label="Loading the lesson" className="mf-instrument p-5 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <span className="mf-engraved">Lesson</span>
        <span className="mf-engraved">Loading</span>
      </div>
      <div className="mt-5 grid grid-cols-7 gap-1.5 sm:gap-2" aria-hidden="true">
        {LESSON_STAGES.map((_, index) => (
          <span
            key={index}
            className="h-8.5 rounded-chip border border-line-strong bg-void sm:h-13.5"
          />
        ))}
      </div>
      <div
        className="mt-3 grid gap-6 sm:mt-6 sm:grid-cols-[minmax(0,1fr)_18rem] sm:items-start"
        aria-hidden="true"
      >
        <div className="sm:col-start-2 sm:row-start-1">
          <StepPlates step="see" />
        </div>
        <div className="sm:col-start-1 sm:row-start-1">
          <p className="font-display text-h3 font-bold">
            <span className={bar}>{STEP_COPY.see.title}</span>
          </p>
          <p className="mt-1 max-w-[60ch]">
            <span className={bar}>{STEP_COPY.see.body}</span>
          </p>
        </div>
      </div>
      {/* The screen holds a glyph-sized blank, so it takes the real see step's
          height at every width (the glyph scales with the viewport). */}
      <Screen
        grid
        className="mt-6 grid min-h-56 place-items-center py-8 sm:min-h-0 sm:py-7"
        aria-hidden="true"
      >
        <span className="invisible font-display text-glyph font-bold">E</span>
      </Screen>
      <div className="mt-6 h-11 rounded-control bg-elevated sm:h-14" aria-hidden="true" />
      {/* Where the see step draws the path (phone) or the tree (sm up): the
          real tree, so the reserved height is exact at every width. */}
      <div className="mt-6" aria-hidden="true" inert>
        <div className="h-9 sm:hidden" />
        <div className="hidden sm:block">
          <SignalTree className="min-w-0" />
        </div>
      </div>
    </section>
  )
}

export function LessonScreen({ nextSteps = [] }: LessonScreenProps) {
  const progressStore = useMemo(() => createProgressStore(), [])
  const settingsStore = useMemo(() => createSettingsStore(), [])
  const statsStore = useMemo(() => createStatsStore(), [])
  const install = useInstallPrompt()

  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)
  const [progress, setProgress] = useState<ProgressRecord>(emptyProgress)
  const [ready, setReady] = useState(false)

  const [position, setPosition] = useState<LessonPosition>(() => stageStart(0))
  const [phase, setPhase] = useState<Phase>('teach')
  const [feedback, setFeedback] = useState<SendFeedback | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  const [earned, setEarned] = useState<Achievement[]>([])
  const [report, setReport] = useState<StageReport | null>(null)
  const [drillRun, setDrillRun] = useState(0)
  /**
   * A drill result is on screen, with the next stage as its main button.
   * Follows the practice screen's own state, so "Skip the drill" is back as
   * soon as the learner leaves a result for the Ready screen or a new run.
   */
  const [drillDone, setDrillDone] = useState(false)
  const onDrillStatus = useCallback(
    (status: 'idle' | 'running' | 'finished') => setDrillDone(status === 'finished'),
    [],
  )

  /** The position the timer and the send handler act on, never a stale copy. */
  const positionRef = useRef(position)
  positionRef.current = position
  /** True from an accepted send until the next step is on screen. */
  const lockedRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  /** The code keyed for the character in progress, element by element. */
  const codeRef = useRef('')
  /** XP and sends banked during the current stage run, for its report. */
  const runRef = useRef({ xp: 0, sends: 0 })
  const feedbackId = useRef(0)
  /**
   * The screen, and in the send step the key and its verdict under it (J-20):
   * brought into view after "Now send it", and the area whose visibility
   * decides whether Space keys (A-09).
   */
  const sendArea = useRef<HTMLDivElement>(null)
  /** The whole lesson, whatever its phase: scrolled to on a new stage (J-13). */
  const rootRef = useRef<HTMLDivElement>(null)
  /** Each phase's heading, focused when the phase or the step changes (A-10). */
  const headingRef = useRef<HTMLHeadingElement>(null)
  /**
   * Where the next view should bring the page: the send area after "Now send
   * it", the lesson's top after a stage change, or nowhere special (then the
   * heading is only revealed if it is off screen).
   */
  const scrollIntent = useRef<'send' | 'top' | null>(null)
  /** The first view after arriving is not a change: it takes no focus. */
  const arrived = useRef(false)
  const reducedMotion = useReducedMotion()

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  // Read once on mount rather than subscribing: the lesson deliberately does
  // not jump the learner forward mid-session because an answer happened to
  // complete a stage. Where they are up to is resolved when they arrive.
  //
  // The landing hero's finished drill links here with #hear (DEC-044): while
  // stage 1 is unheard, the lesson opens on hearing E. The hash is then
  // dropped, so a reload or a shared link does not reopen it.
  useEffect(() => {
    const loaded = progressStore.read()
    const hash = window.location.hash
    const start = entryPosition(loaded, Date.now(), hash)
    if (hash === HEAR_FIRST_HASH) {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      )
    }
    setProgress(loaded)
    setSettings(settingsStore.read())
    if (start === null) {
      setPhase('complete')
      track('lesson_start', 'complete')
    } else {
      setPosition(start)
      track('lesson_start', `stage-${start.stage + 1}`)
    }
    setReady(true)
  }, [progressStore, settingsStore])

  // The stage rail reads progress, so keep a copy in step with every write.
  useEffect(() => progressStore.subscribe((next) => setProgress(next)), [progressStore])

  useEffect(() => clearTimer, [clearTimer])

  const stageCharacters = LESSON_STAGES[position.stage] ?? []
  const character = stageCharacters[position.characterIndex] ?? ''
  const code = targetCode(character)
  const day = stageDay(position.stage)

  // Meeting a character counts as seeing it, which is what lights its node.
  useEffect(() => {
    if (!ready || phase !== 'teach' || !character) return
    progressStore.update((current) => markSeen(current, character, Date.now()))
  }, [ready, phase, character, progressStore])

  /** Bank the stage, celebrate it, and offer the drill. Runs once per stage run. */
  const finishStage = useCallback(
    (stage: number) => {
      const now = Date.now()
      const before = progressStore.read()
      const after = unlockTaught(before, poolThroughStage(stage))
      if (after !== before) progressStore.write(after)

      const run = runRef.current
      let xp = run.xp
      // A stage where every send was skipped taught nothing that was checked,
      // and an activity with no answers banks nothing.
      if (run.sends > 0) {
        const since = achievementSnapshot(after, statsStore.read(), now)
        const result = bankActivity({ xp: XP.sessionComplete, since, now })
        xp += result.xp
        if (result.earned.length > 0) setEarned((list) => mergeEarned(list, result.earned))
      }

      const pool = unlockedCharacters(after)
      setReport({
        stage,
        xp,
        unlocked: newlyUnlocked(before, after),
        pool: pool.length,
        covered: poolThroughStage(stage).every((c) => pool.includes(c)),
        sends: run.sends,
      })
      runRef.current = { xp: 0, sends: 0 }
      track('lesson_finish', `stage-${stage + 1}`)
      scrollIntent.current = 'top'
      setPhase('cleared')
    },
    [progressStore, statsStore],
  )

  /** One move forward from wherever the lesson is now. */
  const advance = useCallback(() => {
    clearTimer()
    lockedRef.current = false
    setTransitioning(false)
    setFeedback(null)
    const next = nextPosition(positionRef.current)
    if (next.kind === 'position') setPosition(next.position)
    else finishStage(next.stage)
  }, [clearTimer, finishStage])

  const handleSent = useCallback(
    (sent: string) => {
      const keyed = codeRef.current
      codeRef.current = ''
      // A second commit inside the hand-over window is ignored outright: it
      // is what used to advance twice and skip a character.
      if (lockedRef.current) return
      const target = LESSON_STAGES[positionRef.current.stage]?.[positionRef.current.characterIndex]
      if (!target) return

      const correct = sent === target
      const now = Date.now()
      const since = achievementSnapshot(progressStore.read(), statsStore.read(), now)
      progressStore.update((current) => recordAnswer(current, target, 'sending', correct, now))
      const result = bankActivity({
        elements: keyed.length,
        answers: 1,
        correct: correct ? 1 : 0,
        xp: correct ? xpForAnswer(target) : 0,
        since,
        now,
      })
      runRef.current = { xp: runRef.current.xp + result.xp, sends: runRef.current.sends + 1 }
      if (result.earned.length > 0) setEarned((list) => mergeEarned(list, result.earned))

      feedbackId.current += 1
      setFeedback({
        correct,
        code: keyed,
        sent,
        xp: result.xp,
        firstSignal: result.firstSignal,
        id: feedbackId.current,
      })

      if (correct) {
        lockedRef.current = true
        setTransitioning(true)
        clearTimer()
        timerRef.current = window.setTimeout(advance, ADVANCE_DELAY_MS)
      }
    },
    [advance, clearTimer, progressStore, statsStore],
  )

  const sending = ready && phase === 'teach' && position.step === 'send'
  const commitWhen = useMemo(() => commitOnTarget(code), [code])
  // Space keys only while the send area is on screen (A-09, DEC-028): a
  // learner who scrolls down to the FAQ pages down with Space instead of
  // recording a scored send.
  const sendInView = useInView(sendArea, { enabled: sending })

  const key = useMorseKey({
    wpm: settings.timing.wpm,
    dotDashThresholdMs: settings.timing.dotDashThresholdMs,
    characterGapMs: settings.timing.characterGapMs,
    wordGapMs: settings.timing.wordGapMs,
    autoCommit: settings.timing.autoCommit,
    bindings: settings.keys,
    frequency: settings.audio.frequency,
    volume: settings.audio.enabled ? settings.audio.volume : 0,
    disabled: !sending || transitioning,
    windowKeys: sendInView,
    commitWhen,
    onElement: (element) => {
      codeRef.current += element
    },
    onCharacter: handleSent,
  })

  const { reset: resetKey } = key
  useEffect(() => {
    resetKey()
    codeRef.current = ''
    setFeedback(null)
  }, [character, position.step, phase, resetKey])

  // Every change of phase or step moves focus to the new heading, which
  // names the step ("Step 2 of 3: Hear it, E"), so focus never falls to the
  // page when a button unmounts (A-10). Then the page follows: to the send
  // area, to the lesson's top on a new stage (J-13), or just far enough to
  // show the heading. The arrival view takes no focus.
  const viewKey = `${phase}:${position.stage}:${position.characterIndex}:${position.step}`
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion
  useEffect(() => {
    if (!ready) return
    if (!arrived.current) {
      arrived.current = true
      return
    }
    const intent = scrollIntent.current
    scrollIntent.current = null
    // The drill is the practice screen, which places its own focus.
    if (phase === 'drill') return
    const heading = headingRef.current
    heading?.focus({ preventScroll: true })

    const behavior: ScrollBehavior = reducedMotionRef.current ? 'auto' : 'smooth'
    // The sticky header's allowance, as the page declares it (scroll-padding).
    const padding =
      Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
    if (intent === 'send') {
      const area = sendArea.current
      if (!area) return
      const box = area.getBoundingClientRect()
      if (box.top >= padding && box.bottom <= window.innerHeight) return
      area.scrollIntoView({ block: 'start', behavior })
      return
    }
    if (intent === 'top') {
      const root = rootRef.current
      if (!root) return
      const top = root.getBoundingClientRect().top
      if (top >= padding && top <= window.innerHeight / 2) return
      root.scrollIntoView({ block: 'start', behavior })
      return
    }
    if (!heading) return
    const box = heading.getBoundingClientRect()
    if (box.top >= padding && box.bottom <= window.innerHeight) return
    heading.scrollIntoView({ block: 'start', behavior })
  }, [ready, viewKey, phase])

  const goToStage = useCallback(
    (stage: number) => {
      scrollIntent.current = 'top'
      clearTimer()
      lockedRef.current = false
      setTransitioning(false)
      setFeedback(null)
      setReport(null)
      runRef.current = { xp: 0, sends: 0 }
      setPosition(stageStart(stage))
      setPhase('teach')
    },
    [clearTimer],
  )

  if (!ready) return <LessonSkeleton />

  const statuses = stageStatuses(progress, phase === 'complete' ? -1 : position.stage, Date.now())
  const stageCount = LESSON_STAGES.length

  /* ---------------------------------------------------------------- complete */

  if (phase === 'complete') {
    return (
      <section ref={rootRef} aria-labelledby="lesson-complete" className="mf-instrument p-5 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <span className="mf-engraved">Lesson · all {stageCount} stages</span>
          <Lamp on tone="amber" label="Course complete" />
        </div>
        <div className="mt-5">
          <StageRail statuses={statuses} />
        </div>

        <Screen powerOn grid className="mt-6 grid place-items-center px-6 py-10 text-center">
          <p className="mf-engraved">Course complete</p>
          <p className="mt-3 font-mono text-readout-xl text-signal tabular-nums mf-phosphor">
            {LESSON_ORDER.length}
          </p>
          <p className="mt-3 text-lead text-ink">
            characters taught, every letter and digit, in {stageCount} stages
          </p>
        </Screen>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <h2
            ref={headingRef}
            id="lesson-complete"
            tabIndex={-1}
            className="font-display text-h2 font-bold text-ink outline-none"
          >
            You have the whole code.
          </h2>
          <span className="mf-stamp mf-stamp-in text-amber">Course complete</span>
        </div>
        <p className="mt-3 max-w-[60ch] text-muted">
          Knowing every character is the first half. The second is hearing them at speed, and that
          comes from short, regular practice. Pick one of these and keep the streak going.
        </p>

        {earned.length > 0 && (
          <div className="mt-6">
            <AchievementSlips earned={earned} />
          </div>
        )}

        {nextSteps.length > 0 && (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {nextSteps.map((step) => (
              <li key={step.href} className="flex">
                <a href={step.href} className="mf-card flex w-full flex-col gap-1 p-5">
                  <span className="font-display text-h3 font-bold text-ink">{step.label}</span>
                  <span className="text-sm text-muted">{step.hint}</span>
                  <span className="mt-2 mf-engraved text-signal">Open →</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 border-t border-line pt-6">
          <h3 className="font-display text-h3 font-bold text-ink">Go over a stage again</h3>
          <p className="mt-1 text-sm text-muted">
            Teaching a stage again never takes anything away; your practice pool stays as it is.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {LESSON_STAGES.map((characters, index) => (
              <li key={index}>
                <button
                  type="button"
                  className="mf-btn mf-btn-secondary mf-btn-sm"
                  aria-label={`Teach stage ${index + 1} again: ${stageLabel(characters)}`}
                  onClick={() => goToStage(index)}
                >
                  <span className="tabular-nums">{index + 1}</span>
                  <span className="text-muted">{stageLabel(characters).replaceAll(' ', '')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    )
  }

  /* ----------------------------------------------------------------- cleared */

  if (phase === 'cleared' && report) {
    const characters = LESSON_STAGES[report.stage] ?? []
    const last = report.stage >= stageCount - 1
    const percent = Math.round(courseProgress(progress, Date.now()) * 100)
    // The stage under the CLEARED stamp is done, not "in progress", even when
    // its sends were skipped and the store would not call it complete yet.
    const cleared = statuses.map((status, index): StageStatus =>
      index === report.stage ? 'done' : status,
    )
    return (
      <section ref={rootRef} aria-labelledby="stage-cleared" className="mf-instrument p-5 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <span className="mf-engraved">
            Stage {report.stage + 1} of {stageCount}
          </span>
          <Lamp on tone="amber" label="Stage cleared" />
        </div>
        <div className="mt-5">
          <StageRail statuses={cleared} />
        </div>

        <div className="relative mt-8">
          {/* D5: the stage prints onto the tape one character at a time. */}
          <p className="mf-tape flex flex-wrap items-baseline gap-x-5 gap-y-2 pt-8 pr-10 pb-5 font-display text-h2 font-bold">
            <span className="sr-only">Characters in this stage: </span>
            {characters.map((entry, index) => (
              <span
                key={entry}
                // Staggered through a variable, so reduced motion can zero the
                // delay: a quick fade still popped in one character at a time.
                style={{ '--strike-index': index } as CSSProperties}
                className="mf-strike [animation-delay:calc(var(--duration-dah)*var(--strike-index))] mf-still:[animation-delay:0s]"
              >
                {entry}
              </span>
            ))}
          </p>
          <span className="mf-stamp mf-stamp-in absolute -top-4 right-2 bg-panel text-signal sm:right-6">
            Stage {report.stage + 1} cleared
          </span>
        </div>

        <h2
          ref={headingRef}
          id="stage-cleared"
          tabIndex={-1}
          className="mt-8 font-display text-h2 font-bold text-ink outline-none"
        >
          {stageDay(report.stage)?.title ?? `Stage ${report.stage + 1}`}: taught.
        </h2>
        <p className="mt-2 max-w-[60ch] text-muted">
          {report.sends > 0
            ? 'Now hear them mixed with everything from earlier stages. A character you can only recognise on its own is not one you know yet.'
            : 'You skipped the sending, so nothing was checked yet. The drill does that by ear: it mixes these with everything from earlier stages.'}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Readout
            label="XP this stage"
            value={`+${report.xp}`}
            tone="amber"
            lamp={report.xp > 0}
          />
          <Readout label="Course" value={`${percent}%`} caption="of characters answered" />
          <Readout
            label="Letters in practice"
            value={report.pool}
            caption={
              report.unlocked.length > 0
                ? `New in practice: ${report.unlocked.join(' ')}`
                : report.covered
                  ? 'Already holds this stage'
                  : 'Your method adds these at its own pace'
            }
            className="col-span-2 sm:col-span-1"
          />
        </div>

        {earned.length > 0 && (
          <div className="mt-6">
            <AchievementSlips earned={earned} />
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            className="mf-btn mf-btn-primary mf-btn-lg"
            onClick={() => {
              setDrillRun((run) => run + 1)
              setDrillDone(false)
              setPhase('drill')
            }}
          >
            Drill stage {report.stage + 1}
          </button>
          <button
            type="button"
            className="mf-btn mf-btn-secondary mf-btn-lg"
            onClick={() => {
              if (!last) return goToStage(report.stage + 1)
              scrollIntent.current = 'top'
              setPhase('complete')
            }}
          >
            {last ? 'Finish the course' : `Skip to stage ${report.stage + 2} →`}
          </button>
          <button
            type="button"
            className="mf-btn mf-btn-ghost"
            onClick={() => goToStage(report.stage)}
          >
            Teach it again
          </button>
          {install && (
            <button
              type="button"
              className="mf-btn mf-btn-ghost"
              onClick={() => void install.prompt()}
            >
              Install for offline
            </button>
          )}
        </div>
      </section>
    )
  }

  /* ------------------------------------------------------------------- drill */

  if (phase === 'drill') {
    const stage = report?.stage ?? position.stage
    const preset = drillPreset(stage)
    const last = stage >= stageCount - 1
    const next = {
      label: last
        ? 'Finish the course'
        : `Next stage: ${stageLabel(LESSON_STAGES[stage + 1] ?? []).replaceAll(' ', '')} →`,
      onClick: () => {
        if (!last) return goToStage(stage + 1)
        scrollIntent.current = 'top'
        setPhase('complete')
      },
    }
    // The drilled stage is cleared, as the stamp just said: not "in progress" (J-25).
    const drillStatuses = statuses.map((status, index): StageStatus =>
      index === stage ? 'done' : status,
    )
    return (
      <div ref={rootRef} className="grid gap-6">
        <section aria-labelledby="drill-heading" className="mf-instrument p-5 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <span className="mf-engraved">
              Drill · stage {stage + 1} of {stageCount}
            </span>
            <span className="mf-engraved">{preset.length} prompts</span>
          </div>
          <div className="mt-5">
            <StageRail statuses={drillStatuses} />
          </div>
          <h2 id="drill-heading" className="mt-6 font-display text-h3 font-bold text-ink">
            Everything so far, by ear
          </h2>
          <p className="mt-1 text-sm text-muted">
            {preset.characters.length} characters: {stageLabel(preset.characters)}
          </p>
        </section>

        {/* The real practice screen, not a copy of it: the drill has to behave
            exactly like practising, or the lesson teaches a different app. */}
        {/* The result's main button is the next stage, so the drill ends
            with one obvious way on instead of two competing ones. */}
        <PracticeScreen
          key={`${stage}-${drillRun}`}
          preset={preset}
          primaryAction={next}
          onStatus={onDrillStatus}
        />

        <div className="flex flex-wrap gap-3">
          {!drillDone && (
            <button type="button" className="mf-btn mf-btn-ghost" onClick={next.onClick}>
              {last ? 'Skip the drill and finish' : 'Skip the drill'}
            </button>
          )}
          <button type="button" className="mf-btn mf-btn-ghost" onClick={() => goToStage(stage)}>
            Teach stage {stage + 1} again
          </button>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------------- teach */

  const copy = STEP_COPY[position.step]
  const isDigit = /\d/.test(character)
  const stepNumber = TEACH_STEPS.indexOf(position.step) + 1

  /** The next-step button, one per step so focus never rides it into the next one (A-10). */
  const stepButton = (label: string) => (
    <button
      key={position.step}
      type="button"
      onClick={(event) => {
        // A double click would otherwise run through two steps at once.
        if (event.detail > 1) return
        scrollIntent.current = position.step === 'hear' ? 'send' : null
        advance()
      }}
      className="mf-btn mf-btn-primary mf-btn-lg mf-btn-block mt-6"
    >
      {label}
    </button>
  )

  return (
    <section ref={rootRef} aria-labelledby="lesson-step" className="mf-instrument p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="mf-engraved">
          Stage {position.stage + 1} of {stageCount}
          <span className="hidden sm:inline"> · {day?.title}</span>
        </span>
        <span className="mf-engraved tabular-nums">
          Character {position.characterIndex + 1} of {stageCharacters.length}
        </span>
      </div>

      <div className="mt-5">
        <StageRail statuses={statuses} />
      </div>
      {/* On a phone the plates sit under the rail; from sm up they move beside
          the step's heading, so the character and its way on fit a laptop's
          first screen (V-02). The plates hold no controls. */}
      <div className="mt-3 grid gap-6 sm:mt-6 sm:grid-cols-[minmax(0,1fr)_18rem] sm:items-start">
        <div className="sm:col-start-2 sm:row-start-1">
          <StepPlates step={position.step} />
        </div>
        <div className="sm:col-start-1 sm:row-start-1">
          <h2
            ref={headingRef}
            id="lesson-step"
            tabIndex={-1}
            className="font-display text-h3 font-bold text-ink outline-none"
          >
            <span className="sr-only">
              Step {stepNumber} of {TEACH_STEPS.length}:{' '}
            </span>
            {copy.title}
            <span className="sr-only">, {character}</span>
          </h2>
          <p className="mt-1 max-w-[60ch] text-muted">{copy.body}</p>
        </div>
      </div>

      <div ref={sendArea} className="mt-6">
        <Screen
          grid
          className={[
            'relative grid place-items-center px-6 text-center',
            // Shorter while sending, so the key is on screen with the target.
            // From sm up the glyph and its code sit side by side, as on the
            // landing's station, which keeps the way on in the first screen.
            position.step === 'send' ? 'py-5' : 'min-h-56 py-8 sm:min-h-0 sm:py-7',
          ].join(' ')}
        >
          {feedback?.correct && <span key={feedback.id} className="mf-flash" aria-hidden="true" />}
          <div
            className={[
              'relative z-[3] flex flex-col items-center gap-3',
              position.step === 'send' ? '' : 'sm:flex-row sm:gap-10',
            ].join(' ')}
          >
            <span
              className={[
                'font-display font-bold text-signal mf-phosphor',
                position.step === 'send' ? 'text-display' : 'text-glyph',
              ].join(' ')}
            >
              {character}
            </span>
            <CodePulses code={code} />
            {position.step === 'send' && (
              <span className="mt-1 flex h-6 items-center gap-2">
                <Lamp on={feedback?.correct === true} label="Signal detected" />
                <span className="mf-engraved">
                  {feedback?.correct ? 'Signal detected' : 'Listening for your key'}
                </span>
              </span>
            )}
          </div>
          {feedback?.correct && feedback.xp > 0 && (
            // Held, not faded (J-20): the XP stays readable until the next step.
            <span
              key={`xp-${feedback.id}`}
              aria-hidden="true"
              className="mf-rise-hold absolute top-5 right-6 z-[3] font-mono text-control text-amber"
            >
              +{feedback.xp} XP
            </span>
          )}
        </Screen>

        {position.step === 'send' && (
          // The key and its verdict sit with the screen, so the area brought
          // into view after "Now send it" holds all three (J-20).
          <div className="mt-6">
            {/* The key comes first, so it is in thumb reach on a phone. */}
            <MorseKey
              isDown={key.state.isDown}
              pending={key.state.pending}
              preview={key.state.preview}
              commitProgress={key.state.commitProgress}
              autoCommit={settings.timing.autoCommit}
              keyLabel={settings.keys.key === ' ' ? 'SPACE' : settings.keys.key.toUpperCase()}
              commitLabel={(settings.keys.submit ?? 'Control').toUpperCase()}
              disabled={transitioning}
              pointerHandlers={key.pointerHandlers}
            />

            <p aria-live="polite" className="mt-4 min-h-12 text-center">
              {feedback?.correct && (
                <span className="text-signal">
                  That is {character}.{' '}
                  {feedback.xp > 0 && (
                    <span className="font-mono text-amber">
                      +{feedback.xp} XP{feedback.firstSignal ? ', your first signal' : ''}
                    </span>
                  )}
                </span>
              )}
              {feedback && !feedback.correct && (
                // The glyphs are for the eye; a screen reader hears the code
                // as words ("dash dot"), not "minus middle dot" (A-11).
                <span className="text-danger">
                  {feedback.sent === UNKNOWN_CHARACTER ? (
                    <>
                      <span aria-hidden="true">{prettify(feedback.code)}</span>
                      <span className="sr-only">{spokenCode(feedback.code)}</span> is not a
                      character.
                    </>
                  ) : (
                    <>
                      That was {feedback.sent}{' '}
                      <span aria-hidden="true">({prettify(feedback.code)})</span>
                      <span className="sr-only">, {spokenCode(feedback.code)}</span>.
                    </>
                  )}{' '}
                  {character} is <span aria-hidden="true">{prettify(code)}</span>
                  <span className="sr-only">{spokenCode(code)}</span>. Try it again.
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {position.step === 'see' && (
        <>
          {/* The way on sits right under the character, before the tree, so
              it is on the first screen on a phone and a laptop (V-02). */}
          {stepButton('Now hear it')}
          <div className="mt-6">
            {/* Where it sits, so the code stops looking arbitrary the moment it
                is introduced rather than a screen later. */}
            <div className={isDigit ? '' : 'sm:hidden'}>
              <PathRibbon character={character} code={code} />
              {isDigit && (
                <p className="mt-3 text-center text-sm text-muted">
                  Digits sit below the letters on the tree, {code.length} elements from the start.
                </p>
              )}
            </div>
            {!isDigit && (
              <div className="hidden sm:block">
                <SignalTree highlight={character} className="min-w-0" />
              </div>
            )}
          </div>
        </>
      )}

      {position.step === 'hear' && code && (
        // The full player rather than a bare play button: the lamp and the
        // buzz are the whole reason this step is reachable at all without
        // hearing. With sound off in settings, a bare play button did nothing
        // and the lesson could not be finished (§28).
        <div className="mt-6">
          <MorsePlayer
            morse={code}
            autoPlay
            initialFlash
            label={character}
            initialWpm={settings.timing.wpm}
          />
        </div>
      )}
      {/* After the player, so its Play control comes first in the tab order. */}
      {position.step === 'hear' && stepButton('Now send it')}

      {position.step === 'send' && (
        <div className="mt-4">
          {earned.length > 0 && (
            <div className="mb-5">
              <AchievementSlips earned={earned.slice(-1)} />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={(event) => {
                // Focus back to the page after a click, or Space would be
                // aimed at this button rather than the key.
                releaseFocus(event)
                key.commitCharacter()
              }}
              disabled={key.state.pending === '' || transitioning}
              className="mf-btn mf-btn-secondary"
            >
              Finish character
            </button>
            <button
              type="button"
              onClick={(event) => {
                releaseFocus(event)
                advance()
              }}
              disabled={transitioning}
              className="mf-btn mf-btn-ghost"
            >
              Skip sending
            </button>
          </div>
          <p className="mt-2 text-center text-sm text-muted">
            No keyboard, or no sound? Skip it: the drill checks {character} by ear.
          </p>

          {!isDigit && (
            <>
              <div className="mt-6 hidden sm:block">
                <SignalTree
                  livePath={key.state.pending}
                  highlight={feedback && !feedback.correct ? character : null}
                  className="min-w-0"
                />
              </div>
              <details className="mt-6 sm:hidden">
                <summary className="mf-btn mf-btn-ghost">Where you are on the tree</summary>
                <div className="mt-3">
                  <SignalTree
                    livePath={key.state.pending}
                    highlight={feedback && !feedback.correct ? character : null}
                    className="min-w-0"
                  />
                </div>
              </details>
            </>
          )}
        </div>
      )}
    </section>
  )
}

/** Add newly earned achievements once each, oldest first. */
function mergeEarned(list: readonly Achievement[], more: readonly Achievement[]): Achievement[] {
  const seen = new Set(list.map((entry) => entry.id))
  return [...list, ...more.filter((entry) => !seen.has(entry.id))]
}
