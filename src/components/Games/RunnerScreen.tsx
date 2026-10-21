import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useGameLoop } from './useGameLoop'
import {
  GameOver,
  GameSetup,
  HudCell,
  LivesCell,
  PlateRow,
  StatusLamp,
  formatScore,
  useGamePool,
} from './shared'
import { bankRun, clearedPercent, type GameIdentity, type RunReport } from './results'
import {
  HORIZON,
  STARTING_LIVES,
  accuracy,
  advance,
  clearScore,
  commitOnGate,
  endRun,
  fromMemory,
  isOver,
  newRunnerGame,
  runXp,
  send,
  sends,
  streakMultiplier,
  weakest,
  type RunnerState,
} from '../../game/runner'
import { createRandom, seedFrom } from '../../game/random'
import { KeyStation } from '../MorseKey/KeyStation'
import { KeyingLead } from '../MorseKey/MorseKey'
import { useMorseKey } from '../MorseKey/useMorseKey'
import { useInView } from '../MorseKey/useInView'
import { MORSE_ALPHABET } from '../../data/morseAlphabet'
import { prettify } from '../../engine/morseEncoder'
import { useT } from '../../i18n/react'
import { renderRich } from '../../i18n/richReact'
import { createSettingsStore, defaultSettings, type SettingsRecord } from '../../storage/settings'
import { answer as recordAnswer, createProgressStore } from '../../storage/progress'
import { createStatsStore } from '../../storage/stats'
import { achievementSnapshot } from '../../storage/snapshot'
import type { AchievementSnapshot } from '../../game/achievements'
import { track } from '../../analytics/track'

/**
 * Morse Runner (PROJECT.md §18).
 *
 * Gates come towards you; key the character before you reach one. The mirror
 * of Signal Defender — that game is receiving under pressure, this one is
 * sending under it. A gate shows its letter only (DEC-032); a wrong send shows
 * the nearest gate's code as a hint, and a gate cleared on its hint is an
 * assisted pass that records and pays nothing (rules in game/runner.ts).
 *
 * Sending is the skill with no natural pressure anywhere else on the site. The
 * telegraph waits forever, and a keyer that waits forever never teaches anyone
 * to commit to a character. Here the gate arrives whether you are ready or not.
 *
 * Side effects follow the same rule as Defender (flow audit B11): the run lives
 * in a ref, each step computes the next state purely and then writes progress
 * in the handler, and `finish` banks once per run, guarded by its number.
 */

/** Where the runner stands, and how much of the width the horizon spans. */
const RUNNER_X = 0.08
const TRACK_SPAN = 0.86
/** The lane's height, as a fraction of the track (pkg-h.css `.gm-lane`). */
const LANE_Y = 0.62
/** Metres between ground marks. */
const TICK_M = 10

const along = (distance: number) => RUNNER_X + (Math.max(0, distance) / HORIZON) * TRACK_SPAN

interface Burst {
  id: number
  x: number
  points: number
}

const BURST_MS = 420

/** Idle gates on the attract screen: fixed, so prerender and hydration agree. */
const PREVIEW_GATES = [18, 44, 76] as const

