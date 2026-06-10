import * as THREE from 'three'
import { useMemo } from 'react'
import type { Orientation, ShipClassId } from '../game/types'
import { CELL, SHIP_MODEL, useNormalizedModel } from './models'

interface ShipProps {
  classId: ShipClassId
  length: number
  row: number
  col: number
  orientation: Orientation
  /** 'fleet' = player's live ship, 'sunk' = charred, 'ghost' = placement preview */
  variant?: 'fleet' | 'sunk' | 'ghost'
  ghostValid?: boolean
}

/** Center of the covered cells in board-local space. */
function shipTransform(length: number, row: number, col: number, orientation: Orientation) {
  const endRow = row + (orientation === 'v' ? length - 1 : 0)
  const endCol = col + (orientation === 'h' ? length - 1 : 0)
  const x = ((col + endCol) / 2 - 4.5) * CELL
  const z = ((row + endRow) / 2 - 4.5) * CELL
  return { x, z, rotY: orientation === 'h' ? 0 : Math.PI / 2 }
}

export function Ship({ classId, length, row, col, orientation, variant = 'fleet', ghostValid }: ShipProps) {
  const model = useNormalizedModel(SHIP_MODEL[classId], length * CELL * 0.92, 0.55 + 0.3 * length)
  const instance = useMemo(() => {
    const clone = model.clone(true)
    if (variant === 'sunk') {
      const charred = new THREE.MeshStandardMaterial({
        color: '#1a1216',
        roughness: 0.9,
        metalness: 0.2,
        emissive: '#FF2EA6',
        emissiveIntensity: 0.14,
      })
      clone.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) (obj as THREE.Mesh).material = charred
      })
    } else if (variant === 'ghost') {
      const ghost = new THREE.MeshStandardMaterial({
        color: ghostValid ? '#0e3640' : '#3a0d18',
        emissive: ghostValid ? '#21F4FF' : '#FF3B30',
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
      clone.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh
          mesh.material = ghost
          mesh.castShadow = false
        }
      })
    }
    return clone
  }, [model, variant, ghostValid])

  const { x, z, rotY } = shipTransform(length, row, col, orientation)
  return (
    <group position={[x, variant === 'sunk' ? -0.06 : 0.06, z]} rotation-y={rotY}>
      <primitive object={instance} />
      {variant === 'fleet' && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
          <planeGeometry args={[length * CELL * 0.98, CELL * 0.98]} />
          <meshBasicMaterial color="#21F4FF" transparent opacity={0.07} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
