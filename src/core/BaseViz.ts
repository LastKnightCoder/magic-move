import { Group, Text } from 'leafer-ui'
import type { IUI } from 'leafer-ui'
import type { AnimationOptions, HighlightOptions, IVisualizer, VizState, NodeState, MagicMoveOptions } from './types'
import { MagicMove } from './MagicMove'
import { resolveEasing } from './Easing'
import { FontManager } from '../text/FontManager'
import { createPathLabel } from './PathLabel'
import type { PathLabelData, LabelResult } from './PathLabel'
import { writeGlyphs, showCreationGlyphs, charByCharGlyphs } from '../text/TextAnimations'
import type { WriteOptions, ShowCreationOptions, CharByCharOptions } from '../text/TextAnimations'

type LeaferNode = IUI & {
  animate?: (kf: unknown, o: unknown) => { on?: (e: string, cb: () => void) => void } | undefined
}

interface HighlightSnapshot {
  fill?: string
  stroke?: string
  strokeWidth?: number
}

let hasWarnedAnimatePlugin = false

function warnAnimatePluginOnce(): void {
  if (hasWarnedAnimatePlugin) return
  hasWarnedAnimatePlugin = true
  console.warn(
    '[algo-viz] Animation plugin is not available. Please ensure "@leafer-in/animate" is imported before creating scenes.'
  )
}

function parseHexColor(color: string): [number, number, number] | null {
  const raw = color.trim()
  if (!raw.startsWith('#')) return null
  const value = raw.slice(1)
  if (value.length === 3) {
    const r = Number.parseInt(value[0] + value[0], 16)
    const g = Number.parseInt(value[1] + value[1], 16)
    const b = Number.parseInt(value[2] + value[2], 16)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
    return [r, g, b]
  }
  if (value.length === 6) {
    const r = Number.parseInt(value.slice(0, 2), 16)
    const g = Number.parseInt(value.slice(2, 4), 16)
    const b = Number.parseInt(value.slice(4, 6), 16)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
    return [r, g, b]
  }
  return null
}

function toHexChannel(channel: number): string {
  return Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')
}

function deriveStrokeColorFromFill(fill: string): string {
  const rgb = parseHexColor(fill)
  if (!rgb) return fill
  const [r, g, b] = rgb
  // 轻微压暗，避免高亮填充和描边亮度重叠造成“发糊”。
  const factor = 0.7
  return `#${toHexChannel(r * factor)}${toHexChannel(g * factor)}${toHexChannel(b * factor)}`
}

/**
 * 所有可视化器的通用基类，封装状态快照、节点注册与动画原语。
 */
export abstract class BaseViz implements IVisualizer {
  readonly group: Group
  readonly nodeMap: Map<string, IUI> = new Map()
  private readonly highlightSnapshots = new Map<string, HighlightSnapshot>()
  private readonly pathLabels = new Map<string, PathLabelData>()

  protected abstract defaultFill: string

  constructor(x = 0, y = 0) {
    this.group = new Group({ x, y })
  }

  getState(): VizState {
    const nodes = new Map<string, NodeState>()
    for (const [id, node] of this.nodeMap) {
      const n = node as IUI & Record<string, unknown>
      nodes.set(id, {
        id,
        x: (n.x as number) ?? 0,
        y: (n.y as number) ?? 0,
        width: (n.width as number) ?? 0,
        height: (n.height as number) ?? 0,
        points: Array.isArray(n.points) ? ([...(n.points as number[])] as number[]) : undefined,
        fill: n.fill as string,
        stroke: n.stroke as string,
        strokeWidth: n.strokeWidth as number,
        opacity: (n.opacity as number) ?? 1,
        cornerRadius: n.cornerRadius as number,
        pathData: n.path as string | undefined,
        dashPattern: n.dashPattern as number[] | undefined,
        dashOffset: n.dashOffset as number | undefined,
        fillOpacity: n.fillOpacity as number | undefined,
        strokeOpacity: n.strokeOpacity as number | undefined,
      })
    }
    return { nodes }
  }

  abstract computeState(): VizState

  async applyState(state: VizState, options?: AnimationOptions): Promise<void> {
    const before = this.getState()
    await MagicMove.animate(this.nodeMap, before, state, options)
    const { exit } = MagicMove.diff(before, state)
    for (const id of exit) {
      this.unregister(id)
    }
  }

  /**
   * 先快照旧状态，再执行数据变更并重建节点，最后做 Magic Move。
   * 这样可避免标签/箭头等附属节点在目标状态里丢失导致的状态不一致问题。
   */
  protected async commitMutation(
    mutate: () => void,
    rebuild: () => void,
    options?: MagicMoveOptions
  ): Promise<void> {
    const before = this.getState()
    mutate()
    this.clearAll()
    rebuild()
    const after = this.getState()
    await MagicMove.animate(this.nodeMap, before, after, options)
  }

  async highlight(id: string, color: string, opts?: HighlightOptions): Promise<void> {
    const node = this.nodeMap.get(id)
    if (!node) return
    const n = node as IUI & Record<string, unknown>

    if (!this.highlightSnapshots.has(id)) {
      this.highlightSnapshots.set(id, {
        fill: typeof n.fill === 'string' ? (n.fill as string) : undefined,
        stroke: typeof n.stroke === 'string' ? (n.stroke as string) : undefined,
        strokeWidth: typeof n.strokeWidth === 'number' ? (n.strokeWidth as number) : undefined,
      })
    }

    const currentStrokeWidth = typeof n.strokeWidth === 'number' ? (n.strokeWidth as number) : undefined
    const strokeWidth = opts?.highlightStrokeWidth ?? Math.max(currentStrokeWidth ?? 0, 2.2)
    const stroke = opts?.highlightStrokeColor ?? deriveStrokeColorFromFill(color)

    await this.animateProp(node, { fill: color, stroke, strokeWidth }, opts)
  }

