import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { THEME_COLOR, THEME_KEY } from '../../styles/palette'
import { THEME_CONTROL_SCRIPT } from './themeControl'

/**
 * The shared theme script, run as the browser runs it: an inline script, so
 * it is executed in a sandbox over a small stub DOM with the two controls it
 * binds (the header menu and the Settings radiogroup).
 */

type Handler = (event: { key: string; preventDefault: () => void }) => void

class Stub {
  dataset: Record<string, string> = {}
  attributes: Record<string, string> = {}
  handlers: Record<string, Handler[]> = {}
  tabIndex = 0
  open = false
  children: Stub[] = []
  constructor(
    public tag: string,
    data: Record<string, string> = {},
  ) {
    Object.assign(this.dataset, data)
  }
  setAttribute(name: string, value: string) {
    this.attributes[name] = value
  }
  getAttribute(name: string) {
    return this.attributes[name] ?? null
  }
  removeAttribute(name: string) {
    if (name === 'open') this.open = false
  }
  addEventListener(type: string, handler: Handler) {
    ;(this.handlers[type] ??= []).push(handler)
  }
  fire(type: string, key = '') {
    for (const handler of this.handlers[type] ?? []) handler({ key, preventDefault: () => {} })
  }
  focus() {
    world.active = this
  }
  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null
  }
  querySelectorAll(selector: string): Stub[] {
    return this.children.filter((child) => matches(child, selector))
  }
}

function matches(el: Stub, selector: string): boolean {
  if (selector === 'summary') return el.tag === 'summary'
  const attr = /^\[data-([a-z-]+)\]/.exec(selector)?.[1]
  if (!attr) return false
  const key = attr.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
  if (!(key in el.dataset)) return false
  return !(selector.includes(':not([data-bound])') && 'bound' in el.dataset)
}

const world: { active: Stub | null } = { active: null }

function page({ stored, osLight = false }: { stored?: string; osLight?: boolean }) {
  world.active = null
  const html = new Stub('html')
  const meta = new Stub('meta')
  const summary = new Stub('summary')
  const items = ['system', 'dark', 'light'].map((v) => new Stub('button', { themeOption: v }))
  const menu = new Stub('details', { menu: '', themeMenu: '' })
  menu.children = [summary, ...items]
  const radios = ['system', 'dark', 'light'].map((v) => new Stub('button', { themeValue: v }))
  const group = new Stub('div', { themeToggle: '' })
  group.children = radios
  const all = [menu, summary, ...items, group, ...radios]
  const storage = new Map<string, string>(stored ? [[THEME_KEY, stored]] : [])
  const sandbox: Record<string, unknown> = {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    },
    document: {
      documentElement: html,
      get activeElement() {
        return world.active
      },
      querySelector: (s: string) => (s.startsWith('meta') ? meta : null),
      querySelectorAll: (s: string) => all.filter((el) => matches(el, s)),
    },
  }
  sandbox.window = {
    matchMedia: () => ({ matches: osLight, addEventListener: () => {} }),
  }
  const run = () => runInNewContext(THEME_CONTROL_SCRIPT, sandbox)
  return { html, meta, menu, summary, items, group, radios, storage, sandbox, run }
}

const checked = (els: Stub[]) => els.filter((el) => el.getAttribute('aria-checked') === 'true')

describe('THEME_CONTROL_SCRIPT', () => {
  it('applies the stored choice to the page and to both controls', () => {
    const p = page({ stored: 'light' })
    p.run()
    expect(p.html.dataset['theme']).toBe('light')
    expect(p.html.dataset['themeChoice']).toBe('light')
    expect(checked(p.items)).toEqual([p.items[2]])
    expect(checked(p.radios)).toEqual([p.radios[2]])
    expect(p.radios[2]!.tabIndex).toBe(0)
    expect(p.radios[0]!.tabIndex).toBe(-1)
    expect(p.meta.attributes['content']).toBe(THEME_COLOR.light)
  })

  it('resolves "system" from the OS, and treats junk as "system"', () => {
    const p = page({ stored: 'purple', osLight: true })
    p.run()
    expect(p.html.dataset['themeChoice']).toBe('system')
    expect(p.html.dataset['theme']).toBe('light')
    expect(checked(p.items)).toEqual([p.items[0]])
  })

  it('choosing from the menu stores it, checks it everywhere, and closes the menu', () => {
    const p = page({ stored: 'dark' })
    p.run()
    p.menu.open = true
    p.items[2]!.fire('click')
    expect(p.storage.get(THEME_KEY)).toBe('light')
    expect(p.html.dataset['theme']).toBe('light')
    expect(checked(p.radios)).toEqual([p.radios[2]])
    expect(p.menu.open).toBe(false)
    expect(world.active).toBe(p.summary)
  })

  it('opening the menu focuses the checked item; arrows move without choosing', () => {
    const p = page({ stored: 'dark' })
    p.run()
    p.menu.open = true
    p.menu.fire('toggle')
    expect(world.active).toBe(p.items[1])
    p.menu.fire('keydown', 'ArrowDown')
    expect(world.active).toBe(p.items[2])
    p.menu.fire('keydown', 'ArrowDown')
    expect(world.active).toBe(p.items[0])
    p.menu.fire('keydown', 'End')
    expect(world.active).toBe(p.items[2])
    expect(p.html.dataset['themeChoice']).toBe('dark')
  })

  it('the radiogroup selects as the arrows move, wrapping', () => {
    const p = page({ stored: 'light' })
    p.run()
    p.radios[2]!.focus()
    p.group.fire('keydown', 'ArrowRight')
    expect(world.active).toBe(p.radios[0])
    expect(p.html.dataset['themeChoice']).toBe('system')
  })

  it('names the theme button with the choice, and what "system" resolves to (AI-3)', () => {
    const dark = page({ osLight: false })
    dark.run()
    expect(dark.summary.attributes['aria-label']).toBe('Colour theme: System, dark now')
    expect(dark.summary.attributes['title']).toBe('Colour theme: System, dark now')

    const light = page({ stored: 'light', osLight: false })
    light.run()
    expect(light.summary.attributes['aria-label']).toBe('Colour theme: Light')
    light.items[1]!.fire('click')
    expect(light.summary.attributes['aria-label']).toBe('Colour theme: Dark')
  })

  it('binds each control once however many times it runs', () => {
    const p = page({ stored: 'dark' })
    p.run()
    p.run()
    expect(p.items[0]!.handlers['click']).toHaveLength(1)
    expect(p.group.handlers['keydown']).toHaveLength(1)
  })
})
