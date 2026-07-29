import * as THREE from 'three'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { easing } from 'maath'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { Ocean } from '../three/Ocean'
import { SHIP_MODEL, useNormalizedModel } from '../three/models'
import { glowTexture, puffTexture, ringTexture } from './textures'
import {
  CINEMATIC_SHIPS,
  DURATION,
  SHAKE_GAIN,
  HULL_SIZE,
  IMPACT_POINT,
  IMPACT_T,
  SHIP_SLOTS,
  cameraShake,
  desiredCamera,
  fadeAmount,
  flightU,
  missilePosition,
  missileTangent,
  timeAtU,
  type CameraAngle,
  type CinematicShip,
} from './timeline'

const clamp01 = (x: number) => THREE.MathUtils.clamp(x, 0, 1)
const smooth = (x: number, a: number, b: number) => THREE.MathUtils.smoothstep(x, a, b)

const TRAIL_COUNT = 80
const FLAME_COUNT = 16
const SPARK_COUNT = 90
const COLUMN_COUNT = 26
const FIREBALL_COUNT = 14

/**
 * Brighter, more directional relight of the game's night palette: the in-game
 * rig is tuned for a top-down board, this one has to carry hulls seen from a
 * chase camera a few metres off the water.
 */
function CinematicLights() {
  return (
    <>
      <ambientLight color="#3d5878" intensity={1.15} />
      <hemisphereLight color="#22384f" groundColor="#05070c" intensity={0.85} />
      <directionalLight color="#dbeeff" intensity={3.4} position={[-16, 13, -9]} />
      <directionalLight color="#8fd7ff" intensity={1.1} position={[6, 7, -18]} />
      <directionalLight color="#FF2EA6" intensity={1.5} position={[13, 5, 15]} />
      <pointLight color="#21F4FF" intensity={40} distance={34} decay={2} position={[-9, 4, 9]} />
    </>
  )
}

function Fleet({ target }: { target: CinematicShip }) {
  const others = CINEMATIC_SHIPS.filter((id) => id !== target)
  return (
    <>
      <Hull id={target} slot={0} />
      <Hull id={others[0]} slot={1} />
      <Hull id={others[1]} slot={2} />
    </>
  )
}

function Hull({ id, slot }: { id: CinematicShip; slot: number }) {
  const size = HULL_SIZE[id]
  const model = useNormalizedModel(SHIP_MODEL[id], size.length, size.height)
  const { position, rotationY } = SHIP_SLOTS[slot]
  const bob = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    if (!bob.current) return
    const t = clock.elapsedTime
    const phase = slot * 2.1
    bob.current.position.y = position[1] + Math.sin(t * 0.55 + phase) * 0.055
    bob.current.rotation.z = Math.sin(t * 0.42 + phase) * 0.012
    bob.current.rotation.x = Math.sin(t * 0.33 + phase * 1.7) * 0.008
  })

  return (
    <group ref={bob} position={position} rotation-y={rotationY}>
      <primitive object={model} />
    </group>
  )
}

/** The warhead: hull model, hot nozzle, and the light it drags across the sea. */
function Missile() {
  const model = useNormalizedModel('attack-projectile', 1.55)
  const glow = glowTexture()
  const group = useRef<THREE.Group>(null)
  const nozzle = useRef<THREE.Sprite>(null)
  const light = useRef<THREE.PointLight>(null)
  const position = useMemo(() => new THREE.Vector3(), [])
  const ahead = useMemo(() => new THREE.Vector3(), [])
  const tangent = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (!group.current) return
    const alive = t < IMPACT_T
    group.current.visible = alive
    if (light.current) light.current.intensity = alive ? 26 : 0
    if (!alive) return

    missilePosition(t, position)
    missileTangent(t, tangent)
    group.current.position.copy(position)
    group.current.lookAt(ahead.copy(position).add(tangent))
    // Slow roll so the silhouette reads as a body in flight, not a decal.
    group.current.rotateZ(t * 1.1)
    if (nozzle.current) {
      const flicker = 0.62 + Math.sin(t * 41) * 0.06 + Math.sin(t * 17.3) * 0.04
      nozzle.current.scale.set(flicker, flicker, 1)
    }
  })

  return (
    <group ref={group}>
      <group rotation-y={-Math.PI / 2}>
        <primitive object={model} />
      </group>
      <sprite ref={nozzle} position={[0, 0, -0.95]} renderOrder={10}>
        <spriteMaterial
          map={glow}
          color="#FFC169"
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
      <pointLight ref={light} color="#FFA43C" intensity={26} distance={16} decay={2} />
      {/* Small key on the body itself so the warhead reads against black water. */}
      <pointLight color="#cfe4ff" intensity={14} distance={5.5} decay={2} position={[1.1, 0.9, 1.2]} />
    </group>
  )
}

