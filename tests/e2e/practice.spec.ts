import { expect, test, type Page } from '@playwright/test'

async function openReady(page: Page) {
  // `/` is the wallet-aware entry since Phase 5 (GAME-504); practice lives at
  // its explicit route and must stay playable without a wallet.
  await page.goto('/practice')
  await expect(page.getByRole('heading', { name: /Encrypted Battleship/i }))
    .toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Loading Battlefield')).toBeHidden({ timeout: 30_000 })
}

test('entry onboarding keeps practice reachable without a wallet', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('entry-screen')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('entry-skip').click()
  await expect(page.getByRole('button', { name: 'Practice vs Bot' }))
    .toBeVisible({ timeout: 30_000 })
})

async function storeValue<T>(page: Page, selector: string): Promise<T> {
  return page.evaluate((path) => {
    const store = (window as unknown as {
      __store: { getState: () => Record<string, unknown> }
    }).__store
    return path.split('.').reduce<unknown>((value, key) => {
      if (value === null || typeof value !== 'object') return undefined
      return (value as Record<string, unknown>)[key]
    }, store.getState()) as T
  }, selector)
}

test('renders a non-blank WebGL battlefield', async ({ page }) => {
  await openReady(page)

  await expect
    .poll(
      async () => {
        return page.locator('canvas').evaluate(async (canvas: HTMLCanvasElement) => {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
          if (!gl) return 0

          const pixels = new Uint8Array(canvas.width * canvas.height * 4)
          gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
          const unique = new Set<string>()
          const stride = Math.max(4, Math.floor(pixels.length / 20_000 / 4) * 4)
          for (let index = 0; index < pixels.length; index += stride) {
            unique.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`)
            if (unique.size > 24) break
          }
          return unique.size
        })
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(4)
})

test('completes placement, attack, forfeit, and rematch flows', async ({ page }) => {
  await openReady(page)
  // "Practice vs Bot" now launches the on-chain bot match (wallet-gated). The
  // local engine still ships and is exercised here through its store — the same
  // entry the sunk-halo test below uses.
  await page.evaluate(() => {
    ;(
      window as unknown as { __store: { getState: () => { startPlacement: () => void } } }
    ).__store
      .getState()
      .startPlacement()
  })
  await expect(page.getByText('Deploy Fleet')).toBeVisible()

  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  let placedAt: { x: number; y: number } | null = null
  for (const yRatio of [0.38, 0.46, 0.3, 0.54]) {
    for (const xRatio of [0.5, 0.4, 0.6]) {
      const point = { x: box!.width * xRatio, y: box!.height * yRatio }
      await canvas.click({ position: point })
      if ((await storeValue<Array<unknown>>(page, 'placements')).filter(Boolean).length > 0) {
        placedAt = point
        break
      }
    }
    if (placedAt) break
  }
  expect(placedAt).not.toBeNull()

  await page.getByRole('button', { name: /Rotate/ }).click()
  await expect(page.getByRole('button', { name: /Rotate · Vertical/ })).toBeVisible()
  await canvas.click({ position: placedAt! })
  await expect.poll(async () =>
    (await storeValue<Array<unknown>>(page, 'placements')).filter(Boolean).length,
  ).toBe(0)

  await page.getByRole('button', { name: 'Auto Place' }).click()
  await expect.poll(async () =>
    (await storeValue<Array<unknown>>(page, 'placements')).filter(Boolean).length,
  ).toBe(10)
  await page.getByRole('button', { name: 'Confirm Fleet' }).click()
  await expect.poll(() => storeValue<string>(page, 'screen')).toBe('battle')
  await expect(page.getByText('Your Turn')).toBeVisible()

  await page.evaluate(() => {
    const store = (window as unknown as {
      __store: { getState: () => { selectCell: (cell: number) => void } }
    }).__store
    store.getState().selectCell(10)
  })
  await page.getByRole('button', { name: 'Fire at A2' }).click()
  await expect.poll(() => storeValue<unknown[]>(page, 'match.moves'), { timeout: 15_000 })
    .toHaveLength(1)
  await expect(page.locator('.toast')).toContainText(/Miss|Hit|Sunk/)

  await expect.poll(() => storeValue<boolean>(page, 'busy'), { timeout: 20_000 }).toBe(false)
  await page.getByRole('button', { name: 'Forfeit' }).click()
  await page.getByRole('button', { name: 'Forfeit' }).last().click()
  await expect(page.getByRole('heading', { name: 'Defeat' })).toBeVisible()
  await expect(page.getByText('Match forfeited')).toBeVisible()

  await page.getByRole('button', { name: 'Play Again' }).click()
  await expect(page.getByText(/0\/10 placed/)).toBeVisible()
  expect((await storeValue<Array<unknown>>(page, 'placements')).filter(Boolean)).toHaveLength(0)
})

test('handles sunk halo and reaches victory', async ({ page }) => {
  await openReady(page)
  await page.evaluate(() => {
    const makeShip = (
      slot: number,
      length: number,
      cells: number[],
      row: number,
      col: number,
      classId: string,
      label: string,
    ) => ({
      slot,
      classId,
      length,
      label,
      row,
      col,
      orientation: 'h',
      cells,
      hitMask: 0,
      sunk: false,
    })
    const makeBoard = (ships: ReturnType<typeof makeShip>[]) => {
      const shipAt = new Array(100).fill(-1)
      ships.forEach((ship, index) => ship.cells.forEach((cell) => {
        shipAt[cell] = index
      }))
      return { ships, shipAt, shots: new Array(100).fill(0) }
    }
    const player = makeBoard([
      makeShip(6, 1, [99], 9, 9, 'patrol-boat', 'Patrol Boat'),
    ])
    const bot = makeBoard([
      makeShip(6, 1, [0], 0, 0, 'patrol-boat', 'Patrol Boat'),
      makeShip(3, 2, [22, 23], 2, 2, 'destroyer', 'Destroyer'),
    ])
    const store = (window as unknown as {
      __store: {
        setState: (state: Record<string, unknown>) => void
      }
    }).__store
    store.setState({
      screen: 'battle',
      match: {
        boards: { player, bot },
        turn: 'player',
        moves: [],
        winner: null,
      },
      focus: 'enemy',
      selectedCell: null,
      busy: false,
      effects: [],
      projectiles: [],
      toast: null,
      forfeited: false,
    })
  })

  const fireAt = async (cell: number, label: string, moves: number) => {
    await page.evaluate((target) => {
      const store = (window as unknown as {
        __store: { getState: () => { selectCell: (cell: number) => void } }
      }).__store
      store.getState().selectCell(target)
    }, cell)
    // Wait for the HUD to reflect the selection before clicking (helps in CI/headless)
    await expect(page.getByRole('button', { name: `Fire at ${label}` }))
      .toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: `Fire at ${label}` }).click()
    await expect.poll(() => storeValue<unknown[]>(page, 'match.moves'), { timeout: 15_000 })
      .toHaveLength(moves)
    await expect.poll(() => storeValue<boolean>(page, 'busy'), { timeout: 15_000 }).toBe(false)
  }

  await fireAt(0, 'A1', 1)
  expect(await storeValue<string>(page, 'match.moves.0.result')).toBe('sunk')
  await page.evaluate(() => {
    const store = (window as unknown as {
      __store: { getState: () => { selectCell: (cell: number) => void } }
    }).__store
    store.getState().selectCell(1)
  })
  expect(await storeValue<null>(page, 'selectedCell')).toBeNull()

  await fireAt(22, 'C3', 2)
  await fireAt(23, 'D3', 3)
  await expect(page.getByRole('heading', { name: 'Victory' })).toBeVisible({ timeout: 15_000 })
})

test('persists mute across reload', async ({ page }) => {
  await openReady(page)
  await page.getByRole('button', { name: 'Mute sound' }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('eb-muted'))).toBe('1')

  await page.reload()
  await expect(page.getByRole('button', { name: 'Unmute sound' }))
    .toBeVisible({ timeout: 30_000 })
})
