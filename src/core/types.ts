import type { IUI } from 'leafer-ui'

export type EasingName =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'spring'
  | 'bounce'

export interface AnimationOptions {
  /** 动画时长（秒），默认 0.5。 */
  duration?: number
  easing?: EasingName
  /** 动画延迟（秒），默认 0。 */
  delay?: number
}

export interface HighlightOptions extends AnimationOptions {
  /** 高亮描边颜色；未传时会根据高亮填充色自动推导。 */
  highlightStrokeColor?: string
  /** 高亮描边宽度；未传时会基于当前描边宽度做兜底增强。 */
  highlightStrokeWidth?: number
}

export interface MagicMoveOptions extends AnimationOptions {
  enterAnimation?: 'fade' | 'scale' | 'slide' | 'draw'
  exitAnimation?: 'fade' | 'scale' | 'slide'
  /** 新增节点的错峰系数（0~1），类似 manim 的 lag_ratio。 */
  enterLagRatio?: number
  /** 新增节点的轻微过冲比例（>=1）。 */
  enterOvershoot?: number
}

export interface NodeState {
  id: string
  x: number
  y: number
  width: number
  height: number
  points?: number[]
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  cornerRadius?: number
  label?: string
  // 路径渲染相关（文字可视化）
  pathData?: string
  dashPattern?: number[]
  dashOffset?: number
  fillOpacity?: number
  strokeOpacity?: number
  /** 额外领域数据（不参与动画，仅用于存储）。 */
  meta?: Record<string, unknown>
}

export interface EdgeState {
  id: string
  fromId: string
  toId: string
  stroke?: string
  strokeWidth?: number
  label?: string
  directed?: boolean
}

export interface VizState {
  nodes: Map<string, NodeState>
  edges?: Map<string, EdgeState>
}

export interface StepperState {
  currentIndex: number
  totalSteps: number
  currentLabel?: string
  isFirst: boolean
  isLast: boolean
}

export interface IVisualizer {
  /** 可视化器的根 Group 节点。 */
  readonly group: IUI
  /** 以纯数据形式快照当前可视状态。 */
  getState(): VizState
  /** 从当前状态过渡到给定状态。 */
  applyState(state: VizState, options?: AnimationOptions): Promise<void>
}
