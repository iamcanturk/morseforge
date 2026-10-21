import type { ReactNode } from 'react'
import { Lamp, type LampTone } from './Lamp'

/**
 * A readout plate: an engraved label over a big tabular number.
 *
 * `md` is the dashboard plate (32px value). `xl` is for inside a `Screen`:
 * no plate, phosphor value, sized for the one number a result screen is about.
 * HUD values must not go below this component's `md` size — a 10px score
 * under time pressure is a score nobody reads.
 */

export type ReadoutTone = 'ink' | 'signal' | 'amber' | 'danger'

export interface ReadoutProps {
  label: string
  value: ReactNode
  tone?: ReadoutTone
  size?: 'md' | 'xl'
  /** A lit lamp beside the label, in the readout's tone. */
  lamp?: boolean
  /** One line under the value, e.g. "34 of 39 decoded". */
  caption?: ReactNode
  className?: string
}

const LAMP_TONE: Record<ReadoutTone, LampTone> = {
  ink: 'signal',
  signal: 'signal',
  amber: 'amber',
  danger: 'danger',
}

export function Readout({
  label,
  value,
  tone = 'ink',
  size = 'md',
  lamp = false,
  caption,
  className,
}: ReadoutProps) {
  return (
    <div
      className={['mf-readout', size === 'xl' ? 'mf-readout-xl' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      data-tone={tone === 'ink' ? undefined : tone}
    >
      <span className="mf-readout-label mf-engraved">
        {lamp && <Lamp on tone={LAMP_TONE[tone]} />}
        {label}
      </span>
      <span className="mf-readout-value">{value}</span>
      {caption && <span className="text-sm text-muted">{caption}</span>}
    </div>
  )
}
