/**
 * Player display settings: reduced motion + graphics quality (GAME-807).
 *
 * Persisted in localStorage — these are device preferences, not match or
 * account data, and contain nothing private. Quality follows the planned
 * modes in `docs/mobile-performance-budget.md` ("Graphics Quality Modes"):
 *
 * | Mode   | dpr | Antialias | Shadows | Ocean              |
 * | Low    | 1   | off       | off     | static (no waves)  |
 * | Medium | 1.5 | on        | on      | animated shader    |
 * | High   | 2   | on        | on      | animated shader    |
 *
 * 'auto' resolves to Medium on coarse-pointer (phone/tablet) devices and High
 * on desktop. Motion 'system' follows `prefers-reduced-motion`.
 */

import { useEffect, useState } from 'react'
import { create } from 'zustand'

export type MotionSetting = 'system' | 'reduced' | 'full'
export type QualitySetting = 'auto' | 'low' | 'medium' | 'high'
export type QualityLevel = Exclude<QualitySetting, 'auto'>

export interface QualityProfile {
  /** Device-pixel-ratio cap passed to the Canvas. */
  dpr: number
  antialias: boolean
  shadows: boolean
  /** When false the ocean shader time stays frozen (flat, no waves). */
  oceanAnimated: boolean
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  low: { dpr: 1, antialias: false, shadows: false, oceanAnimated: false },
  medium: { dpr: 1.5, antialias: true, shadows: true, oceanAnimated: true },
  high: { dpr: 2, antialias: true, shadows: true, oceanAnimated: true },
}

const STORAGE_KEY = 'settings:display:v1'

interface PersistedSettings {
  motion?: MotionSetting
  quality?: QualitySetting
}

function loadPersisted(): Required<PersistedSettings> {
  const defaults = { motion: 'system' as MotionSetting, quality: 'auto' as QualitySetting }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as PersistedSettings
    return {
      motion: ['system', 'reduced', 'full'].includes(parsed.motion as string)
        ? (parsed.motion as MotionSetting)
        : defaults.motion,
      quality: ['auto', 'low', 'medium', 'high'].includes(parsed.quality as string)
        ? (parsed.quality as QualitySetting)
        : defaults.quality,
    }
  } catch {
    return defaults
  }
}

function persist(motion: MotionSetting, quality: QualitySetting): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ motion, quality }))
  } catch {
    // Storage unavailable: settings stay session-local.
  }
}

export interface SettingsState {
  motion: MotionSetting
  quality: QualitySetting
  setMotion: (motion: MotionSetting) => void
  setQuality: (quality: QualitySetting) => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadPersisted(),
  setMotion: (motion) => {
    set({ motion })
    persist(motion, get().quality)
  },
  setQuality: (quality) => {
    set({ quality })
    persist(get().motion, quality)
  },
}))

/** The OS-level reduced-motion preference (false where unsupported). */
export function systemPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** True when animations should be minimized right now. */
export function isReducedMotion(
  motion: MotionSetting,
  systemPref: boolean = systemPrefersReducedMotion(),
): boolean {
  if (motion === 'reduced') return true
  if (motion === 'full') return false
  return systemPref
}

/** True for touch-first devices (phones/tablets); drives the 'auto' default. */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/** Resolve the 'auto' setting per the performance budget defaults. */
export function resolveQualityLevel(
  quality: QualitySetting,
  coarsePointer: boolean = isCoarsePointer(),
): QualityLevel {
  if (quality !== 'auto') return quality
  return coarsePointer ? 'medium' : 'high'
}

export function qualityProfile(
  quality: QualitySetting,
  coarsePointer: boolean = isCoarsePointer(),
): QualityProfile {
  return QUALITY_PROFILES[resolveQualityLevel(quality, coarsePointer)]
}

/** Reactive reduced-motion flag: in-app setting + live system preference. */
export function useReducedMotion(): boolean {
  const motion = useSettingsStore((state) => state.motion)
  const [systemPref, setSystemPref] = useState(systemPrefersReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setSystemPref(query.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])

  return isReducedMotion(motion, systemPref)
}
