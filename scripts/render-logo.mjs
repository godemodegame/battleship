#!/usr/bin/env node
/**
 * Offline renderer for the Fhenix wordmark slot-machine reveal (logo.html).
 *
 * Usage:
 *   node scripts/render-logo.mjs
 *   node scripts/render-logo.mjs --fps=60 --duration=6 --no-motion-blur
 */
import { mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import { BLUR_SUBFRAMES, captureFrames, encode, startVite } from './lib/offline-render.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const args = {
    fps: 30,
    duration: 6,
    width: 1920,
    height: 1080,
    out: join(ROOT, 'renders'),
    name: 'fhenix-logo-slot',
    motionBlur: true,
    keepFrames: false,
    headless: false,
    port: 5199,
  }
  for (const arg of argv) {
    const [key, raw] = arg.replace(/^--/, '').split('=')
    const value = raw ?? 'true'
    switch (key) {
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
      case 'name':
        args.name = value
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
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const captureFps = args.motionBlur ? args.fps * BLUR_SUBFRAMES : args.fps
  const frameCount = Math.round(args.duration * captureFps)
  const scratch =
    process.env.CLAUDE_SCRATCHPAD ?? join(process.env.TMPDIR ?? '/tmp', 'fhenix-logo')

  await mkdir(args.out, { recursive: true })

  const vite = await startVite(args.port, ROOT)
  const browser = await chromium.launch({
    headless: args.headless,
    args: ['--use-angle=metal', '--font-render-hinting=none'],
  })

  try {
    // Half-size CSS viewport at 2x DPR: screenshots land at full 1920x1080
    // without needing a window that large.
    const page = await browser.newPage({
      viewport: { width: args.width / 2, height: args.height / 2 },
      deviceScaleFactor: 2,
    })
    page.on('pageerror', (error) => console.error(`  page error: ${error.message}`))

    const framesDir = join(scratch, 'frames-logo')
    await rm(framesDir, { recursive: true, force: true })
    await mkdir(framesDir, { recursive: true })

    console.log(`· rendering logo (${frameCount} frames @ ${captureFps}fps)`)
    await captureFrames({
      page,
      url: `http://127.0.0.1:${args.port}/logo.html`,
      framesDir,
      captureFps,
      frameCount,
      label: 'logo',
      source: 'page',
    })

    const outFile = join(args.out, `${args.name}.mp4`)
    await encode({
      framesDir,
      captureFps,
      fps: args.fps,
      motionBlur: args.motionBlur,
      outFile,
    })
    if (!args.keepFrames) await rm(framesDir, { recursive: true, force: true })
    console.log(`· wrote ${outFile}`)
  } finally {
    await browser.close()
    if (vite) vite.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
