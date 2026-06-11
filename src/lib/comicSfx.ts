export const COMIC_SFX_URL = {
  pew: '/textures/comic-sfx/comic-sfx-pew.webp',
  thoom: '/textures/comic-sfx/comic-sfx-thoom.webp',
  fwoosh: '/textures/comic-sfx/comic-sfx-fwoosh.webp',
  zip: '/textures/comic-sfx/comic-sfx-zip.webp',
  krak: '/textures/comic-sfx/comic-sfx-krak.webp',
  blam: '/textures/comic-sfx/comic-sfx-blam.webp',
  boom: '/textures/comic-sfx/comic-sfx-boom.webp',
  splash: '/textures/comic-sfx/comic-sfx-splash.webp',
  kaboom: '/textures/comic-sfx/comic-sfx-kaboom.webp',
} as const

export type ComicSfxName = keyof typeof COMIC_SFX_URL
export type ComicFlightSfx = 'pew' | 'thoom' | 'fwoosh' | 'zip'
export type ComicResultSfx = 'krak' | 'blam' | 'boom' | 'splash' | 'kaboom'

const FLIGHT_VARIANTS: readonly ComicFlightSfx[] = ['pew', 'fwoosh', 'zip', 'thoom']
const HIT_VARIANTS: readonly ComicResultSfx[] = ['krak', 'blam', 'boom']

const variantAt = <T>(variants: readonly T[], id: number) =>
  variants[Math.abs(Math.trunc(id)) % variants.length]

export function comicFlightFor(id: number): ComicFlightSfx {
  return variantAt(FLIGHT_VARIANTS, id)
}

export function comicResultFor(
  result: 'miss' | 'hit' | 'sunk',
  id: number,
): ComicResultSfx {
  if (result === 'miss') return 'splash'
  if (result === 'sunk') return 'kaboom'
  return variantAt(HIT_VARIANTS, id)
}
