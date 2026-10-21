import { useId } from 'react'
import { Segmented } from '../ui/Segmented'
import { formatSeconds } from '../../data/format'
import { KEYER_PRESETS, type KeyerPreset, matchKeyerPreset } from '../../storage/settings'
import type { SettingsRecord } from '../../storage/settings'
import { useT } from '../../i18n/react'
import { presetLabel } from './keyCopy'

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
  const t = useT()
  const labelId = useId()
  const active = matchKeyerPreset(timing)
  const names = Object.keys(KEYER_PRESETS) as KeyerPreset[]

  const options = names.map((name) => {
    const preset = KEYER_PRESETS[name]
    const label = presetLabel(t, name)
    const seconds = formatSeconds(preset.characterGapMs)
    const detail = preset.autoCommit ? t('key.seconds', { seconds }) : t('key.noTimer')
    return {
      value: name,
      ariaLabel: preset.autoCommit
        ? t('key.patienceSeconds', { preset: label, seconds })
        : t('key.patienceNoTimer', { preset: label }),
      label: (
        <span className="flex flex-col items-center gap-1 py-1 leading-none">
          <span>{label}</span>
          <span className="font-mono text-label tracking-normal normal-case">{detail}</span>
        </span>
      ),
    }
  })

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="mf-engraved">
          {t('key.patience')}
        </span>
        {active === null && <span className="mf-engraved text-amber">{t('key.custom')}</span>}
      </div>
      <Segmented
        label={t('key.patience')}
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
