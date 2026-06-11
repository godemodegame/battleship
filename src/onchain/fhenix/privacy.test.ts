import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))

describe('encrypted fleet privacy regression (GAME-607/610/612)', () => {
  it('does not persist, log, or URL-encode fleet inputs or ciphertext payloads', async () => {
    const files = [
      resolve(here, './cofheClient.ts'),
      resolve(here, './cofhe.worker.ts'),
      resolve(here, '../placement/EncryptedFleetPanel.tsx'),
      resolve(here, '../placement/placementStore.ts'),
    ]
    const source = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n')

    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
    expect(source).not.toMatch(/console\.(?:log|info|debug|warn|error)/)
    expect(source).not.toMatch(/URLSearchParams|history\.(?:pushState|replaceState)/)
    expect(source).not.toMatch(/indexedDB\.open/)
  })
})
