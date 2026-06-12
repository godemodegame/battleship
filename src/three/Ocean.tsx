import * as THREE from 'three'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Reflector } from 'three/addons/objects/Reflector.js'

const OCEAN_SIZE = 160
const OCEAN_SEGMENTS = 128
const OCEAN_Y = -0.22

const blackReflection = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
blackReflection.needsUpdate = true

/**
 * Layered dark-water surface. The large swells displace a moderately
 * subdivided mesh while smaller ripples only perturb the fragment normal, so
 * the silhouette, reflections, and specular response move at different scales.
 */
const vertex = /* glsl */ `
  uniform float uTime;
  uniform mat4 textureMatrix;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;
  varying float vSlope;
  varying vec4 vReflectionCoord;

  const float TAU = 6.28318530718;

  void addWave(
    vec2 p,
    vec2 direction,
    float amplitude,
    float wavelength,
    float speed,
    inout float height,
    inout vec2 gradient
  ) {
    vec2 dir = normalize(direction);
    float frequency = TAU / wavelength;
    float phase = dot(p, dir) * frequency + uTime * speed;
    height += sin(phase) * amplitude;
    gradient += cos(phase) * amplitude * frequency * dir;
  }

  void main() {
    vec3 displaced = position;
    vec2 p = position.xy;
    float height = 0.0;
    vec2 gradient = vec2(0.0);

    addWave(p, vec2(1.0, 0.32), 0.095, 13.0, 0.42, height, gradient);
    addWave(p, vec2(-0.38, 1.0), 0.065, 8.2, 0.58, height, gradient);
    addWave(p, vec2(0.72, -1.0), 0.040, 4.6, 0.78, height, gradient);
    addWave(p, vec2(-1.0, -0.18), 0.022, 2.7, 1.08, height, gradient);

    displaced.z += height;
    vec3 localNormal = normalize(vec3(-gradient.x, -gradient.y, 1.0));
    vec4 world = modelMatrix * vec4(displaced, 1.0);

    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * localNormal);
    vHeight = height;
    vSlope = length(gradient);
    vReflectionCoord = textureMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragment = /* glsl */ `
  uniform float uTime;
  uniform sampler2D tDiffuse;
  uniform float uReflectionStrength;
  uniform vec2 uReflectionTexel;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;
  varying float vSlope;
  varying vec4 vReflectionCoord;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 p = vWorld.xz;
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float cameraDistance = length(cameraPosition - vWorld);

    // Fine capillary ripples disappear with distance to avoid horizon shimmer.
    float detailFade = 1.0 - smoothstep(18.0, 54.0, cameraDistance);
    vec2 rippleGradient = vec2(0.0);
    vec2 d1 = normalize(vec2(0.92, 0.38));
    vec2 d2 = normalize(vec2(-0.44, 0.90));
    vec2 d3 = normalize(vec2(0.27, -0.96));
    float r1 = dot(p, d1) * 3.8 + uTime * 1.70;
    float r2 = dot(p, d2) * 5.7 + uTime * 2.05;
    float r3 = dot(p, d3) * 8.4 + uTime * 2.65;
    rippleGradient += cos(r1) * d1 * 0.075;
    rippleGradient += cos(r2) * d2 * 0.045;
    rippleGradient += cos(r3) * d3 * 0.025;

    vec3 normal = normalize(vNormal - vec3(rippleGradient.x, 0.0, rippleGradient.y) * detailFade);
    float facing = clamp(dot(normal, viewDir), 0.0, 1.0);
    float fresnel = 0.025 + 0.975 * pow(1.0 - facing, 5.0);

    // Approximate the reflected night sky without an environment-map pass.
    vec3 reflected = reflect(-viewDir, normal);
    float skyElevation = clamp(reflected.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 horizonSky = vec3(0.028, 0.042, 0.052);
    vec3 zenithSky = vec3(0.004, 0.006, 0.014);
    vec3 sky = mix(horizonSky, zenithSky, smoothstep(0.18, 0.95, skyElevation));

    // Keep the original near-black / muted petrol palette.
    vec3 deepWater = vec3(0.007, 0.009, 0.018);
    vec3 litWater = vec3(0.034, 0.048, 0.057);
    float waterLight = 0.12 + (1.0 - facing) * 0.25 + vHeight * 0.42;
    vec3 water = mix(deepWater, litWater, clamp(waterLight, 0.0, 1.0));
    vec3 color = mix(water, sky, fresnel * 0.56);

    // True planar reflection of the platform and ships. Projective sampling
    // follows the mirrored camera, while wave normals break up the image.
    vec3 projected = vReflectionCoord.xyz / max(vReflectionCoord.w, 0.0001);
    vec2 distortion = normal.xz * (0.010 + vSlope * 0.025) * detailFade;
    vec2 reflectionUv = projected.xy + distortion;
    float reflectionBounds =
      step(0.002, reflectionUv.x) * step(reflectionUv.x, 0.998) *
      step(0.002, reflectionUv.y) * step(reflectionUv.y, 0.998);
    vec2 blur = uReflectionTexel * (1.2 + vSlope * 5.0);
    vec3 sceneReflection = texture2D(tDiffuse, reflectionUv).rgb * 0.40;
    sceneReflection += texture2D(tDiffuse, reflectionUv + vec2(blur.x, 0.0)).rgb * 0.15;
    sceneReflection += texture2D(tDiffuse, reflectionUv - vec2(blur.x, 0.0)).rgb * 0.15;
    sceneReflection += texture2D(tDiffuse, reflectionUv + vec2(0.0, blur.y)).rgb * 0.15;
    sceneReflection += texture2D(tDiffuse, reflectionUv - vec2(0.0, blur.y)).rgb * 0.15;
    sceneReflection *= vec3(0.72, 0.84, 0.92);
    float reflectionMix = uReflectionStrength * reflectionBounds * (0.10 + fresnel * 0.72);
    color = mix(color, sceneReflection, reflectionMix);

    // Cold key-light sparkle plus restrained cyan/magenta city reflections.
    vec3 keyDir = normalize(vec3(0.42, 0.82, 0.38));
    vec3 halfVector = normalize(keyDir + viewDir);
    float keyGlint = pow(max(dot(normal, halfVector), 0.0), 150.0);
    float broadGlint = pow(max(dot(normal, halfVector), 0.0), 28.0);
    color += vec3(0.70, 0.85, 0.92) * keyGlint * 0.42;
    color += vec3(0.06, 0.28, 0.32) * broadGlint * 0.05;

    float cyanBand = pow(max(dot(normal, normalize(vec3(-0.40, 0.88, 0.24))), 0.0), 72.0);
    float magentaBand = pow(max(dot(normal, normalize(vec3(0.58, 0.79, -0.20))), 0.0), 86.0);
    color += vec3(0.129, 0.957, 1.0) * cyanBand * 0.05;
    color += vec3(1.0, 0.18, 0.65) * magentaBand * 0.025;

    // Sparse broken foam catches only the steepest high crests.
    vec2 foamCell = floor(p * 1.8);
    float foamNoise = hash21(foamCell) * 0.65 + hash21(foamCell + 7.3) * 0.35;
    float crest = smoothstep(0.115, 0.205, vHeight);
    float steep = smoothstep(0.08, 0.18, vSlope);
    float foam = crest * steep * smoothstep(0.48, 0.78, foamNoise);
    color = mix(color, vec3(0.50, 0.66, 0.68), foam * 0.14);

    // Blend into the same blue-black as the scene fog at the horizon.
    float fog = smoothstep(31.0, 68.0, cameraDistance);
    color = mix(color, vec3(0.027, 0.031, 0.051), fog);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function oceanUniforms(reflectionStrength: number, reflectionSize = 1) {
  return {
    color: { value: new THREE.Color('#07080D') },
    tDiffuse: { value: blackReflection },
    textureMatrix: { value: new THREE.Matrix4() },
    uTime: { value: 0 },
    uReflectionStrength: { value: reflectionStrength },
    uReflectionTexel: { value: new THREE.Vector2(1 / reflectionSize, 1 / reflectionSize) },
  }
}

function StaticOcean({ animated }: { animated: boolean }) {
  const material = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(() => oceanUniforms(0), [])
  // GAME-807: low quality / reduced motion freezes the shader time, leaving a
  // static dark-glass surface with no per-frame uniform updates.
  useFrame((_, dt) => {
    if (animated && material.current) material.current.uniforms.uTime.value += dt
  })
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={OCEAN_Y}>
      <planeGeometry args={[OCEAN_SIZE, OCEAN_SIZE, OCEAN_SEGMENTS, OCEAN_SEGMENTS]} />
      <shaderMaterial
        ref={material}
        vertexShader={vertex}
        fragmentShader={fragment}
        uniforms={uniforms}
        toneMapped
      />
    </mesh>
  )
}

