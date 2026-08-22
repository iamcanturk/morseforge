import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnswerKey } from './AnswerKey'
import type { UseCopySessionResult } from './useCopySession'
import { AudioEngine } from '../../engine/audioEngine'
import { encode } from '../../engine/morseEncoder'
import { estimateDuration } from '../../engine/timingEngine'

/**
 * One line of copy practice: send it, take an answer, show the answer key.
 *
 * Shared by free copy practice and the daily challenge, which differ in what
 * they send and how they are scored but not at all in how a line is answered.
 * Keeping this in one place is what stops the two screens drifting into two
 * slightly different exercises.
 */

export interface RoundAudio {
  wpm: number
  farnsworthWpm: number
  enabled: boolean
  frequency: number
  volume: number
}

export function useCopyRound(session: UseCopySessionResult, audio: RoundAudio) {
  const { status, current } = session

  const [typed, setTyped] = useState('')
  const [sending, setSending] = useState(false)
  const [plays, setPlays] = useState(0)

  const engine = useRef<AudioEngine | null>(null)
  const stopPlayback = useRef<(() => void) | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const advance = useRef<HTMLButtonElement>(null)

  // Held in a ref so the play callback keeps a stable identity: it is called
  // from an effect keyed on the prompt, and re-sending a line because the
  // volume slider moved would be maddening.
  const settings = useRef(audio)
  settings.current = audio

  useEffect(() => () => void engine.current?.dispose(), [])

  const play = useCallback(async (text: string) => {
    const { enabled, frequency, volume, wpm, farnsworthWpm } = settings.current
    if (!enabled) return

    engine.current ??= new AudioEngine({ frequency, volume })
    engine.current.update({ frequency, volume })

    // A second press restarts rather than overlapping — two copies of the same
    // line playing a beat apart is unreadable.
    stopPlayback.current?.()
    setSending(true)
    setPlays((count) => count + 1)
    try {
      const playback = await engine.current.play(encode(text), { wpm, farnsworthWpm })
      stopPlayback.current = playback.stop
      await playback.finished
    } finally {
      stopPlayback.current = null
      setSending(false)
    }
  }, [])

  // Send each line as it appears. The AudioContext is unlocked by then, since
  // a session only starts from a press.
  useEffect(() => {
    if (status !== 'running' || current === null) return
    setPlays(0)
    setTyped('')
    void play(current)
    input.current?.focus()
  }, [current, status, play])

  // Move focus to the continue button while the answer key is up, so a whole
  // session stays playable from the keyboard.
  useEffect(() => {
    if (status === 'reviewing') advance.current?.focus()
  }, [status])

  const estimate = useMemo(
    () =>
      current === null
        ? 0
        : Math.round(
            estimateDuration(current, {
              wpm: audio.wpm,
              farnsworthWpm: audio.farnsworthWpm,
            }) / 1000,
          ),
    [current, audio.wpm, audio.farnsworthWpm],
  )

  return { typed, setTyped, sending, plays, estimate, play, input, advance }
}

export type CopyRound = ReturnType<typeof useCopyRound>

export function CopyRound({
  session,
  round,
  nextLabel,
}: {
  session: UseCopySessionResult
  round: CopyRound
  /** What the continue button says on the final line. */
  nextLabel: string
}) {
  const { status, current, lastGrade } = session
  const { typed, setTyped, sending, plays, estimate, play, input, advance } = round

  if (status === 'reviewing' && lastGrade) {
    return (
      <div className="mt-8">
        <div
          className="rounded-xl border p-5"
          style={{
            borderColor: lastGrade.perfect ? 'var(--color-signal)' : 'var(--color-danger)',
          }}
        >
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted">SENT</p>
          <div className="mt-3">
            <AnswerKey grade={lastGrade} />
          </div>

          <p
            className="mt-4 font-mono text-xs tracking-[0.14em]"
            style={{ color: lastGrade.perfect ? 'var(--color-signal)' : 'var(--color-danger)' }}
          >
            {lastGrade.perfect ? 'CLEAN COPY' : `${lastGrade.hits} / ${lastGrade.total} CHARACTERS`}
          </p>

          {!lastGrade.perfect && lastGrade.missed.length > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Lost: {[...new Set(lastGrade.missed)].join(', ')}
            </p>
          )}
        </div>

        <button
          ref={advance}
          type="button"
          onClick={session.next}
          className="mt-6 w-full rounded-lg px-6 py-3.5 font-mono text-sm tracking-[0.16em] text-void"
          style={{ background: 'var(--color-signal)' }}
        >
          {nextLabel}
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="mt-8 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => current && void play(current)}
          className="rounded-lg border px-6 py-3 font-mono text-xs tracking-[0.14em] transition-colors"
          style={{
            borderColor: sending
              ? 'var(--color-cyan)'
              : 'color-mix(in srgb, var(--color-cyan) 40%, transparent)',
            color: sending ? 'var(--color-void)' : 'var(--color-cyan)',
            background: sending ? 'var(--color-cyan)' : 'transparent',
          }}
        >
          {sending ? '♪ SENDING' : '▶ SEND IT AGAIN'}
        </button>

        <p className="font-mono text-[10px] tracking-[0.14em] text-muted">
          {plays <= 1 ? `ABOUT ${estimate}s` : `HEARD IT ${plays}×`}
        </p>
      </div>

      <form
        className="mt-8"
        onSubmit={(event) => {
          event.preventDefault()
          session.submit(typed)
        }}
      >
        <label htmlFor="copy-answer" className="sr-only">
          Type what you copied
        </label>
        <input
          id="copy-answer"
          ref={input}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="what did you get?"
          className="w-full rounded-lg border border-line bg-elevated px-4 py-4 text-center font-mono text-2xl tracking-[0.18em] uppercase outline-none placeholder:text-sm placeholder:tracking-normal placeholder:normal-case focus:border-signal"
        />
        <button
          type="submit"
          className="mt-4 w-full rounded-lg px-6 py-3 font-mono text-xs tracking-[0.14em] text-void"
          style={{ background: 'var(--color-signal)' }}
        >
          CHECK IT
        </button>
        <p className="mt-3 text-center text-xs text-muted">
          Submit an empty answer if you got nothing — it counts, and nothing is lost by being honest
          about it.
        </p>
      </form>
    </>
  )
}
