import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MorseKey } from '../MorseKey/MorseKey'
import { useMorseKey } from '../MorseKey/useMorseKey'
import { SignalTree } from '../SignalTree/SignalTree'
import { PracticeScreen } from '../Practice/PracticeScreen'
import { STEP_COPY, TEACH_STEPS, currentStageIndex, type TeachStep } from './lesson'
import { AudioEngine } from '../../engine/audioEngine'
import { prettify } from '../../engine/morseEncoder'
import { LEARNING_STAGES, MORSE_ALPHABET } from '../../data/morseAlphabet'
import { createSettingsStore, defaultSettings, type SettingsRecord } from '../../storage/settings'
import {
  answer as recordAnswer,
  createProgressStore,
  markSeen,
  type ProgressRecord,
} from '../../storage/progress'

/**
 * The guided lesson (PROJECT.md §4.1, §45, §46, §48).
 *
 * Teach a character three ways — see it, hear it, send it — then immediately
 * drill everything taught so far. §46's loop is show, try, fail, try again; the
 * drill is the "try" and it comes straight after the teaching rather than being
 * a separate screen the learner has to go and find.
 */
export function LessonScreen() {
  const progressStore = useMemo(() => createProgressStore(), [])
  const settingsStore = useMemo(() => createSettingsStore(), [])

  const [progress, setProgress] = useState<ProgressRecord>({ characters: {} })
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)
  const [ready, setReady] = useState(false)

  const [stage, setStage] = useState(0)
  const [characterIndex, setCharacterIndex] = useState(0)
  const [step, setStep] = useState<TeachStep>('see')
  const [phase, setPhase] = useState<'teach' | 'drill'>('teach')
  const [sendResult, setSendResult] = useState<'right' | 'wrong' | null>(null)

  const audio = useRef<AudioEngine | null>(null)

  useEffect(() => {
    const loaded = progressStore.read()
    setProgress(loaded)
    setStage(Math.min(currentStageIndex(loaded, Date.now()), LEARNING_STAGES.length - 1))
    setSettings(settingsStore.read())
    setReady(true)
    return progressStore.subscribe(setProgress)
  }, [progressStore, settingsStore])

  useEffect(() => () => void audio.current?.dispose(), [])

  const stageCharacters = LEARNING_STAGES[stage] ?? []
  const character = stageCharacters[characterIndex] ?? ''
  const code = MORSE_ALPHABET[character] ?? ''

  const play = useCallback(async () => {
    if (!code || !settings.audio.enabled) return
    audio.current ??= new AudioEngine({
      frequency: settings.audio.frequency,
      volume: settings.audio.volume,
    })
    const playback = await audio.current.play(code, {
      wpm: settings.timing.wpm,
      farnsworthWpm: settings.timing.farnsworthWpm,
    })
    await playback.finished
  }, [code, settings])

  // Meeting a character counts as seeing it, which is what lights its node.
  useEffect(() => {
    if (!ready || !character) return
    progressStore.update((current) => markSeen(current, character, Date.now()))
  }, [ready, character, progressStore])

  // Hearing it should actually play, not wait for a second click.
  useEffect(() => {
    if (step === 'hear') void play()
  }, [step, play])

  const advance = useCallback(() => {
    setSendResult(null)
    const stepIndex = TEACH_STEPS.indexOf(step)

    if (stepIndex < TEACH_STEPS.length - 1) {
      setStep(TEACH_STEPS[stepIndex + 1]!)
      return
    }

    // Finished this character. Next one, or the drill.
    if (characterIndex < stageCharacters.length - 1) {
      setCharacterIndex((index) => index + 1)
      setStep('see')
      return
    }
    setPhase('drill')
  }, [step, characterIndex, stageCharacters.length])

  const key = useMorseKey({
    wpm: settings.timing.wpm,
    dotDashThresholdMs: settings.timing.dotDashThresholdMs,
    characterGapMs: settings.timing.characterGapMs,
    wordGapMs: settings.timing.wordGapMs,
    autoCommit: settings.timing.autoCommit,
    bindings: settings.keys,
    frequency: settings.audio.frequency,
    volume: settings.audio.enabled ? settings.audio.volume : 0,
    disabled: step !== 'send' || phase !== 'teach',
    onCharacter: (sent) => {
      const correct = sent === character
      setSendResult(correct ? 'right' : 'wrong')
      progressStore.update((current) =>
        recordAnswer(current, character, 'sending', correct, Date.now()),
      )
      if (correct) setTimeout(advance, 900)
    },
  })

  const { reset: resetKey } = key
  useEffect(() => {
    resetKey()
    setSendResult(null)
  }, [character, step, resetKey])

  if (!ready) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-8">
        <p className="font-mono text-xs tracking-[0.16em] text-muted">LOADING</p>
      </div>
    )
  }

  if (phase === 'drill') {
    return (
      <div>
        <div className="rounded-2xl border border-signal/30 bg-panel p-6">
          <h2 className="font-display text-xl font-bold tracking-tight text-signal">
            Stage {stage + 1} taught — now use it
          </h2>
          <p className="mt-2 leading-relaxed text-muted">
            You have met {stageCharacters.join(', ')}. This drill mixes them with everything from
            earlier stages, because a character you can only recognise in isolation is not one you
            know yet.
          </p>
        </div>

        <div className="mt-6">
          {/* The real practice screen, not a copy of it: the drill has to behave
              exactly like practising, or the lesson teaches a different app. */}
          <PracticeScreen />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {stage < LEARNING_STAGES.length - 1 && (
            <button
              type="button"
              onClick={() => {
                setStage((index) => index + 1)
                setCharacterIndex(0)
                setStep('see')
                setPhase('teach')
              }}
              className="rounded-lg px-5 py-2.5 font-mono text-xs tracking-[0.14em] text-void"
              style={{ background: 'var(--color-signal)' }}
            >
              NEXT STAGE →
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setCharacterIndex(0)
              setStep('see')
              setPhase('teach')
            }}
            className="rounded-lg border border-line px-5 py-2.5 font-mono text-xs tracking-[0.14em] text-muted transition-colors hover:border-signal hover:text-signal"
          >
            TEACH IT AGAIN
          </button>
        </div>
      </div>
    )
  }

  const copy = STEP_COPY[step]

  return (
    <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted">
          STAGE {stage + 1} · {characterIndex + 1} / {stageCharacters.length}
        </span>
        <span className="flex gap-1.5" aria-label={`Step ${TEACH_STEPS.indexOf(step) + 1} of 3`}>
          {TEACH_STEPS.map((entry) => (
            <span
              key={entry}
              className="h-1.5 w-8 rounded-full"
              style={{
                background:
                  TEACH_STEPS.indexOf(entry) <= TEACH_STEPS.indexOf(step)
                    ? 'var(--color-signal)'
                    : 'var(--color-line)',
              }}
            />
          ))}
        </span>
      </div>

      <h2 className="mt-6 font-display text-xl font-bold tracking-tight">{copy.title}</h2>
      <p className="mt-2 leading-relaxed text-muted">{copy.body}</p>

      <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-line py-8">
        <span className="font-display text-6xl font-bold text-signal">{character}</span>
        <span className="font-mono text-2xl tracking-[0.25em] text-cyan">{prettify(code)}</span>
      </div>

      {step === 'see' && (
        <div className="mt-6">
          {/* Where it sits, so the code stops looking arbitrary the moment it
              is introduced rather than a screen later. */}
          <SignalTree highlight={character} className="min-w-0" />
        </div>
      )}

      {step === 'hear' && (
        <button
          type="button"
          onClick={() => void play()}
          className="mt-6 w-full rounded-lg border border-cyan/40 px-5 py-3 font-mono text-xs tracking-[0.14em] text-cyan"
        >
          ▶ PLAY IT AGAIN
        </button>
      )}

      {step === 'send' && (
        <div className="mt-6">
          <SignalTree
            livePath={key.state.pending}
            highlight={sendResult === 'wrong' ? character : null}
            className="min-w-0"
          />
          <div className="mt-6">
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
              onClick={key.commitCharacter}
              disabled={key.state.pending === ''}
              className="mx-auto mt-5 block w-full max-w-md rounded-lg border px-4 py-2.5 font-mono text-xs tracking-[0.14em] disabled:opacity-30"
              style={{ borderColor: 'var(--color-signal)', color: 'var(--color-signal)' }}
            >
              FINISH CHARACTER
            </button>
          </div>

          <p aria-live="polite" className="mt-4 min-h-6 text-center text-sm">
            {sendResult === 'right' && <span className="text-signal">That is {character}.</span>}
            {sendResult === 'wrong' && (
              <span className="text-danger">
                Not quite — {character} is {prettify(code)}. Try it again.
              </span>
            )}
          </p>
        </div>
      )}

      {step !== 'send' && (
        <button
          type="button"
          onClick={advance}
          className="mt-8 w-full rounded-lg px-6 py-3 font-mono text-sm tracking-[0.16em] text-void"
          style={{ background: 'var(--color-signal)' }}
        >
          {step === 'see' ? 'NOW HEAR IT' : 'NOW SEND IT'}
        </button>
      )}
    </div>
  )
}