function ReflectedOcean({ animated, reflectionSize }: { animated: boolean; reflectionSize: number }) {
  const [reflector, setReflector] = useState<Reflector | null>(null)

  useEffect(() => {
    const geometry = new THREE.PlaneGeometry(
      OCEAN_SIZE,
      OCEAN_SIZE,
      OCEAN_SEGMENTS,
      OCEAN_SEGMENTS,
    )
    const next = new Reflector(geometry, {
      textureWidth: reflectionSize,
      textureHeight: reflectionSize,
      clipBias: 0.002,
      multisample: 0,
      shader: {
        name: 'BattleshipOceanReflection',
        uniforms: oceanUniforms(0.64, reflectionSize),
        vertexShader: vertex,
        fragmentShader: fragment,
      },
    })
    setReflector(next)
    return () => {
      geometry.dispose()
      next.dispose()
    }
  }, [reflectionSize])

  useFrame((_, dt) => {
    if (animated && reflector) {
      const material = reflector.material as THREE.ShaderMaterial
      material.uniforms.uTime.value += dt
    }
  })

  if (!reflector) return <StaticOcean animated={animated} />
  return <primitive object={reflector} rotation-x={-Math.PI / 2} position-y={OCEAN_Y} />
}

interface OceanProps {
  animated?: boolean
  reflections?: boolean
  reflectionSize?: number
}

export function Ocean({
  animated = true,
  reflections = false,
  reflectionSize = 512,
}: OceanProps) {
  return reflections
    ? <ReflectedOcean animated={animated} reflectionSize={reflectionSize} />
    : <StaticOcean animated={animated} />
}
