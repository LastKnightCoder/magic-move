import { Ellipse, Line } from 'leafer-ui'
import type { IUI } from 'leafer-ui'
import type { Scene } from '../core/Scene'
import type { AnimationOptions, HighlightOptions, VizState, NodeState } from '../core/types'
import { BaseViz } from '../core/BaseViz'
import { MagicMove } from '../core/MagicMove'

export interface TreeNodeData<T> {
  id: string
  value: T
  left?: TreeNodeData<T>
  right?: TreeNodeData<T>
}

export interface TreeVizOptions {
  x?: number
  y?: number
  nodeRadius?: number
  levelHeight?: number
  fillColor?: string
  highlightColor?: string
  visitedColor?: string
  edgeColor?: string
  fontSize?: number
}

const DEFAULTS: Required<TreeVizOptions> = {
  x: 0,
  y: 0,
  nodeRadius: 26,
  levelHeight: 80,
  fillColor: '#bfdbfe',
  highlightColor: '#6366f1',
  visitedColor: '#86efac',
  edgeColor: '#94a3b8',
  fontSize: 15,
}

export class TreeViz<T extends string | number> extends BaseViz {
  protected defaultFill: string

  private scene: Scene
  private root: TreeNodeData<T> | null
  private detachedRoots: TreeNodeData<T>[] = []
  private opts: Required<TreeVizOptions>
  private layout: Map<string, { x: number; y: number }> = new Map()
  private circleStyles: Map<string, { fill: string; stroke?: string; strokeWidth?: number }> = new Map()
  private labelStyles: Map<string, { fill: string }> = new Map()
  private edgeBindings: Map<string, { fromId: string; toId: string }> = new Map()
  private edgeSyncBound = false

  constructor(scene: Scene, root: TreeNodeData<T> | null, options?: TreeVizOptions) {
    const opts = { ...DEFAULTS, ...options }
    super(opts.x, opts.y)
    this.scene = scene
    this.root = root
    this.opts = opts
    this.defaultFill = opts.fillColor
    this._computeLayout()
    this._buildNodes()
    this._ensureEdgeSync()
  }

  computeState(): VizState {
    return this._stateFromLayout()
  }

  getState(): VizState {
    const state = super.getState()
    const values = this._collectNodeValues()
    for (const [edgeId, binding] of this.edgeBindings) {
      const edgeState = state.nodes.get(edgeId)
      if (!edgeState) continue
      edgeState.meta = {
        ...(edgeState.meta ?? {}),
        fromId: binding.fromId,
        toId: binding.toId,
      }
    }
    for (const [id, nodeState] of state.nodes) {
      if (!id.startsWith('circle-') && !id.startsWith('label-')) continue
      const nodeId = id.slice(id.indexOf('-') + 1)
      const value = values.get(nodeId)
      if (value === undefined) continue
      const isCircle = id.startsWith('circle-')
      nodeState.meta = {
        ...(nodeState.meta ?? {}),
        nodeId,
        value,
        text: String(value),
        ...(isCircle ? { enterFromFill: this.opts.fillColor } : {}),
      }
    }
    return state
  }

  async applyState(state: VizState, options?: AnimationOptions): Promise<void> {
    const before = this.getState()
    this._restoreEdgeBindingsFromState(state)
    this._ensureNodesFromState(state)
    await MagicMove.animate(this.nodeMap, before, state, options)
    const { exit } = MagicMove.diff(before, state)
    for (const id of exit) this.unregister(id)
    this._syncEdgesToNodes()
    for (const [id, node] of state.nodes) {
      if (!id.startsWith('circle-')) continue
      const nodeId = id.slice('circle-'.length)
      const fill = node.fill ?? this.opts.fillColor
      this.circleStyles.set(nodeId, {
        fill,
        stroke: node.stroke,
        strokeWidth: node.strokeWidth,
      })
      const labelState = state.nodes.get(`label-${nodeId}`)
      const labelFill = labelState?.fill ?? this._labelColorForFill(fill)
      this.labelStyles.set(nodeId, { fill: labelFill })
      this._setLabelColorInstant(nodeId, labelFill)
    }
  }

