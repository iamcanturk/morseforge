import { describe, expect, it } from 'vitest'
import { DEFAULT_KEY_BINDINGS } from '../../engine/keyEngine'
import { keyName, rejectKey } from './controls'

describe('rejectKey (A-14)', () => {
  it('refuses Tab, which would trap a keyboard user on every instrument page', () => {
    expect(rejectKey('Tab')).toMatch(/Tab moves between controls/)
  })

  it('refuses modifiers, lock keys and function keys', () => {
    for (const key of ['Shift', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'NumLock', 'ContextMenu']) {
      expect(rejectKey(key), key).toMatch(/cannot be bound/)
    }
    for (let n = 1; n <= 12; n++) expect(rejectKey(`F${n}`), `F${n}`).not.toBeNull()
  })

  it('names the key it refused, in words a person would use', () => {
    expect(rejectKey('CapsLock')).toContain('CapsLock')
    expect(rejectKey('F5')).toContain('F5')
  })

  it('accepts every default binding, and ordinary keys', () => {
    for (const key of Object.values(DEFAULT_KEY_BINDINGS)) {
      if (key) expect(rejectKey(key), keyName(key)).toBeNull()
    }
    for (const key of [' ', 'Enter', 'Control', 'Escape', 'j', 'K', '.', 'ArrowDown']) {
      expect(rejectKey(key), keyName(key)).toBeNull()
    }
  })

  it('does not mistake a letter F for a function key', () => {
    expect(rejectKey('f')).toBeNull()
    expect(rejectKey('F')).toBeNull()
  })
})
