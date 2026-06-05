'use client'

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { ContactShadows, Environment, Grid, Lightformer, RoundedBox, useGLTF, useTexture } from '@react-three/drei'
import { animated, useSpring } from '@react-spring/three'
import type { DJSet } from '@/types/dj-set'

type CrateSceneProps = {
  sets: DJSet[]
  selectedId: string
  openId: string | null
  dissolved: boolean
  reducedMotion: boolean
  onSelect: (id: string) => void
  onStep: (offset: number) => void
}

/* ---------------------------------------------------------------------------
 * The crate is a real asset (public/models/milk_crate.glb). Records are still
 * placeholder primitives (cover-art textures land in Phase 4), but their size,
 * count, and seating are DERIVED from the measured crate so they nest inside it
 * regardless of the model's native scale/orientation.
 * ------------------------------------------------------------------------- */

const MODEL_URL = '/models/milk_crate.glb'

// 1×1 transparent PNG — keeps useTexture's input non-empty if no covers exist.
const BLANK_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// Sleeves are thin; the crate is packed.
const RECORD_DEPTH = 0.018
const RECORD_GAP = 0.006
const SLEEVE_PITCH = RECORD_DEPTH + RECORD_GAP

// Record fit, as fractions of the measured crate (tune these to taste). Sleeves
// are SQUARE (album proportions): height equals width.
const FIT_WIDTH = 0.84 // sleeve width vs crate inner width
const FIT_DEPTH = 0.84 // packed span vs crate inner depth
const FIT_FLOOR = 0.06 // how high the stack's base sits vs crate height

const CRATE_TARGET_WIDTH = 1.3 // scene units the crate's footprint maps to
const CRATE_COLOR = '#0024cc' // classic blue milk crate

type CrateMetrics = {
  scale: number
  width: number
  height: number
  depth: number
  offset: [number, number, number]
}

type SleeveProps = {
  z: number
  width: number
  height: number
  color: string
  cover?: THREE.Texture
  active: boolean
  opened: boolean
  dissolve: boolean
  openLift: number
  immediate: boolean
  onSelect?: () => void
}

// One spine that animates itself. A single spring drives every level of state:
//  - focused (`active`): springs up a little in place, subtle scale + emissive.
//  - opened (the hero): springs up out of the crate, recenters to z = 0, and
//    rotates the cover face toward the camera (rotation-y → π/2, since the
//    camera sits on +x).
//  - dissolve: once it's clear of the crate it evaporates — scales up, flares
//    emissive, and fades to nothing, handing off to the ambient field.
// Closing reverses the same timeline.
function Sleeve({
  z,
  width,
  height,
  color,
  cover,
  active,
  opened,
  dissolve,
  openLift,
  immediate,
  onSelect,
}: SleeveProps) {
  const selectable = Boolean(onSelect)
  const [hovered, setHovered] = useState(false)

  const { posY, posZ, rotY, scale, emissive, opacity } = useSpring({
    posY: opened ? openLift : active ? height * 0.35 : 0,
    posZ: opened ? 0 : z,
    rotY: opened ? Math.PI / 2 : 0,
    // Opened record keeps its real size (only the in-crate focus gets a nudge).
    scale: opened ? 1 : active ? 1.04 : 1,
    emissive: dissolve ? 0.7 : opened ? 0.24 : active ? 0.16 : 0,
    opacity: dissolve ? 0 : 1,
    immediate,
    config: { tension: 200, friction: 24 },
  })

  // Pointer cursor while hovering a selectable spine.
  useEffect(() => {
    if (!hovered) return
    document.body.style.cursor = 'pointer'
    return () => {
      document.body.style.cursor = 'auto'
    }
  }, [hovered])

  // The cover material can't be `animated.*` (a Texture prop blows up the spring
  // typings), so sync the front/back covers' opacity from the spring each frame.
  const coverFront = useRef<THREE.MeshStandardMaterial>(null)
  const coverBack = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(() => {
    const o = opacity.get()
    if (coverFront.current) coverFront.current.opacity = o
    if (coverBack.current) coverBack.current.opacity = o
  })

  return (
    <animated.group
      position-z={posZ}
      position-y={posY}
      rotation-y={rotY}
      scale={scale}
      onPointerOver={
        selectable
          ? (e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation()
              setHovered(true)
            }
          : undefined
      }
      onPointerOut={selectable ? () => setHovered(false) : undefined}
      onClick={
        selectable
          ? (e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              onSelect?.()
            }
          : undefined
      }
    >
      <RoundedBox
        args={[width, height, RECORD_DEPTH]}
        radius={0.004}
        smoothness={3}
        castShadow
        receiveShadow
      >
        <animated.meshStandardMaterial
          color={color}
          roughness={0.55}
          metalness={0}
          envMapIntensity={0.7}
          emissive={color}
          emissiveIntensity={emissive}
          transparent
          opacity={opacity}
        />
      </RoundedBox>
      {/* Cover art on both large faces (+z front, -z back). The crate view sees
          the spine edge-on, so spines stay solid color; the cover reveals on the
          open-spin. The back plane is flipped to face outward. */}
      {cover && (
        <>
          <mesh position={[0, 0, RECORD_DEPTH / 2 + 0.001]}>
            <planeGeometry args={[width, height]} />
            <meshStandardMaterial
              ref={coverFront}
              map={cover}
              roughness={0.58}
              metalness={0}
              transparent
            />
          </mesh>
          <mesh position={[0, 0, -RECORD_DEPTH / 2 - 0.001]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[width, height]} />
            <meshStandardMaterial
              ref={coverBack}
              map={cover}
              roughness={0.58}
              metalness={0}
              transparent
            />
          </mesh>
        </>
      )}
    </animated.group>
  )
}

