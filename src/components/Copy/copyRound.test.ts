import { describe, expect, it } from 'vitest'
import { gradeAnnouncement } from './CopyRound'

describe('gradeAnnouncement', () => {
  it('says a clean line is clean, and nothing more', () => {
    expect(gradeAnnouncement({ perfect: true, hits: 5, total: 5 }, [])).toBe('Clean copy.')
  })

  it('reads the score, then what got past', () => {
    expect(gradeAnnouncement({ perfect: false, hits: 3, total: 5 }, ['K', 'Q'])).toBe(
      '3 of 5 characters. Got past you: K Q.',
    )
  })

  it('reads the score alone when nothing was missed but the line was padded', () => {
    expect(gradeAnnouncement({ perfect: false, hits: 5, total: 5 }, [])).toBe('5 of 5 characters.')
  })
})
