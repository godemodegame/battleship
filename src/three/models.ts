import * as THREE from 'three'
import { useMemo } from 'react'
import { useFBX, useTexture } from '@react-three/drei'
import type { ShipClassId } from '../game/types'

/**
 * The runtime FBX assets ship at arbitrary export scales and orientations,
 * so every model is normalized from its bounding box: recentred, scaled to a
 * target footprint, rotated so the hull runs along +X, and grounded at y=0.
 */

export const CELL = 1.04

const MODEL = (name: string) => `/models/${name}.fbx`
const TEXTURE = (name: string) => `/textures/${name}-texture.jpg`
const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

// Exported FBX files reference source-tool texture folders that are not part
// of the runtime bundle. Their materials are replaced below, so satisfy those
// redundant loader requests without reporting false asset failures.
THREE.DefaultLoadingManager.setURLModifier((url) =>
  url.includes('.fbm/') || url.includes('.fbm\\') ? TRANSPARENT_PIXEL : url,
)

export function useStyledFBX(name: string): THREE.Group {
  const fbx = useFBX(MODEL(name))
  const map = useTexture(TEXTURE(name))
  return useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 4
    const clone = fbx.clone(true)
    const material = new THREE.MeshStandardMaterial({
      map,
      roughness: 0.72,
      metalness: 0.28,
    })
    clone.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh
        mesh.material = material
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    return clone
  }, [fbx, map])
}

/**
 * Wraps a model in a group whose local space is normalized: hull along +X,
 * centered at the origin in XZ, base resting on y=0, longest XZ side equal
 * to `targetLength`.
 */
function normalize(model: THREE.Object3D, targetLength: number, maxHeight?: number): THREE.Group {
  const inner = new THREE.Group()
  inner.add(model)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  model.position.sub(center)
  if (size.z > size.x) inner.rotation.y = Math.PI / 2

  const length = Math.max(size.x, size.z, 1e-6)
  let scale = targetLength / length
  if (maxHeight && size.y * scale > maxHeight) scale = maxHeight / size.y

  const outer = new THREE.Group()
  outer.add(inner)
  inner.scale.setScalar(scale)
  // Re-measure after rotation/scale so the keel sits exactly on the deck.
  const normBox = new THREE.Box3().setFromObject(inner)
  inner.position.y = -normBox.min.y
  return outer
}

export function useNormalizedModel(name: string, targetLength: number, maxHeight?: number): THREE.Group {
  const styled = useStyledFBX(name)
  return useMemo(() => normalize(styled, targetLength, maxHeight), [styled, targetLength, maxHeight])
}

export const SHIP_MODEL: Record<ShipClassId, string> = {
  'carrier': 'ship-carrier',
  'battleship': 'ship-battleship',
  'cruiser': 'ship-cruiser',
  'destroyer': 'ship-destroyer',
  'submarine': 'ship-submarine',
  'patrol-boat': 'ship-patrol-boat',
}

export const DESTROYED_SHIP_MODEL: Record<ShipClassId, string> = {
  'carrier': 'ship-carrier-destroyed',
  'battleship': 'ship-battleship-destroyed',
  'cruiser': 'ship-cruiser-destroyed',
  'destroyer': 'ship-destroyer-destroyed',
  'submarine': 'ship-submarine-destroyed',
  'patrol-boat': 'ship-patrol-boat-destroyed',
}

/** Board-local position of a cell center, origin at the board center. */
export function cellPosition(row: number, col: number): [number, number] {
  return [(col - 4.5) * CELL, (row - 4.5) * CELL]
}

/** Just the assets the placement board needs: live hulls plus the hero base. */
export function preloadPlacement() {
  for (const name of [...Object.values(SHIP_MODEL), 'tactical-ocean-board']) {
    useFBX.preload(MODEL(name))
    useTexture.preload(TEXTURE(name))
  }
}

export function preloadAll() {
  for (const name of [
    ...Object.values(SHIP_MODEL),
    ...Object.values(DESTROYED_SHIP_MODEL),
    'tactical-ocean-board',
    'attack-projectile',
    'hidden-enemy-grid-cell',
    'prop-encrypted-core',
    'prop-turn-token',
  ]) {
    useFBX.preload(MODEL(name))
    useTexture.preload(TEXTURE(name))
  }
}
