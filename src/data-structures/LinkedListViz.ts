import { Rect, Line } from 'leafer-ui'
import type { Scene } from '../core/Scene'
import type { AnimationOptions, VizState, NodeState } from '../core/types'
import { BaseViz } from '../core/BaseViz'
import { MagicMove } from '../core/MagicMove'

export interface ListNodeData<T> {
  id: string
  value: T
  next?: string
}

export interface LinkedListVizOptions {
  x?: number
  y?: number
  nodeWidth?: number
  nodeHeight?: number
  gap?: number
  fillColor?: string
  highlightColor?: string
  arrowColor?: string
  fontSize?: number
}

const DEFAULTS: Required<LinkedListVizOptions> = {
  x: 0,
  y: 0,
  nodeWidth: 80,
  nodeHeight: 48,
  gap: 40,
  fillColor: '#fde68a',
  highlightColor: '#f59e0b',
  arrowColor: '#64748b',
  fontSize: 16,
}

export class LinkedListViz<T extends string | number> extends BaseViz {
  protected defaultFill: string

  private scene: Scene
  private nodes: Map<string, ListNodeData<T>>
  private headId: string | null
  private opts: Required<LinkedListVizOptions>
  private arrowBindings: Map<string, { fromNodeId: string; toNodeId: string }> = new Map()
  private arrowSyncBound = false

  constructor(scene: Scene, nodes: ListNodeData<T>[] = [], options?: LinkedListVizOptions) {
    const opts = { ...DEFAULTS, ...options }
    super(opts.x, opts.y)
    this.scene = scene
    this.opts = opts
    this.defaultFill = opts.fillColor
    this.nodes = new Map(nodes.map((n) => [n.id, n]))
    this.headId = nodes[0]?.id ?? null
    this._buildNodes()
    this._ensureArrowSync()
  }

  computeState(): VizState {
    return this._currentState()
  }

  getState(): VizState {
    const state = super.getState()
    for (const [id, nodeState] of state.nodes) {
      if (!id.startsWith('rect-') && !id.startsWith('label-')) continue
      const nodeId = id.slice(id.indexOf('-') + 1)
      const listNode = this.nodes.get(nodeId)
      if (!listNode) continue
      nodeState.meta = {
        ...(nodeState.meta ?? {}),
        nodeId,
        value: listNode.value,
        text: String(listNode.value),
      }
    }
    for (const [id, binding] of this.arrowBindings) {
      const nodeState = state.nodes.get(id)
      if (!nodeState) continue
      nodeState.meta = {
        ...(nodeState.meta ?? {}),
        fromNodeId: binding.fromNodeId,
        toNodeId: binding.toNodeId,
      }
    }
    return state
  }

  async applyState(state: VizState, options?: AnimationOptions): Promise<void> {
    const before = this.getState()
    this._restoreArrowBindingsFromState(state)
    this._ensureNodesFromState(state)
    await MagicMove.animate(this.nodeMap, before, state, options)
    const { exit } = MagicMove.diff(before, state)
    for (const id of exit) this.unregister(id)
    this._syncArrowsToNodes()
  }

  async insertAfter(afterId: string | null, newNode: ListNodeData<T>, opts?: AnimationOptions): Promise<void> {
    await this.commitMutation(
      () => {
        if (afterId === null) {
          newNode.next = this.headId ?? undefined
          this.headId = newNode.id
        } else {
          const prev = this.nodes.get(afterId)
          if (prev) { newNode.next = prev.next; prev.next = newNode.id }
        }
        this.nodes.set(newNode.id, newNode)
      },
      () => {
        this._buildNodes()
      },
      { enterAnimation: 'scale', enterLagRatio: 0.06, ...opts }
    )
  }

  async remove(nodeId: string, opts?: AnimationOptions): Promise<void> {
    await this.commitMutation(
      () => {
        if (this.headId === nodeId) {
          this.headId = this.nodes.get(nodeId)?.next ?? null
        } else {
          for (const [, node] of this.nodes) {
            if (node.next === nodeId) { node.next = this.nodes.get(nodeId)?.next; break }
          }
        }
        this.nodes.delete(nodeId)
      },
      () => {
        this._buildNodes()
      },
      { exitAnimation: 'fade', ...opts }
    )
  }