  async unhighlight(id: string, opts?: AnimationOptions): Promise<void> {
    const node = this.nodeMap.get(id)
    if (!node) return
    const snapshot = this.highlightSnapshots.get(id)
    if (!snapshot) {
      await this.animateProp(node, { fill: this.defaultFill }, opts)
      return
    }

    const restored: Record<string, unknown> = {
      fill: snapshot.fill ?? this.defaultFill,
    }
    if (snapshot.stroke !== undefined) restored.stroke = snapshot.stroke
    if (snapshot.strokeWidth !== undefined) restored.strokeWidth = snapshot.strokeWidth

    await this.animateProp(node, restored, opts)
    this.highlightSnapshots.delete(id)
  }

  async setNodeProp(id: string, props: Record<string, unknown>, opts?: AnimationOptions): Promise<void> {
    const node = this.nodeMap.get(id)
    if (!node) return
    await this.animateProp(node, props, opts)
  }

  /**
   * 在给定矩形区域内创建居中文本。
   * 有默认字体时返回 Path 路径标签，否则回退到 Text 节点。
   */
  protected createCenteredLabel(
    text: string | number,
    bounds: { x: number; y: number; width: number; height: number },
    options?: { fontSize?: number; fill?: string; fontWeight?: string; opacity?: number }
  ): LabelResult {
    if (FontManager.hasDefault()) {
      const pathData = createPathLabel(String(text), bounds, {
        fontSize: options?.fontSize ?? 16,
        fill: options?.fill ?? '#1e293b',
      })
      if (options?.opacity !== undefined) {
        (pathData.group as unknown as Record<string, unknown>).opacity = options.opacity
      }
      return { node: pathData.group, pathData }
    }
    const node = new Text({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      text: String(text),
      fontSize: options?.fontSize ?? 16,
      fill: options?.fill ?? '#1e293b',
      fontWeight: options?.fontWeight ?? 'normal',
      textAlign: 'center',
      verticalAlign: 'middle',
      textWrap: 'none',
      opacity: options?.opacity ?? 1,
    })
    return { node }
  }

  /** 底层动画封装：将 LeaferJS 的 node.animate() 转成 Promise。 */
  protected animateProp(
    node: IUI,
    props: Record<string, unknown>,
    opts?: AnimationOptions,
    defaultDuration = 0.4
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const n = node as LeaferNode
      const options = {
        duration: opts?.duration ?? defaultDuration,
        easing: resolveEasing(opts?.easing),
        delay: opts?.delay ?? 0,
        ending: 'to',
      }

      try {
        const animation = n.animate?.([props], options)
        if (animation?.on) {
          animation.on('completed', resolve)
          return
        }
      } catch {
        // 动画插件不可用时，下面会直接写入最终状态兜底。
      }

      Object.assign(node as unknown as Record<string, unknown>, props)
      warnAnimatePluginOnce()
      resolve()
    })
  }

  protected register(id: string, node: IUI): void {
    this.group.add(node)
    this.nodeMap.set(id, node)
  }

  /** 注册标签节点，同时存储 pathData 元数据。 */
  protected registerLabel(id: string, result: LabelResult): void {
    this.register(id, result.node)
    if (result.pathData) {
      this.pathLabels.set(id, result.pathData)
    }
  }

  /** 重建标签字形（用于 setValue 等场景）。 */
  protected rebuildLabel(
    id: string,
    newText: string,
    bounds: { x: number; y: number; width: number; height: number },
    options?: { fontSize?: number; fill?: string }
  ): void {
    this.unregister(id)
    const result = this.createCenteredLabel(newText, bounds, options)
    this.registerLabel(id, result)
  }

  /** 获取标签的路径元数据。 */
  protected getPathLabel(id: string): PathLabelData | undefined {
    return this.pathLabels.get(id)
  }

  /** Write 文字动画：有 pathLabel 时用路径动画，否则回退 fade。 */
  async writeLabelIn(id: string, opts?: WriteOptions): Promise<void> {
    const pl = this.pathLabels.get(id)
    if (pl) {
      await writeGlyphs(pl.glyphs, opts)
    } else {
      const node = this.nodeMap.get(id)
      if (node) await this.animateProp(node, { opacity: 1 }, opts)
    }
  }

  /** ShowCreation 文字动画：有 pathLabel 时用路径动画，否则回退 fade。 */
  async showLabelCreation(id: string, opts?: ShowCreationOptions): Promise<void> {
    const pl = this.pathLabels.get(id)
    if (pl) {
      await showCreationGlyphs(pl.glyphs, opts)
    } else {
      const node = this.nodeMap.get(id)
      if (node) await this.animateProp(node, { opacity: 1 }, opts)
    }
  }

  /** CharByChar 文字动画：有 pathLabel 时用路径动画，否则回退 fade。 */
  async charByCharLabel(id: string, opts?: CharByCharOptions): Promise<void> {
    const pl = this.pathLabels.get(id)
    if (pl) {
      await charByCharGlyphs(pl.glyphs, opts)
    } else {
      const node = this.nodeMap.get(id)
      if (node) await this.animateProp(node, { opacity: 1 }, opts)
    }
  }

  protected unregister(id: string): void {
    const node = this.nodeMap.get(id)
    if (node) {
      this.group.remove(node)
      this.nodeMap.delete(id)
    }
    this.highlightSnapshots.delete(id)
    this.pathLabels.delete(id)
  }

  protected clearAll(): void {
    this.group.clear()
    this.nodeMap.clear()
    this.highlightSnapshots.clear()
    this.pathLabels.clear()
  }
}
