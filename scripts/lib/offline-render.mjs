/**
 * Shared plumbing for the deterministic offline renderers.
 *
 * A page under test exposes two globals — `window.__seek(t)` draws exactly one
 * frame for absolute clip time `t`, and `window.__ready` flips true once every
 * asset is loaded. This module boots vite, drives that contract frame by frame,
 * and hands the sequence to ffmpeg.
 */
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { join } from 'node:path'

/** Sub-frames folded into one output frame to fake a 180° shutter. */
export const BLUR_SUBFRAMES = 3

const wait = (ms) => new Promise((done) => setTimeout(done, ms))

export function portOpen(port) {
  return new Promise((done) => {
    const socket = createConnection({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      done(true)
    })
    socket.once('error', () => done(false))
  })
}

export async function startVite(port, cwd) {
  if (await portOpen(port)) {
    console.log(`· reusing dev server on :${port}`)
    return null
  }
  console.log(`· starting vite on :${port}`)
  const child = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stderr.on('data', (chunk) => process.stderr.write(`  vite: ${chunk}`))
  for (let i = 0; i < 120; i++) {
    if (await portOpen(port)) return child
    await wait(250)
  }
  child.kill()
  throw new Error('vite did not come up in 30s')
}

export function run(command, args, options = {}) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.on('error', fail)
    child.on('exit', (code) =>
      code === 0 ? done() : fail(new Error(`${command} exited with ${code}`)),
    )
  })
}

/**
 * Steps the page through every frame and writes PNGs.
 *
 * `source: 'canvas'` reads the WebGL backing store directly (full render
 * resolution regardless of window size); `source: 'page'` screenshots the DOM,
 * where the device scale factor supplies the resolution instead.
 */
export async function captureFrames({
  page,
  url,
  framesDir,
  captureFps,
  frameCount,
  label,
  source = 'canvas',
  expect,
}) {
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 })

  if (source === 'canvas' && expect) {
    const backing = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      return { width: canvas.width, height: canvas.height }
    })
    if (backing.width !== expect.width || backing.height !== expect.height) {
      throw new Error(
        `canvas backing store is ${backing.width}x${backing.height}, expected ${expect.width}x${expect.height}`,
      )
    }
  }

  // Warm-up passes: compile shaders / lay out fonts before the sequence starts.
  await page.evaluate(() => {
    window.__seek(0)
    window.__seek(0)
  })
  if (source === 'page') await page.evaluate(() => document.fonts.ready)

  const started = Date.now()
  for (let frame = 0; frame < frameCount; frame++) {
    const t = frame / captureFps
    const file = join(framesDir, `f${String(frame).padStart(5, '0')}.png`)

    if (source === 'canvas') {
      const dataUrl = await page.evaluate((time) => {
        window.__seek(time)
        return document.querySelector('canvas').toDataURL('image/png')
      }, t)
      await writeFile(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'))
    } else {
      await page.evaluate((time) => window.__seek(time), t)
      await page.screenshot({ path: file })
    }

    if (frame % 30 === 0 || frame === frameCount - 1) {
      const pct = Math.round(((frame + 1) / frameCount) * 100)
      const rate = ((frame + 1) / ((Date.now() - started) / 1000)).toFixed(1)
      process.stdout.write(`\r  ${label}: ${pct}% (${frame + 1}/${frameCount}, ${rate} fps)   `)
    }
  }
  process.stdout.write('\n')
}

export async function encode({ framesDir, captureFps, fps, motionBlur, outFile }) {
  const filters = motionBlur
    ? `tmix=frames=${BLUR_SUBFRAMES}:weights='1 1 1',fps=${fps},format=yuv420p`
    : 'format=yuv420p'
  await run('ffmpeg', [
    '-y',
    '-framerate',
    String(captureFps),
    '-i',
    join(framesDir, 'f%05d.png'),
    '-vf',
    filters,
    '-c:v',
    'libx264',
    '-crf',
    '17',
    '-preset',
    'slow',
    '-movflags',
    '+faststart',
    outFile,
  ])
}
