import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGameLoop } from './useGameLoop'
import { GameOver, PoolPicker, useGamePool } from './shared'
import {
  STARTING_LIVES,
  accuracy,
  advance,
  isOver,
  newDefenderGame,
  pressure,
  shoot,
  weakest,
  type DefenderState,
} from '../../game/defender'
import { createRandom, seedFrom } from '../../game/random'
import { AudioEngine } from '../../engine/audioEngine'
import { MORSE_ALPHABET } from '../../data/morseAlphabet'
import { prettify } from '../../engine/morseEncoder'
import { createSettingsStore, defaultSettings, type SettingsRecord } from '../../storage/settings'
import { answer as recordAnswer, createProgressStore } from '../../storage/progress'
import { track } from '../../analytics/track'

/**
 * Signal Defender (PROJECT.md §18).
 *
 * Characters fall, each sounding as it appears; type one to knock it down.
 * The rules are in `game/defender.ts` and tested there — this holds the state,
 * the clock and the audio.
 *
 * What it adds over practice is pressure that a practice screen cannot create
 * honestly: practice waits for you, and copying at speed fails not because you
 * cannot decode a character but because you cannot decode it before the next
 * one arrives.
 */
export function DefenderScreen() {
  const settingsStore = useMemo(() => createSettingsStore(), [])
  const progressStore = useMemo(() => createProgressStore(), [])
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)

  const pool = useGamePool()
  const [game, setGame] = useState<DefenderState | null>(null)
  const [typed, setTyped] = useState('')
  const [flash, setFlash] = useState<'hit' | 'miss' | null>(null)

  const audio = useRef<AudioEngine | null>(null)
  const random = useRef(createRandom(1))
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSettings(settingsStore.read())
    return settingsStore.subscribe(setSettings)
  }, [settingsStore])

  useEffect(() => () => void audio.current?.dispose(), [])

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

  const start = useCallback(() => {
    track('game_start', 'defender')
    audio.current ??= new AudioEngine({
      frequency: settings.audio.frequency,
      volume: settings.audio.volume,
    })
    void audio.current.resume()
    random.current = createRandom(seedFrom(`defender-${pool.id}-${performance.now()}`))
    setGame(newDefenderGame())
    setTyped('')
    setFlash(null)
    setTimeout(() => input.current?.focus(), 50)
  }, [settings, pool.id])

  const running = game !== null && !isOver(game)

  useGameLoop(running, (dtMs) => {
    setGame((current) => {
      if (!current || isOver(current)) return current
      const { state, spawned } = advance(current, dtMs, pool.characters, random.current)
      if (spawned) sound(spawned.character)
      return state
    })
  })

  const submit = useCallback(
    (character: string) => {
      setGame((current) => {
        if (!current || isOver(current)) return current
        const { state, hit } = shoot(current, character)
        setFlash(hit ? 'hit' : 'miss')
        setTimeout(() => setFlash(null), 160)

        // A game is still evidence: every character shot at was heard and
        // either recognised or not, so it feeds the same listening schedule as
        // practice rather than being a throwaway score.
        if (hit) {
          progressStore.update((progress) =>
            recordAnswer(progress, hit.character, 'listening', true, Date.now()),
          )
        }
        return state
      })
      setTyped('')
    },
    [progressStore],
  )

  // Report the run once, when it ends.
  const finished = game !== null && isOver(game)
  useEffect(() => {
    if (finished) track('game_finish', 'defender')
  }, [finished])

  if (game === null) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
        <h2 className="font-display text-2xl font-bold tracking-tight">Signal Defender</h2>
        <p className="mt-3 leading-relaxed text-muted">
          Characters fall, one sounding as each appears. Type a character to knock down the lowest
          one matching it. Let three reach the floor and the run is over.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Practice waits for you. This does not, which is the whole point — copying at speed fails
          not because you cannot decode a character but because you cannot decode it before the next
          one arrives.
        </p>

        <div className="mt-6">
          <PoolPicker />
        </div>

        <button
          type="button"
          onClick={start}
          className="mt-8 w-full rounded-lg px-6 py-3.5 font-mono text-sm tracking-[0.16em] text-void"
          style={{ background: 'var(--color-signal)' }}
        >
          START
        </button>

        {!settings.audio.enabled && (
          <p className="mt-4 text-xs text-amber">
            Sound is off in settings. The characters still fall and are still readable on screen, so
            the game works — it is just the reading game rather than the listening one.
          </p>
        )}
      </div>
    )
  }

  if (isOver(game)) {
    return (
      <GameOver
        title="Overrun"
        stats={[
          { label: 'SCORE', value: game.score.toLocaleString('en') },
          { label: 'ACCURACY', value: `${Math.round(accuracy(game) * 100)}%` },
          { label: 'BEST STREAK', value: String(game.bestStreak) },
          { label: 'LASTED', value: `${Math.round(game.elapsedMs / 1000)}s` },
        ]}
        weakest={weakest(game)}
        onAgain={start}
        onQuit={() => setGame(null)}
      />
    )
  }

  return (
    <div className="rounded-2xl border border-line bg-panel p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted">
          SCORE {game.score.toLocaleString('en')}
        </span>
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted">
          STREAK {game.streak}
        </span>
        <span
          className="font-mono text-[10px] tracking-[0.18em]"
          style={{ color: game.lives === 1 ? 'var(--color-danger)' : 'var(--color-muted)' }}
        >
          {/* Lives as a count as well as pips: three hearts and two hearts are
              hard to tell apart at a glance under time pressure. */}
          {game.lives} / {STARTING_LIVES} LIVES
          <span aria-hidden="true"> {'●'.repeat(Math.max(0, game.lives))}</span>
        </span>
        <button
          type="button"
          onClick={() => setGame(null)}
          className="font-mono text-[10px] tracking-[0.14em] text-muted hover:text-danger"
        >
          GIVE UP
        </button>
      </div>

      {/* The field. Signals are positioned rather than drawn, so they stay real
          text — selectable, readable by a screen reader, and legible at any
          zoom. A canvas would be none of those. */}
      <div
        className="relative mt-4 overflow-hidden rounded-xl border"
        style={{
          height: 'min(58vh, 420px)',
          borderColor:
            flash === 'hit'
              ? 'var(--color-signal)'
              : flash === 'miss'
                ? 'var(--color-danger)'
                : 'var(--color-line)',
          background: 'var(--color-void)',
        }}
      >
        {game.signals.map((signal) => (
          <span
            key={signal.id}
            className="absolute font-display text-3xl font-bold"
            style={{
              left: `${signal.x * 100}%`,
              top: `${signal.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              // Reddens as it nears the floor: a non-colour cue is not needed
              // here because the position itself is the information.
              color: signal.y > 0.8 ? 'var(--color-danger)' : 'var(--color-signal)',
            }}
          >
            {signal.character}
            <span className="mt-1 block text-center font-mono text-[10px] tracking-[0.12em] text-muted">
              {prettify(MORSE_ALPHABET[signal.character] ?? '')}
            </span>
          </span>
        ))}

        {/* The floor. */}
        <span
          aria-hidden="true"
          className="absolute right-0 bottom-0 left-0 h-px"
          style={{ background: 'var(--color-danger)', opacity: 0.5 }}
        />

        <span className="absolute right-3 bottom-2 font-mono text-[10px] tracking-[0.14em] text-muted">
          {Math.round(pressure(game.elapsedMs) * 100)}% PRESSURE
        </span>
      </div>

      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (typed.trim()) submit(typed)
        }}
      >
        <label htmlFor="defender-answer" className="sr-only">
          Type the character you heard
        </label>
        <input
          id="defender-answer"
          ref={input}
          value={typed}
          // Submitted on the keystroke rather than on Enter: pressing Enter
          // after every character halves how fast anyone can play.
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
          placeholder="type what you hear"
          className="w-full rounded-lg border border-line bg-elevated px-4 py-4 text-center font-display text-2xl uppercase outline-none placeholder:text-sm placeholder:normal-case focus:border-signal"
        />
      </form>
    </div>
  )
}
