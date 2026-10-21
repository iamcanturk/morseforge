# Translating MorseForge

MorseForge is built so that a language is one typed catalog and one switch. You
do not touch components, pages or routes. This guide covers how to claim a
language, how to write the catalog, how to keep the site's voice, what never to
translate, and how to check your work before anyone else sees it.

## 1. Claim the language first

Open an issue that says which language you are taking (for example
"Translation: German"), before you start. Issue #44 asks for this so two people
do not translate the same thing. If an issue for your language already exists,
comment on it instead.

Languages that would help most, roughly by the size of their amateur radio
community: German, Japanese, Spanish, Russian, Turkish, Italian.

The articles under `/blog/` are not part of a first pass. They stay English.

## 2. How the pieces fit

| File                     | What it is                                                                  |
| ------------------------ | --------------------------------------------------------------------------- |
| `src/i18n/en/*.ts`       | The English interface strings, one file per area. The source of truth.      |
| `src/i18n/en/content.ts` | The English page copy: titles, descriptions, H1s, intros, FAQs, landing.    |
| `src/i18n/catalog.ts`    | The `LocaleCatalog` type every language must satisfy, derived from English. |
| `src/i18n/catalogs.ts`   | The list of catalogs, and the fallback rule.                                |
| `src/i18n/locales.ts`    | Which languages exist and which are switched on.                            |

English URLs never change. Your language lives under `/<code>/`, so German is
`/de/`, `/de/morse-code-alphabet/` and so on.

## 3. Add the catalog

Create `src/i18n/locales/de.ts`. It exports one object of type
`LocaleCatalog`, with two parts:

```ts
import { FACTS } from '../../config/facts'
import { UNTRANSLATED } from '../define'
import type { LocaleCatalog } from '../catalog'

export const DE: LocaleCatalog = {
  messages: {
    'header.allTools': 'Alle Werkzeuge',
    'practice.ready': 'Bereit · {mode} · {count} Aufgaben',
    'result.streakDays': { one: '{count} Tag', other: '{count} Tage' },
    'lesson.seeBody': UNTRANSLATED,
    // … every key English has
  },
  content: {
    pages: {
      '/tree/': {
        title: 'Der Morsecode-Baum — wie jeder Buchstabe entsteht | MorseForge',
        description: '…',
        h1: 'Der Morsecode-Baum',
        intro: `… die ${FACTS.letterCount} Buchstaben …`,
        navLabel: 'Der Morse-Baum',
        hint: '…',
        llmsSummary: '…',
      },
      '/privacy/': UNTRANSLATED,
      // … every registry path
    },
    faq: { '/': UNTRANSLATED /* … */ },
    landing: UNTRANSLATED,
    curriculum: [UNTRANSLATED /* … one per day */],
    wordPage: UNTRANSLATED,
    wordFaq: UNTRANSLATED,
    characterPage: UNTRANSLATED,
    characterFaq: UNTRANSLATED,
  },
}
```

The type will not compile until every key is present. Each entry is either the
translation or `UNTRANSLATED`. An untranslated entry shows the English, and the
coverage report lists it, so you can ship a language at 60% honestly and finish
it later. Leaving a key out is not an option: that is how strings silently go
missing.

Then register it:

1. `src/i18n/catalogs.ts`: add `de: () => DE` to `CATALOGS`.
2. `src/i18n/locales.ts`: add an entry to `LOCALES`:

   ```ts
   { code: 'de', path: 'de', lang: 'de', ogLocale: 'de_DE', label: 'Deutsch', dir: 'ltr', status: 'disabled' },
   ```

   Keep `status: 'disabled'` while you work. Change it to `'enabled'` in the
   pull request that ships the language. That one change turns on the routes,
   `<html lang>`, `hreflang` and `x-default`, the sitemap's alternates, the
   language switcher in the footer and the language's section in `llms.txt`.

## 4. Messages: placeholders, plurals and markup