  async highlight(id: string, color: string, opts?: HighlightOptions): Promise<void> {
    const nodeId = this._nodeIdFromCircleId(id)
    if (!nodeId) {
      await super.highlight(id, color, opts)
      return
    }
    await Promise.all([
      super.highlight(id, color, opts),
      this._applyLabelColor(nodeId, this._labelColorForFill(color), opts),
    ])
    this._rememberCircleStyle(nodeId)
  }

  async unhighlight(id: string, opts?: AnimationOptions): Promise<void> {
    await super.unhighlight(id, opts)
    const nodeId = this._nodeIdFromCircleId(id)
    if (!nodeId) return
    this._rememberCircleStyle(nodeId)
    const style = this.circleStyles.get(nodeId)
    const fill = style?.fill ?? this.opts.fillColor
    await this._applyLabelColor(nodeId, this._labelColorForFill(fill), opts)
  }

  async markVisited(nodeId: string, opts?: AnimationOptions): Promise<void> {
    await this.paintNode(nodeId, this.opts.visitedColor, opts)
  }

  async setRoot(newRoot: TreeNodeData<T> | null, opts?: AnimationOptions): Promise<void> {
    await this.commitMutation(
      () => {
        this.root = newRoot
        this.detachedRoots = []
        this._computeLayout()
      },
      () => {
        this._buildNodes()
      },
      opts
    )
  }

  async insertChild(
    parentId: string | null,
    side: 'left' | 'right',
    newNode: TreeNodeData<T>,
    opts?: AnimationOptions
  ): Promise<void> {
    if (parentId === null) {
      await this.setRoot(newNode, opts)
      return
    }

    const target = this._findNodeWithParent(parentId)
    if (!target) return

    await this.commitMutation(
      () => {
        const replaced = target.node[side]
        if (replaced) this._addDetachedRoot(replaced)
        target.node[side] = newNode
        this._removeDetachedRootById(newNode.id)
        this._computeLayout()
      },
      () => {
        this._buildNodes()
      },
      { enterAnimation: 'scale', enterLagRatio: 0.06, ...opts }
    )
  }

  async setChild(
    parentId: string | null,
    side: 'left' | 'right',
    child: TreeNodeData<T> | undefined,
    opts?: AnimationOptions
  ): Promise<void> {
    if (parentId === null) {
      await this.setRoot(child ?? null, opts)
      return
    }
    const target = this._findNodeWithParent(parentId)
    if (!target) return
    await this.commitMutation(
      () => {
        const replaced = target.node[side]
        if (replaced && replaced.id !== child?.id) {
          this._addDetachedRoot(replaced)
        }
        target.node[side] = child
        if (child) this._removeDetachedRootById(child.id)
        this._computeLayout()
      },
      () => {
        this._buildNodes()
      },
      opts
    )
  }

  async rewireChild(
    parentId: string,
    side: 'left' | 'right',
    childId: string | null,
    opts?: AnimationOptions
  ): Promise<void> {
    const parentTarget = this._findNodeWithParent(parentId)
    if (!parentTarget) return

    await this.commitMutation(
      () => {
        if (childId === null) {
          const replaced = parentTarget.node[side]
          if (replaced) this._addDetachedRoot(replaced)
          parentTarget.node[side] = undefined
          this._computeLayout()
          return
        }

        const childTarget = this._findNodeWithParent(childId)
        if (!childTarget) return

        if (this._containsNode(childTarget.node, parentTarget.node)) return

        if (childTarget.parent) {
          childTarget.parent[childTarget.side!] = undefined
        } else if (this.root?.id === childTarget.node.id) {
          this.root = null
        } else {
          this._removeDetachedRootById(childTarget.node.id)
        }

        const replaced = parentTarget.node[side]
        if (replaced && replaced.id !== childTarget.node.id) {
          this._addDetachedRoot(replaced)
        }
        parentTarget.node[side] = childTarget.node
        this._computeLayout()
      },
      () => {
        this._buildNodes()
      },
      opts
    )
  }

