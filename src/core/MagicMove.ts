import type { IUI } from 'leafer-ui'
import type { VizState, NodeState, MagicMoveOptions } from './types'
import { resolveEasing } from './Easing'

interface DiffResult {
  enter: string[]
  exit: string[]
  morph: Array<{ id: string; from: NodeState; to: NodeState }>
}

type AnimateNode = IUI & {
  animate?: (keyframes: unknown, options: unknown) => { on?: (event: string, cb: () => void) => void } | undefined
}

let hasWarnedAnimatePlugin = false

function warnAnimatePluginOnce(): void {
  if (hasWarnedAnimatePlugin) return
  hasWarnedAnimatePlugin = true
  console.warn(
    '[algo-viz] Animation plugin is not available. Please ensure "@leafer-in/animate" is imported before using transitions.'
  )
}

function animateOrApply(
  node: IUI,
  keyframes: Array<Record<string, unknown>>,
  options: { duration: number; easing: string; ending: 'to'; delay?: number }
): Promise<void> {
  return new Promise<void>((resolve) => {
    const n = node as AnimateNode
    const firstFrame = keyframes[0]
    // 先写入首帧，避免“先显示终态再回到起态”的闪动。
    if (firstFrame && keyframes.length > 1) {
      Object.assign(node as unknown as Record<string, unknown>, firstFrame)
    }
    try {
      const animation = n.animate?.(keyframes, options)
      if (animation?.on) {
        animation.on('completed', resolve)
        return
      }
    } catch {
      // 动画不可用时，下面直接应用最终帧兜底。
    }

    const finalFrame = keyframes[keyframes.length - 1]
    if (finalFrame) {
      Object.assign(node as unknown as Record<string, unknown>, finalFrame)
    }
    warnAnimatePluginOnce()
    resolve()
  })
}

function pointsEqual(a?: number[], b?: number[]): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function isLineState(state: NodeState): boolean {
  return Array.isArray(state.points) && state.points.length >= 4
}

interface LineLink {
  fromNodeKey: string
  toNodeKey: string
}

function edgeLinkOf(state: NodeState): LineLink | null {
  const meta = state.meta
  if (!meta || typeof meta !== 'object') return null

  const fromNodeId = (meta as Record<string, unknown>).fromNodeId
  const toNodeId = (meta as Record<string, unknown>).toNodeId
  if (typeof fromNodeId === 'string' && typeof toNodeId === 'string') {
    return { fromNodeKey: fromNodeId, toNodeKey: toNodeId }
  }

  const fromId = (meta as Record<string, unknown>).fromId
  const toId = (meta as Record<string, unknown>).toId
  if (typeof fromId !== 'string' || typeof toId !== 'string') return null
  return { fromNodeKey: `circle-${fromId}`, toNodeKey: `circle-${toId}` }
}

function nodeCenterOf(state: NodeState): [number, number] {
  return [state.x + state.width / 2, state.y + state.height / 2]
}

function edgePointsFromLink(state: VizState, link: LineLink): number[] | null {
  const from = state.nodes.get(link.fromNodeKey)
  const to = state.nodes.get(link.toNodeKey)
  if (!from || !to) return null
  const [fx, fy] = nodeCenterOf(from)
  const [tx, ty] = nodeCenterOf(to)
  return [fx, fy, tx, ty]
}

