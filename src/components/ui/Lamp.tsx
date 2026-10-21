/**
 * An indicator lamp: a brass-set bulb that is either lit or not.
 *
 * On and off are instant, never faded. The glow is a static shadow on a layer
 * whose opacity flips, which costs the compositor nothing — an animated
 * box-shadow would repaint every frame.
 *
 * Decorative unless given a `label`, which is read instead of shown. A lamp
 * should never be the only carrier of a fact; when it is the only one in
 * view, label it.
 */

export type LampTone = 'signal' | 'amber' | 'danger' | 'cyan'

export interface LampProps {
  on: boolean
  tone?: LampTone
  /** Read by screen readers, not shown, e.g. "Transmitting". */
  label?: string
  size?: 'md' | 'lg'
  className?: string
}

export function Lamp({ on, tone = 'signal', label, size = 'md', className }: LampProps) {
  return (
    <span
      className={['mf-lamp', size === 'lg' ? 'mf-lamp-lg' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      data-on={on}
      data-tone={tone === 'signal' ? undefined : tone}
      aria-hidden={label ? undefined : true}
    >
      {label && <span className="sr-only">{label}</span>}
    </span>
  )
}
