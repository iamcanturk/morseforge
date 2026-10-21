import { describe, expect, it } from 'vitest'
import { DEFAULT_KEY_BINDINGS } from '../../engine/keyEngine'
import { keyName, rejectKey } from './controls'
import { translatorFor } from '../../i18n/server'

const t = translatorFor('en')

describe('rejectKey (A-14)', () => {
  it('refuses Tab, which would trap a keyboard user on every instrument page', () => {
    expect(rejectKey(t, 'Tab')).toMatch(/Tab moves between controls/)
  })

  it('refuses modifiers, lock keys and function keys', () => {
    for (const key of ['Shift', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'NumLock', 'ContextMenu']) {
      expect(rejectKey(t, key), key).toMatch(/cannot be bound/)
    }
    for (let n = 1; n <= 12; n++) expect(rejectKey(t, `F${n}`), `F${n}`).not.toBeNull()
  })

  it('names the key it refused, in words a person would use', () => {
    expect(rejectKey(t, 'CapsLock')).toContain('CapsLock')
    expect(rejectKey(t, 'F5')).toContain('F5')
  })

  it('accepts every default binding, and ordinary keys', () => {
    for (const key of Object.values(DEFAULT_KEY_BINDINGS)) {
      if (key) expect(rejectKey(t, key), keyName(t, key)).toBeNull()
    }
    for (const key of [' ', 'Enter', 'Control', 'Escape', 'j', 'K', '.', 'ArrowDown']) {
      expect(rejectKey(t, key), keyName(t, key)).toBeNull()
    }
  })

  it('does not mistake a letter F for a function key', () => {
    expect(rejectKey(t, 'f')).toBeNull()
    expect(rejectKey(t, 'F')).toBeNull()
  })
})

describe('paddle adapter keys (DEC-055)', () => {
  it('accepts Left and Right Ctrl, and names each side', () => {
    expect(rejectKey(t, 'ControlLeft')).toBeNull()
    expect(rejectKey(t, 'ControlRight')).toBeNull()
    expect(keyName(t, 'ControlLeft')).toBe('Left Ctrl')
    expect(keyName(t, 'ControlRight')).toBe('Right Ctrl')
  })

  it('still refuses the other modifiers for every binding (A-14)', () => {
    for (const key of ['Shift', 'Alt', 'Meta']) expect(rejectKey(t, key)).not.toBeNull()
  })
})
