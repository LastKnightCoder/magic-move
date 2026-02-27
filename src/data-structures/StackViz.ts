import { Rect } from 'leafer-ui'
import type { Scene } from '../core/Scene'
import type { AnimationOptions, VizState, NodeState } from '../core/types'
import { BaseViz } from '../core/BaseViz'
import { MagicMove } from '../core/MagicMove'

export interface StackVizOptions {
  x?: number
  y?: number
  cellWidth?: number
  cellHeight?: number
  gap?: number
  fillColor?: string
  highlightColor?: string
  fontSize?: number
  maxVisible?: number
}

const DEFAULTS: Required<StackVizOptions> = {
  x: 0,
  y: 0,
  cellWidth: 100,
  cellHeight: 48,
  gap: 3,
  fillColor: '#ddd6fe',
  highlightColor: '#f59e0b',
  fontSize: 16,
  maxVisible: 8,
}

export class StackViz<T extends string | number> extends BaseViz {
  protected defaultFill: string

  private scene: Scene
  private data: T[]
  private opts: Required<StackVizOptions>

  constructor(scene: Scene, data: T[] = [], options?: StackVizOptions) {
    const opts = { ...DEFAULTS, ...options }
    super(opts.x, opts.y)
    this.scene = scene
    this.data = [...data]
    this.opts = opts
    this.defaultFill = opts.fillColor
    this._buildCells()
  }

  computeState(): VizState {
    return this._stateForData(this.data)
  }

  getState(): VizState {
    const state = super.getState()
    for (const [id, nodeState] of state.nodes) {
      if (!id.startsWith('cell-') && !id.startsWith('label-')) continue
      const indexText = id.slice(id.indexOf('-') + 1)
      const index = Number.parseInt(indexText, 10)
      if (!Number.isFinite(index)) continue
      const value = this.data[index]
      if (value === undefined) continue
      nodeState.meta = {
        ...(nodeState.meta ?? {}),
        index,
        value,
        text: String(value),
      }
    }
    return state
  }

  async applyState(state: VizState, options?: AnimationOptions): Promise<void> {
    const before = this.getState()
    this._ensureNodesFromState(state)
    await MagicMove.animate(this.nodeMap, before, state, options)
    const { exit } = MagicMove.diff(before, state)
    for (const id of exit) this.unregister(id)
  }

  async push(value: T, opts?: AnimationOptions): Promise<void> {
    this.data.push(value)
    const i = this.data.length - 1
    const { cellWidth, cellHeight, fontSize, fillColor } = this.opts
    const y = this._yForIndex(i)

    const rect = new Rect({ x: 0, y: y - 20, width: cellWidth, height: cellHeight, fill: fillColor, stroke: '#a78bfa', strokeWidth: 1.5, cornerRadius: 6, opacity: 0 })
    const label = this.createCenteredLabel(value, { x: 0, y: y - 20, width: cellWidth, height: cellHeight }, { fontSize, fill: '#1e293b', opacity: 0 })
    this.register(`cell-${i}`, rect)
    this.registerLabel(`label-${i}`, label)

    // label.node is a Group (path) or Text — animate its y by +20 to reach target position
    const labelNode = label.node
    const labelStartY = (labelNode as unknown as Record<string, unknown>).y as number
    await Promise.all([
      this.animateProp(rect, { opacity: 1, y }, opts),
      this.animateProp(labelNode, { opacity: 1, y: labelStartY + 20 }, opts),
    ])
  }

  async pop(opts?: AnimationOptions): Promise<T | undefined> {
    if (this.data.length === 0) return undefined
    const i = this.data.length - 1
    const value = this.data[i]
    const rect = this.nodeMap.get(`cell-${i}`)
    const label = this.nodeMap.get(`label-${i}`)

    if (rect && label) {
      const n = rect as typeof rect & Record<string, unknown>
      await Promise.all([
        this.animateProp(rect, { opacity: 0, y: (n.y as number) - 20 }, opts),
        this.animateProp(label, { opacity: 0 }, opts),
      ])
      this.unregister(`cell-${i}`)
      this.unregister(`label-${i}`)
    }

    this.data.pop()
    return value
  }

