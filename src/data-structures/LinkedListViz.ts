import { Rect, Line } from 'leafer-ui'
import type { Scene } from '../core/Scene'
import type { AnimationOptions, VizState, NodeState } from '../core/types'
import { BaseViz } from '../core/BaseViz'

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

  constructor(scene: Scene, nodes: ListNodeData<T>[] = [], options?: LinkedListVizOptions) {
    const opts = { ...DEFAULTS, ...options }
    super(opts.x, opts.y)
    this.scene = scene
    this.opts = opts
    this.defaultFill = opts.fillColor
    this.nodes = new Map(nodes.map((n) => [n.id, n]))
    this.headId = nodes[0]?.id ?? null
    this._buildNodes()
  }

  computeState(): VizState {
    return this._currentState()
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
    this._orderedIds().forEach((id, i) => {
      const node = this.nodes.get(id)!
      const x = i * (nodeWidth + gap)
      const rect = new Rect({ x, y: 0, width: nodeWidth, height: nodeHeight, fill: fillColor, stroke: '#d97706', strokeWidth: 1.5, cornerRadius: 6 })
      const label = this.createCenteredLabel(node.value, { x, y: 0, width: nodeWidth, height: nodeHeight }, { fontSize, fill: '#1e293b' })
      this.register(`rect-${id}`, rect)
      this.registerLabel(`label-${id}`, label)
      if (node.next) {
        const arrow = new Line({ points: [x + nodeWidth, nodeHeight / 2, x + nodeWidth + gap, nodeHeight / 2], stroke: this.opts.arrowColor, strokeWidth: 2 })
        this.register(`arrow-${id}`, arrow)
      }
    })
  }

  private _currentState(): VizState {
    const { nodeWidth, nodeHeight, gap, fillColor } = this.opts
    const nodes = new Map<string, NodeState>()
    this._orderedIds().forEach((id, i) => {
      nodes.set(`rect-${id}`, { id: `rect-${id}`, x: i * (nodeWidth + gap), y: 0, width: nodeWidth, height: nodeHeight, fill: fillColor, opacity: 1 })
    })
    return { nodes }
  }
}
