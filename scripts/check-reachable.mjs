/**
 * Fail on a module that nothing reaches.
 *
 * Three features once shipped as data plus tests plus a commit, with no UI, and
 * nothing flagged it — the tests all passed. That is the hole this closes: a
 * module can be fully covered and completely unreachable, and coverage is
 * exactly the wrong instrument for noticing.
 *
 * Reachability is computed from the pages inwards, the same way a user reaches
 * the product: start at every file under src/pages, follow every relative
 * import, and report anything under src/data, src/game, src/engine, src/storage
 * or src/analytics that never comes up.
 *
 *   node scripts/check-reachable.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')

/** Where an unreachable module is a bug rather than a choice. */
const WATCHED = ['data', 'game', 'engine', 'storage', 'analytics'].map((dir) => join(SRC, dir))

/**
 * Modules that are a public surface rather than something a page imports.
 *
 * Kept as an explicit list so adding one is a decision someone made, not a
 * silence. Empty for now, and it should stay that way.
 */
const ALLOWED = new Set([])

const CODE = new Set(['.ts', '.tsx', '.astro', '.mjs', '.js'])

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (CODE.has(extname(entry.name))) files.push(full)
  }
  return files
}

/** Resolve a relative import the way the bundler would. */
function resolveImport(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier)
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.astro`,
    `${base}.js`,
    `${base}.mjs`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      // Not this one.
    }
  }
  return null
}

const IMPORT = /(?:from|import)\s*['"](\.[^'"]+)['"]/g

function importsOf(file) {
  const source = readFileSync(file, 'utf8')
  const found = []
  for (const match of source.matchAll(IMPORT)) {
    const resolved = resolveImport(file, match[1])
    if (resolved) found.push(resolved)
  }
  return found
}

/** Everything reachable from the pages, following imports. */
function reachable() {
  const seen = new Set()
  const queue = walk(join(SRC, 'pages'))

  while (queue.length > 0) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    queue.push(...importsOf(file))
  }
  return seen
}

const live = reachable()
const orphans = WATCHED.flatMap((dir) => {
  try {
    return walk(dir)
  } catch {
    return []
  }
})
  .filter((file) => !file.includes('.test.'))
  .filter((file) => !live.has(file))
  .map((file) => relative(ROOT, file))
  .filter((file) => !ALLOWED.has(file))
  .sort()

if (orphans.length > 0) {
  console.error('Unreachable from any page:\n')
  for (const file of orphans) console.error(`  ${file}`)
  console.error(
    '\nEach of these is built and tested but cannot be reached by a user.\n' +
      'Either wire it to a screen, delete it, or add it to ALLOWED in this\n' +
      'script with a reason.',
  )
  process.exit(1)
}

console.log(`Reachability: every module under ${WATCHED.length} watched directories is reachable.`)