/**
 * Persistent exhaust: smoke pinned to fixed points along the flight path, each
 * revealed as the missile passes it, plus a short additive flame at the nozzle.
 */
function ExhaustTrail() {
  const glow = glowTexture()
  const smoke = useRef<(THREE.Sprite | null)[]>([])
  const flames = useRef<(THREE.Sprite | null)[]>([])

  const puffs = useMemo(
    () =>
      Array.from({ length: TRAIL_COUNT }, (_, i) => {
        const u = (i + 0.5) / TRAIL_COUNT
        const position = new THREE.Vector3()
        missilePosition(timeAtU(u), position)
        position.add(
          new THREE.Vector3(
            Math.sin(i * 12.9898) * 0.2,
            Math.sin(i * 4.1414) * 0.12,
            Math.sin(i * 7.233) * 0.2,
          ),
        )
        return {
          born: timeAtU(u),
          position,
          drift: 0.3 + Math.abs(Math.sin(i * 3.77)) * 0.45,
          map: puffTexture(i % 6),
          spin: Math.sin(i * 9.13) * 0.6,
        }
      }),
    [],
  )

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    puffs.forEach((puff, i) => {
      const sprite = smoke.current[i]
      if (!sprite) return
      const age = t - puff.born
      if (age <= 0) {
        sprite.visible = false
        return
      }
      sprite.visible = true
      const life = clamp01(age / 3)
      const material = sprite.material as THREE.SpriteMaterial
      material.opacity = smooth(age, 0, 0.12) * (1 - smooth(life, 0.3, 1)) * 0.4
      const grow = 0.55 + life * 3.1
      sprite.scale.set(grow, grow, 1)
      sprite.position.set(
        puff.position.x,
        puff.position.y + age * puff.drift * 0.4,
        puff.position.z,
      )
      material.rotation = puff.spin * age * 0.3
      // Freshly shed exhaust still carries the flame's warmth.
      const cool = smooth(age, 0.05, 0.55)
      material.color.setRGB(
        THREE.MathUtils.lerp(1, 0.52, cool),
        THREE.MathUtils.lerp(0.72, 0.58, cool),
        THREE.MathUtils.lerp(0.45, 0.62, cool),
      )
    })

    const u = flightU(t)
    for (let i = 0; i < FLAME_COUNT; i++) {
      const sprite = flames.current[i]
      if (!sprite) continue
      const back = u - (i + 1) * 0.0016
      const alive = t < IMPACT_T && back > 0
      sprite.visible = alive
      if (!alive) continue
      missilePosition(timeAtU(back), sprite.position)
      const k = i / FLAME_COUNT
      const scale = 0.62 - k * 0.4
      sprite.scale.set(scale, scale, 1)
      const material = sprite.material as THREE.SpriteMaterial
      material.opacity = Math.pow(1 - k, 1.6) * 0.5 * (0.88 + Math.sin(t * 47 + i) * 0.12)
      material.color.setRGB(1, 0.66 - k * 0.24, 0.3 - k * 0.22)
    }
  })

  return (
    <group>
      {puffs.map((puff, i) => (
        <sprite
          key={`smoke-${i}`}
          ref={(node) => {
            smoke.current[i] = node
          }}
          visible={false}
          renderOrder={8}
        >
          <spriteMaterial
            map={puff.map}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </sprite>
      ))}
      {Array.from({ length: FLAME_COUNT }, (_, i) => (
        <sprite
          key={`flame-${i}`}
          ref={(node) => {
            flames.current[i] = node
          }}
          visible={false}
          renderOrder={9}
        >
          <spriteMaterial
            map={glow}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  )
}

/** Debris thrown out of the hull: additive points on ballistic arcs. */
function Sparks() {
  const glow = glowTexture()
  const points = useRef<THREE.Points>(null)

  const { geometry, seeds } = useMemo(() => {
    const tangent = missileTangent(IMPACT_T)
    const positions = new Float32Array(SPARK_COUNT * 3)
    const colors = new Float32Array(SPARK_COUNT * 3)
    const list = Array.from({ length: SPARK_COUNT }, (_, i) => {
      // Deterministic spray: a cone around the impact vector, biased upward.
      const a = i * 2.399963
      const r = Math.sqrt((i + 0.5) / SPARK_COUNT)
      const dir = new THREE.Vector3(Math.cos(a) * r, 0.55 + r * 0.9, Math.sin(a) * r)
        .add(tangent.clone().multiplyScalar(0.5))
        .normalize()
      return {
        dir,
        speed: 6 + ((i * 37) % 100) / 100 * 11,
        life: 0.55 + ((i * 53) % 100) / 100 * 0.85,
        warm: 0.5 + ((i * 17) % 100) / 100 * 0.5,
      }
    })
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    next.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return { geometry: next, seeds: list }
  }, [])

  useFrame(({ clock }) => {
    const node = points.current
    if (!node) return
    const a = clock.elapsedTime - IMPACT_T
    node.visible = a >= 0
    if (!node.visible) return

    const position = geometry.attributes.position as THREE.BufferAttribute
    const color = geometry.attributes.color as THREE.BufferAttribute
    for (let i = 0; i < SPARK_COUNT; i++) {
      const spark = seeds[i]
      const k = clamp01(a / spark.life)
      // Ease-out travel plus gravity — debris slows fast in air, then drops.
      const travel = spark.speed * spark.life * (1 - Math.pow(1 - k, 2.2)) * 0.5
      const drop = 4.6 * Math.pow(a, 2) * 0.5
      position.setXYZ(
        i,
        IMPACT_POINT.x + spark.dir.x * travel,
        IMPACT_POINT.y + spark.dir.y * travel - drop,
        IMPACT_POINT.z + spark.dir.z * travel,
      )
      const fade = (1 - smooth(k, 0.25, 1)) * (0.4 + spark.warm * 0.6)
      color.setXYZ(i, fade * 1.6, fade * (0.55 + spark.warm * 0.3), fade * 0.22)
    }
    position.needsUpdate = true
    color.needsUpdate = true
  })

  return (
    <points ref={points} geometry={geometry} visible={false} renderOrder={22}>
      <pointsMaterial
        map={glow}
        size={0.34}
        sizeAttenuation
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

/** Detonation: white core, expanding fireball, shockwave, smoke column, embers. */
function Detonation() {
  const glow = glowTexture()
  const ring = ringTexture()

  const core = useRef<THREE.Sprite>(null)
  const fireballs = useRef<(THREE.Sprite | null)[]>([])
  const shock = useRef<THREE.Mesh>(null)
  const column = useRef<(THREE.Sprite | null)[]>([])
  const light = useRef<THREE.PointLight>(null)

  const fireballSeeds = useMemo(
    () =>
      Array.from({ length: FIREBALL_COUNT }, (_, i) => ({
        delay: i * 0.022,
        offset: new THREE.Vector3(
          Math.sin(i * 5.31) * 0.85,
          Math.abs(Math.sin(i * 2.13)) * 0.7,
          Math.sin(i * 2.77 + 1.3) * 0.85,
        ),
        rise: 0.7 + Math.abs(Math.sin(i * 3.31)) * 1.1,
        scale: 0.85 + Math.abs(Math.sin(i * 6.7)) * 0.9,
      })),
    [],
  )

  const columnSeeds = useMemo(
    () =>
      Array.from({ length: COLUMN_COUNT }, (_, i) => ({
        delay: 0.08 + i * 0.052,
        offset: new THREE.Vector3(Math.sin(i * 5.31) * 1.5, 0, Math.sin(i * 2.77 + 1.3) * 1.5),
        rise: 1.0 + Math.abs(Math.sin(i * 4.9)) * 1.6,
        map: puffTexture(i % 6),
        spin: i % 2 === 0 ? 1 : -1,
      })),
    [],
  )

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const a = t - IMPACT_T
    const live = a >= 0

    if (core.current) {
      core.current.visible = live && a < 0.5
      if (core.current.visible) {
        const k = clamp01(a / 0.5)
        const pop = 1.2 + 3.4 * smooth(a, 0, 0.16)
        core.current.scale.set(pop, pop, 1)
        const material = core.current.material as THREE.SpriteMaterial
        material.opacity = 1 - smooth(k, 0.08, 1)
        material.color.setRGB(1, 0.92 - k * 0.35, 0.78 - k * 0.6)
      }
    }

    fireballSeeds.forEach((seed, i) => {
      const sprite = fireballs.current[i]
      if (!sprite) return
      const age = a - seed.delay
      sprite.visible = live && age > 0 && age < 1.0
      if (!sprite.visible) return
      const k = clamp01(age / 1.0)
      sprite.position.set(
        IMPACT_POINT.x + seed.offset.x * (0.5 + k * 1.5),
        IMPACT_POINT.y + seed.offset.y + age * seed.rise,
        IMPACT_POINT.z + seed.offset.z * (0.5 + k * 1.5),
      )
      const grow = seed.scale * (0.55 + k * 1.7)
      sprite.scale.set(grow, grow, 1)
      const material = sprite.material as THREE.SpriteMaterial
      material.opacity = smooth(age, 0, 0.06) * (1 - smooth(k, 0.15, 0.95)) * 0.95
      // White-hot → sodium orange → deep red as it burns out.
      material.color.setRGB(
        1,
        THREE.MathUtils.lerp(0.85, 0.16, smooth(k, 0, 0.55)),
        THREE.MathUtils.lerp(0.6, 0.04, smooth(k, 0, 0.3)),
      )
    })

    if (shock.current) {
      shock.current.visible = live && a < 1.5
      if (shock.current.visible) {
        const k = clamp01(a / 1.5)
        const scale = 2 + Math.pow(k, 0.62) * 15
        shock.current.scale.set(scale, scale, 1)
        const material = shock.current.material as THREE.MeshBasicMaterial
        material.opacity = 0.26 * (1 - smooth(k, 0.03, 0.7))
      }
    }

    columnSeeds.forEach((seed, i) => {
      const sprite = column.current[i]
      if (!sprite) return
      const age = a - seed.delay
      sprite.visible = live && age > 0
      if (!sprite.visible) return
      const life = clamp01(age / 2.6)
      sprite.position.set(
        IMPACT_POINT.x + seed.offset.x * (0.35 + life * 1.3),
        IMPACT_POINT.y + 0.25 + age * seed.rise,
        IMPACT_POINT.z + seed.offset.z * (0.35 + life * 1.3),
      )
      const grow = 1.1 + life * 3.4
      sprite.scale.set(grow, grow, 1)
      const material = sprite.material as THREE.SpriteMaterial
      material.opacity = smooth(age, 0, 0.2) * (1 - smooth(life, 0.6, 1)) * 0.55
      material.rotation = age * 0.2 * seed.spin
      const cool = smooth(life, 0, 0.45)
      material.color.setRGB(
        THREE.MathUtils.lerp(1, 0.36, cool),
        THREE.MathUtils.lerp(0.5, 0.4, cool),
        THREE.MathUtils.lerp(0.22, 0.46, cool),
      )
    })

    if (light.current) {
      const burst = live ? Math.max(0, 1 - a / 0.55) : 0
      const ember = live ? 0.22 + Math.sin(t * 11) * 0.06 + Math.sin(t * 4.3) * 0.04 : 0
      light.current.intensity = 620 * burst * burst + 80 * ember
    }
  })

  return (
    <group>
      <sprite ref={core} position={IMPACT_POINT} visible={false} renderOrder={24}>
        <spriteMaterial
          map={glow}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
      {fireballSeeds.map((_, i) => (
        <sprite
          key={`fire-${i}`}
          ref={(node) => {
            fireballs.current[i] = node
          }}
          visible={false}
          renderOrder={23}
        >
          <spriteMaterial
            map={glow}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}
      <mesh
        ref={shock}
        position={[IMPACT_POINT.x, 0.06, IMPACT_POINT.z]}
        rotation-x={-Math.PI / 2}
        visible={false}
        renderOrder={18}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={ring}
          color="#FFD2A0"
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {columnSeeds.map((seed, i) => (
        <sprite
          key={`column-${i}`}
          ref={(node) => {
            column.current[i] = node
          }}
          visible={false}
          renderOrder={21}
        >
          <spriteMaterial
            map={seed.map}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </sprite>
      ))}
      <pointLight
        ref={light}
        color="#FF7A2A"
        intensity={0}
        distance={70}
        decay={2}
        position={[IMPACT_POINT.x, IMPACT_POINT.y + 0.5, IMPACT_POINT.z]}
      />
      <Sparks />
    </group>
  )
}

/** Damped rig. Fed a fixed delta by the seek loop, so it stays reproducible. */
function CameraRig({ angle }: { angle: CameraAngle }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const position = useRef(new THREE.Vector3())
  const target = useRef(new THREE.Vector3())
  const shake = useMemo(() => new THREE.Vector3(), [])
  const seeded = useRef(false)

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    const pose = desiredCamera(t, angle)
    if (pose.damping <= 0) {
      // Rigid angles (weapon-cam, hard cuts) must land exactly on the pose.
      position.current.copy(pose.position)
      target.current.copy(pose.target)
      seeded.current = true
    } else if (!seeded.current) {
      // First frame snaps, otherwise the rig would swing in from the origin.
      position.current.copy(pose.position)
      target.current.copy(pose.target)
      seeded.current = true
    } else {
      const step = THREE.MathUtils.clamp(dt, 0, 0.1)
      easing.damp3(position.current, pose.position, pose.damping, step)
      easing.damp3(target.current, pose.target, pose.damping * 1.2, step)
    }
    cameraShake(t, SHAKE_GAIN[angle], shake)
    camera.position.copy(position.current).add(shake)
    camera.lookAt(target.current)
    if (Math.abs(camera.fov - pose.fov) > 1e-4) {
      camera.fov = pose.fov
      camera.updateProjectionMatrix()
    }
  })

  return null
}

const gradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uFade: { value: 1 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uFade;
    uniform float uTime;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      // Bloom leaves values above 1.0; the contrast curve below is only
      // defined on [0,1], so clamp before grading.
      vec3 color = clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0);
      // Gentle S-curve plus a cold shadow tint for the night-sea look.
      color = mix(color, color * color * (3.0 - 2.0 * color), 0.22);
      color += vec3(-0.004, 0.004, 0.016) * (1.0 - color);

      float vignette = smoothstep(1.15, 0.30, length(vUv - 0.5) * 1.34);
      color *= mix(0.68, 1.0, vignette);

      color += (hash(vUv * 1200.0 + uTime * 61.0) - 0.5) * 0.018;
      color *= (1.0 - uFade);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
}

/** Owns rendering (priority > 0 disables R3F's own render call). */
function Post() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const { composer, grade } = useMemo(() => {
    const next = new EffectComposer(gl)
    next.addPass(new RenderPass(scene, camera))
    next.addPass(
      new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.72, 0.72, 0.78),
    )
    const gradePass = new ShaderPass(gradeShader)
    gradePass.renderToScreen = true
    next.addPass(gradePass)
    return { composer: next, grade: gradePass }
  }, [gl, scene, camera, size.width, size.height])

  useEffect(() => {
    composer.setPixelRatio(dpr)
    composer.setSize(size.width, size.height)
  }, [composer, dpr, size.width, size.height])

  useEffect(() => () => composer.dispose(), [composer])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    grade.uniforms.uFade.value = fadeAmount(t)
    grade.uniforms.uTime.value = t
    composer.render()
  }, 1)

  return null
}

