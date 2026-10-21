import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Lamp } from '../ui/Lamp'
import { useT } from '../../i18n/react'
import type { Translator } from '../../i18n/translator'
import { isCodeBinding } from '../../engine/keyEngine'

/**
 * The settings screen's building blocks: a panel per subsystem, a row per
 * setting, and the three controls the shared ui/ kit does not have (a switch,
 * a slider with its readout, and a rebindable key).
 *
 * Single choices are not here on purpose. They use ui/Segmented and
 * ui/OptionGroup, which own the radio-group keyboard model.
 */

export interface PanelProps {
  id: string
  /** Shown as the engraved plate number, "01". */
  index: number
  title: string
  intro?: ReactNode
  /** A status lamp on the plate, e.g. sound on. Always labelled. */
  lamp?: { on: boolean; label: string; tone?: 'signal' | 'amber' | 'danger' }
  children: ReactNode
}

/** One instrument face per subsystem, with an engraved plate for a title. */
export function Panel({ id, index, title, intro, lamp, children }: PanelProps) {
  const headingId = `${id}-title`
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      // No scroll margin of its own: the page's scroll-padding already keeps
      // a jumped-to panel below the sticky header (C-7).
      className="mf-instrument px-5 pt-6 pb-2 sm:px-8 sm:pt-8"
    >
      <header>
        <div className="flex items-center justify-between gap-4">
          <p className="mf-engraved" aria-hidden="true">
            {String(index).padStart(2, '0')}
          </p>
          {lamp && (
            <span className="flex shrink-0 items-center gap-2">
              <Lamp on={lamp.on} tone={lamp.tone} />
              <span className="mf-engraved">{lamp.label}</span>
            </span>
          )}
        </div>
        <h2 id={headingId} className="mt-1 font-display text-h3 font-bold text-ink">
          {title}
        </h2>
        {intro && <p className="mt-2 max-w-[60ch] text-sm text-muted">{intro}</p>}
      </header>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export interface RowProps {
  label: string
  hint?: ReactNode
  /** Give the label an id, so a group control can be `labelledBy` it. */
  labelId?: string
  /** For a control that should be read as its own label (a slider, a switch). */
  htmlFor?: string
  /** Put the control under the label at every width (option cards, key grids). */
  wide?: boolean
  children: ReactNode
}

/**
 * What a row's hint describes: the row's own control, whichever kind it is.
 * A row holds one setting, so this finds its switch, slider, radio group or
 * key cap, but not the radios inside a group (they carry their own hints).
 */
const DESCRIBED_CONTROLS =
  '[role="switch"], [role="radiogroup"], input[type="range"], .pj-keycap, .pj-described'

/**
 * A setting: what it is and why on the left, the control on the right. On a
 * phone, and for wide controls, the control drops underneath.
 *
 * The hint is the control's description (A-19): "Volume, slider, 40%" alone
 * says nothing about what the setting is for. It is wired after render, on
 * the DOM, because the radio groups are shared ui/ primitives that take no
 * describedby prop; an attribute React does not manage is left alone.
 */
export function Row({ label, hint, labelId, htmlFor, wide = false, children }: RowProps) {
  const Label = htmlFor ? 'label' : 'span'
  const hintId = useId()
  const control = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hint) return
    for (const element of control.current?.querySelectorAll(DESCRIBED_CONTROLS) ?? []) {
      const ids = (element.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
      if (!ids.includes(hintId))
        element.setAttribute('aria-describedby', [...ids, hintId].join(' '))
    }
  })

  return (
    <div
      className={[
        'grid gap-3 border-t border-line py-5 first:border-t-0',
        wide ? '' : 'sm:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] sm:items-center sm:gap-8',
      ].join(' ')}
    >
      <div className="min-w-0">
        <Label id={labelId} htmlFor={htmlFor} className="block font-semibold text-ink">
          {label}
        </Label>
        {hint && (
          <p id={hintId} className="mt-1 max-w-[52ch] text-sm text-muted">
            {hint}
          </p>
        )}
      </div>
      <div ref={control} className="min-w-0">
        {children}
      </div>
    </div>
  )
}

/**
 * On/off, as a lever. `role=switch` on a button rather than a styled
 * checkbox: the native `switch` attribute is Safari-only and a polyfill is not
 * worth a dependency for two switches.
 */
export function Switch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  /** Accessible name; the visible label is the row's. */
  label: string
  id?: string
}) {
  return (
    <span className="flex items-center gap-3 sm:justify-end">
      <span className="mf-engraved sm:w-8 sm:text-right" aria-hidden="true">
        {checked ? 'On' : 'Off'}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="pj-switch"
      />
    </span>
  )
}