export function RunnerScreen({ identity }: { identity: GameIdentity }) {
  const t = useT()
  const settingsStore = useMemo(() => createSettingsStore(), [])
  const progressStore = useMemo(() => createProgressStore(), [])
  const statsStore = useMemo(() => createStatsStore(), [])
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)

  const pool = useGamePool()
  const [game, setGame] = useState<RunnerState | null>(null)
  const [report, setReport] = useState<RunReport | null>(null)
  const [bursts, setBursts] = useState<readonly Burst[]>([])
  const [feedback, setFeedback] = useState<{ kind: 'hit' | 'miss'; text: string } | null>(null)
  const [stumbles, setStumbles] = useState(0)

  const live = useRef<RunnerState | null>(null)
  const run = useRef(0)
  const finished = useRef(0)
  const since = useRef<AchievementSnapshot | undefined>(undefined)
  /** Elements keyed this run: real keying, banked like the telegraph's. */
  const elements = useRef(0)
  const random = useRef(createRandom(1))
  const cabinet = useRef<HTMLElement>(null)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  useEffect(() => {
    setSettings(settingsStore.read())
    return settingsStore.subscribe(setSettings)
  }, [settingsStore])

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending) clearTimeout(timer)
    }
  }, [])

  const later = useCallback((ms: number, fn: () => void) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      fn()
    }, ms)
    timers.current.add(timer)
  }, [])

  const commit = useCallback((next: RunnerState | null) => {
    live.current = next
    setGame(next)
  }, [])

  const record = useCallback(
    (character: string, correct: boolean) => {
      // Keying a character from memory under time pressure, or failing to, is
      // evidence about sending, so it feeds the same schedule practice does.
      progressStore.update((progress) =>
        recordAnswer(progress, character, 'sending', correct, Date.now()),
      )
    },
    [progressStore],
  )

  const finish = useCallback(
    (state: RunnerState) => {
      if (finished.current === run.current) return
      finished.current = run.current
      track('game_finish', 'runner')
      setReport(
        bankRun(
          {
            game: 'runner',
            score: state.score,
            answers: state.cleared + state.stumbles,
            // Only gates cleared from memory: a hinted one had its code on it.
            correct: fromMemory(state),
            inputs: sends(state),
            xp: runXp(state),
            elements: elements.current,
            since: since.current,
          },
          { stats: statsStore, progress: progressStore },
        ),
      )
    },
    [progressStore, statsStore],
  )

  const running = game !== null && !isOver(game)

  const keyed = useCallback(
    (character: string) => {
      const current = live.current
      if (!current || isOver(current)) return
      const { state, cleared, blamed, hinted } = send(current, character)
      commit(state)

      if (cleared?.hinted) {
        // Through on the hint: the wrong send already counted against it.
        setFeedback({
          kind: 'hit',
          text: t('runner.throughHint', { character: cleared.character }),
        })
      } else if (cleared) {
        record(cleared.character, true)
        const burst: Burst = {
          id: cleared.id,
          x: along(cleared.distance),
          points: clearScore(cleared, current.streak),
        }
        setBursts((list) => [...list, burst])
        later(BURST_MS * 2, () => setBursts((list) => list.filter((entry) => entry !== burst)))
        setFeedback({
          kind: 'hit',
          text: t('runner.cleared', { character: cleared.character, points: burst.points }),
        })
      } else {
        if (blamed) record(blamed.character, false)
        const code = hinted ? prettify(MORSE_ALPHABET[hinted.character] ?? '') : ''
        setFeedback({
          kind: 'miss',
          text: hinted
            ? t('runner.noGateHint', { character, hinted: hinted.character, code })
            : t('runner.noGate', { character }),
        })
      }
    },
    [commit, record, later, t],
  )

  // As on the telegraph (DEC-028): Space keys the run only while the cabinet
  // is on screen. Scrolled down to the guide or the FAQ, it pages down.
  const cabinetInView = useInView(cabinet, { enabled: running })

  const key = useMorseKey({
    wpm: settings.timing.wpm,
    dotDashThresholdMs: settings.timing.dotDashThresholdMs,
    characterGapMs: settings.timing.characterGapMs,
    wordGapMs: settings.timing.wordGapMs,
    autoCommit: settings.timing.autoCommit,
    bindings: settings.keys,
    keyer: settings.keyer.type,
    swapPaddles: settings.keyer.swapPaddles,
    frequency: settings.audio.frequency,
    volume: settings.audio.enabled ? settings.audio.volume : 0,
    disabled: !running,
    windowKeys: cabinetInView,
    onElement: () => {
      if (live.current && !isOver(live.current)) elements.current += 1
    },
    // A character is judged the moment it can no longer grow into a gate on
    // the track (J-09); only a half-keyed one waits out the gap.
    commitWhen: (pending) => commitOnGate(pending, live.current?.gates ?? []),
    onCharacter: keyed,
  })

  const start = useCallback(() => {
    track('game_start', 'runner')
    run.current += 1
    elements.current = 0
    since.current = achievementSnapshot(progressStore.read(), statsStore.read(), Date.now())
    random.current = createRandom(seedFrom(`runner-${pool.id}-${performance.now()}`))
    key.reset()
    setReport(null)
    setBursts([])
    setFeedback(null)
    commit(newRunnerGame())
    later(50, () => cabinet.current?.scrollIntoView({ block: 'start' }))
  }, [pool.id, key, progressStore, statsStore, commit, later])

  useGameLoop(running, (dtMs) => {
    const current = live.current
    if (!current || isOver(current)) return
    const { state, hit } = advance(current, dtMs, pool.characters, random.current)
    commit(state)
    if (hit.length > 0) {
      // A gate blamed by an earlier wrong send already counted as missed.
      for (const gate of hit) if (!gate.wrong) record(gate.character, false)
      setStumbles((count) => count + 1)
      setFeedback({
        kind: 'miss',
        text: t('runner.hitGate', { gates: hit.map((gate) => gate.character).join(', ') }),
      })
    }
    if (isOver(state)) finish(state)
  })

  const quit = useCallback(() => {
    const current = live.current
    if (!current || isOver(current)) return
    const ended = endRun(current)
    commit(ended)
    finish(ended)
  }, [commit, finish])

  const setup = useCallback(() => {
    commit(null)
    setReport(null)
  }, [commit])

  if (game === null) {
    const sample = pool.characters.length > 0 ? pool.characters : ['E']
    return (
      <GameSetup
        identity={identity}
        console={t('runner.console')}
        startLabel={t('runner.start')}
        onStart={start}
        rules={[
          t('runner.ruleGates'),
          t('runner.ruleKey'),
          t('runner.ruleHint'),
          t('runner.ruleLives', { lives: t.capitalise(t.numberWord(STARTING_LIVES)) }),
        ]}
        preview={
          <Track
            distance={0}
            runnerAt={RUNNER_X}
            gates={PREVIEW_GATES.map((distance, index) => ({
              id: index,
              character: sample[index % sample.length]!,
              distance,
            }))}
          />
        }
        note={
          <p className="text-sm leading-relaxed text-muted">
            {renderRich(
              t.rich('runner.note'),
              {
                telegraph: {
                  href: '/telegraph/',
                  class: 'text-signal underline underline-offset-4',
                },
                settings: { href: '/settings/', class: 'text-signal underline underline-offset-4' },
              },
              t,
            )}
          </p>
        }
      />
    )
  }

  if (isOver(game)) {
    if (!report) return null
    const percent = clearedPercent(accuracy(game))
    return (
      <GameOver
        identity={identity}
        overLabel={t('runner.runOver')}
        quit={game.quit}
        score={game.score}
        cleared={accuracy(game)}
        caption={t('runner.caption', {
          percent,
          cleared: game.cleared,
          gates: game.cleared + game.stumbles,
        })}
        plates={[
          {
            label: t('runner.distance'),
            // A no-break space, so "120 m" never parts at a line end.
            value: t('runner.metres', { metres: Math.round(game.distance) }).replace(' ', ' '),
          },
          { label: t('runner.bestStreak'), value: String(game.bestStreak) },
          {
            label: t('runner.xp'),
            value: t('runner.plusXp', { xp: formatScore(report.xp) }),
            tone: 'amber',
          },
        ]}
        outcomes={game.outcomes}
        stripCaption={t('runner.strip')}
        report={report}
        weakest={weakest(game)}
        weakestLabel={t('runner.knocked')}
        onAgain={start}
        onSetup={setup}
      />
    )
  }

  const nearest = game.gates.reduce<(typeof game.gates)[number] | null>(
    (best, gate) => (!best || gate.distance < best.distance ? gate : best),
    null,
  )

  return (
    <section
      ref={cabinet}
      className="mf-instrument gm-cabinet p-4 sm:p-6"
      aria-label={t('runner.running', { name: identity.name })}
    >
      <PlateRow
        title={t('runner.sending', { name: identity.name })}
        status={
          <StatusLamp on tone={game.lives <= 1 ? 'danger' : 'signal'}>
            {t('runner.onAir')}
          </StatusLamp>
        }
      >
        <button type="button" onClick={quit} className="mf-btn mf-btn-danger mf-btn-sm">
          {t('runner.endRun')}
        </button>
      </PlateRow>

      <div className="mt-4 grid gap-4">
        <div className="gm-hud">
          <HudCell label={t('runner.distance')} sub={t('runner.metresUnit')}>
            {Math.round(game.distance)}
          </HudCell>
          <HudCell
            label={t('runner.score')}
            tone={game.streak >= 5 ? 'amber' : undefined}
            sub={t('runner.multiplier', { value: streakMultiplier(game.streak).toFixed(1) })}
          >
            {formatScore(game.score)}
          </HudCell>
          <LivesCell lives={game.lives} of={STARTING_LIVES} />
        </div>

        <div className="mf-screen mf-grid gm-field gm-field-runner">
          {stumbles > 0 && <span key={stumbles} className="mf-flash gm-flash-danger" />}
          <Track
            distance={game.distance}
            runnerAt={RUNNER_X}
            gates={game.gates}
            nextId={nearest?.id}
          />
          {bursts.map((burst) => (
            <span key={burst.id} aria-hidden="true">
              <span
                className="gm-burst"
                style={{ '--x': burst.x, '--y': LANE_Y - 0.22 } as CSSProperties}
              />
              {/* Positioned outside, risen inside: the rise is a transform
                  animation and would replace the positioning transform. */}
              <span
                className="gm-points"
                style={{ '--x': burst.x, '--y': LANE_Y - 0.22 } as CSSProperties}
              >
                <span className="mf-rise block font-mono text-base text-amber">
                  {t('runner.points', { points: burst.points })}
                </span>
              </span>
            </span>
          ))}
          <span
            className="gm-corner right-3 bottom-2 font-mono text-sm text-muted"
            aria-hidden="true"
          >
            {t('runner.speed', { speed: game.speed.toFixed(1) })}
          </span>
          {/* Announced only when the next gate changes, not every metre. */}
          <span className="sr-only" aria-live="polite">
            {nearest
              ? nearest.hinted
                ? t('runner.nextGateHint', {
                    character: nearest.character,
                    code: t.spokenCode(MORSE_ALPHABET[nearest.character] ?? ''),
                  })
                : t('runner.nextGate', { character: nearest.character })
              : t('runner.trackClear')}
          </span>
        </div>

        <KeyStation
          morseKey={key}
          settings={settings}
          tape="pending"
          disabled={!running}
          status={
            <span role="status" className="font-mono">
              {feedback ? (
                <span className={feedback.kind === 'hit' ? 'text-signal' : 'text-danger'}>
                  <span aria-hidden="true">{feedback.kind === 'hit' ? '● ' : '✕ '}</span>
                  {feedback.text}
                </span>
              ) : (
                <>
                  <KeyingLead paddles={key.paddles} /> {t('runner.keyNearest')}
                </>
              )}
            </span>
          }
        />
      </div>
    </section>
  )
}

