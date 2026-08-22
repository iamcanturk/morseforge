import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGameLoop } from './useGameLoop'
import { GameOver, PoolPicker, useGamePool } from './shared'
import {
  HORIZON,
  STARTING_LIVES,
  accuracy,
  advance,
  isOver,
  newRunnerGame,
  send,
  weakest,
  type RunnerState,
} from '../../game/runner'
import { createRandom, seedFrom } from '../../game/random'
import { MorseKey } from '../MorseKey/MorseKey'
import { useMorseKey } from '../MorseKey/useMorseKey'
import { MORSE_ALPHABET } from '../../data/morseAlphabet'
import { prettify } from '../../engine/morseEncoder'
import { createSettingsStore, defaultSettings, type SettingsRecord } from '../../storage/settings'
import { answer as recordAnswer, createProgressStore } from '../../storage/progress'
import { track } from '../../analytics/track'

/**
 * Morse Runner (PROJECT.md §18).
 *
 * Gates come towards you; key the character before you reach one. The mirror
 * of Signal Defender — that game is receiving under pressure, this one is
 * sending under it.
 *
 * Sending is the skill with no natural pressure anywhere else on the site. The
 * telegraph waits forever, and a keyer that waits forever never teaches anyone
 * to commit to a character. Here the gate arrives whether you are ready or not.
 */
