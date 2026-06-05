'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { djSets } from '@/data/sets'
import type { DJSet } from '@/types/dj-set'
import { YouTubePlayer } from '@/components/YouTubePlayer'
import { AmbientField } from '@/components/AmbientField'

// R3F is client-only; load the canvas without SSR.
const CrateScene = dynamic(
  () => import('@/components/crate/CrateScene').then((m) => m.CrateScene),
  { ssr: false },
)

// How long the record takes to clear the crate before it dissolves and the
// ambient "now playing" field blooms in. Roughly matches the open spring.
const REMOVE_MS = 620
// Keep the playing overlay mounted briefly on close so it can fade out.
const EXIT_MS = 420

type OpenPhase = 'closed' | 'opening' | 'open'

export default function Home() {
  // Two-level interaction: `selectedId` is the focused record (springs up in the
  // crate); `openId` is the *opened* record (the hero — dissolves out and plays).
  const [selectedId, setSelectedId] = useState(djSets[0]?.id ?? '')
  const [openId, setOpenId] = useState<string | null>(null)

  const selectedIndex = useMemo(
    () => Math.max(0, djSets.findIndex((set) => set.id === selectedId)),
    [selectedId],
  )

  const selectByOffset = useCallback(
    (offset: number) => {
      setOpenId(null) // stepping focus closes any opened record
      const nextIndex = Math.min(
        djSets.length - 1,
        Math.max(0, selectedIndex + offset),
      )
      setSelectedId(djSets[nextIndex].id)
    },
    [selectedIndex],
  )

  // Click semantics: a new record focuses; the focused record opens; the opened
  // record closes.
  const handleSelect = useCallback(
    (id: string) => {
      if (id === openId) {
        setOpenId(null)
        return
      }
      if (id === selectedId) {
        setOpenId(id)
        return
      }
      setSelectedId(id)
      setOpenId(null)
    },
    [openId, selectedId],
  )

  const closeOpen = useCallback(() => setOpenId(null), [])

  const openSet = useMemo(
    () => djSets.find((set) => set.id === openId) ?? null,
    [openId],
  )

  // prefers-reduced-motion → snap instead of long springs / fades / drifts.
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // The open timeline: 'opening' (record rises) → 'open' (record dissolves, the
  // ambient field + glass + video bloom in). The dissolve "queues" the bg change.
  const [phase, setPhase] = useState<OpenPhase>('closed')
  useEffect(() => {
    if (!openId) {
      setPhase('closed')
      return
    }
    if (reducedMotion) {
      setPhase('open')
      return
    }
    setPhase('opening')
    const t = setTimeout(() => setPhase('open'), REMOVE_MS)
    return () => clearTimeout(t)
  }, [openId, reducedMotion])

  // Keep the playing layers (ambient + glass + video) mounted through the close
  // fade-out — and only then unmount the iframe so playback stops after the exit.
  const [shownSet, setShownSet] = useState<DJSet | null>(null)
  useEffect(() => {
    if (openSet) {
      setShownSet(openSet)
      return
    }
    if (reducedMotion) {
      setShownSet(null)
      return
    }
    const t = setTimeout(() => setShownSet(null), EXIT_MS)
    return () => clearTimeout(t)
  }, [openSet, reducedMotion])

  // Escape closes the opened record.
  useEffect(() => {
    if (!openId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeOpen()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openId, closeOpen])

  const playing = phase === 'open'

  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      {/* Ambient color field — behind the (transparent) canvas. */}
      {shownSet && (
        <AmbientField
          color={shownSet.color}
          reduced={reducedMotion}
          className={`absolute inset-0 z-0 transition-opacity duration-700 ease-out ${
            playing ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* Hero wordmark — sits behind the (transparent) canvas as a backdrop. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 flex select-none items-start justify-center pt-[8vh]"
      >
        <span
          className="font-bold leading-none text-text-faint/70"
          style={{
            fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif',
            fontSize: 'clamp(6rem, 28vw, 26rem)',
            letterSpacing: '-0.06em',
          }}
        >
          Crate
        </span>
      </div>

      {/* The 3D crate. Transparent canvas, so the ambient field shows through. */}
      <div className="absolute inset-0 z-10">
        <CrateScene
          sets={djSets}
          selectedId={selectedId}
          openId={openId}
          dissolved={playing}
          reducedMotion={reducedMotion}
          onSelect={handleSelect}
          onStep={selectByOffset}
        />
      </div>

      {/* Keyboard legend — small, Apple-style keycaps for arrow navigation.
          Hidden while a record is open and the glass takes over. */}
      {!shownSet && (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-5 right-5 z-40 flex select-none items-center gap-4 text-text-faint"
        >
          <div className="flex items-center gap-2">
            <kbd className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface/80 text-sm shadow-sm backdrop-blur-sm">
              ←
            </kbd>
            <kbd className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface/80 text-sm shadow-sm backdrop-blur-sm">
              →
            </kbd>
            <span className="text-xs uppercase tracking-widest">Browse</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface/80 text-sm shadow-sm backdrop-blur-sm">
              ↑
            </kbd>
            <span className="text-xs uppercase tracking-widest">Open</span>
          </div>
        </div>
      )}

      {/* Series credit — bottom left. */}
      {!shownSet && (
        <p className="absolute bottom-5 left-5 z-40 select-none text-xs uppercase tracking-widest text-text-faint">
          Day 2 of 30 · one mini app a day →{' '}
          <a
            href="https://x.com/tomsanee"
            target="_blank"
            rel="noreferrer"
            className="normal-case text-text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
          >
            @tomsanee
          </a>
        </p>
      )}

      {shownSet && (
        <>
          {/* Glass blur over the crate — turns it into a dim, soft presence.
              Click anywhere off the video to close. */}
          <button
            type="button"
            aria-label="Close player"
            onClick={closeOpen}
            className={`absolute inset-0 z-20 cursor-default bg-canvas/15 backdrop-blur-2xl transition-opacity duration-700 ease-out ${
              playing ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          />

          {/* The crisp video at a fixed upper anchor, above the glass. */}
          <div className="pointer-events-none absolute inset-0 z-30 flex justify-center">
            <div
              className={`pointer-events-auto absolute top-[6vh] w-[min(92vw,640px)] transition-all duration-500 ease-out ${
                playing ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
              }`}
            >
              {/* Close is handled by Esc / backdrop click — a floated caption
                  hints at it without reserving any layout space. */}
              <div
                aria-hidden
                className="absolute -top-7 right-0 flex select-none items-center gap-2 text-text-faint"
              >
                <kbd className="flex h-6 items-center justify-center rounded-md border border-border bg-surface px-1.5 text-xs text-text-muted">
                  Esc
                </kbd>
              </div>
              <YouTubePlayer youtubeId={shownSet.youtubeId} title={shownSet.title} />
            </div>
          </div>
        </>
      )}
    </main>
  )
}