function Records({
  sets,
  crate,
  selectedId,
  openId,
  dissolved,
  reducedMotion,
  onSelect,
}: {
  sets: DJSet[]
  crate: CrateMetrics
  selectedId: string
  openId: string | null
  dissolved: boolean
  reducedMotion: boolean
  onSelect: (id: string) => void
}) {
  // Load each unique cover once (three caches by URL); center-crop the 16:9
  // thumbnail to the square sleeve face. `coverUrls` is non-empty in practice,
  // but fall back to a blank pixel so the hook always gets a valid input.
  const coverUrls = useMemo(
    () => Array.from(new Set(sets.map((s) => s.cover).filter((c): c is string => Boolean(c)))),
    [sets],
  )
  const coverInput: string[] = coverUrls.length ? coverUrls : [BLANK_PIXEL]
  const textures = useTexture(coverInput) as THREE.Texture[]
  const coverByUrl = useMemo(() => {
    const map: Record<string, THREE.Texture> = {}
    if (!coverUrls.length) return map
    coverUrls.forEach((url, i) => {
      const tex = textures[i]
      tex.colorSpace = THREE.SRGBColorSpace
      tex.center.set(0.5, 0.5)
      tex.repeat.set(9 / 16, 1) // crop sides → centered square
      tex.needsUpdate = true
      map[url] = tex
    })
    return map
  }, [coverUrls, textures])

  const recW = crate.width * FIT_WIDTH
  const recH = recW // square sleeves (album proportions)
  const bottomY = crate.height * FIT_FLOOR
  // Every record is a real, selectable set. Pack them at SLEEVE_PITCH and, if the
  // crate is shallower than the row needs, tighten the pitch so they still fit.
  const availDepth = crate.depth * FIT_DEPTH
  const pitch =
    sets.length > 1
      ? Math.min(SLEEVE_PITCH, availDepth / (sets.length - 1))
      : SLEEVE_PITCH
  const span = (sets.length - 1) * pitch
  const seatY = bottomY + recH / 2
  // World-relative y for the opened record: floats clearly above the crate rim.
  // (seatY is the group origin, so subtract it to get the local offset.)
  const openLift = crate.height + recH * 0.6 - seatY

  return (
    <group position={[0, seatY, 0]}>
      {sets.map((set, index) => {
        // Camera sits on the +z side, so +z reads as screen-left. Lay records
        // out with index increasing toward screen-RIGHT so ArrowRight (onStep+1)
        // moves the focus right, matching the key.
        const z = span / 2 - index * pitch
        return (
          <Sleeve
            key={set.id}
            z={z}
            width={recW}
            height={recH}
            color={set.color}
            cover={set.cover ? coverByUrl[set.cover] : undefined}
            active={set.id === selectedId}
            opened={set.id === openId}
            dissolve={set.id === openId && dissolved}
            openLift={openLift}
            immediate={reducedMotion}
            onSelect={() => onSelect(set.id)}
          />
        )
      })}
    </group>
  )
}

