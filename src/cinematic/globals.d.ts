/** Hooks the offline frame renderer (scripts/render-cinematic.mjs) drives. */
interface Window {
  /** Renders exactly one frame for absolute clip time `t` (seconds). */
  __seek?: (t: number) => void
  /** True once every model/texture has loaded and the first frame is drawn. */
  __ready?: boolean
  /** Clip length in seconds. */
  __duration?: number
}
