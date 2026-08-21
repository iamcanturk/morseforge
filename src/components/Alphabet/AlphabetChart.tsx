import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioEngine } from '../../engine/audioEngine'
import { prettify } from '../../engine/morseEncoder'

/**
 * A playable reference chart.
 *
 * The rows are rendered by the Astro page, not here, so the whole table is in
 * the prerendered HTML for crawlers and for anyone with JavaScript off. This
 * component only adds the ability to hear a row — progressive enhancement over
 * markup that is already complete.
 */
export function AlphabetChart({
  entries,
}: {
  entries: readonly { character: string; code: string }[]
}) {
  const [playing, setPlaying] = useState<string | null>(null)
  const [wpm, setWpm] = useState(12)
  const audio = useRef<AudioEngine | null>(null)

  useEffect(() => () => void audio.current?.dispose(), [])

  const play = useCallback(
    async (character: string, code: string) => {
      audio.current ??= new AudioEngine()
      setPlaying(character)
      try {
        const playback = await audio.current.play(code, { wpm })
        await playback.finished
      } finally {
        setPlaying(null)
      }
    },
    [wpm],
  )

  return (
    <div>
      <label className="mb-5 flex max-w-sm items-center gap-3">
        <span className="font-mono text-[10px] tracking-[0.16em] text-muted">SPEED</span>
        <input
          type="range"
          min={5}
          max={40}
          value={wpm}
          onChange={(event) => setWpm(Number(event.target.value))}
          className="flex-1 accent-[var(--color-signal)]"
          aria-label="Playback speed in words per minute"
        />
        <span className="w-16 text-right font-mono text-xs text-signal">{wpm} WPM</span>
      </label>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {entries.map(({ character, code }) => {
          const active = playing === character
          return (
            <li key={character}>
              <button
                type="button"
                onClick={() => void play(character, code)}
                aria-label={`Play ${character}, Morse ${code}`}
                className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors"
                style={{
                  borderColor: active ? 'var(--color-signal)' : 'var(--color-line)',
                  background: active
                    ? 'color-mix(in srgb, var(--color-signal) 12%, var(--color-panel))'
                    : 'var(--color-panel)',
                }}
              >
                <span className="w-5 font-display text-lg font-bold text-signal">{character}</span>
                <span className="font-mono text-sm tracking-[0.18em] text-cyan">
                  {prettify(code)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
