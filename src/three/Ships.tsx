import { useMemo } from "react";
import * as THREE from "three";
import { PlacedShip } from "../game/types";
import { CELL, cellCenter } from "./layout";
import { fitToFootprint, stylize, useModel, useModelTexture } from "./models";

// Renders the player's placed fleet as real 3D models on the fleet board.
// Sunk ships can be tinted; individually-hit segments are marked by the board.

function ShipModel({
  ship,
  accent,
  sunk,
}: {
  ship: PlacedShip;
  accent: "player" | "enemy";
  sunk: boolean;
}) {
  const fbx = useModel(ship.model);
  const tex = useModelTexture(ship.model);

  const object = useMemo(() => {
    const fitted = fitToFootprint(fbx, ship.length, CELL);
    stylize(fitted, tex.clone(), sunk ? "enemy" : accent);
    if (sunk) {
      fitted.traverse((c) => {
        const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (m) {
          m.emissive = new THREE.Color("#ff2e3a");
          m.emissiveIntensity = 0.5;
          m.color = new THREE.Color("#5a5a66");
        }
      });
    }
    return fitted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbx, tex, ship.id, ship.orientation, sunk]);

  // Anchor at the ship's first cell; footprint extends along +X (horizontal)
  // or +Z (vertical). fitToFootprint centers the model on its footprint, so
  // we offset to the footprint midpoint.
  const mid = (ship.length - 1) / 2;
  const base =
    ship.orientation === "horizontal"
      ? cellCenter(ship.x + mid, ship.y, 0.02)
      : cellCenter(ship.x, ship.y + mid, 0.02);
  const rotY = ship.orientation === "horizontal" ? 0 : Math.PI / 2;

  return (
    <group position={base} rotation={[0, rotY, 0]}>
      <primitive object={object} />
    </group>
  );
}

export function Ships({
  ships,
  accent = "player",
  sunkNames = [],
}: {
  ships: PlacedShip[];
  accent?: "player" | "enemy";
  sunkNames?: string[];
}) {
  return (
    <group>
      {ships.map((s) => (
        <ShipModel
          key={s.id}
          ship={s}
          accent={accent}
          sunk={sunkNames.includes(s.id)}
        />
      ))}
    </group>
  );
}
