import { useId } from 'react'
import { Segmented } from '../ui/Segmented'
import { formatSeconds } from '../../data/format'
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
 *
 * A radio group (one choice, arrow keys) rather than the row of toggles it
 * used to be. The seconds come from `KEYER_PRESETS`, so the label can never
 * disagree with what the key actually does.
 */
export function KeyerSpeedPicker({
  timing,
  onChange,
  className,
}: {
  timing: SettingsRecord['timing']
  onChange: (preset: KeyerPreset) => void
  className?: string
}) {
  const labelId = useId()
  const active = matchKeyerPreset(timing)
  const names = Object.keys(KEYER_PRESETS) as KeyerPreset[]

  const options = names.map((name) => {
    const preset = KEYER_PRESETS[name]
    const detail = preset.autoCommit ? `${formatSeconds(preset.characterGapMs)} s` : 'No timer'
    return {
      value: name,
      ariaLabel: `${preset.label}, ${preset.autoCommit ? `${formatSeconds(preset.characterGapMs)} seconds` : 'no timer'}`,
      label: (
        <span className="flex flex-col items-center gap-1 py-1 leading-none">
          <span>{preset.label}</span>
          <span className="font-mono text-label tracking-normal normal-case">{detail}</span>
        </span>
      ),
    }
  })

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="mf-engraved">
          Time to finish a character
        </span>
        {active === null && <span className="mf-engraved text-amber">Custom, set in Settings</span>}
      </div>
      <Segmented
        label="Time to finish a character"
        labelledBy={labelId}
        value={active}
        options={options}
        onChange={onChange}
        size="sm"
        block
        className="kc-seg-grid mt-2"
      />
    </div>
  )
}
