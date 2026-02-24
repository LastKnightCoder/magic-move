import { Ellipse, Line } from 'leafer-ui'
import type { Scene } from '../core/Scene'
import type { AnimationOptions, VizState, NodeState } from '../core/types'
import { BaseViz } from '../core/BaseViz'
import { MagicMove } from '../core/MagicMove'

export interface GraphNodeData<T> {
  id: string
  value: T
  x?: number
  y?: number
}

export interface GraphEdgeData {
  id: string
  from: string
  to: string
  directed?: boolean
  weight?: number
}

export interface GraphVizOptions {
  x?: number
  y?: number
  nodeRadius?: number
  fillColor?: string
  visitedColor?: string
  highlightEdgeColor?: string
  edgeColor?: string
  fontSize?: number
  layout?: 'circular' | 'manual'
  width?: number
  height?: number
}

const DEFAULTS: Required<GraphVizOptions> = {
  x: 0,
  y: 0,
  nodeRadius: 24,
  fillColor: '#fecdd3',
  visitedColor: '#86efac',
  highlightEdgeColor: '#f59e0b',
  edgeColor: '#94a3b8',
  fontSize: 14,
  layout: 'circular',
  width: 400,
  height: 400,
}

export class GraphViz<T extends string | number> extends BaseViz {
  protected defaultFill: string

  private scene: Scene
  private graphNodes: Map<string, GraphNodeData<T>>
  private edges: Map<string, GraphEdgeData>
  private opts: Required<GraphVizOptions>
  private positions: Map<string, { x: number; y: number }> = new Map()
  private edgeStyles: Map<string, { stroke: string; strokeWidth: number }> = new Map()

  constructor(scene: Scene, nodes: GraphNodeData<T>[], edges: GraphEdgeData[], options?: GraphVizOptions) {
    const opts = { ...DEFAULTS, ...options }
    super(opts.x, opts.y)
    this.scene = scene
    this.opts = opts
    this.defaultFill = opts.fillColor
    this.graphNodes = new Map(nodes.map((n) => [n.id, n]))
    this.edges = new Map(edges.map((e) => [e.id, e]))
    this._computeLayout([...this.graphNodes.values()])
    this._buildGraph()
  }

  computeState(): VizState {
    return this._stateFromPositions()
  }

  async applyState(state: VizState, options?: AnimationOptions): Promise<void> {
    const before = this.getState()
    this._ensureEdgeNodesFromState(state)
    await MagicMove.animate(this.nodeMap, before, state, options)
    const { exit } = MagicMove.diff(before, state)
    for (const id of exit) this.unregister(id)
    for (const [id, node] of state.nodes) {
      if (!id.startsWith('edge-')) continue
      const edgeId = id.slice('edge-'.length)
      this.edgeStyles.set(edgeId, {
        stroke: node.stroke ?? this.opts.edgeColor,
        strokeWidth: node.strokeWidth ?? 2,
      })
    }
  }

  private _ensureEdgeNodesFromState(state: VizState): void {
    const firstNode = this._firstNodeInGroup()
    for (const [id, nodeState] of state.nodes) {
      if (!id.startsWith('edge-')) continue
      if (this.nodeMap.has(id)) continue
      const points = nodeState.points && nodeState.points.length >= 4 ? [...nodeState.points] : [0, 0, 0, 0]
      const line = new Line({
        points,
        stroke: nodeState.stroke ?? this.opts.edgeColor,
        strokeWidth: nodeState.strokeWidth ?? 2,
        opacity: 0,
      })
      if (firstNode) {
        this.group.addBefore(line, firstNode)
      } else {
        this.group.add(line)
      }
      this.nodeMap.set(id, line)
    }
  }

  private _firstNodeInGroup(): unknown {
    const group = this.group as unknown as { children?: unknown[] }
    const children = group.children
    if (!children || children.length === 0) return null
    return children[0] ?? null
  }

  async markVisited(nodeId: string, opts?: AnimationOptions): Promise<void> {
    await this.highlight(`circle-${nodeId}`, this.opts.visitedColor, opts)
  }

  async markEdgeTraversed(edgeId: string, opts?: AnimationOptions): Promise<void> {
    await this.setNodeProp(`edge-${edgeId}`, { stroke: this.opts.highlightEdgeColor, strokeWidth: 3 }, opts)
    this.edgeStyles.set(edgeId, { stroke: this.opts.highlightEdgeColor, strokeWidth: 3 })
  }

  async addNode(node: GraphNodeData<T>, opts?: AnimationOptions): Promise<void> {
    await this.commitMutation(
      () => {
        this.graphNodes.set(node.id, node)
        this._computeLayout([...this.graphNodes.values()])
      },
      () => {
        this._buildGraph()
      },
      { enterAnimation: 'scale', enterLagRatio: 0.06, ...opts }
    )
  }