  async peek(opts?: AnimationOptions): Promise<void> {
    if (this.data.length === 0) return
    const id = `cell-${this.data.length - 1}`
    await this.highlight(id, this.opts.highlightColor, opts)
    await new Promise((r) => setTimeout(r, 400))
    await this.unhighlight(id, opts)
  }

  private _yForIndex(i: number): number {
    const { cellHeight, gap, maxVisible } = this.opts
    return (maxVisible - 1 - i) * (cellHeight + gap)
  }

  private _buildCells(): void {
    const { cellWidth, cellHeight, gap, fillColor, fontSize } = this.opts
    this.data.forEach((value, i) => {
      const y = this._yForIndex(i)
      const rect = new Rect({ x: 0, y, width: cellWidth, height: cellHeight, fill: fillColor, stroke: '#a78bfa', strokeWidth: 1.5, cornerRadius: 6 })
      const label = this.createCenteredLabel(value, { x: 0, y, width: cellWidth, height: cellHeight }, { fontSize, fill: '#1e293b' })
      this.register(`cell-${i}`, rect)
      this.registerLabel(`label-${i}`, label)
    })
  }

  private _stateForData(data: T[]): VizState {
    const { cellWidth, cellHeight, fillColor } = this.opts
    const nodes = new Map<string, NodeState>()
    data.forEach((_, i) => {
      nodes.set(`cell-${i}`, { id: `cell-${i}`, x: 0, y: this._yForIndex(i), width: cellWidth, height: cellHeight, fill: fillColor, opacity: 1 })
    })
    return { nodes }
  }

  private _ensureNodesFromState(state: VizState): void {
    for (const [id, nodeState] of state.nodes) {
      if (this.nodeMap.has(id)) continue
      if (id.startsWith('cell-')) {
        const rect = new Rect({
          x: nodeState.x,
          y: nodeState.y,
          width: nodeState.width,
          height: nodeState.height,
          fill: nodeState.fill ?? this.opts.fillColor,
          stroke: nodeState.stroke ?? '#a78bfa',
          strokeWidth: nodeState.strokeWidth ?? 1.5,
          cornerRadius: nodeState.cornerRadius ?? 6,
          opacity: nodeState.opacity ?? 1,
        })
        this.register(id, rect)
        continue
      }

      if (id.startsWith('label-')) {
        const indexText = id.slice('label-'.length)
        const index = Number.parseInt(indexText, 10)
        const text = this._labelTextFromState(state, index, nodeState)
        const cell = Number.isFinite(index) ? state.nodes.get(`cell-${index}`) : undefined
        const bounds = {
          x: cell?.x ?? nodeState.x,
          y: cell?.y ?? nodeState.y,
          width: cell?.width ?? nodeState.width,
          height: cell?.height ?? nodeState.height,
        }
        const label = this.createCenteredLabel(text, bounds, {
          fontSize: this.opts.fontSize,
          fill: nodeState.fill ?? '#1e293b',
          opacity: nodeState.opacity ?? 1,
        })
        this.registerLabel(id, label)
      }
    }
  }

  private _labelTextFromState(state: VizState, index: number, labelState: NodeState): string {
    const labelMeta = labelState.meta
    if (labelMeta && typeof labelMeta === 'object') {
      const text = (labelMeta as Record<string, unknown>).text
      if (typeof text === 'string' && text.length > 0) return text
      const value = (labelMeta as Record<string, unknown>).value
      if (typeof value === 'string' || typeof value === 'number') return String(value)
    }
    const cellState = Number.isFinite(index) ? state.nodes.get(`cell-${index}`) : undefined
    const cellMeta = cellState?.meta
    if (cellMeta && typeof cellMeta === 'object') {
      const value = (cellMeta as Record<string, unknown>).value
      if (typeof value === 'string' || typeof value === 'number') return String(value)
    }
    return Number.isFinite(index) ? String(index) : ''
  }
}
