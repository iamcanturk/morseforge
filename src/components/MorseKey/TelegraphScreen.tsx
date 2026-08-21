import { useEffect, useMemo, useState } from 'react'
import { MorseKey, SignalTrace } from './MorseKey'
import { useMorseKey } from './useMorseKey'
import { encode } from '../../engine/morseEncoder'
import { UNKNOWN_CHARACTER } from '../../engine/morseDecoder'
import { createSettingsStore, defaultSettings, type SettingsRecord } from '../../storage/settings'

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

  useEffect(() => {
    setSettings(store.read())
    return store.subscribe(setSettings)
  }, [store])

  const { state, cancelPending, reset, pointerHandlers } = useMorseKey({
    wpm: settings.timing.wpm,
    dotDashThresholdMs: settings.timing.dotDashThresholdMs,
    bindings: settings.keys,
    frequency: settings.audio.frequency,
    volume: settings.audio.enabled ? settings.audio.volume : 0,
  })

  const keyLabel = settings.keys.key === ' ' ? 'SPACE' : settings.keys.key.toUpperCase()
  const decoded = state.text.trimEnd()
  const hasUnknown = decoded.includes(UNKNOWN_CHARACTER)

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section>
        <MorseKey
          isDown={state.isDown}
          pending={state.pending}
          preview={state.preview}
          keyLabel={keyLabel}
          pointerHandlers={pointerHandlers}
        />

        <div className="mt-8">
          <div className="mb-2 font-mono text-[10px] tracking-[0.18em] text-muted">SIGNAL</div>
          <SignalTrace elements={state.recent} thresholdMs={settings.timing.dotDashThresholdMs} />
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
            {UNKNOWN_CHARACTER} marks a sequence that is not a character. Usually an extra element
            slipped in — try leaving a slightly longer gap between characters.
          </p>
        )}

        <div className="mt-auto flex gap-3 pt-6">
          <button
            type="button"
            onClick={cancelPending}
            className="flex-1 rounded-lg border border-line px-4 py-2.5 font-mono text-xs tracking-[0.14em] text-muted transition-colors hover:border-amber hover:text-amber"
          >
            UNDO CHAR
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex-1 rounded-lg border border-line px-4 py-2.5 font-mono text-xs tracking-[0.14em] text-muted transition-colors hover:border-danger hover:text-danger"
          >
            CLEAR ALL
          </button>
        </div>
      </aside>
    </div>
  )
}
