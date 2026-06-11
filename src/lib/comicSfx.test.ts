import { describe, expect, it } from 'vitest'
import { comicFlightFor, comicResultFor } from './comicSfx'

describe('comic SFX selection', () => {
  it('cycles through flight and hit variants deterministically', () => {
    expect([0, 1, 2, 3, 4].map(comicFlightFor)).toEqual([
      'pew',
      'fwoosh',
      'zip',
      'thoom',
      'pew',
    ])
    expect([0, 1, 2, 3].map((id) => comicResultFor('hit', id))).toEqual([
      'krak',
      'blam',
      'boom',
      'krak',
    ])
  })

  it('keeps miss and sunk outcomes unambiguous', () => {
    expect(comicResultFor('miss', 12)).toBe('splash')
    expect(comicResultFor('sunk', 12)).toBe('kaboom')
  })
})
