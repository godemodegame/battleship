import * as THREE from "three";
import { useFBX, useTexture } from "@react-three/drei";
import { ModelKey } from "../game/types";

// All runtime models are the user-provided FBX assets in /public/models with
// their matching /public/textures jpg. (Runtime GLB was the doc target, but no
// converter is available, so we load FBX directly — the files are small.)

export const MODEL_FILES = {
  board: "tactical-ocean-board",
  projectile: "attack-projectile",
  hiddenCell: "hidden-enemy-grid-cell",
  turnToken: "prop-turn-token",
  encryptedCore: "prop-encrypted-core",
  carrier: "ship-carrier",
  battleship: "ship-battleship",
  cruiser: "ship-cruiser",
  destroyer: "ship-destroyer",
  submarine: "ship-submarine",
  "patrol-boat": "ship-patrol-boat",
} as const;

export type ModelName = keyof typeof MODEL_FILES;

export const SHIP_MODELS: ModelKey[] = [
  "carrier",
  "battleship",
  "cruiser",
  "destroyer",
  "submarine",
  "patrol-boat",
];

export const modelPath = (n: ModelName) => `/models/${MODEL_FILES[n]}.fbx`;
export const texturePath = (n: ModelName) => `/textures/${MODEL_FILES[n]}-texture.jpg`;

// Preload everything so the Field Loading gate reflects real progress.
export function preloadAll() {
  (Object.keys(MODEL_FILES) as ModelName[]).forEach((n) => {
    useFBX.preload(modelPath(n));
  });
}

const accentFor: Record<string, THREE.ColorRepresentation> = {
  player: "#0a3a44",
  enemy: "#3a0a2a",
  neutral: "#0a2a3a",
};

/**
 * Replace FBX materials with stylized standard materials carrying the asset's
 * texture plus a faint neon emissive, per docs/visual-style-guide.md.
 */
export function stylize(
  obj: THREE.Object3D,
  texture: THREE.Texture | null,
  accent: keyof typeof accentFor = "neutral",
) {
  if (texture) texture.colorSpace = THREE.SRGBColorSpace;
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.material = new THREE.MeshStandardMaterial({
      map: texture ?? undefined,
      color: texture ? 0xffffff : 0x9fb6c4,
      metalness: 0.55,
      roughness: 0.5,
      emissive: new THREE.Color(accentFor[accent]),
      emissiveIntensity: 0.45,
    });
  });
  return obj;
}

/**
 * Fit an object into a footprint of `length` cells along +X (horizontal),
 * resting on y=0 and centered on the footprint. Robust to any native FBX
 * scale/orientation by measuring the bounding box.
 */
export function fitToFootprint(
  source: THREE.Object3D,
  length: number,
  cell: number,
): THREE.Group {
  const obj = source.clone(true);
  // Reset transforms before measuring.
  obj.position.set(0, 0, 0);
  obj.rotation.set(0, 0, 0);
  obj.scale.set(1, 1, 1);

  let box = new THREE.Box3().setFromObject(obj);
  let size = box.getSize(new THREE.Vector3());

  // Orient longest horizontal axis to +X.
  if (size.z > size.x) {
    obj.rotation.y = Math.PI / 2;
    box = new THREE.Box3().setFromObject(obj);
    size = box.getSize(new THREE.Vector3());
  }

  const targetLen = length * cell * 0.9;
  const targetWidth = cell * 0.78;
  const scaleByLen = targetLen / (size.x || 1);
  const scaleByWidth = targetWidth / (size.z || 1);
  const s = Math.min(scaleByLen, scaleByWidth);
  obj.scale.setScalar(s);

  // Recenter on footprint origin, base on the surface.
  box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.x -= center.x;
  obj.position.z -= center.z;
  obj.position.y -= box.min.y;

  const wrap = new THREE.Group();
  wrap.add(obj);
  return wrap;
}

/**
 * Scale an object so its larger horizontal dimension equals `maxWidth`,
 * centered on origin with its base resting at `baseY`. Used for the board
 * backdrop and decorative props.
 */
export function fitWithin(
  source: THREE.Object3D,
  maxWidth: number,
  baseY = 0,
): THREE.Group {
  const obj = source.clone(true);
  obj.position.set(0, 0, 0);
  obj.rotation.set(0, 0, 0);
  obj.scale.set(1, 1, 1);
  let box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = maxWidth / (Math.max(size.x, size.z) || 1);
  obj.scale.setScalar(s);
  box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.x -= center.x;
  obj.position.z -= center.z;
  obj.position.y -= box.min.y - baseY;
  const wrap = new THREE.Group();
  wrap.add(obj);
  return wrap;
}

/** Convenience hooks used inside Suspense boundaries. */
export function useModel(name: ModelName) {
  return useFBX(modelPath(name));
}
export function useModelTexture(name: ModelName) {
  return useTexture(texturePath(name));
}
