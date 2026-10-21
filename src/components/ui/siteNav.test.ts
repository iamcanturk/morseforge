import { describe, expect, it } from 'vitest'
import {
  ALL_NAV_GROUPS,
  MENU_TILES,
  NAV_GROUPS,
  PHONE_GROUPS,
  PRIMARY_NAV,
  filterExisting,
  hasPage,
  isCurrent,
  pageFilesFor,
  phoneGroups,
} from './siteNav'

describe('pageFilesFor', () => {
  it('maps a route to the files that could serve it', () => {
    expect(pageFilesFor('/')).toEqual(['index.astro'])
    expect(pageFilesFor('/learn/')).toEqual(['learn.astro', 'learn/index.astro'])
    expect(pageFilesFor('/games/morse-runner/')).toEqual([
      'games/morse-runner.astro',
      'games/morse-runner/index.astro',
    ])
  })
})

describe('hasPage', () => {
  const files = ['../../pages/index.astro', '../../pages/words/index.astro']

  it('finds flat and directory pages', () => {
    expect(hasPage('/', files)).toBe(true)
    expect(hasPage('/words/', files)).toBe(true)
    expect(hasPage('/message/', files)).toBe(false)
  })
})

describe('the real navigation', () => {
  it('keeps the four primary destinations in the bar', () => {
    expect(PRIMARY_NAV.map((link) => link.href)).toEqual([
      '/learn/',
      '/practice/',
      '/telegraph/',
      '/daily/',
    ])
  })

  it('only links to pages that exist', () => {
    for (const link of NAV_GROUPS.flatMap((group) => group.links)) {
      expect(hasPage(link.href), link.href).toBe(true)
    }
  })

  it('links the speed and how-to guides from the menu and the footer (DEC-030)', () => {
    const hrefs = NAV_GROUPS.flatMap((group) => group.links.map((link) => link.href))
    expect(hrefs).toContain('/morse-code-speed/')
    expect(hrefs).toContain('/how-to-learn-morse-code/')
  })

  it('lists progress and the challenge, so a phone can reach both', () => {
    const hrefs = NAV_GROUPS.flatMap((group) => group.links.map((link) => link.href))
    expect(hrefs).toContain('/stats/')
    expect(hrefs).toContain('/challenge/')
    // And at the top of the phone menu, not only in the long list below it.
    expect(MENU_TILES.map((link) => link.href)).toEqual(
      expect.arrayContaining(['/stats/', '/challenge/']),
    )
  })

  it('names the secret message, which appears once its page does', () => {
    const declared = ALL_NAV_GROUPS.flatMap((group) => group.links.map((link) => link.href))
    expect(declared).toContain('/message/')
    const shown = filterExisting([...ALL_NAV_GROUPS], ['../../pages/message.astro'])
    expect(shown.flatMap((group) => group.links.map((link) => link.href))).toEqual(['/message/'])
  })
})

describe('the phone menu (V-13, J-23)', () => {
  const panel = () => [
    ...MENU_TILES.map((link) => link.href),
    ...PHONE_GROUPS.flatMap((group) => group.links.map((link) => link.href)),
  ]

  it('links no destination twice', () => {
    const hrefs = panel()
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('still reaches every page the menu lists', () => {
    const listed = NAV_GROUPS.flatMap((group) => group.links.map((link) => link.href))
    expect(new Set(panel())).toEqual(new Set([...listed, ...MENU_TILES.map((link) => link.href)]))
  })

  it('leaves Settings to the gear in the bar', () => {
    expect(panel()).not.toContain('/settings/')
  })

  it('drops a group the tiles have emptied', () => {
    const groups = [
      { title: 'A', links: [{ href: '/a/', label: 'A', hint: '' }] },
      {
        title: 'B',
        links: [
          { href: '/b/', label: 'B', hint: '' },
          { href: '/c/', label: 'C', hint: '' },
        ],
      },
    ]
    const tiles = [
      { href: '/a/', label: 'A', hint: '' },
      { href: '/b/', label: 'B', hint: '' },
    ]
    expect(phoneGroups(groups, tiles)).toEqual([
      { title: 'B', links: [{ href: '/c/', label: 'C', hint: '' }] },
    ])
  })
})

describe('isCurrent', () => {
  it('ignores a missing trailing slash', () => {
    expect(isCurrent('/learn/', '/learn')).toBe(true)
    expect(isCurrent('/learn/', '/learn/')).toBe(true)
    expect(isCurrent('/learn/', '/learn-morse-code-in-7-days/')).toBe(false)
  })
})
