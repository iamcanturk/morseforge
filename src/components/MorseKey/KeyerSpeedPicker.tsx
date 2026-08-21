import { KEYER_PRESETS, type KeyerPreset, matchKeyerPreset } from '../../storage/settings'
import type { SettingsRecord } from '../../storage/settings'

/**
 * Picks how patient the decoder is while keying.
 *
 * Presented as "how much time do I get", not as a speed, because that is the
 * question a learner is actually asking. WPM lives in the settings screen and
 * controls playback; this controls how long you may hesitate mid-character,
 * which is a completely different thing that happens to be measured in
 * milliseconds too.
 */
export function KeyerSpeedPicker({
  timing,
  onChange,
}: {
  timing: SettingsRecord['timing']
  onChange: (preset: KeyerPreset) => void
}) {
  const active = matchKeyerPreset(timing)

  return (
    <fieldset>
      <legend className="font-mono text-[10px] tracking-[0.18em] text-muted">
        TIME TO FINISH A CHARACTER
      </legend>

      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(KEYER_PRESETS) as KeyerPreset[]).map((name) => {
          const preset = KEYER_PRESETS[name]
          const selected = active === name
          return (
            <button
              key={name}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(name)}
              className="rounded-lg border px-3 py-2 text-left transition-colors"
              style={{
                borderColor: selected ? 'var(--color-signal)' : 'var(--color-line)',
                color: selected ? 'var(--color-signal)' : 'var(--color-muted)',
              }}
            >
              <span className="block font-mono text-xs tracking-[0.12em]">
                {preset.label.toUpperCase()}
              </span>
              <span className="mt-0.5 block text-[11px] opacity-70">
                {preset.autoCommit ? `${(preset.characterGapMs / 1000).toFixed(1)}s` : 'no timer'}
              </span>
            </button>
          )
        })}
      </div>

      {active === null && (
        <p className="mt-2 font-mono text-[10px] tracking-[0.14em] text-amber">CUSTOM</p>
      )}
    </fieldset>
  )
}