export function RunnerScreen() {
  const settingsStore = useMemo(() => createSettingsStore(), [])
  const progressStore = useMemo(() => createProgressStore(), [])
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)

  const pool = useGamePool()
  const [game, setGame] = useState<RunnerState | null>(null)
  const [flash, setFlash] = useState<'clear' | 'wrong' | null>(null)

  const random = useRef(createRandom(1))

  useEffect(() => {
    setSettings(settingsStore.read())
    return settingsStore.subscribe(setSettings)
  }, [settingsStore])

  const running = game !== null && !isOver(game)

  const keyed = useCallback(
    (character: string) => {
      setGame((current) => {
        if (!current || isOver(current)) return current
        const { state, cleared } = send(current, character)
        setFlash(cleared ? 'clear' : 'wrong')
        setTimeout(() => setFlash(null), 160)

        // Keying a character correctly under time pressure is evidence about
        // sending, so it feeds the same schedule practice does.
        if (cleared) {
          progressStore.update((progress) =>
            recordAnswer(progress, cleared.character, 'sending', true, Date.now()),
          )
        }
        return state
      })
    },
    [progressStore],
  )

  const key = useMorseKey({
    wpm: settings.timing.wpm,
    dotDashThresholdMs: settings.timing.dotDashThresholdMs,
    characterGapMs: settings.timing.characterGapMs,
    wordGapMs: settings.timing.wordGapMs,
    autoCommit: settings.timing.autoCommit,
    bindings: settings.keys,
    frequency: settings.audio.frequency,
    volume: settings.audio.enabled ? settings.audio.volume : 0,
    disabled: !running,
    onCharacter: keyed,
  })

  const start = useCallback(() => {
    track('game_start', 'runner')
    random.current = createRandom(seedFrom(`runner-${pool.id}-${performance.now()}`))
    key.reset()
    setGame(newRunnerGame())
    setFlash(null)
  }, [pool.id, key])

  useGameLoop(running, (dtMs) => {
    setGame((current) => {
      if (!current || isOver(current)) return current
      return advance(current, dtMs, pool.characters, random.current).state
    })
  })

  const finished = game !== null && isOver(game)
  useEffect(() => {
    if (finished) track('game_finish', 'runner')
  }, [finished])

  if (game === null) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
        <h2 className="font-display text-2xl font-bold tracking-tight">Morse Runner</h2>
        <p className="mt-3 leading-relaxed text-muted">
          Gates come towards you, each asking for one character. Key it before you reach the gate
          and you pass through. Three collisions ends the run.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This is the sending game. The telegraph waits for you forever, and a key that waits
          forever never teaches anyone to commit to a character — here the gate arrives whether you
          are ready or not.
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
          START RUNNING
        </button>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          Tap for a dot, hold for a dash — same key as the{' '}
          <a href="/telegraph/" className="text-signal underline underline-offset-4">
            telegraph
          </a>
          . How patient the key is comes from your{' '}
          <a href="/settings/" className="text-signal underline underline-offset-4">
            settings
          </a>
          , so if characters are landing before you finish them, loosen it there.
        </p>
      </div>
    )
  }

  if (isOver(game)) {
    return (
      <GameOver
        title="Run over"
        stats={[
          { label: 'DISTANCE', value: `${Math.round(game.distance)} m` },
          { label: 'SCORE', value: game.score.toLocaleString('en') },
          { label: 'CLEARED', value: `${Math.round(accuracy(game) * 100)}%` },
          { label: 'BEST STREAK', value: String(game.bestStreak) },
        ]}
        weakest={weakest(game)}
        onAgain={start}
        onQuit={() => setGame(null)}
      />
    )
  }

  // Nearest first, so the one that matters is at the top of the list.
  const ahead = [...game.gates].sort((a, b) => a.distance - b.distance)
  const next = ahead[0]

  return (
    <div className="rounded-2xl border border-line bg-panel p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted">
          {Math.round(game.distance)} M
        </span>
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted">
          SCORE {game.score.toLocaleString('en')}
        </span>
        <span
          className="font-mono text-[10px] tracking-[0.18em]"
          style={{ color: game.lives === 1 ? 'var(--color-danger)' : 'var(--color-muted)' }}
        >
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

      {/* The track, seen from above: the runner is fixed at the left and the
          gates slide towards it. Positioned text rather than a canvas, so the
          characters stay real text at any zoom. */}
      <div
        aria-live="polite"
        className="relative mt-4 overflow-hidden rounded-xl border"
        style={{
          height: '150px',
          borderColor:
            flash === 'clear'
              ? 'var(--color-signal)'
              : flash === 'wrong'
                ? 'var(--color-danger)'
                : 'var(--color-line)',
          background: 'var(--color-void)',
        }}
      >
        <span
          aria-hidden="true"
          className="absolute top-1/2 right-0 left-0 h-px"
          style={{ background: 'var(--color-line)' }}
        />

        {/* The runner. */}
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-[8%] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: 'var(--color-cyan)',
            boxShadow: '0 0 20px color-mix(in srgb, var(--color-cyan) 60%, transparent)',
          }}
        />

        {ahead.map((gate) => (
          <span
            key={gate.id}
            className="absolute top-1/2 -translate-y-1/2 text-center"
            style={{
              // 8% is the runner; 100% is the horizon.
              left: `${8 + (gate.distance / HORIZON) * 92}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <span
              className="block font-display text-2xl font-bold"
              style={{
                color: gate.distance < 20 ? 'var(--color-danger)' : 'var(--color-signal)',
              }}
            >
              {gate.character}
            </span>
            <span className="mt-0.5 block font-mono text-[10px] tracking-[0.12em] text-muted">
              {prettify(MORSE_ALPHABET[gate.character] ?? '')}
            </span>
          </span>
        ))}

        <span className="sr-only">
          {next
            ? `Next gate: ${next.character}, ${Math.round(next.distance)} metres`
            : 'Track clear'}
        </span>
      </div>

      <div className="mt-4">
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
        {!settings.timing.autoCommit && (
          <button
            type="button"
            onClick={key.commitCharacter}
            disabled={key.state.pending === ''}
            className="mx-auto mt-4 block w-full max-w-md rounded-lg border px-4 py-2.5 font-mono text-xs tracking-[0.14em] disabled:opacity-30"
            style={{ borderColor: 'var(--color-signal)', color: 'var(--color-signal)' }}
          >
            SEND IT
          </button>
        )}
      </div>
    </div>
  )
}
