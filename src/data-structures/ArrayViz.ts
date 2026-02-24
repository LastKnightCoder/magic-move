import { Rect, Text } from 'leafer-ui'
import type { Scene } from '../core/Scene'
import type { AnimationOptions, VizState, NodeState } from '../core/types'
import { BaseViz } from '../core/BaseViz'
import { FontManager } from '../text/FontManager'
import { createPathLabelAt } from '../core/PathLabel'

export interface ArrayVizOptions {
  x?: number
  y?: number
  cellWidth?: number
  cellHeight?: number
  gap?: number
  fillColor?: string
  highlightColor?: string
  sortedColor?: string
  fontSize?: number
  strokeColor?: string
}

const DEFAULTS: Required<ArrayVizOptions> = {
  x: 0,
  y: 0,
  cellWidth: 60,
  cellHeight: 60,
  gap: 4,
  fillColor: '#e2e8f0',
  highlightColor: '#f59e0b',
  sortedColor: '#86efac',
  fontSize: 18,
  strokeColor: '#94a3b8',
}

export class ArrayViz<T extends string | number> extends BaseViz {
  protected defaultFill: string

  private scene: Scene
  private data: T[]
  private opts: Required<ArrayVizOptions>
  // 指针名 -> 当前指向的单元格下标
  private pointers: Map<string, number> = new Map()

  constructor(scene: Scene, data: T[], options?: ArrayVizOptions) {
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

  async highlightAt(indices: number[], color?: string, opts?: AnimationOptions): Promise<void> {
    await Promise.all(
      indices.map((i) => this.highlight(`cell-${i}`, color ?? this.opts.highlightColor, opts))
    )
  }

  async unhighlightAt(indices: number[], opts?: AnimationOptions): Promise<void> {
    await Promise.all(indices.map((i) => this.unhighlight(`cell-${i}`, opts)))
  }

  async swap(i: number, j: number, opts?: AnimationOptions): Promise<void> {
    const cellI = this.nodeMap.get(`cell-${i}`)
    const cellJ = this.nodeMap.get(`cell-${j}`)
    const labelI = this.nodeMap.get(`label-${i}`)
    const labelJ = this.nodeMap.get(`label-${j}`)
    if (!cellI || !cellJ || !labelI || !labelJ) return

    const ci = cellI as typeof cellI & Record<string, unknown>
    const cj = cellJ as typeof cellJ & Record<string, unknown>
    const li = labelI as typeof labelI & Record<string, unknown>
    const lj = labelJ as typeof labelJ & Record<string, unknown>
    const cellXi = ci.x as number
    const cellXj = cj.x as number
    const labelXi = li.x as number
    const labelXj = lj.x as number

    await Promise.all([
      this.animateProp(cellI, { x: cellXj }, opts),
      this.animateProp(cellJ, { x: cellXi }, opts),
      this.animateProp(labelI, { x: labelXj }, opts),
      this.animateProp(labelJ, { x: labelXi }, opts),
    ])

    // 交换后要同步重映射 ID：ID 绑定“节点身份”，而不是屏幕位置。
    this.nodeMap.set(`cell-${i}`, cellJ)
    this.nodeMap.set(`cell-${j}`, cellI)
    this.nodeMap.set(`label-${i}`, labelJ)
    this.nodeMap.set(`label-${j}`, labelI)
    ;[this.data[i], this.data[j]] = [this.data[j], this.data[i]]
  }

  async markSorted(indices: number[], opts?: AnimationOptions): Promise<void> {
    await this.highlightAt(indices, this.opts.sortedColor, opts)
  }

  async setValue(index: number, value: T, opts?: AnimationOptions): Promise<void> {
    this.data[index] = value
    const labelNode = this.nodeMap.get(`label-${index}`)
    if (!labelNode) return
    const { cellWidth, cellHeight, gap, fontSize } = this.opts
    const x = index * (cellWidth + gap)
    await this.animateProp(labelNode, { opacity: 0 }, { duration: 0.15, ...opts })
    this.rebuildLabel(`label-${index}`, String(value), { x, y: 0, width: cellWidth, height: cellHeight }, { fontSize, fill: '#1e293b' })
    const newNode = this.nodeMap.get(`label-${index}`)
    if (newNode) {
      ;(newNode as unknown as Record<string, unknown>).opacity = 0
      await this.animateProp(newNode, { opacity: 1 }, { duration: 0.15, ...opts })
    }
  }

  async setData(newData: T[], opts?: AnimationOptions): Promise<void> {
    await this.commitMutation(
      () => {
        this.data = [...newData]
      },
      () => {
        this._buildCells()
      },
      opts
    )
  }

  async showPointer(index: number, label: string, opts?: AnimationOptions): Promise<void> {
    const { cellWidth, cellHeight, gap } = this.opts
    const x = index * (cellWidth + gap) + cellWidth / 2 - 10
    const y = cellHeight + 8
    const id = `ptr-${label}`

    if (this.nodeMap.has(id)) {
      await this.setNodeProp(id, { x }, opts)
      return
    }

    if (FontManager.hasDefault()) {
      const pathData = createPathLabelAt(label, x, y, { fontSize: 13, fill: '#6366f1' })
      ;(pathData.group as unknown as Record<string, unknown>).opacity = 0
      this.registerLabel(id, { node: pathData.group, pathData })
      await this.animateProp(pathData.group, { opacity: 1 }, opts)
    } else {
      const ptrText = new Text({ x, y, text: label, fontSize: 13, fill: '#6366f1', fontWeight: 'bold', opacity: 0 })
      this.register(id, ptrText)
      await this.animateProp(ptrText, { opacity: 1 }, opts)
    }
    this.pointers.set(label, index)
  }

  async hidePointer(label: string, opts?: AnimationOptions): Promise<void> {
    const id = `ptr-${label}`
    const node = this.nodeMap.get(id)
    if (!node) return
    await this.animateProp(node, { opacity: 0 }, opts)
    this.unregister(id)
    this.pointers.delete(label)
  }

  private _buildCells(): void {
    const { cellWidth, cellHeight, gap, fillColor, strokeColor, fontSize } = this.opts
    this.data.forEach((value, i) => {
      const x = i * (cellWidth + gap)
      const rect = new Rect({ x, y: 0, width: cellWidth, height: cellHeight, fill: fillColor, stroke: strokeColor, strokeWidth: 1.5, cornerRadius: 6 })
      const label = this.createCenteredLabel(value, { x, y: 0, width: cellWidth, height: cellHeight }, { fontSize, fill: '#1e293b' })
      this.register(`cell-${i}`, rect)
      this.registerLabel(`label-${i}`, label)
    })
  }

  private _stateForData(data: T[]): VizState {
    const { cellWidth, cellHeight, gap, fillColor, strokeColor } = this.opts
    const nodes = new Map<string, NodeState>()
    data.forEach((_, i) => {
      nodes.set(`cell-${i}`, { id: `cell-${i}`, x: i * (cellWidth + gap), y: 0, width: cellWidth, height: cellHeight, fill: fillColor, stroke: strokeColor, opacity: 1 })
    })
    return { nodes }
  }
}