  async removeNode(nodeId: string, opts?: AnimationOptions): Promise<void> {
    await this.commitMutation(
      () => {
        this.graphNodes.delete(nodeId)
        for (const [id, edge] of this.edges) {
          if (edge.from === nodeId || edge.to === nodeId) this.edges.delete(id)
        }
      },
      () => {
        this._buildGraph()
      },
      { exitAnimation: 'fade', ...opts }
    )
  }

  async addEdge(edge: GraphEdgeData, opts?: AnimationOptions): Promise<void> {
    await this.commitMutation(
      () => {
        this.edges.set(edge.id, edge)
      },
      () => {
        this._buildGraph()
      },
      { enterAnimation: 'draw', enterLagRatio: 0.04, ...opts }
    )
  }

  async removeEdge(edgeId: string, opts?: AnimationOptions): Promise<void> {
    await this.commitMutation(
      () => {
        this.edges.delete(edgeId)
      },
      () => {
        this._buildGraph()
      },
      { exitAnimation: 'fade', ...opts }
    )
  }

  private _computeLayout(nodes: GraphNodeData<T>[]): void {
    const { layout, width, height, nodeRadius } = this.opts
    const cx = width / 2
    const cy = height / 2
    const r = Math.min(cx, cy) - nodeRadius * 2

    nodes.forEach((node, i) => {
      if (node.x !== undefined && node.y !== undefined) {
        this.positions.set(node.id, { x: node.x, y: node.y })
      } else if (layout === 'circular') {
        const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2
        this.positions.set(node.id, { x: cx + r * Math.cos(angle) - nodeRadius, y: cy + r * Math.sin(angle) - nodeRadius })
      } else {
        this.positions.set(node.id, { x: (i % 4) * 100, y: Math.floor(i / 4) * 100 })
      }
    })
  }

  private _buildGraph(): void {
    const { nodeRadius, edgeColor, fillColor, fontSize } = this.opts
    // 先画边，保证边在线条层而节点在上层。
    for (const [id, edge] of this.edges) {
      const fp = this.positions.get(edge.from)
      const tp = this.positions.get(edge.to)
      if (!fp || !tp) continue
      const style = this.edgeStyles.get(id)
      const line = new Line({
        points: [fp.x + nodeRadius, fp.y + nodeRadius, tp.x + nodeRadius, tp.y + nodeRadius],
        stroke: style?.stroke ?? edgeColor,
        strokeWidth: style?.strokeWidth ?? 2,
      })
      this.register(`edge-${id}`, line)
    }
    for (const [id, node] of this.graphNodes) {
      const pos = this.positions.get(id)!
      const circle = new Ellipse({ x: pos.x, y: pos.y, width: nodeRadius * 2, height: nodeRadius * 2, fill: fillColor, stroke: '#fda4af', strokeWidth: 2 })
      const label = this.createCenteredLabel(node.value, { x: pos.x, y: pos.y, width: nodeRadius * 2, height: nodeRadius * 2 }, { fontSize, fill: '#1e293b' })
      this.register(`circle-${id}`, circle)
      this.registerLabel(`label-${id}`, label)
    }
  }

  private _stateFromPositions(): VizState {
    const { nodeRadius, fillColor, edgeColor } = this.opts
    const nodes = new Map<string, NodeState>()
    for (const [edgeId, edge] of this.edges) {
      const fp = this.positions.get(edge.from)
      const tp = this.positions.get(edge.to)
      if (!fp || !tp) continue
      const style = this.edgeStyles.get(edgeId)
      nodes.set(`edge-${edgeId}`, {
        id: `edge-${edgeId}`,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [fp.x + nodeRadius, fp.y + nodeRadius, tp.x + nodeRadius, tp.y + nodeRadius],
        stroke: style?.stroke ?? edgeColor,
        strokeWidth: style?.strokeWidth ?? 2,
        opacity: 1,
        meta: { fromId: edge.from, toId: edge.to },
      })
    }
    for (const [id, pos] of this.positions) {
      if (!this.graphNodes.has(id)) continue
      nodes.set(`circle-${id}`, { id: `circle-${id}`, x: pos.x, y: pos.y, width: nodeRadius * 2, height: nodeRadius * 2, fill: fillColor, opacity: 1 })
      nodes.set(`label-${id}`, { id: `label-${id}`, x: pos.x, y: pos.y, width: nodeRadius * 2, height: nodeRadius * 2, fill: '#1e293b', opacity: 1 })
    }
    return { nodes }
  }
}
