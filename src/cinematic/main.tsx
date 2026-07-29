import { createRoot } from 'react-dom/client'
import { CinematicScene } from './CinematicScene'
import {
  CAMERA_ANGLES,
  CINEMATIC_SHIPS,
  type CameraAngle,
  type CinematicShip,
} from './timeline'

/**
 * Dev-only entry for the offline missile-strike render. It is deliberately kept
 * out of the production bundle: vite's default build input is index.html, so
 * cinematic.html only exists on the dev server.
 */

const params = new URLSearchParams(window.location.search)

const requested = params.get('ship') as CinematicShip | null
const ship: CinematicShip =
  requested && CINEMATIC_SHIPS.includes(requested) ? requested : 'carrier'

const requestedAngle = params.get('angle') as CameraAngle | null
const angle: CameraAngle =
  requestedAngle && CAMERA_ANGLES.includes(requestedAngle) ? requestedAngle : 'chase'

// The window stays small so it fits any display; the WebGL backing store is
// scaled up by dpr instead, and frames are read straight off the canvas.
const dpr = Number(params.get('dpr') ?? 2)

// No StrictMode here: its double-mount would re-run the seek bridge and make
// frame capture non-deterministic.
createRoot(document.getElementById('root')!).render(
  <CinematicScene ship={ship} angle={angle} dpr={dpr} />,
)
