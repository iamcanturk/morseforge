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
import { SignalPiece, SignalReveal } from './signalPiece'
import {
  DEFENDER_SKILL,
  STARTING_LIVES,
  accuracy,
  advance,
  endRun,
  hitScore,
  isOver,
  newDefenderGame,
  pressure,
  runXp,
  shoot,
  shots,
  streakMultiplier,
  weakest,
  type DefenderState,
} from '../../game/defender'
import { createRandom, seedFrom } from '../../game/random'
import { AudioEngine } from '../../engine/audioEngine'
import { MORSE_ALPHABET } from '../../data/morseAlphabet'
import { joinList, numberWord } from '../../data/format'
import { createSettingsStore, defaultSettings, type SettingsRecord } from '../../storage/settings'
import { answer as recordAnswer, createProgressStore } from '../../storage/progress'
import { createStatsStore } from '../../storage/stats'
import { achievementSnapshot } from '../../storage/snapshot'
import type { AchievementSnapshot } from '../../game/achievements'
import { track } from '../../analytics/track'

/**
 * Signal Defender (PROJECT.md §18).
 *
 * Signals fall as Morse code, each sounding as it appears; type the character
 * it spells to knock it down. The letter itself is shown only once it is hit
 * (DEC-027), so every hit is a code read, not a glyph copied.
 * The rules are in `game/defender.ts` and tested there — this holds the state,
 * the clock and the audio.
 *
 * What it adds over practice is pressure that a practice screen cannot create
 * honestly: practice waits for you, and copying at speed fails not because you
 * cannot decode a character but because you cannot decode it before the next
 * one arrives.
 *
 * **Where the side effects live (flow audit B11).** The game state is held in
 * a ref and mirrored into React state for rendering. Every step — a frame, a
 * keystroke — reads the ref, computes the next state with the pure rules,
 * stores it, and only then sounds tones and writes progress, in the handler
 * itself. Nothing with a side effect runs inside a state updater, which React
 * may defer or run twice. The run is banked by `finish`, guarded by the run's
 * number, so it banks exactly once whether it ended on the floor or by "End".
 */

/** A knocked-down signal's burst, kept on screen for one word-space. */
interface Burst {
  id: number
  character: string
  x: number
  y: number
  points: number
}

const BURST_MS = 420

/**
 * Where a signal is drawn. The rules put a fresh signal at 0 and the floor at
 * 1; drawn as-is, a new signal would be born half above the glass. The top
 * tenth is headroom, so it appears whole and still lands exactly on the floor.
 */
const HEADROOM = 0.1
const onScreen = (y: number) => HEADROOM + y * (1 - HEADROOM)

/**
 * The most characters the touch answer pad offers one button each (journeys
 * idea I-1). Two rows of four on a phone; beyond that the keyboard is quicker
 * than hunting across a grid.
 */
const PAD_MAX = 8

/** Whether this run answers by pad: a touch screen and a pool small enough. */
const usesPad = (pool: readonly string[]) =>
  pool.length > 0 &&
  pool.length <= PAD_MAX &&
  typeof window !== 'undefined' &&
  window.matchMedia('(pointer: coarse)').matches

/** Where the attract screen draws its idle signals: fixed, so prerender and hydration agree. */
const PREVIEW_SPOTS = [
  { x: 0.2, y: 0.28 },
  { x: 0.52, y: 0.55 },
  { x: 0.8, y: 0.18 },
  { x: 0.36, y: 0.82 },
] as const