  async rotateLeft(pivotId: string, opts?: AnimationOptions): Promise<void> {
    const target = this._findNodeWithParent(pivotId)
    if (!target || !target.node.right) return

    await this.commitMutation(
      () => {
        const pivot = target.node
        const rightChild = pivot.right!

        pivot.right = rightChild.left
        rightChild.left = pivot

        if (!target.parent) {
          this.root = rightChild
        } else if (target.side === 'left') {
          target.parent.left = rightChild
        } else {
          target.parent.right = rightChild
        }

        this._computeLayout()
      },
      () => {
        this._buildNodes()
      },
      opts
    )
  }

  async rotateRight(pivotId: string, opts?: AnimationOptions): Promise<void> {
    const target = this._findNodeWithParent(pivotId)
    if (!target || !target.node.left) return

    await this.commitMutation(
      () => {
        const pivot = target.node
        const leftChild = pivot.left!

        pivot.left = leftChild.right
        leftChild.right = pivot

        if (!target.parent) {
          this.root = leftChild
        } else if (target.side === 'left') {
          target.parent.left = leftChild
        } else {
          target.parent.right = leftChild
        }

        this._computeLayout()
      },
      () => {
        this._buildNodes()
      },
      opts
    )
  }

  async showTraversalPath(nodeIds: string[], opts?: AnimationOptions): Promise<void> {
    for (const id of nodeIds) {
      await this.paintNode(id, this.opts.highlightColor, opts)
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  async paintNode(nodeId: string, fill: string, opts?: AnimationOptions): Promise<void> {
    await this.highlight(`circle-${nodeId}`, fill, opts)
  }

  private _findNodeWithParent(
    targetId: string
  ): { node: TreeNodeData<T>; parent: TreeNodeData<T> | null; side: 'left' | 'right' | null } | null {
    const walk = (
      node: TreeNodeData<T> | undefined,
      parent: TreeNodeData<T> | null,
      side: 'left' | 'right' | null
    ): { node: TreeNodeData<T>; parent: TreeNodeData<T> | null; side: 'left' | 'right' | null } | null => {
      if (!node) return null
      if (node.id === targetId) return { node, parent, side }

      const leftFound = walk(node.left, node, 'left')
      if (leftFound) return leftFound
      return walk(node.right, node, 'right')
    }

    for (const root of this._allRoots()) {
      const found = walk(root, null, null)
      if (found) return found
    }
    return null
  }

  private _computeLayout(): void {
    const previousLayout = new Map(this.layout)
    this.layout.clear()
    const components = this._allRoots()
    if (components.length === 0) return

    let autoCursor = 0
    const componentGap = this.opts.nodeRadius * 2 + 48
    for (const componentRoot of components) {
      const { positions, minX, maxX, rootX } = this._layoutComponent(componentRoot)
      const previousRootPos = previousLayout.get(componentRoot.id)
      const shift = previousRootPos ? previousRootPos.x - rootX : autoCursor - minX
      let componentMaxX = Number.NEGATIVE_INFINITY

      for (const [id, pos] of positions) {
        const x = pos.x + shift
        this.layout.set(id, { x, y: pos.y })
        componentMaxX = Math.max(componentMaxX, x)
      }
      const width = maxX - minX + this.opts.nodeRadius * 2
      const fallbackMax = shift + minX + width
      autoCursor = Math.max(
        autoCursor,
        Number.isFinite(componentMaxX)
          ? componentMaxX + this.opts.nodeRadius * 2 + componentGap
          : fallbackMax + componentGap
      )
    }
    this._pruneStyles()
  }

  private _buildNodes(): void {
    const { nodeRadius, edgeColor, fillColor, fontSize } = this.opts
    this.edgeBindings.clear()
    // 先画边再画节点，避免边覆盖节点。
    const drawEdges = (node: TreeNodeData<T> | undefined): void => {
      if (!node) return
      const pos = this.layout.get(node.id)!
      for (const child of [node.left, node.right]) {
        if (!child) continue
        const cp = this.layout.get(child.id)!
        const line = new Line({ points: [pos.x + nodeRadius, pos.y + nodeRadius, cp.x + nodeRadius, cp.y + nodeRadius], stroke: edgeColor, strokeWidth: 2 })
        const edgeId = `edge-${child.id}`
        this.edgeBindings.set(edgeId, { fromId: node.id, toId: child.id })
        this.register(edgeId, line)
        drawEdges(child)
      }
    }
    for (const root of this._allRoots()) {
      drawEdges(root)
    }

    const drawNodes = (node: TreeNodeData<T> | undefined): void => {
      if (!node) return
      const pos = this.layout.get(node.id)!
      const style = this.circleStyles.get(node.id)
      const circleFill = style?.fill ?? fillColor
      const circleStroke = style?.stroke ?? '#93c5fd'
      const circleStrokeWidth = style?.strokeWidth ?? 2
      const labelStyle = this.labelStyles.get(node.id)
      const labelFill = labelStyle?.fill ?? this._labelColorForFill(circleFill)

      const circle = new Ellipse({
        x: pos.x,
        y: pos.y,
        width: nodeRadius * 2,
        height: nodeRadius * 2,
        fill: circleFill,
        stroke: circleStroke,
        strokeWidth: circleStrokeWidth,
      })
      const label = this.createCenteredLabel(
        node.value,
        { x: pos.x, y: pos.y, width: nodeRadius * 2, height: nodeRadius * 2 },
        { fontSize, fill: labelFill }
      )
      this.register(`circle-${node.id}`, circle)
      this.registerLabel(`label-${node.id}`, label)
      drawNodes(node.left)
      drawNodes(node.right)
    }
    for (const root of this._allRoots()) {
      drawNodes(root)
    }
    this._syncEdgesToNodes()
  }

  private _ensureEdgeSync(): void {
    if (this.edgeSyncBound) return
    this.edgeSyncBound = true
    this.scene.leafer.on('render.before', () => {
      this._syncEdgesToNodes()
    })
  }

  private _syncEdgesToNodes(): void {
    for (const [edgeId, binding] of this.edgeBindings) {
      const edgeNode = this.nodeMap.get(edgeId) as (Line & Record<string, unknown>) | undefined
      const fromNode = this.nodeMap.get(`circle-${binding.fromId}`)
      const toNode = this.nodeMap.get(`circle-${binding.toId}`)
      if (!edgeNode || !fromNode || !toNode) continue
      const from = this._centerFromBounds(fromNode)
      const to = this._centerFromBounds(toNode)
      const points = [from.x, from.y, to.x, to.y]
      Object.assign(edgeNode, { points })
    }
  }

  private _restoreEdgeBindingsFromState(state: VizState): void {
    const bindings = new Map<string, { fromId: string; toId: string }>()
    for (const [id, node] of state.nodes) {
      if (!id.startsWith('edge-')) continue
      const meta = node.meta
      if (!meta || typeof meta !== 'object') continue
      const fromId = (meta as Record<string, unknown>).fromId
      const toId = (meta as Record<string, unknown>).toId
      if (typeof fromId !== 'string' || typeof toId !== 'string') continue
      bindings.set(id, { fromId, toId })
    }
    if (bindings.size > 0) {
      this.edgeBindings = bindings
    }
  }

  private _ensureNodesFromState(state: VizState): void {
    const firstNode = this._firstNodeInGroup()
    for (const [id, nodeState] of state.nodes) {
      if (this.nodeMap.has(id)) continue

      if (id.startsWith('edge-')) {
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
        continue
      }

      if (id.startsWith('circle-')) {
        const circle = new Ellipse({
          x: nodeState.x,
          y: nodeState.y,
          width: nodeState.width,
          height: nodeState.height,
          fill: nodeState.fill ?? this.opts.fillColor,
          stroke: nodeState.stroke ?? '#93c5fd',
          strokeWidth: nodeState.strokeWidth ?? 2,
          opacity: nodeState.opacity ?? 1,
        })
        this.register(id, circle)
        continue
      }

      if (id.startsWith('label-')) {
        const nodeId = id.slice('label-'.length)
        const text = this._labelTextFromState(state, nodeId, nodeState)
        const label = this.createCenteredLabel(
          text,
          { x: nodeState.x, y: nodeState.y, width: nodeState.width, height: nodeState.height },
          { fontSize: this.opts.fontSize, fill: nodeState.fill ?? '#1e293b', opacity: nodeState.opacity ?? 1 }
        )
        this.registerLabel(id, label)
      }
    }
  }

  private _firstNodeInGroup(): IUI | null {
    const group = this.group as unknown as { children?: IUI[] }
    const children = group.children
    if (!children || children.length === 0) return null
    return children[0] ?? null
  }

  private _centerFromBounds(node: unknown): { x: number; y: number } {
    const n = node as {
      getBounds?: (type?: string, relative?: string) => { x: number; y: number; width: number; height: number }
      x?: number
      y?: number
      width?: number
      height?: number
    }
    const bounds = n.getBounds?.('box', 'local')
    if (bounds) return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    const x = typeof n.x === 'number' ? n.x : 0
    const y = typeof n.y === 'number' ? n.y : 0
    const width = typeof n.width === 'number' ? n.width : this.opts.nodeRadius * 2
    const height = typeof n.height === 'number' ? n.height : this.opts.nodeRadius * 2
    return { x: x + width / 2, y: y + height / 2 }
  }

  private _stateFromLayout(): VizState {
    const { nodeRadius, fillColor, edgeColor } = this.opts
    const nodes = new Map<string, NodeState>()

    const collect = (node: TreeNodeData<T> | undefined): void => {
      if (!node) return
      const pos = this.layout.get(node.id)
      if (!pos) return
      for (const child of [node.left, node.right]) {
        if (!child) continue
        const cp = this.layout.get(child.id)
        if (!cp) continue
        nodes.set(`edge-${child.id}`, {
          id: `edge-${child.id}`,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          points: [pos.x + nodeRadius, pos.y + nodeRadius, cp.x + nodeRadius, cp.y + nodeRadius],
          stroke: edgeColor,
          strokeWidth: 2,
          opacity: 1,
          meta: { fromId: node.id, toId: child.id },
        })
      }
      collect(node.left)
      collect(node.right)
    }
    for (const root of this._allRoots()) {
      collect(root)
    }

    for (const [id, pos] of this.layout) {
      const style = this.circleStyles.get(id)
      const fill = style?.fill ?? fillColor
      nodes.set(`circle-${id}`, {
        id: `circle-${id}`,
        x: pos.x,
        y: pos.y,
        width: nodeRadius * 2,
        height: nodeRadius * 2,
        fill,
        stroke: style?.stroke,
        strokeWidth: style?.strokeWidth,
        opacity: 1,
      })
      const labelStyle = this.labelStyles.get(id)
      nodes.set(`label-${id}`, {
        id: `label-${id}`,
        x: pos.x,
        y: pos.y,
        width: nodeRadius * 2,
        height: nodeRadius * 2,
        fill: labelStyle?.fill ?? this._labelColorForFill(fill),
        opacity: 1,
      })
    }
    return { nodes }
  }

  private _labelColorForFill(fill: string): string {
    const hex = fill.trim()
    if (!hex.startsWith('#')) return '#ffffff'
    const value = hex.slice(1)
    if (value.length !== 6) return '#ffffff'
    const r = Number.parseInt(value.slice(0, 2), 16)
    const g = Number.parseInt(value.slice(2, 4), 16)
    const b = Number.parseInt(value.slice(4, 6), 16)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return '#ffffff'
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b
    return luminance > 155 ? '#0f172a' : '#ffffff'
  }

  private _nodeIdFromCircleId(id: string): string | null {
    if (!id.startsWith('circle-')) return null
    return id.slice('circle-'.length)
  }

  private _rememberCircleStyle(nodeId: string): void {
    const circleNode = this.nodeMap.get(`circle-${nodeId}`)
    if (!circleNode) return
    const circle = circleNode as typeof circleNode & Record<string, unknown>
    this.circleStyles.set(nodeId, {
      fill: typeof circle.fill === 'string' ? (circle.fill as string) : this.opts.fillColor,
      stroke: typeof circle.stroke === 'string' ? (circle.stroke as string) : undefined,
      strokeWidth: typeof circle.strokeWidth === 'number' ? (circle.strokeWidth as number) : undefined,
    })
  }

  private async _applyLabelColor(nodeId: string, fill: string, opts?: AnimationOptions): Promise<void> {
    this.labelStyles.set(nodeId, { fill })
    const pathLabel = this.getPathLabel(`label-${nodeId}`)
    if (pathLabel) {
      await Promise.all(pathLabel.glyphs.map((glyph) => this.animateProp(glyph.node, { fill }, opts)))
      return
    }
    await this.setNodeProp(`label-${nodeId}`, { fill }, opts)
  }

  private _pruneStyles(): void {
    const activeIds = new Set(this.layout.keys())
    for (const id of this.circleStyles.keys()) {
      if (!activeIds.has(id)) this.circleStyles.delete(id)
    }
    for (const id of this.labelStyles.keys()) {
      if (!activeIds.has(id)) this.labelStyles.delete(id)
    }
  }

  private _setLabelColorInstant(nodeId: string, fill: string): void {
    const pathLabel = this.getPathLabel(`label-${nodeId}`)
    if (pathLabel) {
      for (const glyph of pathLabel.glyphs) {
        Object.assign(glyph.node as unknown as Record<string, unknown>, { fill })
      }
      return
    }
    const label = this.nodeMap.get(`label-${nodeId}`)
    if (!label) return
    Object.assign(label as unknown as Record<string, unknown>, { fill })
  }

  private _labelTextFromState(state: VizState, nodeId: string, labelState: NodeState): string {
    const labelMeta = labelState.meta
    if (labelMeta && typeof labelMeta === 'object') {
      const text = (labelMeta as Record<string, unknown>).text
      if (typeof text === 'string' && text.length > 0) return text
      const value = (labelMeta as Record<string, unknown>).value
      if (typeof value === 'string' || typeof value === 'number') return String(value)
    }

    const circleState = state.nodes.get(`circle-${nodeId}`)
    const circleMeta = circleState?.meta
    if (circleMeta && typeof circleMeta === 'object') {
      const value = (circleMeta as Record<string, unknown>).value
      if (typeof value === 'string' || typeof value === 'number') return String(value)
    }
    return nodeId
  }

  private _collectNodeValues(): Map<string, T> {
    const values = new Map<string, T>()
    const walk = (node: TreeNodeData<T> | undefined): void => {
      if (!node || values.has(node.id)) return
      values.set(node.id, node.value)
      walk(node.left)
      walk(node.right)
    }
    for (const root of this._allRoots()) {
      walk(root)
    }
    return values
  }

  private _allRoots(): TreeNodeData<T>[] {
    const roots: TreeNodeData<T>[] = []
    if (this.root) roots.push(this.root)
    roots.push(...this.detachedRoots)
    return roots
  }

  private _layoutComponent(root: TreeNodeData<T>): {
    positions: Map<string, { x: number; y: number }>
    minX: number
    maxX: number
    rootX: number
  } {
    const unit = this.opts.nodeRadius * 2 + 20
    const positions = new Map<string, { x: number; y: number }>()
    let cursor = 0
    const place = (node: TreeNodeData<T> | undefined, depth: number): void => {
      if (!node) return
      place(node.left, depth + 1)
      positions.set(node.id, { x: cursor * unit, y: depth * this.opts.levelHeight })
      cursor++
      place(node.right, depth + 1)
    }
    place(root, 0)

    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    for (const { x } of positions.values()) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
      return { positions: new Map(), minX: 0, maxX: unit, rootX: 0 }
    }
    const rootX = positions.get(root.id)?.x ?? minX
    return { positions, minX, maxX, rootX }
  }

  private _addDetachedRoot(node: TreeNodeData<T>): void {
    if (this.root?.id === node.id) return
    if (this.detachedRoots.some((r) => r.id === node.id)) return
    for (const root of this.detachedRoots) {
      if (this._containsNode(root, node)) return
    }
    this.detachedRoots = this.detachedRoots.filter((r) => !this._containsNode(node, r))
    this.detachedRoots.push(node)
  }

  private _removeDetachedRootById(nodeId: string): void {
    this.detachedRoots = this.detachedRoots.filter((r) => r.id !== nodeId)
  }

  private _containsNode(root: TreeNodeData<T> | undefined, target: TreeNodeData<T>): boolean {
    if (!root) return false
    if (root.id === target.id) return true
    return this._containsNode(root.left, target) || this._containsNode(root.right, target)
  }
}
