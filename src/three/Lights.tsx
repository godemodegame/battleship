/** Shared scene lighting for the practice battle and on-chain placement canvases. */
export function Lights({ shadows = true }: { shadows?: boolean }) {
  return (
    <>
      <ambientLight color="#26384a" intensity={0.55} />
      <directionalLight
        color="#cfeefc"
        intensity={2.4}
        position={[7, 13, 6]}
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0004}
      />
      <directionalLight color="#FF2EA6" intensity={1.1} position={[-9, 5, -16]} />
      <pointLight color="#FFB000" intensity={5} distance={11} position={[4.5, 2.2, 10.5]} />
      <pointLight color="#21F4FF" intensity={2.5} distance={12} position={[-6.5, 3.5, -1.5]} />
    </>
  )
}
