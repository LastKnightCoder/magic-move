import type { IUI } from 'leafer-ui'
import type { AnimationOptions } from '../core/types'
import type { PathGlyphEntry } from '../core/PathLabel'
import type { TextViz } from './TextViz'

type LeaferNode = IUI & {
  animate?: (kf: unknown, o: unknown) => { on?: (e: string, cb: () => void) => void } | undefined
}

function transparentColorLike(color: unknown): string {
  if (typeof color !== 'string') return 'rgba(0,0,0,0)'
  const raw = color.trim()

  if (raw.startsWith('#')) {
    const hex = raw.slice(1)
    if (hex.length === 3) {
      const r = Number.parseInt(hex[0] + hex[0], 16)
      const g = Number.parseInt(hex[1] + hex[1], 16)
      const b = Number.parseInt(hex[2] + hex[2], 16)
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return `rgba(${r},${g},${b},0)`
    }
    if (hex.length === 6) {
      const r = Number.parseInt(hex.slice(0, 2), 16)
      const g = Number.parseInt(hex.slice(2, 4), 16)
      const b = Number.parseInt(hex.slice(4, 6), 16)
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return `rgba(${r},${g},${b},0)`
    }
    return 'rgba(0,0,0,0)'
  }

  const rgbaMatch = raw.match(/^rgba\(\s*([^)]+)\s*\)$/i)
  if (rgbaMatch) {
    const channels = rgbaMatch[1].split(',').map((s) => s.trim())
    if (channels.length >= 3) return `rgba(${channels[0]},${channels[1]},${channels[2]},0)`
  }

  const rgbMatch = raw.match(/^rgb\(\s*([^)]+)\s*\)$/i)
  if (rgbMatch) {
    const channels = rgbMatch[1].split(',').map((s) => s.trim())
    if (channels.length >= 3) return `rgba(${channels[0]},${channels[1]},${channels[2]},0)`
  }

  // 其他颜色格式（如命名色/渐变）兜底为全透明黑，避免抛错。
  return 'rgba(0,0,0,0)'
}

function animateNode(
  node: IUI,
  keyframes: Array<Record<string, unknown>>,
  options: { duration: number; easing?: string; delay?: number; ending?: string }
): Promise<void> {
  return new Promise<void>((resolve) => {
    const n = node as LeaferNode
    const opts = {
      duration: options.duration,
      easing: options.easing ?? 'ease-in-out',
      delay: options.delay ?? 0,
      ending: options.ending ?? 'to',
    }
    try {
      const animation = n.animate?.(keyframes, opts)
      if (animation?.on) {
        animation.on('completed', resolve)
        return
      }
    } catch { /* fallback below */ }
    const final = keyframes[keyframes.length - 1]
    if (final) Object.assign(node as unknown as Record<string, unknown>, final)
    resolve()
  })
}

export interface WriteOptions extends AnimationOptions {
  /** 字符间交错系数，默认 min(4/(n+1), 0.2)。 */
  lagRatio?: number
  /** 描边颜色，默认使用 fill 色。 */
  strokeColor?: string
  /** 描边宽度，默认 2。 */
  strokeWidth?: number
}

/**
 * 核心 Write 动画：接受 PathGlyphEntry[] 直接驱动。
 */
export async function writeGlyphs(entries: PathGlyphEntry[], opts?: WriteOptions): Promise<void> {
  if (entries.length === 0) return

  const totalDuration = opts?.duration ?? (entries.length < 15 ? 1 : 2)
  const n = entries.length
  const lagRatio = opts?.lagRatio ?? Math.min(4 / (n + 1), 0.2)
  const perCharDuration = totalDuration / (1 + (n - 1) * lagRatio)
  const strokeColor = opts?.strokeColor
  const strokeWidth = opts?.strokeWidth ?? 2
  const promises: Promise<void>[] = []
  const originalStyle = new Map<IUI, { fill: unknown; stroke: unknown; strokeWidth: unknown }>()

  for (const { node, info } of entries) {
    const nodeAny = node as unknown as Record<string, unknown>
    originalStyle.set(node, {
      fill: nodeAny.fill,
      stroke: nodeAny.stroke,
      strokeWidth: nodeAny.strokeWidth,
    })
    const pathLen = info.pathLength || 100
    const outlineStroke = strokeColor ?? nodeAny.fill ?? '#1e293b'
    nodeAny.fill = transparentColorLike(nodeAny.fill)
    nodeAny.stroke = outlineStroke
    nodeAny.strokeWidth = strokeWidth
    nodeAny.dashPattern = [pathLen, pathLen]
    nodeAny.dashOffset = pathLen
  }

  for (let i = 0; i < entries.length; i++) {
    const { node, info } = entries[i]
    const pathLen = info.pathLength || 100
    const delay = (opts?.delay ?? 0) + i * lagRatio * perCharDuration
    const halfDur = perCharDuration / 2

    const nodeAny = node as unknown as Record<string, unknown>
    const original = originalStyle.get(node)
    const outlineStroke = strokeColor ?? nodeAny.stroke ?? '#1e293b'
    const targetFill = original?.fill
    const targetStroke = original?.stroke
    const targetStrokeWidth = original?.strokeWidth
    const transparentFill = transparentColorLike(targetFill)

    const phase1 = animateNode(node, [
      { dashOffset: pathLen },
      { dashOffset: 0 },
    ], { duration: halfDur, delay, easing: 'linear' })

    const phase2 = animateNode(node, [
      { fill: transparentFill, stroke: outlineStroke, strokeWidth },
      { fill: targetFill, stroke: targetStroke, strokeWidth: targetStrokeWidth },
    ], { duration: halfDur, delay: delay + halfDur, easing: 'linear' })

    promises.push(
      Promise.all([phase1, phase2]).then(() => {
        nodeAny.dashPattern = undefined
        nodeAny.dashOffset = undefined
      })
    )
  }

  await Promise.all(promises)
}