  async traverse(opts?: AnimationOptions): Promise<void> {
    let current = this.headId
    while (current) {
      await this.highlight(`rect-${current}`, this.opts.highlightColor, opts)
      await new Promise((r) => setTimeout(r, 300))
      await this.unhighlight(`rect-${current}`, opts)
      current = this.nodes.get(current)?.next ?? null
    }
  }

  private _orderedIds(): string[] {
    const order: string[] = []
    let current = this.headId
    while (current && this.nodes.has(current)) {
      order.push(current)
      current = this.nodes.get(current)?.next ?? null
    }
    return order
  }

  private _buildNodes(): void {
    const { nodeWidth, nodeHeight, gap, fillColor, fontSize } = this.opts
    this.arrowBindings.clear()
    this._orderedIds().forEach((id, i) => {
      const node = this.nodes.get(id)!
      const x = i * (nodeWidth + gap)
      const rect = new Rect({ x, y: 0, width: nodeWidth, height: nodeHeight, fill: fillColor, stroke: '#d97706', strokeWidth: 1.5, cornerRadius: 6 })
      const label = this.createCenteredLabel(node.value, { x, y: 0, width: nodeWidth, height: nodeHeight }, { fontSize, fill: '#1e293b' })
      this.register(`rect-${id}`, rect)
      this.registerLabel(`label-${id}`, label)
      if (node.next) {
        const arrowId = `arrow-${id}`
        const arrow = new Line({ points: [x + nodeWidth, nodeHeight / 2, x + nodeWidth + gap, nodeHeight / 2], stroke: this.opts.arrowColor, strokeWidth: 2 })
        this.arrowBindings.set(arrowId, { fromNodeId: `rect-${id}`, toNodeId: `rect-${node.next}` })
        this.register(arrowId, arrow)
      }
    })
    this._syncArrowsToNodes()
  }

  private _currentState(): VizState {
    const { nodeWidth, nodeHeight, gap, fillColor } = this.opts
    const nodes = new Map<string, NodeState>()
    this._orderedIds().forEach((id, i) => {
      nodes.set(`rect-${id}`, { id: `rect-${id}`, x: i * (nodeWidth + gap), y: 0, width: nodeWidth, height: nodeHeight, fill: fillColor, opacity: 1 })
    })
    return { nodes }
  }

  private _ensureNodesFromState(state: VizState): void {
    for (const [id, nodeState] of state.nodes) {
      if (this.nodeMap.has(id)) continue

      if (id.startsWith('rect-')) {
        const rect = new Rect({
          x: nodeState.x,
          y: nodeState.y,
          width: nodeState.width,
          height: nodeState.height,
          fill: nodeState.fill ?? this.opts.fillColor,
          stroke: nodeState.stroke ?? '#d97706',
          strokeWidth: nodeState.strokeWidth ?? 1.5,
          cornerRadius: nodeState.cornerRadius ?? 6,
          opacity: nodeState.opacity ?? 1,
        })
        this.register(id, rect)
        continue
      }

      if (id.startsWith('label-')) {
        const nodeId = id.slice('label-'.length)
        const text = this._labelTextFromState(state, nodeId, nodeState)
        const rectState = state.nodes.get(`rect-${nodeId}`)
        const bounds = {
          x: rectState?.x ?? nodeState.x,
          y: rectState?.y ?? nodeState.y,
          width: rectState?.width ?? nodeState.width,
          height: rectState?.height ?? nodeState.height,
        }
        const label = this.createCenteredLabel(text, bounds, {
          fontSize: this.opts.fontSize,
          fill: nodeState.fill ?? '#1e293b',
          opacity: nodeState.opacity ?? 1,
        })
        this.registerLabel(id, label)
        continue
      }

      if (id.startsWith('arrow-')) {
        const points = nodeState.points && nodeState.points.length >= 4
          ? [...nodeState.points]
          : [nodeState.x, nodeState.y, nodeState.x + this.opts.gap, nodeState.y]
        const arrow = new Line({
          points,
          stroke: nodeState.stroke ?? this.opts.arrowColor,
          strokeWidth: nodeState.strokeWidth ?? 2,
          opacity: nodeState.opacity ?? 1,
        })
        this.register(id, arrow)
        const meta = nodeState.meta
        if (meta && typeof meta === 'object') {
          const fromNodeId = (meta as Record<string, unknown>).fromNodeId
          const toNodeId = (meta as Record<string, unknown>).toNodeId
          if (typeof fromNodeId === 'string' && typeof toNodeId === 'string') {
            this.arrowBindings.set(id, { fromNodeId, toNodeId })
          }
        }
      }
    }
  }

