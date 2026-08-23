import { useCallback, useEffect, useMemo, useState } from 'react'
import { MorseKey, SignalTrace } from './MorseKey'
import { KeyerSpeedPicker } from './KeyerSpeedPicker'
import { SignalTree } from '../SignalTree/SignalTree'
import { useMorseKey } from './useMorseKey'
import { encode } from '../../engine/morseEncoder'
import { UNKNOWN_CHARACTER } from '../../engine/morseDecoder'
import {
  KEYER_PRESETS,
  type KeyerPreset,
  type SettingsRecord,
  createSettingsStore,
  defaultSettings,
} from '../../storage/settings'
import { track } from '../../analytics/track'

/**
 * The real-time telegraph (PROJECT.md §14, §15).
 *
 * Key it, see it decoded as you go. This is the screen that has to feel
 * immediate — §57 puts the whole growth argument on sending being fun, not on
 * the learning being thorough.
 */
export function TelegraphScreen() {
  const store = useMemo(() => createSettingsStore(), [])

  // Settings start at defaults rather than being read during render: this is
  // prerendered in Node, and differing markup would tear hydration.
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)
  const [showTree, setShowTree] = useState(true)

  useEffect(() => {
    setSettings(store.read())
    return store.subscribe(setSettings)
  }, [store])

  const { state, commitCharacter, commitWord, cancelPending, reset, pointerHandlers } = useMorseKey(
    {
      wpm: settings.timing.wpm,
      dotDashThresholdMs: settings.timing.dotDashThresholdMs,
      characterGapMs: settings.timing.characterGapMs,
      wordGapMs: settings.timing.wordGapMs,
      autoCommit: settings.timing.autoCommit,
      bindings: settings.keys,
      frequency: settings.audio.frequency,
      volume: settings.audio.enabled ? settings.audio.volume : 0,
      // Counted per word rather than per character: a character is a
      // keystroke, a word is someone actually sending something.
      onWord: () => track('telegraph_send'),
    },
  )

  const applyPreset = useCallback(
    (name: KeyerPreset) => {
      const preset = KEYER_PRESETS[name]
      store.update((current) => ({
        ...current,
        timing: {
          ...current.timing,
          characterGapMs: preset.characterGapMs,
          wordGapMs: preset.wordGapMs,
          autoCommit: preset.autoCommit,
        },
      }))
    },
    [store],
  )

  const keyLabel = settings.keys.key === ' ' ? 'SPACE' : settings.keys.key.toUpperCase()
  const commitLabel = (settings.keys.submit ?? 'Control').toUpperCase()
  const decoded = state.text.trimEnd()
  const hasUnknown = decoded.includes(UNKNOWN_CHARACTER)

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* `min-w-0` is load-bearing. A grid item defaults to `min-width: auto`,
          which refuses to shrink below its content's minimum — and the tree
          inside is 560px wide by design. On a 375px screen the column was
          327px and this section was 560px, so the whole page scrolled
          sideways. The tree has its own scroll container; without this, that
          container never got the chance to do its job. */}
      <section className="min-w-0">
        <MorseKey
          isDown={state.isDown}
          pending={state.pending}
          preview={state.preview}
          commitProgress={state.commitProgress}
          autoCommit={settings.timing.autoCommit}
          keyLabel={keyLabel}
          commitLabel={commitLabel}
          pointerHandlers={pointerHandlers}
        />

        {/* Always available, not only in manual mode: even with auto-commit on,
            a learner who knows they are finished should not have to sit and
            wait out a timer they have already beaten. */}
        <div className="mx-auto mt-6 flex max-w-md gap-3">
          <button
            type="button"
            onClick={commitCharacter}
            disabled={state.pending === ''}
            className="flex-1 rounded-lg border px-4 py-2.5 font-mono text-xs tracking-[0.14em] transition-colors disabled:opacity-30"
            style={{ borderColor: 'var(--color-signal)', color: 'var(--color-signal)' }}
          >
            FINISH CHARACTER
          </button>
          <button
            type="button"
            onClick={commitWord}
            disabled={state.text === '' && state.pending === ''}
            className="flex-1 rounded-lg border border-line px-4 py-2.5 font-mono text-xs tracking-[0.14em] text-muted transition-colors hover:border-cyan hover:text-cyan disabled:opacity-30"
          >
            SPACE / NEW WORD
          </button>
        </div>

        <div className="mt-10 rounded-xl border border-line bg-panel p-5">
          <KeyerSpeedPicker timing={settings.timing} onChange={applyPreset} />
        </div>

        <div className="mt-8">
          <div className="mb-2 font-mono text-[10px] tracking-[0.18em] text-muted">SIGNAL</div>
          <SignalTrace elements={state.recent} thresholdMs={settings.timing.dotDashThresholdMs} />
        </div>

        {/* The tree, walking itself as you key. Watching the path light up is
            how the structure stops being a diagram and starts being something
            you can feel where you are inside. */}
        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[0.18em] text-muted">
              WHERE YOU ARE
            </span>
            <button
              type="button"
              aria-pressed={showTree}
              onClick={() => setShowTree((on) => !on)}
              className="font-mono text-[10px] tracking-[0.14em] transition-colors"
              style={{ color: showTree ? 'var(--color-signal)' : 'var(--color-muted)' }}
            >
              {showTree ? 'HIDE TREE' : 'SHOW TREE'}
            </button>
          </div>

          {showTree && <SignalTree livePath={state.pending} highlight={null} className="min-w-0" />}
        </div>
      </section>

      <aside className="flex flex-col rounded-xl border border-line bg-panel p-6">
        <div className="font-mono text-[10px] tracking-[0.18em] text-muted">DECODED</div>

        <output
          aria-live="polite"
          className="mt-3 min-h-24 break-words font-display text-3xl leading-snug tracking-wide"
        >
          {decoded ? (
            <span className="text-signal">{decoded}</span>
          ) : (
            <span className="text-base text-muted">Nothing sent yet.</span>
          )}
        </output>

        {decoded && (
          <div className="mt-5 border-t border-line pt-5">
            <div className="font-mono text-[10px] tracking-[0.18em] text-muted">AS MORSE</div>
            <p className="mt-2 font-mono text-sm break-all text-cyan">{encode(decoded)}</p>
          </div>
        )}

        {hasUnknown && (
          <p className="mt-4 text-xs leading-relaxed text-amber">
            {UNKNOWN_CHARACTER} marks a sequence that is not a character — usually an extra element
            slipped in. Give yourself more time per character, or switch to Manual so nothing
            finishes until you say so.
          </p>
        )}

        <div className="mt-auto flex gap-3 pt-6">
          <button
            type="button"
            onClick={cancelPending}
            disabled={state.pending === ''}
            className="flex-1 rounded-lg border border-line px-4 py-2.5 font-mono text-xs tracking-[0.14em] text-muted transition-colors hover:border-amber hover:text-amber disabled:opacity-30"
          >
            UNDO CHAR
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={state.text === '' && state.pending === ''}
            className="flex-1 rounded-lg border border-line px-4 py-2.5 font-mono text-xs tracking-[0.14em] text-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-30"
          >
            CLEAR ALL
          </button>
        </div>
      </aside>
    </div>
  )
}
