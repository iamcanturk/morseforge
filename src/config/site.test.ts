import { describe, expect, it } from 'vitest'
import { CITATIONS, MORSE_CODE_ABOUT, MORSE_CODE_ENTITY, SITE } from './site'

describe('SITE', () => {
  it('keeps the description inside a search result, because it is the home description', () => {
    expect(SITE.description.length).toBeLessThanOrEqual(155)
    expect(SITE.description.length).toBeGreaterThan(70)
  })

  it('does not promise what the home page does not say', () => {
    expect(SITE.description).toMatch(/free/i)
    expect(SITE.description).toMatch(/morse code/i)
  })
})

describe('MORSE_CODE_ENTITY', () => {
  it('points at Wikidata Q79897 and Wikipedia', () => {
    expect(MORSE_CODE_ENTITY.wikidata).toBe('https://www.wikidata.org/wiki/Q79897')
    expect(MORSE_CODE_ENTITY.wikipedia).toBe('https://en.wikipedia.org/wiki/Morse_code')
  })

  it('becomes a schema.org Thing carrying both links', () => {
    expect(MORSE_CODE_ABOUT['@type']).toBe('Thing')
    expect(MORSE_CODE_ABOUT.name).toBe('Morse code')
    expect(MORSE_CODE_ABOUT.sameAs).toEqual([
      MORSE_CODE_ENTITY.wikipedia,
      MORSE_CODE_ENTITY.wikidata,
    ])
  })
})

describe('CITATIONS', () => {
  it('links the recommendation itself and the ARRL paper over https', () => {
    expect(CITATIONS.itu.url).toBe('https://www.itu.int/rec/R-REC-M.1677-1-200910-I/en')
    expect(CITATIONS.arrl.url).toBe('https://www.arrl.org/files/file/Technology/x9004008.pdf')
    for (const citation of Object.values(CITATIONS)) {
      expect(citation.url.startsWith('https://')).toBe(true)
      expect(citation.name.length).toBeGreaterThan(10)
    }
  })

  it('has a short form that copy can use in a sentence', () => {
    expect(CITATIONS.itu.short).toBe('ITU-R M.1677-1')
    expect(CITATIONS.itu.name).toContain(CITATIONS.itu.short)
  })
})