/**
 * The track, seen from the side: the runner fixed at the left, gates sliding
 * in from the horizon, ground marks sliding under them. Every piece is placed
 * by transform from a fraction of the track's size.
 */
export function Track({
  distance,
  runnerAt,
  gates,
  nextId,
}: {
  distance: number
  runnerAt: number
  gates: readonly { id: number; character: string; distance: number; hinted?: boolean }[]
  nextId?: number
}) {
  const tick = (TICK_M / HORIZON) * TRACK_SPAN * 100
  const shift = ((distance % TICK_M) / HORIZON) * TRACK_SPAN * 100

  return (
    <>
      <span className="gm-lane" aria-hidden="true" />
      <span
        className="gm-ticks"
        aria-hidden="true"
        style={{ '--tick': `${tick}cqw`, '--shift': shift } as CSSProperties}
      />
      <span
        className="gm-runner"
        aria-hidden="true"
        style={{ '--x': runnerAt, '--y': LANE_Y } as CSSProperties}
      />
      {gates.map((gate) => (
        <div
          key={gate.id}
          className="gm-piece gm-gate gm-anchor-bottom"
          data-next={gate.id === nextId}
          data-state={gate.distance < 20 ? 'danger' : undefined}
          style={{ '--x': along(gate.distance), '--y': LANE_Y } as CSSProperties}
          aria-hidden="true"
        >
          <span className="gm-gate-card" data-hinted={gate.hinted ? 'true' : undefined}>
            <span className="gm-glyph">{gate.character}</span>
            {/* The code is the answer: shown only as a hint, after a wrong send. */}
            {gate.hinted && (
              <span className="gm-code text-amber">
                {prettify(MORSE_ALPHABET[gate.character] ?? '')}
              </span>
            )}
          </span>
          <span className="gm-post" />
        </div>
      ))}
    </>
  )
}