  private _labelTextFromState(state: VizState, nodeId: string, labelState: NodeState): string {
    const labelMeta = labelState.meta
    if (labelMeta && typeof labelMeta === 'object') {
      const text = (labelMeta as Record<string, unknown>).text
      if (typeof text === 'string' && text.length > 0) return text
      const value = (labelMeta as Record<string, unknown>).value
      if (typeof value === 'string' || typeof value === 'number') return String(value)
    }

    const rectState = state.nodes.get(`rect-${nodeId}`)
    const rectMeta = rectState?.meta
    if (rectMeta && typeof rectMeta === 'object') {
      const value = (rectMeta as Record<string, unknown>).value
      if (typeof value === 'string' || typeof value === 'number') return String(value)
    }
    return nodeId
  }

  private _ensureArrowSync(): void {
    if (this.arrowSyncBound) return
    this.arrowSyncBound = true
    this.scene.leafer.on('render.before', () => {
      this._syncArrowsToNodes()
    })
  }

  private _syncArrowsToNodes(): void {
    for (const [arrowId, binding] of this.arrowBindings) {
      const arrowNode = this.nodeMap.get(arrowId) as (Line & Record<string, unknown>) | undefined
      const fromNode = this.nodeMap.get(binding.fromNodeId)
      const toNode = this.nodeMap.get(binding.toNodeId)
      if (!arrowNode || !fromNode || !toNode) continue
      const from = this._boundsFromNode(fromNode)
      const to = this._boundsFromNode(toNode)
      const fromX = from.x + from.width
      const fromY = from.y + from.height / 2
      const toX = to.x
      const toY = to.y + to.height / 2
      Object.assign(arrowNode, { points: [fromX, fromY, toX, toY] })
    }
  }

  private _restoreArrowBindingsFromState(state: VizState): void {
    const bindings = new Map<string, { fromNodeId: string; toNodeId: string }>()
    for (const [id, node] of state.nodes) {
      if (!id.startsWith('arrow-')) continue
      const meta = node.meta
      if (!meta || typeof meta !== 'object') continue
      const fromNodeId = (meta as Record<string, unknown>).fromNodeId
      const toNodeId = (meta as Record<string, unknown>).toNodeId
      if (typeof fromNodeId !== 'string' || typeof toNodeId !== 'string') continue
      bindings.set(id, { fromNodeId, toNodeId })
    }
    if (bindings.size > 0) {
      this.arrowBindings = bindings
    }
  }

  private _boundsFromNode(node: unknown): { x: number; y: number; width: number; height: number } {
    const n = node as {
      x?: number
      y?: number
      width?: number
      height?: number
    }
    // 这里故意不用 getBounds：getBounds 会包含 scale 过冲，导致连线端点在入场时抖动。
    const x = typeof n.x === 'number' ? n.x : 0
    const y = typeof n.y === 'number' ? n.y : 0
    const width = typeof n.width === 'number' ? n.width : this.opts.nodeWidth
    const height = typeof n.height === 'number' ? n.height : this.opts.nodeHeight
    return { x, y, width, height }
  }
}
