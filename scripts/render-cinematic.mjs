#!/usr/bin/env node
/**
 * Offline renderer for the cinematic missile-strike clips.
 *
 * Boots the vite dev server, opens /cinematic.html in chromium, steps the
 * composition one frame at a time through window.__seek(t) (deterministic —
 * no wall clock is involved), reads each frame straight off the WebGL canvas,
 * and hands the sequence to ffmpeg.
 *
 * Usage:
 *   node scripts/render-cinematic.mjs                    # all three ships
 *   node scripts/render-cinematic.mjs --ship=carrier
 *   node scripts/render-cinematic.mjs --ship=carrier --angle=broadside,deck
 *   node scripts/render-cinematic.mjs --fps=60 --no-motion-blur
 */
import { mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import { BLUR_SUBFRAMES, captureFrames, encode, startVite } from './lib/offline-render.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHIPS = ['carrier', 'battleship', 'destroyer']
/** Camera setups; see src/cinematic/timeline.ts. */
const ANGLES = ['chase', 'broadside', 'missilecam', 'deck']
function parseArgs(argv) {
  const args = {
    ships: SHIPS,
    angles: ['chase'],
    fps: 30,
    duration: 5,
    width: 1920,
    height: 1080,
    out: join(ROOT, 'renders'),
    motionBlur: true,
    keepFrames: false,
    headless: false,
    port: 5199,
  }
  for (const arg of argv) {
    const [key, raw] = arg.replace(/^--/, '').split('=')
    const value = raw ?? 'true'
    switch (key) {
      case 'ship':
        args.ships = value.split(',').map((s) => s.trim())
        break
      case 'angle':
        args.angles = value.split(',').map((s) => s.trim())
        break
      case 'fps':
        args.fps = Number(value)
        break
      case 'duration':
        args.duration = Number(value)
        break
      case 'width':
        args.width = Number(value)
        break
      case 'height':
        args.height = Number(value)
        break
      case 'out':
        args.out = resolve(value)
        break
      case 'motion-blur':
        args.motionBlur = value !== 'false'
        break
      case 'no-motion-blur':
        args.motionBlur = false
        break
      case 'keep-frames':
        args.keepFrames = value !== 'false'
        break
      case 'headless':
        args.headless = value !== 'false'
        break
      case 'port':
        args.port = Number(value)
        break
      default:
        throw new Error(`Unknown flag --${key}`)
    }
  }
  for (const ship of args.ships) {
    if (!SHIPS.includes(ship)) throw new Error(`Unknown ship "${ship}" (expected ${SHIPS})`)
  }
  for (const angle of args.angles) {
    if (!ANGLES.includes(angle)) throw new Error(`Unknown angle "${angle}" (expected ${ANGLES})`)
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const captureFps = args.motionBlur ? args.fps * BLUR_SUBFRAMES : args.fps
  const frameCount = Math.round(args.duration * captureFps)
  const scratch =
    process.env.CLAUDE_SCRATCHPAD ?? join(process.env.TMPDIR ?? '/tmp', 'battleship-cinematic')

  await mkdir(args.out, { recursive: true })

  const vite = await startVite(args.port, ROOT)
  const browser = await chromium.launch({
    headless: args.headless,
    args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
  })

  try {
    const page = await browser.newPage({
      viewport: { width: 960, height: Math.round((960 * args.height) / args.width) },
      deviceScaleFactor: 1,
    })
    page.on('pageerror', (error) => console.error(`  page error: ${error.message}`))

    for (const ship of args.ships) {
      for (const angle of args.angles) {
        const framesDir = join(scratch, `frames-${ship}-${angle}`)
        await rm(framesDir, { recursive: true, force: true })
        await mkdir(framesDir, { recursive: true })

        console.log(`· rendering ${ship}/${angle} (${frameCount} frames @ ${captureFps}fps)`)
        const query = `ship=${ship}&angle=${angle}&dpr=${args.width / 960}`
        await captureFrames({
          page,
          url: `http://127.0.0.1:${args.port}/cinematic.html?${query}`,
          framesDir,
          captureFps,
          frameCount,
          label: `${ship}/${angle}`,
          source: 'canvas',
          expect: { width: args.width, height: args.height },
        })

        const suffix = angle === 'chase' ? '' : `-${angle}`
        const outFile = join(args.out, `missile-strike-${ship}${suffix}.mp4`)
        await encode({
          framesDir,
          captureFps,
          fps: args.fps,
          motionBlur: args.motionBlur,
          outFile,
        })
        if (!args.keepFrames) await rm(framesDir, { recursive: true, force: true })
        console.log(`· wrote ${outFile}`)
      }
    }
  } finally {
    await browser.close()
    if (vite) vite.kill('SIGTERM')
  }

  if (!existsSync(args.out)) throw new Error('no output directory produced')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
