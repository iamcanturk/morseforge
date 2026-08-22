import { describe, expect, it } from 'vitest'
import { demoteHeadings, sentence } from './markdown'

describe('demoteHeadings', () => {
  it('pushes every heading down one level', () => {
    expect(demoteHeadings('# One\n\n## Two\n\ntext')).toBe('## One\n\n### Two\n\ntext')
  })

  it('pushes further when asked', () => {
    expect(demoteHeadings('# One', 2)).toBe('### One')
  })

  it('leaves the text alone', () => {
    const body = 'A line.\n\nAnother line with a # in it.\n'
    expect(demoteHeadings(body)).toBe(body)
  })

  it('does not touch headings inside a code fence', () => {
    // A shell comment is not a heading, and rewriting it corrupts the example.
    const input = ['## Real heading', '', '```bash', '# not a heading', 'ls', '```', ''].join('\n')
    const output = demoteHeadings(input)
    expect(output).toContain('### Real heading')
    expect(output).toContain('# not a heading')
  })

  it('handles tilde fences and longer fences', () => {
    const input = ['~~~', '# inside', '~~~', '# outside'].join('\n')
    expect(demoteHeadings(input)).toBe(['~~~', '# inside', '~~~', '## outside'].join('\n'))
  })

  it('does not close a backtick fence on a tilde line', () => {
    const input = ['```', '~~~', '# still inside', '```', '# outside'].join('\n')
    const output = demoteHeadings(input)
    expect(output).toContain('# still inside')
    expect(output).toContain('## outside')
  })

  it('never pushes past h6, which does not exist', () => {
    expect(demoteHeadings('###### Six')).toBe('###### Six')
    expect(demoteHeadings('##### Five', 4)).toBe('###### Five')
  })

  it('ignores a hash with no space, which is not a heading', () => {
    expect(demoteHeadings('#hashtag')).toBe('#hashtag')
  })

  it('is a no-op for zero or negative levels', () => {
    expect(demoteHeadings('# One', 0)).toBe('# One')
    expect(demoteHeadings('# One', -1)).toBe('# One')
  })
})

describe('sentence', () => {
  it('does not double a full stop', () => {
    // "Learn Morse. Build the Signal.." shipped in llms-full.txt.
    expect(sentence('Learn Morse. Build the Signal.', 'A free trainer.')).toBe(
      'Learn Morse. Build the Signal. A free trainer.',
    )
  })

  it('adds one when there is none', () => {
    expect(sentence('Learn Morse', 'A free trainer.')).toBe('Learn Morse. A free trainer.')
  })

  it('respects other terminators', () => {
    expect(sentence('Really?', 'Yes.')).toBe('Really? Yes.')
    expect(sentence('Stop!', 'Now.')).toBe('Stop! Now.')
  })

  it('trims either side', () => {
    expect(sentence('  Head  ', '  Tail  ')).toBe('Head. Tail')
  })
})
