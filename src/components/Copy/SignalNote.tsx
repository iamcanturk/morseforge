import { Lamp } from '../ui/Lamp'
import { SIGNAL_LABELS, type SignalMode } from '../../storage/settings'

/**
 * What the Signal setting will do to this exercise, said before it starts.
 *
 * Nothing for Sound, which is what everyone expects. For Lamp and Both, one
 * plain line, so nobody starts a run and wonders why it is silent or why the
 * screen is flashing. Links to the setting itself (`/settings/#signal`).
 */
export function SignalNote({
  signal,
  unit,
  className,
}: {
  signal: SignalMode
  /** What one transmission is: "line" in copy and the daily. */
  unit: string
  className?: string
}) {
  if (signal === 'sound') return null
  return (
    <p
      className={['flex items-baseline gap-2 text-sm leading-relaxed text-muted', className]
        .filter(Boolean)
        .join(' ')}
    >
      <Lamp on tone="cyan" className="translate-y-px" />
      <span>
        {signalSentence(signal, unit)}{' '}
        <a href="/settings/#signal" className="text-signal underline underline-offset-4">
          Change it in settings
        </a>
        .
      </span>
    </p>
  )
}

/** "Signal is set to Lamp: each line flashes instead of sounding." Empty for Sound. */
export function signalSentence(signal: SignalMode, unit: string): string {
  if (signal === 'sound') return ''
  const does = signal === 'lamp' ? 'flashes instead of sounding' : 'sounds and flashes together'
  return `Signal is set to ${SIGNAL_LABELS[signal]}: each ${unit} ${does}.`
}
