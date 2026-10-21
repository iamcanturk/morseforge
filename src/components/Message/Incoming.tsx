import { useEffect, useId, useMemo, useRef, useState, type SubmitEvent } from 'react'
import { buildTimeline } from '../../engine/timingEngine'
import {
  gradeGuess,
  messageCells,
  type MessageCell,
  type MessageLink,
} from '../../game/messageLink'
import type { SettingsRecord } from '../../storage/settings'
import { plural } from '../../data/format'
import { Lamp } from '../ui/Lamp'
import { Screen } from '../ui/Screen'
import { Segmented } from '../ui/Segmented'
import {
  SPEEDS,
  cellOwners,
  cellsToMorse,
  messageTiming,
  nearestSpeed,
  type Speed,
} from './playback'
import { Tape } from './Tape'
import type { useWire } from './useWire'

export interface IncomingProps {
  message: MessageLink
  settings: SettingsRecord
  wire: ReturnType<typeof useWire>
  /** Answer it: gets the text just read, so the reply can say what it answers. */
  onReply: (original: string) => void
}

type Verdict = { exact: boolean; correct: number; letters: number } | null

export function Incoming({ message, settings, wire, onReply }: IncomingProps) {
  const cells = useMemo(() => messageCells(message.text), [message.text])
  const letters = cells.filter((cell) => !cell.space).length

  const [speed, setSpeed] = useState<Speed>(() => nearestSpeed(message.wpm ?? settings.timing.wpm))
  const [guess, setGuess] = useState('')
  const [known, setKnown] = useState<boolean[]>(() => cells.map((cell) => cell.space))
  const [verdict, setVerdict] = useState<Verdict>(null)
  const [revealed, setRevealed] = useState(false)
  const [shake, setShake] = useState(0)
  const [powered, setPowered] = useState(false)
  const ids = { guess: useId(), verdict: useId(), heading: useId() }
  const slip = useRef<HTMLElement>(null)

  // A new message (the hash changed under us) starts from scratch.
  useEffect(() => {
    setKnown(cells.map((cell) => cell.space))
    setVerdict(null)
    setRevealed(false)
    setGuess('')
  }, [cells])

  useEffect(() => {
    if (revealed) slip.current?.focus()
  }, [revealed])

  const play = () => {
    if (wire.playing) {
      wire.stop()
      return
    }
    setPowered(true)
    const morse = cellsToMorse(cells)
    const timing = messageTiming(speed, settings)
    void wire.send({ morse, timing, owners: cellOwners(buildTimeline(morse, timing), cells) })
  }

  const playCell = (cell: MessageCell) => {
    setPowered(true)
    // One character at its own speed; spacing does not apply to a single one.
    void wire.send({ morse: cell.code, timing: { wpm: speed }, owners: cell.index })
  }

  const check = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (guess.trim() === '') return
    const graded = gradeGuess(guess, message.text)
    setVerdict(graded)
    // Letters read correctly are printed on the tape: earned, not given.
    setKnown((before) => before.map((was, i) => was || graded.cells[i] === true))
    if (graded.exact) setRevealed(true)
    else setShake((n) => n + 1)
  }

  const shown = revealed ? cells.map(() => true) : known
  const sound = settings.audio.enabled && !wire.audioFailed

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex items-center justify-between gap-4">
        <span className="mf-engraved flex items-center gap-2">
          <Lamp on tone="amber" label="Message waiting" />
          Incoming wire
        </span>
        <span className="mf-engraved shrink-0">{plural(letters, 'character')}</span>
      </div>

      <div>
        <h2 id={ids.heading} className="font-display text-h2 text-balance">
          Someone sent you a message in Morse.
        </h2>
        <p className="mt-2 text-muted">
          {revealed
            ? 'Here it is, letter by letter.'
            : 'Play it, tap any letter to hear it alone, and see how much you can read before you reveal it.'}
        </p>
      </div>

      <Tape
        cells={cells}
        shown={shown}
        active={wire.cell}
        onTap={playCell}
        strike={revealed}
        label="The message in Morse code. Each character is a button that plays it."
      />

      {/* The receiver: one lamp carries the whole signal, sound or not. */}
      <Screen
        grid
        powerOn={powered}
        className="flex flex-wrap items-center gap-x-5 gap-y-4 p-4 sm:p-5"
      >
        <button
          type="button"
          className="mf-btn mf-btn-primary mf-btn-lg mfm-screen-btn relative z-[3] min-w-40"
          onClick={play}
        >
          <span aria-hidden="true">{wire.playing ? '■' : '▶'}</span>
          {wire.playing ? 'Stop' : revealed ? 'Play again' : 'Play message'}
        </button>
        <span className="relative z-[3] flex items-center gap-3">
          <span className="mfm-receiver-lamp" data-on={wire.lit} aria-hidden="true" />
          <span className="font-mono text-control uppercase text-muted">
            {wire.playing
              ? wire.cell >= 0
                ? `Receiving ${cells.slice(0, wire.cell + 1).filter((c) => !c.space).length} of ${letters}`
                : 'Receiving'
              : sound
                ? 'Sound and light'
                : 'Light only'}
          </span>
        </span>
      </Screen>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Playback speed"
          size="sm"
          value={speed}
          onChange={(value) => {
            wire.stop()
            setSpeed(value)
          }}
          options={SPEEDS.map((option) => ({
            value: option.value,
            label: option.label,
            ariaLabel: `${option.label}, ${option.value} words per minute`,
          }))}
        />
        {message.wpm !== null && (
          <span className="text-sm text-muted">Sent at {message.wpm} WPM</span>
        )}
      </div>

      {!sound && (
        <p className="text-sm text-muted">
          {wire.audioFailed
            ? 'This browser would not start the sound, so the lamp carries the message.'
            : 'Sound is off in your settings, so the lamp carries the message.'}{' '}
          <a className="text-ink underline underline-offset-4" href="/settings/#signal">
            Signal settings
          </a>
          . On an iPhone, the silent switch also mutes it.
        </p>
      )}

      {!revealed && (
        <form className="grid gap-3" onSubmit={check} noValidate>
          <label htmlFor={ids.guess} className="mf-engraved">
            What does it say?
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              key={shake}
              id={ids.guess}
              className={`mf-input min-w-0 flex-1 font-mono uppercase ${shake > 0 ? 'mf-shake' : ''}`}
              value={guess}
              onChange={(event) => setGuess(event.target.value)}
              placeholder="Type what you hear"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-describedby={verdict ? ids.verdict : undefined}
            />
            <button type="submit" className="mf-btn mf-btn-secondary">
              Check
            </button>
          </div>
          <p id={ids.verdict} className="min-h-6 text-sm" aria-live="polite">
            {verdict && !verdict.exact && (
              <span className="text-ink">
                {verdict.correct} of {verdict.letters} letters in the right place
                {verdict.correct > 0 ? ', now printed on the tape.' : '. Try a letter at a time.'}
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              className="mf-btn mf-btn-amber"
              onClick={() => {
                wire.stop()
                setRevealed(true)
              }}
            >
              Reveal message
            </button>
            <a
              className="text-sm text-muted underline underline-offset-4"
              href="/morse-code-alphabet/"
            >
              Look letters up in the alphabet chart
            </a>
          </div>
        </form>
      )}

      {revealed && (
        <section
          ref={slip}
          tabIndex={-1}
          className="mf-slip mfm-slip grid grid-cols-1 gap-4"
          aria-labelledby={`${ids.heading}-revealed`}
        >
          <div className="mfm-slip-head">
            <h3 id={`${ids.heading}-revealed`} className="mfm-form-label">
              The message reads
            </h3>
            <span className="mf-stamp mf-stamp-in mfm-stamp shrink-0 text-paper-ink">
              {verdict?.exact ? 'Decoded' : 'Received'}
            </span>
          </div>
          {/* User text from the link: rendered as text, never as markup. */}
          <p className="mfm-telegram">{message.text}</p>
          <p className="text-sm text-paper-muted">
            This text came from a link, not from MorseForge.
          </p>
          {verdict?.exact && (
            <p className="font-display text-h3 text-paper-ink">
              You read it yourself. That is Morse code.
            </p>
          )}
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              className="mf-btn mf-btn-primary"
              onClick={() => onReply(message.text)}
            >
              Reply
            </button>
            <a className="mf-btn mfm-btn-paper" href="/learn/">
              Learn to read it live
            </a>
          </div>
        </section>
      )}
    </div>
  )
}
