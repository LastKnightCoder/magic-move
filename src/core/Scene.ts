import { Leafer, Frame, Text } from 'leafer-ui'
import type { IVisualizer, AnimationOptions, MagicMoveOptions, VizState } from './types'
import { MagicMove } from './MagicMove'
import { Timeline } from './Timeline'

export interface SceneOptions {
  /** 逻辑宽度（px）；未传时使用 canvas 的 clientWidth。 */
  width?: number
  height: number
  background?: string
  fps?: number
}

/**
 * 场景调度器：封装 Leafer 实例，并提供基于 async/await 的动画编排能力。
 */
export class Scene {
  readonly leafer: Leafer
  readonly frame: Frame

  constructor(canvas: HTMLCanvasElement, options: SceneOptions) {
    const width = options.width ?? canvas.clientWidth ?? canvas.width
    const height = options.height

    this.leafer = new Leafer({
      view: canvas,
      width,
      height,
      type: 'design',
    })

    this.frame = new Frame({
      width,
      height,
      fill: options.background ?? '#ffffff',
      overflow: 'hide',
    })

    this.leafer.add(this.frame)

    // 仅在未显式指定宽度时，跟随容器宽度变化。
    if (typeof ResizeObserver !== 'undefined' && !options.width) {
      const ro = new ResizeObserver((entries) => {
        const newWidth = entries[0]?.contentRect.width
        if (newWidth && newWidth !== this.leafer.width) {
          this.leafer.width = newWidth
          this.frame.width = newWidth
        }
      })
      ro.observe(canvas.parentElement ?? canvas)
      this._resizeObserver = ro
    }
  }

  private _resizeObserver?: ResizeObserver

  play(...animations: Promise<void>[]): Promise<void> {
    return Promise.all(animations).then(() => undefined)
  }

  wait(seconds: number): Promise<void> {
    return Timeline.sleep(seconds)
  }

  /**
   * 按顺序执行步骤。
   * 这里要求传入回调而不是已启动的 Promise，确保前一步完成后才会开始下一步。
   */
  async sequence(...steps: Array<() => Promise<void>>): Promise<void> {
    for (const step of steps) {
      await step()
    }
  }

  /**
   * 将可视化器从当前状态过渡到指定新状态（依赖 nodeMap 驱动）。
   */
  async transition(
    viz: IVisualizer & { nodeMap: Map<string, import('leafer-ui').IUI> },
    newState: VizState,
    options?: MagicMoveOptions
  ): Promise<void> {
    const before = viz.getState()
    await MagicMove.animate(viz.nodeMap, before, newState, options)
  }

  /**
   * 便捷流程：快照当前状态 -> 执行数据变更 -> 计算新状态 -> 执行动画过渡。
   */
  async morph(
    viz: IVisualizer & { nodeMap: Map<string, import('leafer-ui').IUI>; computeState(): VizState },
    mutateFn: () => void,
    options?: MagicMoveOptions
  ): Promise<void> {
    const before = viz.getState()
    mutateFn()
    const after = viz.computeState()
    await MagicMove.animate(viz.nodeMap, before, after, options)
  }

  add(viz: IVisualizer): void {
    this.frame.add(viz.group)
  }

  remove(viz: IVisualizer): void {
    this.frame.remove(viz.group)
  }

  addText(x: number, y: number, text: string, options?: { fontSize?: number; fill?: string; fontWeight?: string }): void {
    this.frame.add(new Text({
      x,
      y,
      text,
      fontSize: options?.fontSize ?? 14,
      fill: options?.fill ?? '#475569',
      fontWeight: options?.fontWeight ?? 'normal',
    }))
  }

  clear(): void {
    this.frame.clear()
  }

  destroy(): void {
    this._resizeObserver?.disconnect()
    this.leafer.destroy()
  }
}
