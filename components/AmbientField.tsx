'use client'

import { useMemo } from 'react'

/* The ambient "now playing" background: a few large, heavily-blurred color
 * blobs derived from the record's own palette (`set.color`), drifting slowly so
 * the field has movement. The actual video plays crisp in front; the crate sits
 * dim behind a glass blur. Colors are per-record DATA, so they're applied via
 * inline style (correctly bypassing the tokens/no-raw-colors class-string rule).
 */

type Hsl = { h: number; s: number; l: number }

function hexToHsl(hex: string): Hsl | null {
  let m = hex.trim().replace('#', '')
  if (m.length === 3) m = m.replace(/(.)/g, '$1$1')
  if (m.length !== 6 || /[^0-9a-f]/i.test(m)) return null
  const r = parseInt(m.slice(0, 2), 16) / 255
  const g = parseInt(m.slice(2, 4), 16) / 255
  const b = parseInt(m.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const l = (max + min) / 2
  let h = 0
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4
    }
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: s * 100, l: l * 100 }
}

type Blob = {
  color: string
  x: string
  y: string
  width: string
  height: string
  radius: string
  keyframe: 'A' | 'B' | 'C'
  morph: 'A' | 'B'
  duration: number
  morphDuration: number
  delay: number
}

// Two organic radius presets, used as the static (reduced-motion) shape; the
// blobMorph keyframes wobble around these while animating.
const RADII = [
  '62% 38% 46% 54% / 60% 49% 51% 40%',
  '48% 52% 60% 40% / 56% 42% 58% 44%',
]

// Layout is fixed; only the hues rotate around the record's base hue. `aspect`
// stretches each blob off-circle, and the irregular radius makes it organic.
const LAYOUT = [
  { dh: 0, l: 62, x: '4%', y: '6%', size: 58, aspect: 0.82, keyframe: 'A', morph: 'A', duration: 15, morphDuration: 11, delay: 0 },
  { dh: 28, l: 56, x: '56%', y: '0%', size: 50, aspect: 1.22, keyframe: 'B', morph: 'B', duration: 19, morphDuration: 13, delay: -5 },
  { dh: -26, l: 58, x: '30%', y: '42%', size: 64, aspect: 0.9, keyframe: 'C', morph: 'A', duration: 23, morphDuration: 17, delay: -11 },
  { dh: 52, l: 66, x: '68%', y: '50%', size: 46, aspect: 1.32, keyframe: 'A', morph: 'B', duration: 17, morphDuration: 9, delay: -8 },
  { dh: -50, l: 50, x: '-10%', y: '56%', size: 54, aspect: 0.74, keyframe: 'B', morph: 'A', duration: 21, morphDuration: 15, delay: -3 },
] as const

function buildField(color: string): { base: string; blobs: Blob[] } {
  const hsl = hexToHsl(color) ?? { h: 150, s: 35, l: 55 } // sane greenish fallback
  const sat = Math.min(80, Math.max(45, hsl.s))
  const blobs: Blob[] = LAYOUT.map((b, i) => ({
    color: `hsl(${(((hsl.h + b.dh) % 360) + 360) % 360} ${sat}% ${b.l}%)`,
    x: b.x,
    y: b.y,
    width: `${b.size}vmax`,
    height: `${Math.round(b.size * b.aspect)}vmax`,
    radius: RADII[i % RADII.length],
    keyframe: b.keyframe,
    morph: b.morph,
    duration: b.duration,
    morphDuration: b.morphDuration,
    delay: b.delay,
  }))
  const base = `hsl(${hsl.h} ${Math.round(sat * 0.5)}% 46%)`
  return { base, blobs }
}

type AmbientFieldProps = {
  color: string
  reduced?: boolean
  className?: string
}

export function AmbientField({ color, reduced = false, className = '' }: AmbientFieldProps) {
  const { base, blobs } = useMemo(() => buildField(color), [color])

  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{
        backgroundColor: base,
        animation: reduced ? undefined : 'ambientHue 18s ease-in-out infinite',
      }}
      aria-hidden
    >
      {blobs.map((blob, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: blob.x,
            top: blob.y,
            width: blob.width,
            height: blob.height,
            // Irregular outline (the soft edge comes from the blur); the morph
            // keyframe wobbles this while running, this value is the still shape.
            borderRadius: blob.radius,
            background: blob.color,
            opacity: 0.85,
            filter: 'blur(70px)',
            willChange: 'transform, border-radius',
            animation: reduced
              ? undefined
              : `ambientDrift${blob.keyframe} ${blob.duration}s ease-in-out ${blob.delay}s infinite, blobMorph${blob.morph} ${blob.morphDuration}s ease-in-out ${blob.delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}