- **Placeholders** look like `{count}` or `{character}`. Keep every one, with
  the same name; move it wherever your grammar wants it. A test fails if a
  translation adds, drops or renames one. The values are filled in by the code
  from the data, which is why no number is ever typed into a message.
- **Plurals** are objects keyed by `Intl.PluralRules` category: `one`, `few`,
  `many`, `other` and so on. Give the categories your language uses; `other` is
  always required. Russian needs `one`, `few`, `many` and `other`; Japanese
  needs only `other`.
- **Markup** is written as tags without attributes: `<b>…</b>`,
  `<tree>the Morse tree</tree>`. Keep the same tags, but move them freely: the
  link can go on whichever words carry it in your language. The component
  decides what a tag becomes (a link, bold text), so a catalog can never inject
  an element or a URL.
- **Number words.** `format.numberWords` is the words for zero to twenty,
  separated by `|`. Prose says "seven days" rather than "7 days". If your
  language prefers digits, mark it `UNTRANSLATED`: digits are then used, never
  the English words.
- **Lists** ("E, T and I") are joined by `Intl.ListFormat` for your language.
  You do not translate the joiner.

## 5. Page copy

The registry copy (`content.pages`), the FAQs, the landing page and the plan
are written as TypeScript, like the English in `src/config/pages.ts` and
`src/data/faq.ts`. Every figure comes from `FACTS` or the alphabet, never typed:

```ts
intro: `Lernen Sie alle ${FACTS.letterCount} Buchstaben in ${FACTS.planDays} Tagen …`
```

Titles must stay within 60 characters and descriptions within 155, including
the ` | MorseForge` suffix. The tests measure them on the rendered strings, per
language, exactly as they do for English.

## 6. Keep the voice

The prose is opinionated on purpose. "Alphabetical is the worst of the three"
stays that blunt in translation; it is advice, not a neutral menu. Translate
what a sentence argues, not word by word: a mechanical translation of the
explanatory paragraphs is worse than leaving them in English, and
`UNTRANSLATED` is always an honest choice. Keep sentences short and answer
first. The site is in British English; match the register of a knowledgeable
friend, not a manual.

## 7. What never to translate

- **Morse codes.** Dots and dashes come from `src/data/morseAlphabet.ts`
  through placeholders. Never type one into a catalog; a test scans for them.
- **The characters being taught** (E, T, the alphabet itself). International
  Morse covers the Latin letters and digits; they are the same in every
  language.
- **Prosigns and Q-codes:** AR, SK, BT, CQ, QTH, 73, 88. They are said the same
  on the air everywhere.
- **Call signs** and anything a learner is meant to send.
- **dit and dah.** The spoken forms are an international convention.
- **Brand and product names:** MorseForge, Signal Tree, Signal Defender, Morse
  Runner. They appear through `{name}` placeholders where they are used.
- **URLs and file names.**

## 8. Test with the pseudo-locale

`en-XA` is English run through an accent-and-stretch filter: "Settings"
becomes "Šééţţîîñĝš", about a third longer, the way German or Russian runs. It
is routed under `astro dev` only, never in a build.

```bash
npm run dev
# then open http://localhost:4321/en-xa/  (any page: /en-xa/tree/, /en-xa/learn/)
```

Anything still in plain English on an `/en-xa/` page never went through the
catalog: that is a bug to report, not to work around. Anything that overflows
its box will overflow in your language too.

Your own language, while its status is `disabled`, can be previewed the same way
by temporarily setting it to `dev` in `locales.ts`.

To see what is left to translate:

```ts
import { coverage } from './src/i18n/catalogs'
coverage('de') // { translated, total, untranslated: ['lesson.seeBody', 'pages./privacy/', …] }
```

Before you open the pull request:

```bash
npm run verify
```

That runs the catalog completeness test, the placeholder and tag check, the
length limits for your titles and descriptions, and the rest of the suite.
