import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const ROOT = process.cwd()
const sourceDir = path.join(ROOT, 'assets/2d-comics/ui-hud')
const runtimeDir = path.join(ROOT, 'public/textures/ui-comic')
const fontPath = path.join(ROOT, 'node_modules/@fontsource/bangers/files/bangers-latin-400-normal.woff2')

const assets = [
  ['ui-halftone-tile', 96, 96],
  ['ui-paper-tile', 256, 256],
  ['ui-panel-frame', 256, 256],
  ['ui-caption-plate', 192, 96],
  ['ui-burst-plate', 256, 128],
  ['ui-title-lockup', 2048, 1024],
  ['ui-word-victory', 1024, 512],
  ['ui-word-defeat', 1024, 512],
  ['ui-word-your-turn', 1024, 512],
  ['ui-word-enemy-turn', 1024, 512],
  ['ui-icon-sheet', 1536, 768],
  ['ui-ship-chips', 1536, 512],
  ['ui-grid-markers', 768, 256],
  ['ui-spinner-frames', 1024, 128],
]

await mkdir(sourceDir, { recursive: true })
await mkdir(runtimeDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 2200, height: 1200 }, deviceScaleFactor: 1 })

await page.setContent(`<!doctype html>
<style>
  @font-face {
    font-family: BangersLocal;
    src: url("file://${fontPath}") format("woff2");
    font-weight: 400;
  }
  body { margin: 0; background: transparent; }
</style>
<canvas id="canvas"></canvas>`)
await page.evaluate(() => document.fonts.ready)

