import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

/**
 * Dark glass water per the style guide: near-black base, drifting cyan and
 * magenta neon glints, kept as one cheap full-scene quad (no reflections,
 * mobile-safe).
 */
const vertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragment = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorld;

  float wave(vec2 p, vec2 dir, float freq, float speed) {
    return sin(dot(p, dir) * freq + uTime * speed);
  }

  void main() {
    vec2 p = vWorld.xz;
    float w = 0.0;
    w += wave(p, vec2(0.8, 0.6), 0.55, 0.6) * 0.5;
    w += wave(p, vec2(-0.5, 0.9), 0.85, 0.42) * 0.3;
    w += wave(p, vec2(0.2, -1.0), 1.6, 0.85) * 0.2;

    vec3 base = mix(vec3(0.027, 0.031, 0.051), vec3(0.063, 0.090, 0.106), 0.5 + 0.5 * w);

    // Neon glints riding the wave crests.
    float crest = smoothstep(0.55, 0.95, w);
    vec3 cyan = vec3(0.129, 0.957, 1.0);
    vec3 magenta = vec3(1.0, 0.18, 0.65);
    float hueShift = 0.5 + 0.5 * sin(p.x * 0.12 + uTime * 0.2);
    base += crest * mix(cyan, magenta, hueShift) * 0.16;

    // Fade brightness away from the play area so edges melt into fog.
    float dist = length(p) / 60.0;
    base *= 1.0 - smoothstep(0.35, 1.0, dist) * 0.85;

    gl_FragColor = vec4(base, 1.0);
  }
`

export function Ocean() {
  const material = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])
  useFrame((_, dt) => {
    if (material.current) material.current.uniforms.uTime.value += dt
  })
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.22}>
      <planeGeometry args={[160, 160]} />
      <shaderMaterial ref={material} vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} />
    </mesh>
  )
}
