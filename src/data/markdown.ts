/**
 * Small Markdown transforms for the generated text files.
 *
 * Embedding one document inside another is where document structure quietly
 * breaks: a post whose sections are `##` dropped under a `##` heading of the
 * host file produces an outline where the post's sections are siblings of the
 * section containing them. A reader does not notice. A machine building a
 * table of contents does, and so does anything deciding what a heading covers.
 */

/** Fence lines: ``` or ~~~, with any info string. */
const FENCE = /^\s{0,3}(`{3,}|~{3,})/

/**
 * Push every heading down by `levels`.
 *
 * Headings inside fenced code blocks are left alone — a shell prompt starting
 * with `#` is a comment, not a heading, and rewriting it corrupts the example.
 * Nothing is pushed past `h6`, which does not exist.
 */
export function demoteHeadings(markdown: string, levels = 1): string {
  if (levels <= 0) return markdown

  let inFence = false
  let fence = ''

  return markdown
    .split('\n')
    .map((line) => {
      const match = FENCE.exec(line)
      if (match) {
        const marker = match[1]!
        if (!inFence) {
          inFence = true
          fence = marker[0]!
        } else if (marker[0] === fence) {
          inFence = false
        }
        return line
      }
      if (inFence) return line

      const heading = /^(#{1,6})(\s)/.exec(line)
      if (!heading) return line

      const depth = Math.min(6, heading[1]!.length + levels)
      return '#'.repeat(depth) + line.slice(heading[1]!.length)
    })
    .join('\n')
}

/** Join a sentence to a following clause without doubling the full stop. */
export function sentence(head: string, tail: string): string {
  const trimmed = head.trim()
  const stop = /[.!?]$/.test(trimmed) ? '' : '.'
  return `${trimmed}${stop} ${tail.trim()}`
}