function getMetaString(state: NodeState, key: string): string | undefined {
  const meta = state.meta
  if (!meta || typeof meta !== 'object') return undefined
  const value = (meta as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

function isLinkedLineState(state: NodeState): boolean {
  return isLineState(state) && !!edgeLinkOf(state)
}

/**
 * Magic Move 核心引擎：对比前后状态并驱动 LeaferJS 做插值过渡。
 */
export class MagicMove {
  static diff(before: VizState, after: VizState): DiffResult {
    const beforeIds = new Set(before.nodes.keys())
    const afterIds = new Set(after.nodes.keys())

    const enter: string[] = []
    const exit: string[] = []
    const morph: DiffResult['morph'] = []

    for (const id of afterIds) {
      if (!beforeIds.has(id)) {
        enter.push(id)
      } else {
        morph.push({ id, from: before.nodes.get(id)!, to: after.nodes.get(id)! })
      }
    }

    for (const id of beforeIds) {
      if (!afterIds.has(id)) exit.push(id)
    }

    return { enter, exit, morph }
  }

  /** 使用 live nodeMap 将状态从 before 过渡到 after。 */
  static async animate(
    nodeMap: Map<string, IUI>,
    before: VizState,
    after: VizState,
    options: MagicMoveOptions = {}
  ): Promise<void> {
    const { enter, exit, morph } = MagicMove.diff(before, after)
    const duration = options.duration ?? 0.5
    const easing = resolveEasing(options.easing)
    const enterAnim = options.enterAnimation ?? 'fade'
    const exitAnim = options.exitAnimation ?? 'fade'
    const baseDelay = options.delay ?? 0
    const enterLagRatio = Math.max(0, options.enterLagRatio ?? 0.06)
    const enterOvershoot = Math.max(1, options.enterOvershoot ?? 1.03)

    const promises: Promise<void>[] = []

    // 已存在节点：执行属性形变动画。
    for (const { id, from, to } of morph) {
      const node = nodeMap.get(id)
      if (!node) continue
      promises.push(MagicMove.morphNode(node, from, to, { duration, easing, delay: baseDelay }))
    }

    // 被删除节点：执行退场动画。
    for (const id of exit) {
      const node = nodeMap.get(id)
      if (!node) continue
      const fromState = before.nodes.get(id)
      if (fromState && isLineState(fromState)) {
        promises.push(
          MagicMove.exitLine(node, fromState, after, exitAnim, {
            duration: duration * 0.6,
            easing,
            delay: baseDelay,
          })
        )
      } else {
        promises.push(MagicMove.exitNode(node, exitAnim, { duration: duration * 0.6, easing, delay: baseDelay }))
      }
    }

    // 新增节点：执行入场动画。
    for (const [index, id] of enter.entries()) {
      const node = nodeMap.get(id)
      if (!node) continue
      const toState = after.nodes.get(id)!
      if (isLineState(toState)) {
        promises.push(
          MagicMove.enterLine(node, toState, before, enterAnim, {
            duration: duration * 0.6,
            easing,
            delay: baseDelay,
          })
        )
      } else {
        const isLabel = id.startsWith('label-')
        promises.push(MagicMove.enterNode(node, toState, enterAnim, {
          duration: duration * 0.6,
          easing,
          delay: isLabel ? baseDelay : baseDelay + index * duration * enterLagRatio,
          overshoot: isLabel ? 1 : enterOvershoot,
          disableScale: isLabel,
        }))
      }
    }

    await Promise.all(promises)
  }

  private static morphNode(
    node: IUI,
    from: NodeState,
    to: NodeState,
    opts: { duration: number; easing: string; delay?: number }
  ): Promise<void> {
    // 仅按需要变化的属性构建关键帧，避免无关属性抖动。
    const fromFrame: Record<string, unknown> = { x: from.x, y: from.y, width: from.width, height: from.height }
    const toFrame: Record<string, unknown> = { x: to.x, y: to.y, width: to.width, height: to.height }

    const linkedLine = isLinkedLineState(from) || isLinkedLineState(to)
    if (linkedLine) {
      // linked line 的几何由外层实时跟随驱动，避免与 keyframe 插值竞争。
      if (from.points) {
        Object.assign(node as unknown as Record<string, unknown>, { points: [...from.points] })
      }
    } else if (!pointsEqual(from.points, to.points)) {
      if (from.points) fromFrame.points = [...from.points]
      if (to.points) toFrame.points = [...to.points]
    }

    if (from.fill !== undefined || to.fill !== undefined) {
      fromFrame.fill = from.fill ?? to.fill
      toFrame.fill = to.fill ?? from.fill
    }
    if (from.stroke !== undefined || to.stroke !== undefined) {
      fromFrame.stroke = from.stroke ?? to.stroke
      toFrame.stroke = to.stroke ?? from.stroke
    }
    if (from.strokeWidth !== undefined || to.strokeWidth !== undefined) {
      fromFrame.strokeWidth = from.strokeWidth ?? to.strokeWidth
      toFrame.strokeWidth = to.strokeWidth ?? from.strokeWidth
    }
    if (from.opacity !== undefined || to.opacity !== undefined) {
      fromFrame.opacity = from.opacity ?? 1
      toFrame.opacity = to.opacity ?? 1
    }
    if (from.cornerRadius !== undefined || to.cornerRadius !== undefined) {
      fromFrame.cornerRadius = from.cornerRadius ?? 0
      toFrame.cornerRadius = to.cornerRadius ?? 0
    }
    if (from.dashOffset !== undefined || to.dashOffset !== undefined) {
      fromFrame.dashOffset = from.dashOffset ?? 0
      toFrame.dashOffset = to.dashOffset ?? 0
    }
    if (from.fillOpacity !== undefined || to.fillOpacity !== undefined) {
      fromFrame.fillOpacity = from.fillOpacity ?? 1
      toFrame.fillOpacity = to.fillOpacity ?? 1
    }
    if (from.strokeOpacity !== undefined || to.strokeOpacity !== undefined) {
      fromFrame.strokeOpacity = from.strokeOpacity ?? 1
      toFrame.strokeOpacity = to.strokeOpacity ?? 1
    }

    return animateOrApply(node, [fromFrame, toFrame], {
      duration: opts.duration,
      easing: opts.easing,
      delay: opts.delay,
      ending: 'to',
    })
  }

  private static enterNode(
    node: IUI,
    toState: NodeState,
    style: 'fade' | 'scale' | 'slide' | 'draw',
    opts: { duration: number; easing: string; delay?: number; overshoot: number; disableScale?: boolean }
  ): Promise<void> {
    const useScale = !opts.disableScale
    let fromFrame: Record<string, unknown> = useScale
      ? { opacity: 0, scaleX: 0.92, scaleY: 0.92 }
      : { opacity: 0 }
    const midFrame: Record<string, unknown> = useScale
      ? { opacity: 1, scaleX: opts.overshoot, scaleY: opts.overshoot }
      : { opacity: 1 }
    const toFrame: Record<string, unknown> = useScale
      ? { opacity: toState.opacity ?? 1, scaleX: 1, scaleY: 1, y: toState.y }
      : { opacity: toState.opacity ?? 1 }
    const enterFromFill = getMetaString(toState, 'enterFromFill')

    if (style === 'scale' && useScale) {
      fromFrame = { ...fromFrame, scaleX: 0.72, scaleY: 0.72 }
    } else if (style === 'slide') {
      fromFrame = { ...fromFrame, y: (toState.y ?? 0) - 20 }
      toFrame.y = toState.y
    }

    if (toState.fill !== undefined) {
      const fromFill = enterFromFill ?? toState.fill
      fromFrame.fill = fromFill
      midFrame.fill = fromFill
      toFrame.fill = toState.fill
    }

    let keyframes: Array<Record<string, unknown>> = useScale
      ? [fromFrame, midFrame, toFrame]
      : [fromFrame, toFrame]

    if (style === 'draw') {
      const transparent = 'rgba(0,0,0,0)'
      const stroke = toState.stroke ?? toState.fill
      const strokeWidth = Math.max(toState.strokeWidth ?? 1.5, 1.5)

      const drawFrom: Record<string, unknown> = {
        ...fromFrame,
        opacity: 1,
        fill: transparent,
        stroke,
        strokeWidth,
      }
      const drawMid: Record<string, unknown> = {
        ...midFrame,
        fill: transparent,
        stroke,
        strokeWidth,
      }
      const drawTo: Record<string, unknown> = {
        ...toFrame,
      }
      if (toState.fill !== undefined) drawTo.fill = toState.fill
      if (toState.stroke !== undefined) drawTo.stroke = toState.stroke
      if (toState.strokeWidth !== undefined) drawTo.strokeWidth = toState.strokeWidth

      keyframes = [drawFrom, drawMid, drawTo]
    }

    return animateOrApply(node, keyframes, {
      duration: opts.duration,
      easing: opts.easing,
      delay: opts.delay,
      ending: 'to',
    })
  }

  private static exitNode(
    node: IUI,
    style: 'fade' | 'scale' | 'slide',
    opts: { duration: number; easing: string; delay?: number }
  ): Promise<void> {
    const n = node as IUI & Record<string, unknown>
    let toFrame: Record<string, unknown>

    if (style === 'scale') {
      toFrame = { opacity: 0, scaleX: 0.3, scaleY: 0.3 }
    } else if (style === 'slide') {
      toFrame = { opacity: 0, y: ((n.y as number) ?? 0) + 20 }
    } else {
      toFrame = { opacity: 0 }
    }

    return animateOrApply(node, [toFrame], {
      duration: opts.duration,
      easing: opts.easing,
      delay: opts.delay,
      ending: 'to',
    })
  }

  private static enterLine(
    node: IUI,
    toState: NodeState,
    before: VizState,
    style: 'fade' | 'scale' | 'slide' | 'draw',
    opts: { duration: number; easing: string; delay?: number }
  ): Promise<void> {
    const toPoints = toState.points ?? [0, 0, 0, 0]
    const link = edgeLinkOf(toState)
    const linked = !!link
    const linkedFromPoints = link ? edgePointsFromLink(before, link) : null
    const fromPoints = linkedFromPoints ?? [...toPoints]
    const x = toPoints[0] ?? 0
    const y = toPoints[1] ?? 0

    const fromFrame: Record<string, unknown> = style === 'draw'
      ? { points: [x, y, x, y], opacity: 0 }
      : linked
        ? { opacity: 0 }
        : { points: [...fromPoints], opacity: 0 }

    const toFrame: Record<string, unknown> = {
      opacity: toState.opacity ?? 1,
    }
    if (!linked) toFrame.points = [...toPoints]
    if (toState.stroke !== undefined) toFrame.stroke = toState.stroke
    if (toState.strokeWidth !== undefined) toFrame.strokeWidth = toState.strokeWidth
    return animateOrApply(node, [fromFrame, toFrame], {
      duration: opts.duration,
      easing: opts.easing,
      delay: opts.delay,
      ending: 'to',
    })
  }

  private static exitLine(
    node: IUI,
    fromState: NodeState,
    after: VizState,
    style: 'fade' | 'scale' | 'slide',
    opts: { duration: number; easing: string; delay?: number }
  ): Promise<void> {
    const points = fromState.points ?? [0, 0, 0, 0]
    const link = edgeLinkOf(fromState)
    const linked = !!link
    const linkedToPoints = link ? edgePointsFromLink(after, link) : null
    const toPoints = linkedToPoints ?? [...points]

    if (style === 'slide') {
      const x = points[0] ?? 0
      const y = points[1] ?? 0
      return animateOrApply(node, [ { points: [x, y, x, y], opacity: 0 } ], {
        duration: opts.duration,
        easing: opts.easing,
        delay: opts.delay,
        ending: 'to',
      })
    }

    const fromFrame: Record<string, unknown> = {
      opacity: fromState.opacity ?? 1,
    }
    if (!linked) fromFrame.points = [...points]
    const toFrame: Record<string, unknown> = {
      opacity: 0,
    }
    if (!linked) toFrame.points = [...toPoints]
    return animateOrApply(node, [fromFrame, toFrame], {
      duration: opts.duration,
      easing: opts.easing,
      delay: opts.delay,
      ending: 'to',
    })
  }
}
