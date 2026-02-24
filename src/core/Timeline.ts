/**
 * 低层时间轴工具：支持按绝对时间调度步骤，或按当前尾部顺序追加。
 */
export class Timeline {
  private steps: Array<{ time: number; fn: () => Promise<void> }> = []
  private _currentTime = 0

  get currentTime(): number {
    return this._currentTime
  }

  at(time: number, fn: () => Promise<void>): this {
    this.steps.push({ time, fn })
    return this
  }

  then(fn: () => Promise<void>): this {
    const lastTime = this.steps.length > 0 ? Math.max(...this.steps.map((s) => s.time)) : 0
    this.steps.push({ time: lastTime, fn })
    return this
  }

  async run(): Promise<void> {
    const sorted = [...this.steps].sort((a, b) => a.time - b.time)
    const startTime = performance.now()

    for (const step of sorted) {
      const elapsed = (performance.now() - startTime) / 1000
      const wait = step.time - elapsed
      if (wait > 0) await Timeline.sleep(wait)
      this._currentTime = step.time
      await step.fn()
    }
  }

  static sleep(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000))
  }
}
