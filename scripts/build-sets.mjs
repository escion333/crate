// @ts-check
/**
 * build-sets.mjs — generates data/sets.ts from data/sets.source.json.
 *
 * The source file is the thing you edit. Each entry needs at minimum a YouTube
 * `url` (or bare 11-char id) plus the editorial fields YouTube can't tell us:
 * `artist` and `mood`. Everything else is enriched at build time:
 *   - title  ← oEmbed title        (override with "title")
 *   - venue  ← oEmbed author_name  (override with "venue")
 *   - color  ← dominant color of the video thumbnail (override with "color")
 * `year` and `notes` are optional and only come from the source file.
 *
 * Hard cap: at most MAX_SETS (44) entries — the crate holds no more. Over that,
 * the build fails.
 *
 * Run: `npm run sync:sets`  (also runs automatically via `prebuild`).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(root, 'data/sets.source.json')
const OUTPUT = resolve(root, 'data/sets.ts')
const COVERS_DIR = resolve(root, 'public/covers')

// Hard cap: the crate holds at most 44 records. This is a rule, not a guideline —
// the build fails if the source exceeds it.
const MAX_SETS = 44

/** Pull the 11-char video id out of a URL or accept a bare id. */
function parseVideoId(input) {
  if (/^[\w-]{11}$/.test(input)) return input
  let url
  try {
    url = new URL(input)
  } catch {
    throw new Error(`Not a valid YouTube URL or id: "${input}"`)
  }
  const id =
    url.hostname === 'youtu.be'
      ? url.pathname.slice(1)
      : url.searchParams.get('v')
  if (!id || !/^[\w-]{11}$/.test(id)) {
    throw new Error(`Could not extract a video id from: "${input}"`)
  }
  return id
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Stable fallback color from a string, used when the thumbnail can't be read. */
function fallbackColor(seed) {
  let hash = 0
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const hue = hash % 360
  return `hsl(${hue} 55% 55%)`
}

function toHex({ r, g, b }) {
  const h = (n) => Math.round(n).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** HSL saturation + lightness of an RGB pixel, channels in 0..255. */
function satLight(r, g, b) {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return { s, l }
}

async function fetchOEmbed(videoId) {
  const endpoint = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
  const res = await fetch(endpoint)
  if (!res.ok) {
    throw new Error(`oEmbed ${res.status} for ${videoId} (video private/removed?)`)
  }
  return /** @type {{ title: string, author_name: string }} */ (await res.json())
}

/**
 * A vivid representative color for the thumbnail (null if unreachable).
 * `sharp`'s `dominant` picks the most frequent bucket, which on DJ thumbnails is
 * usually near-black/near-white background. Instead we sample a small grid, drop
 * washed-out / near-black / near-white pixels, and average the most saturated
 * remainder — so the spine matches the cover art's accent, not its letterboxing.
 */
async function thumbnailColor(videoId) {
  for (const quality of ['maxresdefault', 'hqdefault']) {
    const res = await fetch(`https://i.ytimg.com/vi/${videoId}/${quality}.jpg`)
    if (!res.ok) continue
    const buffer = Buffer.from(await res.arrayBuffer())
    const { data, info } = await sharp(buffer)
      .resize(24, 24, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const candidates = []
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const { s, l } = satLight(r, g, b)
      if (l > 0.12 && l < 0.9 && s > 0.18) candidates.push({ r, g, b, s })
    }

    // Fully gray/dark image: fall back to sharp's dominant bucket.
    if (candidates.length === 0) {
      const { dominant } = await sharp(buffer).stats()
      return toHex(dominant)
    }

    candidates.sort((a, b) => b.s - a.s)
    const top = candidates.slice(0, Math.max(1, Math.ceil(candidates.length * 0.25)))
    const avg = top.reduce(
      (acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }),
      { r: 0, g: 0, b: 0 },
    )
    return toHex({ r: avg.r / top.length, g: avg.g / top.length, b: avg.b / top.length })
  }
  return null
}

/**
 * Save the video's cover art (the clean 16:9 maxres thumbnail) to /public so the
 * sleeve can texture it on the open-spin. Keyed by video id and cached, since
 * many records reuse the same video. Returns the public path, or null if the
 * maxres thumbnail doesn't exist (sleeve falls back to its solid `color`).
 */
const coverCache = new Map()
async function saveCover(videoId) {
  if (coverCache.has(videoId)) return coverCache.get(videoId)
  let coverPath = null
  const res = await fetch(`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`)
  if (res.ok) {
    await writeFile(resolve(COVERS_DIR, `${videoId}.jpg`), Buffer.from(await res.arrayBuffer()))
    coverPath = `/covers/${videoId}.jpg`
  }
  coverCache.set(videoId, coverPath)
  return coverPath
}

/** Emit a single DJSet object literal with only the fields that are present. */
function emitSet(set) {
  const lines = [`  {`, `    id: ${JSON.stringify(set.id)},`]
  lines.push(`    title: ${JSON.stringify(set.title)},`)
  lines.push(`    artist: ${JSON.stringify(set.artist)},`)
  if (set.venue) lines.push(`    venue: ${JSON.stringify(set.venue)},`)
  if (set.year) lines.push(`    year: ${JSON.stringify(set.year)},`)
  lines.push(`    youtubeId: ${JSON.stringify(set.youtubeId)},`)
  if (set.mood?.length) {
    lines.push(`    mood: [${set.mood.map((m) => JSON.stringify(m)).join(', ')}],`)
  }
  lines.push(`    color: ${JSON.stringify(set.color)},`)
  if (set.cover) lines.push(`    cover: ${JSON.stringify(set.cover)},`)
  if (set.notes) lines.push(`    notes: ${JSON.stringify(set.notes)},`)
  lines.push(`  },`)
  return lines.join('\n')
}

async function main() {
  const entries = JSON.parse(await readFile(SOURCE, 'utf8'))
  if (!Array.isArray(entries)) {
    throw new Error('sets.source.json must be an array of entries.')
  }
  if (entries.length > MAX_SETS) {
    throw new Error(
      `sets.source.json has ${entries.length} entries; the crate holds at most ${MAX_SETS}.`,
    )
  }

  await mkdir(COVERS_DIR, { recursive: true })

  const sets = []
  const seenIds = new Set()

  for (const [index, entry] of entries.entries()) {
    if (!entry.url) throw new Error(`Entry #${index} is missing "url".`)
    if (!entry.artist) throw new Error(`Entry #${index} (${entry.url}) is missing "artist".`)

    const youtubeId = parseVideoId(entry.url)
    const oembed = await fetchOEmbed(youtubeId)

    const title = entry.title ?? oembed.title
    const venue = entry.venue ?? oembed.author_name
    const color = entry.color ?? (await thumbnailColor(youtubeId)) ?? fallbackColor(youtubeId)
    const cover = await saveCover(youtubeId)

    const baseId = entry.id ?? slugify(title)
    let id = baseId
    for (let n = 2; seenIds.has(id); n++) id = `${baseId}-${n}`
    seenIds.add(id)

    sets.push({
      id,
      title,
      artist: entry.artist,
      venue,
      year: entry.year,
      youtubeId,
      mood: entry.mood,
      color,
      cover,
      notes: entry.notes,
    })

    console.log(`✓ ${id}  —  ${title}  ·  ${venue}  ·  ${color}${cover ? '  ·  cover' : ''}`)
  }

  const file = [
    '// GENERATED FILE — do not edit by hand.',
    '// Source of truth is data/sets.source.json; regenerate with `npm run sync:sets`.',
    '',
    "import type { DJSet } from '@/types/dj-set'",
    '',
    'export const djSets: DJSet[] = [',
    sets.map(emitSet).join('\n'),
    ']',
    '',
  ].join('\n')

  await writeFile(OUTPUT, file, 'utf8')
  console.log(`\nWrote ${sets.length} sets → data/sets.ts`)
}

main().catch((err) => {
  console.error(`\nbuild-sets failed: ${err.message}`)
  process.exit(1)
})
