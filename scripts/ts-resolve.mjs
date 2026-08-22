/**
 * Let plain Node import the project's TypeScript.
 *
 * Node 25 strips types on its own, but it will not guess an extension: the
 * source imports `./morseAlphabet`, and the ESM resolver wants
 * `./morseAlphabet.ts`. Vite fills that gap for the app and for tests; a
 * standalone script has to fill it itself.
 *
 * Deliberately narrow — it only touches relative specifiers with no extension,
 * and falls through to the default resolver for everything else.
 */
export async function resolve(specifier, context, next) {
  const relative = specifier.startsWith('./') || specifier.startsWith('../')
  const hasExtension = /\.[cm]?[jt]sx?$|\.json$|\.css$/.test(specifier)

  if (relative && !hasExtension) {
    for (const extension of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await next(specifier + extension, context)
      } catch {
        // Try the next shape.
      }
    }
  }
  return next(specifier, context)
}