for (const [name, width, height] of assets) {
  const result = await page.evaluate(({ name, width, height }) => {
    const INK = '#14121C'
    const PAPER = '#F7EFDD'
    const PAPER_SHADE = '#E9DCC0'
    const AMBER = '#FFC63C'
    const RED = '#E8402E'
    const BLUE = '#2F6FD0'
    const CYAN = '#2FC0E0'
    const PINK = '#F8508F'
    const WHITE = '#FFFAF0'

    const canvas = document.getElementById('canvas')
	    canvas.width = width
	    canvas.height = height
	    const ctx = canvas.getContext('2d')
	    ctx.clearRect(0, 0, width, height)
	    ctx.globalAlpha = 1
	    ctx.globalCompositeOperation = 'source-over'
	    ctx.setTransform(1, 0, 0, 1, 0, 0)
	    ctx.lineJoin = 'round'
	    ctx.lineCap = 'round'

    const rng = (seed) => {
      let s = seed >>> 0
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 4294967296
      }
    }
    const rand = rng([...name].reduce((sum, char) => sum + char.charCodeAt(0), 0))
    const j = (amount) => (rand() - 0.5) * amount

    const pathPoly = (points) => {
      ctx.beginPath()
      ctx.moveTo(points[0][0], points[0][1])
      for (const [x, y] of points.slice(1)) ctx.lineTo(x, y)
      ctx.closePath()
    }
    const strokePoly = (points, color = INK, lineWidth = 10) => {
      pathPoly(points)
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.stroke()
    }
    const fillStrokePoly = (points, fill, stroke = INK, lineWidth = 10) => {
      pathPoly(points)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = stroke
      ctx.lineWidth = lineWidth
      ctx.stroke()
    }
    const roundedPlate = (x, y, w, h, r) => {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + w - r, y)
      ctx.quadraticCurveTo(x + w, y, x + w, y + r)
      ctx.lineTo(x + w, y + h - r)
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
      ctx.lineTo(x + r, y + h)
      ctx.quadraticCurveTo(x, y + h, x, y + h - r)
      ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.closePath()
    }
    const halftone = (x, y, w, h, color = 'rgba(20,18,28,.12)', step = 18, radius = 3) => {
      ctx.fillStyle = color
      for (let yy = y + step / 2; yy < y + h; yy += step) {
        for (let xx = x + step / 2; xx < x + w; xx += step) {
          ctx.beginPath()
          ctx.arc(xx + j(1.2), yy + j(1.2), radius + j(0.5), 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    const shadow = (draw, ox = 4, oy = 5) => {
      ctx.save()
      ctx.translate(ox, oy)
      ctx.fillStyle = INK
      draw()
      ctx.fill()
      ctx.restore()
    }
    const word = ({ text, lines = [text], fill, secondary, angle, x, y, size, widthLimit, align = 'center', rise = 0 }) => {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate((angle * Math.PI) / 180)
      ctx.textAlign = align
      ctx.textBaseline = 'middle'
      ctx.font = `${size}px BangersLocal, Impact, sans-serif`
      ctx.lineJoin = 'round'
      const lineHeight = size * 0.82
      const startY = -((lines.length - 1) * lineHeight) / 2
      const maxWidth = widthLimit ?? width * 0.8
      for (let i = 0; i < lines.length; i++) {
        const ly = startY + i * lineHeight + i * rise
        ctx.strokeStyle = INK
        ctx.lineWidth = size * 0.2
        ctx.strokeText(lines[i], 10, ly + 14, maxWidth)
      }
      for (let i = 0; i < lines.length; i++) {
        const ly = startY + i * lineHeight + i * rise
        ctx.strokeStyle = INK
        ctx.lineWidth = size * 0.16
        ctx.strokeText(lines[i], 0, ly, maxWidth)
        ctx.fillStyle = fill
        ctx.fillText(lines[i], 0, ly, maxWidth)
        if (secondary) {
          ctx.save()
          ctx.beginPath()
          ctx.rect(-maxWidth / 2 - 20, ly - size * 0.5, maxWidth + 40, size * 0.32)
          ctx.clip()
          ctx.fillStyle = secondary
          ctx.fillText(lines[i], 0, ly, maxWidth)
          ctx.restore()
        }
      }
      ctx.restore()
    }
    const rays = (cx, cy, r1, r2, count, color = INK) => {
      ctx.strokeStyle = color
      ctx.lineWidth = Math.max(6, width / 140)
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
        ctx.lineTo(cx + Math.cos(a) * (r2 + j(20)), cy + Math.sin(a) * (r2 + j(20)))
        ctx.stroke()
      }
    }

    if (name === 'ui-halftone-tile') {
      ctx.fillStyle = INK
      for (let y = 12; y < height; y += 24) {
        for (let x = 12; x < width; x += 24) {
          ctx.globalAlpha = rand() < 0.08 ? 0.7 : 1
          ctx.beginPath()
          ctx.arc(x + j(0.8), y + j(0.8), 5.8 + j(0.4), 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    }

    if (name === 'ui-paper-tile') {
      ctx.fillStyle = PAPER
      ctx.fillRect(0, 0, width, height)
      for (let i = 0; i < 4000; i++) {
        const v = 232 + Math.floor(rand() * 24)
        ctx.fillStyle = `rgba(${v},${220 + Math.floor(rand() * 20)},${190 + Math.floor(rand() * 25)},0.13)`
        ctx.fillRect(rand() * width, rand() * height, 1 + rand() * 2, 1 + rand() * 2)
      }
      ctx.strokeStyle = 'rgba(20,18,28,.08)'
      ctx.lineWidth = 1
      for (let i = 0; i < 34; i++) {
        ctx.beginPath()
        const x = rand() * width
        const y = rand() * height
        ctx.moveTo(x, y)
        ctx.lineTo(x + 12 + rand() * 24, y + j(3))
        ctx.stroke()
      }
    }

    if (name === 'ui-panel-frame') {
      const outer = [[17,18],[238,15],[242,237],[18,240]]
      strokePoly(outer, INK, 12)
      strokePoly([[33,34],[224,33],[224,222],[34,224]], 'rgba(20,18,28,.25)', 3)
      ctx.strokeStyle = 'rgba(247,239,221,.55)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(178, 16)
      ctx.lineTo(204, 15)
      ctx.stroke()
    }

    if (name === 'ui-caption-plate') {
      shadow(() => roundedPlate(15, 13, 158, 62, 12))
      roundedPlate(11, 8, 160, 64, 12)
      ctx.fillStyle = PAPER
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 7
      ctx.stroke()
      roundedPlate(21, 18, 140, 44, 7)
      ctx.strokeStyle = 'rgba(20,18,28,.22)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      halftone(20, 16, 142, 46, 'rgba(20,18,28,.12)', 14, 1.6)
      fillStrokePoly([[14,8],[36,8],[25,18],[15,24]], INK, INK, 1)
    }

    if (name === 'ui-burst-plate') {
      const cx = 128, cy = 64
      const pts = []
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2
        const r = i % 2 ? 48 + j(8) : 60 + j(13)
        pts.push([cx + Math.cos(a) * r * 1.85, cy + Math.sin(a) * r])
      }
      shadow(() => pathPoly(pts))
      fillStrokePoly(pts, PAPER, INK, 8)
      halftone(52, 25, 154, 76, 'rgba(20,18,28,.12)', 16, 1.7)
    }

    if (name === 'ui-title-lockup') {
      rays(425, 672, 70, 170, 10, CYAN)
      halftone(210, 670, 300, 180, 'rgba(47,192,224,.55)', 38, 8)
      word({ lines: ['ENCRYPTED', 'BATTLESHIP'], fill: PAPER, secondary: AMBER, angle: -2, x: 1010, y: 520, size: 236, widthLimit: 1500, rise: 16 })
    }

    if (name === 'ui-word-victory') {
      rays(512, 256, 235, 305, 17)
      halftone(138, 330, 260, 110, 'rgba(47,111,208,.5)', 26, 6)
      word({ text: 'VICTORY', fill: AMBER, secondary: WHITE, angle: -3, x: 512, y: 252, size: 198, widthLimit: 820, rise: -8 })
    }

    if (name === 'ui-word-defeat') {
      halftone(610, 320, 260, 110, 'rgba(20,18,28,.35)', 24, 6)
      word({ text: 'DEFEAT', fill: PINK, secondary: RED, angle: 3, x: 512, y: 252, size: 218, widthLimit: 780, rise: 8 })
      ctx.strokeStyle = INK
      ctx.lineWidth = 9
      ctx.beginPath()
      ctx.moveTo(396, 228); ctx.lineTo(428, 282)
      ctx.moveTo(566, 208); ctx.lineTo(538, 292)
      ctx.moveTo(776, 285); ctx.bezierCurveTo(820, 320, 790, 372, 838, 406)
      ctx.stroke()
    }

    if (name === 'ui-word-your-turn') {
      ctx.strokeStyle = BLUE
      ctx.lineWidth = 20
      for (let i = 0; i < 4; i++) {
        ctx.beginPath()
        ctx.moveTo(150, 175 + i * 45)
        ctx.lineTo(260, 160 + i * 45)
        ctx.stroke()
      }
      word({ lines: ['YOUR', 'TURN!'], fill: BLUE, secondary: WHITE, angle: -2, x: 548, y: 255, size: 176, widthLimit: 600 })
    }

    if (name === 'ui-word-enemy-turn') {
      ctx.strokeStyle = PINK
      ctx.lineWidth = 20
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.moveTo(802, 185 + i * 52)
        ctx.lineTo(910, 204 + i * 52)
        ctx.stroke()
      }
      word({ lines: ['ENEMY', 'TURN'], fill: PINK, secondary: RED, angle: 2, x: 510, y: 255, size: 176, widthLimit: 650 })
    }

    if (name === 'ui-icon-sheet') {
      ctx.strokeStyle = INK
      ctx.lineWidth = 18
      const cellW = width / 6, cellH = height / 3
      const icon = (col, row, draw) => {
        ctx.save()
        ctx.translate(col * cellW + cellW / 2, row * cellH + cellH / 2)
        draw(78)
        ctx.restore()
      }
      const circle = (r) => { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke() }
      icon(0,0,r=>{circle(r);circle(22);ctx.beginPath();ctx.moveTo(-105,0);ctx.lineTo(-70,0);ctx.moveTo(70,0);ctx.lineTo(105,0);ctx.moveTo(0,-105);ctx.lineTo(0,-70);ctx.moveTo(0,70);ctx.lineTo(0,105);ctx.stroke()})
      icon(1,0,r=>{circle(r);ctx.beginPath();ctx.moveTo(-105,0);ctx.lineTo(105,0);ctx.moveTo(0,-105);ctx.lineTo(0,105);ctx.stroke()})
      icon(2,0,r=>{ctx.beginPath();ctx.moveTo(-70,-80);ctx.lineTo(78,70);ctx.moveTo(70,-80);ctx.lineTo(-78,70);ctx.moveTo(-90,90);ctx.lineTo(-54,54);ctx.moveTo(90,90);ctx.lineTo(54,54);ctx.stroke()})
      icon(3,0,r=>{for(let i=-50;i<=50;i+=50){ctx.beginPath();ctx.moveTo(-50,i);ctx.lineTo(80,i);ctx.moveTo(-88,i);ctx.lineTo(-88,i+.1);ctx.stroke()}})
      icon(4,0,r=>{circle(r);ctx.beginPath();ctx.ellipse(0,0,36,78,0,0,Math.PI*2);ctx.moveTo(-78,0);ctx.lineTo(78,0);ctx.stroke()})
      icon(5,0,r=>{circle(r);ctx.font='150px BangersLocal';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=INK;ctx.fillText('i',0,12)})
      icon(0,1,r=>{ctx.beginPath();ctx.moveTo(0,-80);ctx.lineTo(0,80);ctx.moveTo(-80,0);ctx.lineTo(80,0);ctx.stroke()})
      icon(1,1,r=>{ctx.beginPath();ctx.moveTo(45,-82);ctx.lineTo(-45,0);ctx.lineTo(45,82);ctx.stroke()})
      icon(2,1,r=>{ctx.beginPath();ctx.arc(0,0,78,.2,Math.PI*1.7);ctx.lineTo(30,-90);ctx.moveTo(0,-78);ctx.lineTo(30,-90);ctx.stroke()})
      icon(3,1,r=>{ctx.beginPath();ctx.moveTo(-90,-45);ctx.bezierCurveTo(-25,-45,25,45,90,45);ctx.moveTo(-90,45);ctx.bezierCurveTo(-25,45,25,-45,90,-45);ctx.moveTo(58,-78);ctx.lineTo(92,-45);ctx.lineTo(58,-12);ctx.moveTo(58,12);ctx.lineTo(92,45);ctx.lineTo(58,78);ctx.stroke()})
      icon(4,1,r=>{ctx.beginPath();ctx.moveTo(-80,0);ctx.lineTo(-25,55);ctx.lineTo(85,-65);ctx.stroke()})
      icon(5,1,r=>{ctx.strokeRect(-55,-48,110,112);ctx.beginPath();ctx.moveTo(-70,-48);ctx.lineTo(70,-48);ctx.moveTo(-35,-70);ctx.lineTo(35,-70);ctx.stroke()})
      icon(0,2,r=>{ctx.strokeRect(-58,-70,70,140);ctx.beginPath();ctx.moveTo(-10,0);ctx.lineTo(82,0);ctx.moveTo(50,-34);ctx.lineTo(84,0);ctx.lineTo(50,34);ctx.stroke()})
      icon(1,2,r=>{ctx.beginPath();ctx.arc(0,12,72,-.75,Math.PI*1.75);ctx.moveTo(0,-92);ctx.lineTo(0,-20);ctx.stroke()})
      icon(2,2,r=>{ctx.beginPath();ctx.moveTo(-90,-40);ctx.lineTo(65,-40);ctx.lineTo(35,-70);ctx.moveTo(65,-40);ctx.lineTo(35,-10);ctx.moveTo(90,40);ctx.lineTo(-65,40);ctx.lineTo(-35,10);ctx.moveTo(-65,40);ctx.lineTo(-35,70);ctx.stroke()})
      icon(3,2,r=>{ctx.beginPath();ctx.moveTo(-55,-82);ctx.lineTo(-55,85);ctx.moveTo(-50,-76);ctx.lineTo(70,-45);ctx.lineTo(-50,-12);ctx.stroke()})
      icon(4,2,r=>{ctx.beginPath();ctx.moveTo(-90,-42);ctx.lineTo(-42,-42);ctx.lineTo(10,-84);ctx.lineTo(10,84);ctx.lineTo(-42,42);ctx.lineTo(-90,42);ctx.moveTo(42,-45);ctx.quadraticCurveTo(78,0,42,45);ctx.moveTo(70,-75);ctx.quadraticCurveTo(124,0,70,75);ctx.stroke()})
      icon(5,2,r=>{ctx.beginPath();ctx.moveTo(-90,-42);ctx.lineTo(-42,-42);ctx.lineTo(10,-84);ctx.lineTo(10,84);ctx.lineTo(-42,42);ctx.lineTo(-90,42);ctx.moveTo(55,-55);ctx.lineTo(112,55);ctx.moveTo(112,-55);ctx.lineTo(55,55);ctx.stroke()})
    }

    if (name === 'ui-ship-chips') {
      const lengths = [270, 225, 185, 185, 135, 90]
      let x = 55
      for (let i = 0; i < lengths.length; i++) {
        const w = lengths[i], y = 256, h = 52 - i * 2
        const pts = [[x, y], [x + 25, y - h], [x + w - 25, y - h * .85], [x + w, y], [x + w - 25, y + h * .85], [x + 25, y + h]]
        fillStrokePoly(pts, BLUE, INK, 13)
        ctx.strokeStyle = WHITE
        ctx.lineWidth = 8
        ctx.beginPath()
        ctx.moveTo(x + 48, y)
        ctx.lineTo(x + w - 54, y)
        ctx.stroke()
        ctx.strokeStyle = INK
        ctx.lineWidth = 7
        ctx.beginPath()
        ctx.moveTo(x + w * .32, y - 18); ctx.lineTo(x + w * .42, y - 30)
        ctx.moveTo(x + w * .56, y + 20); ctx.lineTo(x + w * .68, y + 28)
        if (i < 4) ctx.strokeRect(x + w * .5, y - h - 23, 36, 24)
        ctx.stroke()
        x += w + 42
      }
    }

    if (name === 'ui-grid-markers') {
      const cell = 256
      ctx.translate(0, 0)
      ctx.strokeStyle = INK
      ctx.lineWidth = 9
      ctx.fillStyle = BLUE
      ctx.beginPath(); ctx.ellipse(128,128,48,30,0,0,Math.PI*2); ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(76,75);ctx.lineTo(58,52);ctx.moveTo(171,72);ctx.lineTo(195,46);ctx.stroke()
      const splat = (cx, fill, bigger) => {
        const pts = []
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2
          const r = (i % 2 ? 52 : bigger) + j(10)
          pts.push([cx + Math.cos(a) * r, 128 + Math.sin(a) * r])
        }
        fillStrokePoly(pts, fill, INK, 10)
      }
      splat(384, AMBER, 95)
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(384,128,28,0,Math.PI*2); ctx.fill()
      splat(640, RED, 104)
      ctx.strokeStyle = INK; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(608,120); ctx.lineTo(672,98); ctx.moveTo(674,142); ctx.bezierCurveTo(700,162,682,191,718,205); ctx.stroke()
    }

    if (name === 'ui-spinner-frames') {
      const cell = 128
      for (let i = 0; i < 8; i++) {
        const cx = i * cell + 64, cy = 64
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate((i * Math.PI) / 4)
        ctx.fillStyle = PAPER_SHADE
        ctx.strokeStyle = INK
        ctx.lineWidth = 14
        ctx.beginPath(); ctx.arc(0,0,38,0,Math.PI*2); ctx.fill(); ctx.stroke()
        ctx.lineWidth = 16
        ctx.strokeStyle = RED
        ctx.beginPath(); ctx.arc(0,0,38,-Math.PI/2,0); ctx.stroke()
        ctx.strokeStyle = AMBER
        ctx.beginPath(); ctx.arc(0,0,38,0,Math.PI/4); ctx.stroke()
        ctx.strokeStyle = INK
        ctx.lineWidth = 5
        for (let t = 0; t < 3; t++) {
          ctx.beginPath()
          ctx.moveTo(-50 - t * 6, -12 + t * 10)
          ctx.lineTo(-66 - t * 7, -18 + t * 10)
          ctx.stroke()
        }
        ctx.restore()
      }
    }

	    const imageData = ctx.getImageData(0, 0, width, height).data
	    let alphaPixels = 0
	    for (let i = 3; i < imageData.length; i += 4) {
	      if (imageData[i] > 0) alphaPixels += 1
	    }

	    return {
	      alphaPixels,
	      png: canvas.toDataURL('image/png').split(',')[1],
	      webp: canvas.toDataURL('image/webp', 0.86).split(',')[1],
	    }
	  }, { name, width, height })

	  if (result.alphaPixels === 0) {
	    throw new Error(`${name} rendered empty`)
	  }

  await writeFile(path.join(sourceDir, `${name}.png`), Buffer.from(result.png, 'base64'))
  await writeFile(path.join(runtimeDir, `${name}.webp`), Buffer.from(result.webp, 'base64'))
  console.log(`${name}: ${width}x${height}`)
}

await browser.close()
