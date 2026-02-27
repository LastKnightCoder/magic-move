import type { BaseViz } from './BaseViz'
import type { VizState, StepperState, NodeState, EdgeState } from './types'

interface Step {
  label: string
  fn: () => Promise<void>
}

export class Stepper {
  private _steps: Step[] = []
  // snapshots[0] 是初始状态；snapshots[i+1] 是执行完第 i 步后的状态。
  private _snapshots: Array<Map<BaseViz, VizState>> = []
  private _currentIndex = -1
  private _running = false

  onStepChange?: (state: StepperState) => void

  constructor(private visualizers: BaseViz[]) {}

  /** 捕获初始快照；应在所有可视化器完成初次渲染后调用。 */
  init(): this {
    this._snapshots[0] = this._capture()
    return this
  }

  step(label: string, fn: () => Promise<void>): this {
    this._steps.push({ label, fn })
    return this
  }

  /**
   * 对于已执行过的步骤，优先回放快照而不重复执行 step fn，
   * 避免在“回退后再次前进”时对底层数据结构做二次 mutation。
   */
  async next(): Promise<void> {
    if (this._running || this._currentIndex >= this._steps.length - 1) return
    this._running = true
    try {
      const targetIndex = this._currentIndex + 1
      this._currentIndex = targetIndex
      this.onStepChange?.(this._state())

      const existingSnapshot = this._snapshots[targetIndex + 1]
      if (existingSnapshot) {
        await this._restore(existingSnapshot)
      } else {
        await this._steps[targetIndex].fn()
        this._snapshots[targetIndex + 1] = this._capture()
      }
    } finally {
      this._running = false
    }
  }

  async prev(): Promise<void> {
    if (this._running || this._currentIndex < 0) return
    this._running = true
    try {
      this._currentIndex--
      this.onStepChange?.(this._state())
      await this._restore(this._snapshots[this._currentIndex + 1])
    } finally {
      this._running = false
    }
  }

  async goto(index: number): Promise<void> {
    if (this._running || index === this._currentIndex) return
    if (index > this._currentIndex && !this._snapshots[index + 1]) {
      while (this._currentIndex < index) await this.next()
      return
    }

    this._running = true
    try {
      this._currentIndex = index
      this.onStepChange?.(this._state())
      await this._restore(this._snapshots[index + 1])
    } finally {
      this._running = false
    }
  }

  async reset(): Promise<void> {
    if (this._running) return
    this._running = true
    try {
      this._currentIndex = -1
      this.onStepChange?.(this._state())
      await this._restore(this._snapshots[0])
    } finally {
      this._running = false
    }
  }

  get currentIndex(): number { return this._currentIndex }
  get totalSteps(): number { return this._steps.length }
  get stepLabels(): string[] { return this._steps.map(s => s.label) }
  get isFirst(): boolean { return this._currentIndex < 0 }
  get isLast(): boolean { return this._currentIndex >= this._steps.length - 1 }

  /**
   * 导出内部快照，便于外部做持久化（如 JSON 序列化）。
   */
  exportSnapshots(): Array<Map<BaseViz, VizState>> {
    return this._snapshots.map((snapshot) => this._cloneSnapshot(snapshot))
  }

  /**
   * 导入快照并重置游标。导入后 step 的执行函数将被占位函数替代，
   * 该模式适合“回放快照”，不适合继续执行业务 mutation 逻辑。
   */
  importSnapshots(snapshots: Array<Map<BaseViz, VizState>>, stepLabels?: string[]): this {
    this._snapshots = snapshots.map((snapshot) => this._cloneSnapshot(snapshot))
    const total = Math.max(this._snapshots.length - 1, 0)
    this._steps = Array.from({ length: total }, (_, index) => ({
      label: stepLabels?.[index] ?? `Step ${index + 1}`,
      fn: async () => undefined,
    }))
    this._currentIndex = -1
    this.onStepChange?.(this._state())
    return this
  }

  private _capture(): Map<BaseViz, VizState> {
    return new Map(this.visualizers.map(v => [v, v.getState()]))
  }

  private async _restore(snapshot: Map<BaseViz, VizState>): Promise<void> {
    await Promise.all([...snapshot.entries()].map(([v, s]) => v.applyState(this._cloneVizState(s))))
  }

  private _state(): StepperState {
    return {
      currentIndex: this._currentIndex,
      totalSteps: this._steps.length,
      currentLabel: this._currentIndex >= 0 ? this._steps[this._currentIndex]?.label : undefined,
      isFirst: this.isFirst,
      isLast: this.isLast,
    }
  }

  private _cloneSnapshot(snapshot: Map<BaseViz, VizState>): Map<BaseViz, VizState> {
    const cloned = new Map<BaseViz, VizState>()
    for (const [viz, state] of snapshot.entries()) {
      cloned.set(viz, this._cloneVizState(state))
    }
    return cloned
  }

  private _cloneVizState(state: VizState): VizState {
    const nodes = new Map<string, NodeState>()
    for (const [id, node] of state.nodes.entries()) {
      nodes.set(id, this._cloneNodeState(node))
    }

    let edges: Map<string, EdgeState> | undefined
    if (state.edges) {
      edges = new Map<string, EdgeState>()
      for (const [id, edge] of state.edges.entries()) {
        edges.set(id, { ...edge })
      }
    }

    return { nodes, edges }
  }

  private _cloneNodeState(node: NodeState): NodeState {
    const cloned: NodeState = { ...node }
    if (node.points) cloned.points = [...node.points]
    if (node.dashPattern) cloned.dashPattern = [...node.dashPattern]
    if (node.meta && typeof node.meta === 'object') cloned.meta = { ...node.meta }
    return cloned
  }
}