/** A native range with its value read out beside it, and its scale beneath. */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
  id,
  disabled = false,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (next: number) => void
  /** Accessible name, including the unit. */
  label: string
  format: (value: number) => string
  id?: string
  /** Shown but not adjustable; the row's hint says why. */
  disabled?: boolean
}) {
  const fallbackId = useId()
  const inputId = id ?? fallbackId
  return (
    <div>
      <div className="flex items-center gap-4">
        <input
          id={inputId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          aria-valuetext={format(value)}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="mf-range min-h-11 flex-1 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <output
          htmlFor={inputId}
          className={`w-16 shrink-0 text-right font-mono text-control tabular-nums ${disabled ? 'text-muted' : 'text-signal'}`}
        >
          {format(value)}
        </output>
      </div>
      <div
        className="mt-1 flex justify-between pr-20 font-mono text-label text-muted"
        aria-hidden="true"
      >
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  )
}

/** Human-readable name for a key value, since " " and "Control" read badly. */
export function keyName(t: Translator, key: string): string {
  if (key === ' ') return t('settings.keySpace')
  if (key === 'Control') return t('settings.keyCtrl')
  if (key === 'ControlLeft') return t('settings.keyCtrlLeft')
  if (key === 'ControlRight') return t('settings.keyCtrlRight')
  if (key === 'Escape') return t('settings.keyEsc')
  if (key.startsWith('Arrow')) return key.slice('Arrow'.length)
  return key.length === 1 ? key.toUpperCase() : key
}

/**
 * Why a key cannot be bound, or null if it can (A-14).
 *
 * Tab and Shift+Tab are how a keyboard user moves through the page; bound to
 * the Morse key, they were swallowed on every instrument page, a trap of the
 * user's own making. The modifiers and lock keys are pressed as part of other
 * shortcuts, and the function keys belong to the browser and the system.
 */
export function rejectKey(t: Translator, key: string): string | null {
  if (key === 'Tab') return t('settings.tabRefused')
  if (UNBINDABLE.has(key) || /^F\d{1,2}$/.test(key)) {
    return t('settings.keyRefused', { key: keyName(t, key) })
  }
  return null
}

const UNBINDABLE = new Set([
  'Shift',
  'Alt',
  'AltGraph',
  'Meta',
  'OS',
  'Super',
  'Hyper',
  'Fn',
  'FnLock',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'ContextMenu',
  'Dead',
  'Process',
  'Unidentified',
])

/**
 * A key you rebind by pressing it (PROJECT.md §10).
 *
 * Listens on the window with capture, not on the button: the whole point is to
 * intercept keys that are otherwise bound to something else, and by the time an
 * event reaches the button the app's own key handlers have already acted on it.
 * Escape cancels rather than binds, or there would be no way out.
 */
export function KeyCapture({
  value,
  onChange,
  label,
  conflict = false,
  takenBy,
  ctrlSides = false,
}: {
  value: string
  onChange: (next: string) => void
  label: string
  /** Bound to the same key as another action. */
  conflict?: boolean
  /** Which other action a key is already bound to, if any: warned before it is taken. */
  takenBy?: (key: string) => string | null
  /**
   * Bind Ctrl as Left Ctrl or Right Ctrl, by `event.code` (DEC-055). Paddle
   * bindings only: a USB paddle adapter types the two sides for the two
   * paddles. Every other binding keeps Ctrl as one key.
   */
  ctrlSides?: boolean
}) {
  const t = useT()
  const [listening, setListening] = useState(false)
  const [message, setMessage] = useState('')
  const button = useRef<HTMLButtonElement>(null)
  const statusId = useId()

  useEffect(() => {
    if (!listening) return

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setMessage('')
      } else {
        const pressed =
          ctrlSides && event.key === 'Control' && isCodeBinding(event.code) ? event.code : event.key
        const problem = rejectKey(t, pressed)
        if (problem) {
          // Not bound; the old key stays, and the reason is said.
          setMessage(problem)
        } else {
          const other = pressed === value ? null : (takenBy?.(pressed) ?? null)
          setMessage(
            other ? t('settings.keyTaken', { key: keyName(t, pressed), action: other }) : '',
          )
          onChange(pressed)
        }
      }
      setListening(false)
      button.current?.focus()
    }
    // Clicking anywhere else gives up, like pressing Escape.
    const onPointerDown = (event: PointerEvent) => {
      if (event.target !== button.current) setListening(false)
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('pointerdown', onPointerDown, { capture: true })
    }
  }, [listening, onChange, takenBy, value, t, ctrlSides])

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={
          listening
            ? t('settings.captureListening', { label, key: keyName(t, value) })
            : t('settings.captureIdle', { label, key: keyName(t, value) })
        }
        // Constant, so React never rewrites it: the row adds its own hint
        // to this list after render.
        aria-describedby={statusId}
        data-listening={listening}
        data-conflict={conflict}
        onClick={() => {
          setMessage('')
          setListening((on) => !on)
        }}
        className="pj-keycap w-full"
      >
        {listening && <Lamp on tone="amber" />}
        {listening ? t('settings.pressKey') : keyName(t, value)}
      </button>
      {/* Mounted for good, so a message is announced when it appears. */}
      <p
        id={statusId}
        role="status"
        className="text-sm leading-snug text-amber [&:not(:empty)]:mt-2"
      >
        {message}
      </p>
    </>
  )
}

/**
 * A modal confirmation on the native `<dialog>`: focus is trapped and
 * returned, Escape (and a back gesture, where the platform has one) cancels,
 * and so does a click on the backdrop. Every way out except the confirm
 * button leaves the data alone.
 */
export function ConfirmDialog({
  open,
  title,
  tone = 'signal',
  onClose,
  actions,
  children,
}: {
  open: boolean
  title: string
  tone?: 'signal' | 'danger'
  /** Called however the dialog closes without confirming. */
  onClose: () => void
  actions: ReactNode
  children: ReactNode
}) {
  const t = useT()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      closedby="any"
      onClose={() => {
        if (open) onClose()
      }}
      className="pj-dialog mf-instrument mf-slip"
    >
      <div className="p-6 sm:p-8">
        <p className="flex items-center gap-2">
          <Lamp on tone={tone === 'danger' ? 'danger' : 'amber'} />
          <span className="mf-engraved">
            {tone === 'danger' ? t('settings.cannotUndo') : t('settings.confirm')}
          </span>
        </p>
        <h2 id={titleId} className="mt-3 font-display text-h3 font-bold text-ink">
          {title}
        </h2>
        <div className="mt-3 text-ink">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">{actions}</div>
      </div>
    </dialog>
  )
}
