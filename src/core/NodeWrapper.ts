import type { IUI } from 'leafer-ui'
import type { NodeState } from './types'

/** 将 LeaferJS 节点与稳定 ID 绑定，并维护对应的 NodeState。 */
export class NodeWrapper {
  readonly id: string
  readonly node: IUI
  currentState: NodeState

  constructor(id: string, node: IUI, initialState: NodeState) {
    this.id = id
    this.node = node
    this.currentState = { ...initialState }
  }

  syncFromNode(): void {
    const n = this.node as IUI & Record<string, unknown>
    this.currentState = {
      ...this.currentState,
      x: (n.x as number) ?? this.currentState.x,
      y: (n.y as number) ?? this.currentState.y,
      width: (n.width as number) ?? this.currentState.width,
      height: (n.height as number) ?? this.currentState.height,
      fill: (n.fill as string) ?? this.currentState.fill,
      stroke: (n.stroke as string) ?? this.currentState.stroke,
      opacity: (n.opacity as number) ?? this.currentState.opacity,
    }
  }

  applyInstant(state: NodeState): void {
    const n = this.node as IUI & Record<string, unknown>
    n.x = state.x
    n.y = state.y
    n.width = state.width
    n.height = state.height
    if (state.fill !== undefined) n.fill = state.fill
    if (state.stroke !== undefined) n.stroke = state.stroke
    if (state.strokeWidth !== undefined) n.strokeWidth = state.strokeWidth
    if (state.opacity !== undefined) n.opacity = state.opacity
    if (state.cornerRadius !== undefined) n.cornerRadius = state.cornerRadius
    this.currentState = { ...state }
  }
}