/** Exposes the deterministic seek entry point used by the offline renderer. */
function SeekBridge() {
  const advance = useThree((s) => s.advance)

  useEffect(() => {
    window.__seek = (t: number) => advance(THREE.MathUtils.clamp(t, 0, DURATION))
    window.__duration = DURATION
    window.__seek(0)
    // Warm-up frame so shaders compile and the rig seeds before capture.
    window.__seek(0.0001)
    window.__ready = true
    return () => {
      window.__ready = false
    }
  }, [advance])

  return null
}

export function CinematicScene({
  ship,
  angle,
  dpr,
}: {
  ship: CinematicShip
  angle: CameraAngle
  dpr: number
}) {
  return (
    <Canvas
      frameloop="never"
      dpr={dpr}
      gl={{
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      }}
      camera={{ fov: 34, near: 0.1, far: 400, position: [-47, 10, -32] }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.6
        scene.background = new THREE.Color('#05060B')
        scene.fog = new THREE.Fog('#0A1018', 38, 145)
      }}
    >
      <Suspense fallback={null}>
        <CinematicLights />
        <Ocean animated reflections reflectionSize={1024} />
        <Fleet target={ship} />
        <Missile />
        <ExhaustTrail />
        <Detonation />
        <CameraRig angle={angle} />
        <Post />
        <SeekBridge />
      </Suspense>
    </Canvas>
  )
}