function CrateAndRecords({
  sets,
  selectedId,
  openId,
  dissolved,
  reducedMotion,
  onSelect,
}: {
  sets: DJSet[]
  selectedId: string
  openId: string | null
  dissolved: boolean
  reducedMotion: boolean
  onSelect: (id: string) => void
}) {
  const { scene } = useGLTF(MODEL_URL)
  // Clone so we can flag shadows without mutating the cached original.
  const model = useMemo(() => {
    const clone = scene.clone(true)
    const blue = new THREE.Color(CRATE_COLOR)
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
        // Clone the material so recoloring doesn't touch the cached asset, and
        // give it a molded-plastic finish that catches the studio environment.
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
        mat.color = blue
        mat.roughness = 0.62
        mat.metalness = 0
        mat.envMapIntensity = 0.3
        mesh.material = mat
      }
    })
    return clone
  }, [scene])

  // Measure the model (respecting its baked transforms) and derive a scale that
  // maps its footprint to CRATE_TARGET_WIDTH, sitting the base on y = 0.
  const crate = useMemo<CrateMetrics>(() => {
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const scale = CRATE_TARGET_WIDTH / Math.max(size.x, size.z)
    return {
      scale,
      width: size.x * scale,
      height: size.y * scale,
      depth: size.z * scale,
      offset: [-center.x * scale, -box.min.y * scale, -center.z * scale],
    }
  }, [model])

  return (
    <group>
      <primitive object={model} scale={crate.scale} position={crate.offset} />
      <Records
        sets={sets}
        crate={crate}
        selectedId={selectedId}
        openId={openId}
        dissolved={dissolved}
        reducedMotion={reducedMotion}
        onSelect={onSelect}
      />
    </group>
  )
}

useGLTF.preload(MODEL_URL)

/* Locked side view — records read as a row of spines (seen edge-on), pulled
 * back so the whole crate sits comfortably in frame. This is our canonical
 * camera; everything in later phases is composed against it. */
const CAMERA_POSITION: [number, number, number] = [6.8, 2.9, 1.9]
const CAMERA_TARGET: [number, number, number] = [0, 0.55, 0]

function LockedCamera() {
  const camera = useThree((state) => state.camera)
  useLayoutEffect(() => {
    camera.position.set(...CAMERA_POSITION)
    camera.lookAt(...CAMERA_TARGET)
    camera.updateProjectionMatrix()
  }, [camera])
  return null
}

export function CrateScene({
  sets,
  selectedId,
  openId,
  dissolved,
  reducedMotion,
  onSelect,
  onStep,
}: CrateSceneProps) {
  // Browse with Left/Right (the page clamps stepping over djSets indices);
  // Up opens the focused record (pull out + play), Down closes it.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onStep(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        onStep(1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        // onSelect(selectedId) opens the focused record; guard so a repeat Up
        // doesn't toggle it back shut.
        if (selectedId && selectedId !== openId) onSelect(selectedId)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (openId) onSelect(openId) // clicking the opened record closes it
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onStep, onSelect, selectedId, openId])

  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      camera={{ fov: 30 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <LockedCamera />
      <Suspense fallback={null}>
        {/* Soft studio fill — local Lightformers, no HDRI download. */}
        <Environment resolution={256}>
          <Lightformer intensity={1.1} position={[0, 5, 1]} rotation={[-Math.PI / 2, 0, 0]} scale={[10, 10, 1]} />
          <Lightformer intensity={0.7} position={[5, 2, 4]} rotation={[0, -Math.PI / 3, 0]} scale={[5, 5, 1]} />
          <Lightformer intensity={0.4} position={[-5, 1, -3]} rotation={[0, Math.PI / 3, 0]} scale={[5, 5, 1]} />
        </Environment>

        <ambientLight intensity={0.3} />
        <directionalLight
          position={[5, 7, 4]}
          intensity={1.05}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0002}
          shadow-normalBias={0.02}
          shadow-radius={7}
        />

        <CrateAndRecords
          sets={sets}
          selectedId={selectedId}
          openId={openId}
          dissolved={dissolved}
          reducedMotion={reducedMotion}
          onSelect={onSelect}
        />

        {/* Subtle tiled floor — faint grout lines that recede with distance.
            All lines share one light-gray tone so the tiles read as uniform; the
            distance fade keeps it from ever feeling like full opacity. */}
        <Grid
          position={[0, 0.001, 0]}
          args={[30, 30]}
          cellSize={0.2}
          cellThickness={0.7}
          cellColor="#b0b0b0"
          sectionSize={1}
          sectionThickness={0.7}
          sectionColor="#b0b0b0"
          fadeDistance={13}
          fadeStrength={1.5}
          infiniteGrid
          side={THREE.DoubleSide}
        />

        {/* Invisible floor that catches the key light's shadow (the white "floor"
            is just the page behind the transparent canvas, so without this the
            crate casts onto nothing). ShadowMaterial only darkens shadowed
            fragments, so the tiles show through everywhere else. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
          <planeGeometry args={[30, 30]} />
          <shadowMaterial transparent opacity={0.16} color="#15151f" />
        </mesh>

        {/* Soft ambient contact directly under the crate, on top of the cast. */}
        <ContactShadows
          position={[0, 0.002, 0]}
          opacity={0.22}
          scale={7}
          blur={2.6}
          far={3}
          resolution={1024}
          color="#1c1c2e"
        />
      </Suspense>
    </Canvas>
  )
}