export function DefenderScreen({ identity }: { identity: GameIdentity }) {
  const settingsStore = useMemo(() => createSettingsStore(), [])
  const progressStore = useMemo(() => createProgressStore(), [])
  const statsStore = useMemo(() => createStatsStore(), [])
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)

  const pool = useGamePool()
  const [game, setGame] = useState<DefenderState | null>(null)
  const [report, setReport] = useState<RunReport | null>(null)
  const [typed, setTyped] = useState('')
  const [bursts, setBursts] = useState<readonly Burst[]>([])
  const [feedback, setFeedback] = useState<{ kind: 'hit' | 'miss'; text: string } | null>(null)
  const [misses, setMisses] = useState(0)
  const [leaks, setLeaks] = useState(0)

  /** The source of truth for the run; `game` is its rendered copy. */
  const live = useRef<DefenderState | null>(null)
  /** Increments per run. `finished` holds the last run that was banked. */
  const run = useRef(0)
  const finished = useRef(0)
  const since = useRef<AchievementSnapshot | undefined>(undefined)
  const audio = useRef<AudioEngine | null>(null)
  const random = useRef(createRandom(1))
  const input = useRef<HTMLInputElement>(null)
  const cabinet = useRef<HTMLElement>(null)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  useEffect(() => {
    setSettings(settingsStore.read())
    return settingsStore.subscribe(setSettings)
  }, [settingsStore])

  useEffect(() => {
    const pending = timers.current
    return () => {
      void audio.current?.dispose()
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

  const commit = useCallback((next: DefenderState | null) => {
    live.current = next
    setGame(next)
  }, [])

  const record = useCallback(
    (character: string, correct: boolean) => {
      // A game is still evidence: every signal showed its code and was either
      // read in time or not, so it feeds the same schedule as practice rather
      // than being a throwaway score. Reading a code is recognition; the sound
      // helps, but the code is on screen, so it is not proof of listening.
      progressStore.update((progress) =>
        recordAnswer(progress, character, DEFENDER_SKILL, correct, Date.now()),
      )
    },
    [progressStore],
  )

  const sound = useCallback(
    (character: string) => {
      const code = MORSE_ALPHABET[character]
      if (!code || !settings.audio.enabled || !audio.current) return
      // Deliberately not awaited: the game must not wait for a tone to finish,
      // and several can legitimately overlap once things speed up.
      void audio.current.play(code, {
        wpm: settings.timing.wpm,
        farnsworthWpm: settings.timing.wpm,
      })
    },
    [settings],
  )

  /** Bank the run once. Called from the handler that ended it, never from an updater. */
  const finish = useCallback(
    (state: DefenderState) => {
      if (finished.current === run.current) return
      finished.current = run.current
      track('game_finish', 'defender')
      setReport(
        bankRun(
          {
            game: 'defender',
            score: state.score,
            answers: state.hits + state.misses,
            correct: state.hits,
            inputs: shots(state),
            xp: runXp(state),
            since: since.current,
          },
          { stats: statsStore, progress: progressStore },
        ),
      )
    },
    [progressStore, statsStore],
  )

  const start = useCallback(() => {
    track('game_start', 'defender')
    audio.current ??= new AudioEngine({
      frequency: settings.audio.frequency,
      volume: settings.audio.volume,
    })
    void audio.current.resume()
    run.current += 1
    since.current = achievementSnapshot(progressStore.read(), statsStore.read(), Date.now())
    random.current = createRandom(seedFrom(`defender-${pool.id}-${performance.now()}`))
    setReport(null)
    setTyped('')
    setBursts([])
    setFeedback(null)
    commit(newDefenderGame())
    later(50, () => {
      cabinet.current?.scrollIntoView({ block: 'start' })
      // With the pad, the soft keyboard would only cover it and the field.
      if (!usesPad(pool.characters)) input.current?.focus({ preventScroll: true })
    })
  }, [settings, pool.id, pool.characters, progressStore, statsStore, commit, later])

  const running = game !== null && !isOver(game)

  useGameLoop(running, (dtMs) => {
    const current = live.current
    if (!current || isOver(current)) return
    const { state, spawned, landed } = advance(current, dtMs, pool.characters, random.current)
    commit(state)
    if (spawned) sound(spawned.character)
    if (landed.length > 0) {
      // A signal blamed by an earlier wrong key already counted as missed.
      for (const signal of landed) if (!signal.wrong) record(signal.character, false)
      setLeaks((count) => count + 1)
      // A landed signal is the one moment its letter is worth telling: it is
      // how the code gets learned next time.
      const letters = [...new Set(landed.map((signal) => signal.character))]
      setFeedback({ kind: 'miss', text: `${joinList(letters)} got through` })
    }
    if (isOver(state)) finish(state)
  })

  const submit = useCallback(
    (character: string) => {
      setTyped('')
      const current = live.current
      if (!current || isOver(current)) return
      const { state, hit, blamed } = shoot(current, character)
      commit(state)

      if (hit) {
        record(hit.character, true)
        const burst: Burst = {
          id: hit.id,
          character: hit.character,
          x: hit.x,
          y: hit.y,
          points: hitScore(hit, current.streak),
        }
        setBursts((list) => [...list, burst])
        later(BURST_MS * 2, () => setBursts((list) => list.filter((entry) => entry !== burst)))
        setFeedback({ kind: 'hit', text: `${hit.character} down, +${burst.points}` })
      } else {
        if (blamed) record(blamed.character, false)
        setMisses((count) => count + 1)
        setFeedback({ kind: 'miss', text: `${character.toUpperCase()} matched nothing` })
      }
    },
    [commit, record, later],
  )

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
        console="Receiving console"
        startLabel="Start"
        onStart={start}
        rules={[
          'Signals fall as Morse code, each one sounding as it appears.',
          'Type the character a code spells to knock down the lowest one that matches.',
          'The letter shows only once it is hit.',
          `Let ${numberWord(STARTING_LIVES)} reach the floor and the run is over.`,
        ]}
        preview={
          <>
            {PREVIEW_SPOTS.map((spot, index) => {
              const character = sample[index % sample.length]!
              return (
                <SignalPiece
                  key={index}
                  character={character}
                  x={spot.x}
                  y={onScreen(spot.y)}
                  danger={spot.y > 0.8}
                />
              )
            })}
            <span className="gm-floor" />
          </>
        }
        note={
          !settings.audio.enabled && (
            <p className="text-sm text-amber">
              Sound is off in settings. The signals still fall and still show their code, so the
              game works: you read each code instead of hearing it.
            </p>
          )
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
        overLabel="Overrun"
        quit={game.quit}
        score={game.score}
        cleared={accuracy(game)}
        caption={`${percent}% cleared · ${game.hits} down, ${game.leaked.length} landed`}
        plates={[
          { label: 'Best streak', value: String(game.bestStreak) },
          { label: 'Lasted', value: `${Math.round(game.elapsedMs / 1000)}s` },
          { label: 'XP', value: `+${formatScore(report.xp)}`, tone: 'amber' },
        ]}
        outcomes={game.outcomes}
        stripCaption="Each lamp is one signal or one key, in order. A ring is a miss."
        report={report}
        weakest={weakest(game)}
        weakestLabel="What got past you"
        onAgain={start}
        onSetup={setup}
      />
    )
  }

  const danger = game.lives <= 1
  const load = pressure(game.elapsedMs)

  return (
    <section
      ref={cabinet}
      className="mf-instrument gm-cabinet p-4 sm:p-6"
      aria-label={`${identity.name}, playing`}
    >
      <PlateRow
        title={`${identity.name} · Receiving`}
        status={
          <StatusLamp on tone={danger ? 'danger' : 'signal'}>
            On air
          </StatusLamp>
        }
      >
        <button type="button" onClick={quit} className="mf-btn mf-btn-danger mf-btn-sm">
          End run
        </button>
      </PlateRow>

      <div className="gm-console mt-4">
        <div className="gm-hud">
          <HudCell label="Score">{formatScore(game.score)}</HudCell>
          <HudCell
            label="Streak"
            tone={game.streak >= 5 ? 'amber' : undefined}
            sub={`×${streakMultiplier(game.streak).toFixed(1)}`}
          >
            {game.streak}
          </HudCell>
          <LivesCell lives={game.lives} of={STARTING_LIVES} />
          {/* Desk only: the column has room, and a reminder of what can fall
              is worth more there than empty panel. */}
          <div className="gm-hud-cell hidden lg:grid">
            <span className="mf-engraved">On the wire</span>
            <span className="font-mono text-sm tracking-code break-words text-ink">
              {pool.characters.join(' ')}
            </span>
          </div>
        </div>

        {/* The field. Signals are positioned rather than drawn, so they stay
            real text — readable by a screen reader and legible at any zoom.
            Each moves by transform alone (see pkg-h.css). */}
        <div className="gm-field-wrap">
          <div className="mf-screen mf-grid gm-field gm-field-defender">
            {leaks > 0 && <span key={leaks} className="mf-flash gm-flash-danger" />}

            {game.signals.map((signal) => (
              <SignalPiece
                key={signal.id}
                character={signal.character}
                x={signal.x}
                y={onScreen(signal.y)}
                danger={signal.y > 0.8}
              />
            ))}

            {bursts.map((burst) => (
              <SignalReveal
                key={burst.id}
                character={burst.character}
                x={burst.x}
                y={onScreen(burst.y)}
                points={burst.points}
              />
            ))}

            <span className="gm-floor" aria-hidden="true" />
            <span className="mf-engraved gm-floor-label" aria-hidden="true">
              Floor
            </span>
            <span className="gm-corner right-3 bottom-2" aria-hidden="true">
              <span className="mf-engraved">Pressure</span>
              <span className="gm-gauge" style={{ '--fill': load } as CSSProperties}>
                <span />
              </span>
            </span>
          </div>
        </div>

        <form
          className="gm-entry"
          onSubmit={(event) => {
            event.preventDefault()
            if (typed.trim()) submit(typed)
          }}
        >
          <div className="mf-screen mf-screen-flush grid gap-2 p-3">
            <label htmlFor="defender-answer" className="mf-engraved">
              Type what each code spells
            </label>
            {/* Two shake classes, alternated, so each wrong key restarts the
                shake without remounting (and so unfocusing) the field. */}
            <div className={misses === 0 ? undefined : misses % 2 ? 'mf-shake' : 'gm-shake-alt'}>
              <input
                id="defender-answer"
                ref={input}
                value={typed}
                // Submitted on the keystroke rather than on Enter: pressing
                // Enter after every character halves how fast anyone can play.
                onChange={(event) => {
                  const next = event.target.value.slice(-1)
                  if (next.trim()) submit(next)
                  else setTyped('')
                }}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={1}
                enterKeyHint="send"
                className="mf-input-answer relative z-[3]"
              />
            </div>
            {/* On a touch screen with a small pool, one big button per
                character: a two-letter drill should not need the soft
                keyboard for every answer (I-1). The field still works. */}
            {pool.characters.length <= PAD_MAX && (
              <div
                className="relative z-[3] hidden gap-2 pointer-coarse:grid"
                // Up to four across, so two letters share the row rather than
                // leaving half of it empty.
                style={{
                  gridTemplateColumns: `repeat(${Math.min(pool.characters.length, 4)}, minmax(0, 1fr))`,
                }}
                role="group"
                aria-label="Answer pad"
              >
                {pool.characters.map((character) => (
                  <button
                    key={character}
                    type="button"
                    className="mf-btn mf-btn-secondary min-h-14 px-2 font-display text-h3 normal-case"
                    onClick={() => submit(character)}
                  >
                    {character}
                  </button>
                ))}
              </div>
            )}
            <p role="status" className="min-h-5 font-mono text-sm" data-kind={feedback?.kind}>
              {feedback ? (
                <span className={feedback.kind === 'hit' ? 'text-signal' : 'text-danger'}>
                  <span aria-hidden="true">{feedback.kind === 'hit' ? '● ' : '✕ '}</span>
                  {feedback.text}
                </span>
              ) : (
                <span className="text-muted">Waiting for the first signal</span>
              )}
            </p>
          </div>
        </form>
      </div>
    </section>
  )
}