/**
 * Write 动画（DrawBorderThenFill）：先描边绘制，再填充淡入。
 */
export async function writeAnimation(viz: TextViz, opts?: WriteOptions): Promise<void> {
  await writeGlyphs(viz.getGlyphEntries(), opts)
}

export interface ShowCreationOptions extends AnimationOptions {
  lagRatio?: number
  strokeColor?: string
  strokeWidth?: number
}

/**
 * 核心 ShowCreation 动画：接受 PathGlyphEntry[] 直接驱动。
 */
export async function showCreationGlyphs(entries: PathGlyphEntry[], opts?: ShowCreationOptions): Promise<void> {
  if (entries.length === 0) return

  const totalDuration = opts?.duration ?? 2
  const n = entries.length
  const lagRatio = opts?.lagRatio ?? 1.0
  const perCharDuration = totalDuration / (1 + (n - 1) * lagRatio)
  const strokeColor = opts?.strokeColor
  const strokeWidth = opts?.strokeWidth ?? 2

  const promises: Promise<void>[] = []

  for (let i = 0; i < entries.length; i++) {
    const { node, info } = entries[i]
    const pathLen = info.pathLength || 100
    const delay = (opts?.delay ?? 0) + i * lagRatio * perCharDuration

    const nodeAny = node as unknown as Record<string, unknown>
    nodeAny.fill = 'transparent'
    nodeAny.stroke = strokeColor ?? '#1e293b'
    nodeAny.strokeWidth = strokeWidth
    nodeAny.dashPattern = [pathLen, pathLen]
    nodeAny.dashOffset = pathLen

    promises.push(
      animateNode(node, [
        { dashOffset: pathLen },
        { dashOffset: 0 },
      ], { duration: perCharDuration, delay, easing: 'ease-in-out' })
    )
  }

  await Promise.all(promises)
}

/**
 * ShowCreation 动画：仅描边绘制路径，不填充。
 */
export async function showCreationAnimation(viz: TextViz, opts?: ShowCreationOptions): Promise<void> {
  await showCreationGlyphs(viz.getGlyphEntries(), opts)
}

export interface CharByCharOptions extends AnimationOptions {
  /** 每字符显现时长（秒），默认 0.15。 */
  charDuration?: number
}

/**
 * 核心 CharByChar 动画：接受 PathGlyphEntry[] 直接驱动。
 */
export async function charByCharGlyphs(entries: PathGlyphEntry[], opts?: CharByCharOptions): Promise<void> {
  if (entries.length === 0) return

  const totalDuration = opts?.duration ?? 1.5
  const charDuration = opts?.charDuration ?? 0.15
  const timePerChar = entries.length > 1
    ? (totalDuration - charDuration) / (entries.length - 1)
    : 0

  const promises: Promise<void>[] = []

  for (let i = 0; i < entries.length; i++) {
    const { node } = entries[i]
    const nodeAny = node as unknown as Record<string, unknown>
    nodeAny.opacity = 0

    const delay = (opts?.delay ?? 0) + i * timePerChar

    promises.push(
      animateNode(node, [
        { opacity: 0 },
        { opacity: 1 },
      ], { duration: charDuration, delay, easing: 'ease-out' })
    )
  }

  await Promise.all(promises)
}

/**
 * CharByChar 动画：逐字符淡入显现。
 */
export async function charByCharAnimation(viz: TextViz, opts?: CharByCharOptions): Promise<void> {
  await charByCharGlyphs(viz.getGlyphEntries(), opts)
}

export interface WordByWordOptions extends AnimationOptions {
  /** 每词显现时长（秒），默认 0.2。 */
  wordDuration?: number
}

/**
 * 核心 WordByWord 动画：接受 PathGlyphEntry[][] 直接驱动。
 */
export async function wordByWordGlyphs(groups: PathGlyphEntry[][], opts?: WordByWordOptions): Promise<void> {
  if (groups.length === 0) return

  const totalDuration = opts?.duration ?? 1.5
  const wordDuration = opts?.wordDuration ?? 0.2
  const timePerWord = groups.length > 1
    ? (totalDuration - wordDuration) / (groups.length - 1)
    : 0

  for (const group of groups) {
    for (const { node } of group) {
      ;(node as unknown as Record<string, unknown>).opacity = 0
    }
  }

  const promises: Promise<void>[] = []

  for (let gi = 0; gi < groups.length; gi++) {
    const delay = (opts?.delay ?? 0) + gi * timePerWord
    for (const { node } of groups[gi]) {
      promises.push(
        animateNode(node, [
          { opacity: 0 },
          { opacity: 1 },
        ], { duration: wordDuration, delay, easing: 'ease-out' })
      )
    }
  }

  await Promise.all(promises)
}

/**
 * WordByWord 动画：逐词淡入显现。
 */
export async function wordByWordAnimation(viz: TextViz, opts?: WordByWordOptions): Promise<void> {
  await wordByWordGlyphs(viz.getWordGroups(), opts)
}
