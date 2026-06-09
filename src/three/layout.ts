import * as THREE from "three";
import { BOARD_SIZE } from "../game/types";

export const CELL = 1; // world units per board cell
export const HALF = (BOARD_SIZE * CELL) / 2;

/** World-space center of cell (x, y) on the board plane (XZ, y-up). */
export function cellCenter(x: number, y: number, height = 0): THREE.Vector3 {
  return new THREE.Vector3(
    (x - (BOARD_SIZE - 1) / 2) * CELL,
    height,
    (y - (BOARD_SIZE - 1) / 2) * CELL,
  );
}

/** Map a local point on the board plane back to integer cell coords. */
export function pointToCell(localX: number, localZ: number) {
  const x = Math.round(localX / CELL + (BOARD_SIZE - 1) / 2);
  const y = Math.round(localZ / CELL + (BOARD_SIZE - 1) / 2);
  return { x, y };
}
