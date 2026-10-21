import { THEME_COLOR, THEME_KEY } from '../../styles/palette'

/**
 * The one implementation of theme switching, for both of its controls:
 *
 *   - the header's theme menu (ThemeMenu.astro): a button that shows the
 *     resolved theme and opens System / Dark / Light as `menuitemradio`s;
 *   - the Settings row (ThemeToggle.astro): the same three as a segmented
 *     radiogroup, handed into the settings island as a slot.
 *
 * It is an inline script rather than a bundled module, as the old toggle was:
 * it is a few lines, it has to bind the controls as soon as they are parsed
 * (before the settings island hydrates around its slot), and an inline script
 * cannot import. So the source lives here as a string, both components embed
 * it with `set:html`, and themeControl.test.ts runs it in a sandbox.
 *
 * Every run binds whatever controls are not yet bound and re-applies the
 * stored choice, so including it twice on a page (header + settings) is safe.
 * The blocking script in BaseLayout has already set `data-theme` before first
 * paint; this only keeps the controls and the choice in step after that.
 */

/** What each choice is called, in the menu and in the theme button's name. */
export const THEME_CHOICE_NAMES = { system: 'System', dark: 'Dark', light: 'Light' } as const

export const THEME_CONTROL_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(THEME_KEY)}
  const COLOURS = ${JSON.stringify(THEME_COLOR)}
  const NAMES = ${JSON.stringify(THEME_CHOICE_NAMES)}
  // Where arrow keys, Home and End move in a list, wrapping; null otherwise.
  const nextIndex = (key, from, length) => {
    const last = length - 1
    if (key === 'ArrowRight' || key === 'ArrowDown') return from >= last ? 0 : from + 1
    if (key === 'ArrowLeft' || key === 'ArrowUp') return from <= 0 ? last : from - 1
    if (key === 'Home') return 0
    if (key === 'End') return last
    return null
  }
  const root = document.documentElement

  if (!window.mfTheme) {
    const resolve = (choice) =>
      choice === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : choice
    const apply = (choice) => {
      root.dataset.theme = resolve(choice)
      root.dataset.themeChoice = choice
      // The radiogroup: checked state and the roving tab stop.
      for (const button of document.querySelectorAll('[data-theme-value]')) {
        const selected = button.dataset.themeValue === choice
        button.setAttribute('aria-checked', String(selected))
        button.tabIndex = selected ? 0 : -1
      }
      // The menu: checked state only; focus is moved by hand while it is open.
      for (const item of document.querySelectorAll('[data-theme-option]')) {
        item.setAttribute('aria-checked', String(item.dataset.themeOption === choice))
      }
      // The menu button names the choice, and what "system" resolves to, so
      // the state is known without opening the menu (AI-3).
      for (const menu of document.querySelectorAll('[data-theme-menu]')) {
        const name =
          'Colour theme: ' +
          (NAMES[choice] ?? NAMES.system) +
          (choice === 'system' ? ', ' + root.dataset.theme + ' now' : '')
        const summary = menu.querySelector('summary')
        summary?.setAttribute('aria-label', name)
        summary?.setAttribute('title', name)
      }
      // The browser chrome should match, or a light page keeps a black status
      // bar on mobile.
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', COLOURS[root.dataset.theme] ?? COLOURS.dark)
    }
    const choose = (choice) => {
      try {
        localStorage.setItem(KEY, choice)
      } catch {
        // Not persisting is survivable; not applying is not.
      }
      apply(choice)
    }
    window.mfTheme = { apply, choose }
    // Only follow the OS while the choice is actually "system".
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (root.dataset.themeChoice === 'system') apply('system')
    })
  }

  let initial = 'system'
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'dark' || stored === 'light') initial = stored
  } catch {
    // Private mode. System default is a fine place to be.
  }
  window.mfTheme.apply(initial)

  for (const group of document.querySelectorAll('[data-theme-toggle]:not([data-bound])')) {
    group.dataset.bound = ''
    const buttons = [...group.querySelectorAll('[data-theme-value]')]
    for (const button of buttons) {
      button.addEventListener('click', () => window.mfTheme.choose(button.dataset.themeValue))
    }
    // Radio-group keys: arrows move and select, wrapping; Home and End jump.
    group.addEventListener('keydown', (event) => {
      const to = nextIndex(event.key, buttons.indexOf(document.activeElement), buttons.length)
      if (to === null) return
      event.preventDefault()
      buttons[to].focus()
      window.mfTheme.choose(buttons[to].dataset.themeValue)
    })
  }

  for (const menu of document.querySelectorAll('[data-theme-menu]:not([data-bound])')) {
    menu.dataset.bound = ''
    const summary = menu.querySelector('summary')
    const items = [...menu.querySelectorAll('[data-theme-option]')]
    const close = (refocus) => {
      menu.removeAttribute('open')
      if (refocus) summary?.focus()
    }
    for (const item of items) {
      item.addEventListener('click', () => {
        window.mfTheme.choose(item.dataset.themeOption)
        close(true)
      })
    }
    // Opening moves focus to the checked item, as a menu button should.
    menu.addEventListener('toggle', () => {
      if (!menu.open) return
      ;(items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus()
    })
    // Arrows move between items without choosing; Enter and Space choose
    // (they are buttons). Escape and outside clicks are the header's.
    menu.addEventListener('keydown', (event) => {
      const from = items.indexOf(document.activeElement)
      if (from === -1) return
      if (event.key === 'Tab') return close(false)
      const to = nextIndex(event.key, from, items.length)
      if (to === null) return
      event.preventDefault()
      items[to].focus()
    })
  }
})()`
