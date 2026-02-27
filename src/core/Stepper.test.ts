import { describe, expect, it, vi } from 'vitest'
import { Stepper } from './Stepper'
import type { BaseViz } from './BaseViz'
import type { VizState } from './types'

class MockViz {
  private _modelValue = 0
  private _renderValue = 0

  get modelValue(): number {
    return this._modelValue
  }

  get renderValue(): number {
    return this._renderValue
  }

  mutate(): void {
    this._modelValue += 1
    this._renderValue = this._modelValue
  }

  getState(): VizState {
    return {
      nodes: new Map([
        [
          'n',
          {
            id: 'n',
            x: this._renderValue,
            y: 0,
            width: 1,
            height: 1,
            opacity: 1,
          },
        ],
      ]),
    }
  }

  async applyState(state: VizState): Promise<void> {
    this._renderValue = state.nodes.get('n')?.x ?? 0
  }
}

function createStepper(stepCount: number): {
  viz: MockViz
  stepper: Stepper
  steps: Array<ReturnType<typeof vi.fn>>
} {
  const viz = new MockViz()
  const stepper = new Stepper([viz as unknown as BaseViz]).init()
  const steps = Array.from({ length: stepCount }, (_, idx) => {
    const fn = vi.fn(async () => {
      viz.mutate()
    })
    stepper.step(`step-${idx + 1}`, fn)
    return fn
  })
  return { viz, stepper, steps }
}

describe('Stepper snapshot replay semantics', () => {
  it('next should emit step change before step animation completes', async () => {
    const viz = new MockViz()
    const stepper = new Stepper([viz as unknown as BaseViz]).init()

    let resolveStep: (() => void) | undefined
    const stepStarted = vi.fn()
    stepper.step('step-1', async () => {
      stepStarted()
      await new Promise<void>((resolve) => { resolveStep = resolve })
      viz.mutate()
    })

    const onStepChange = vi.fn()
    stepper.onStepChange = onStepChange

    const nextPromise = stepper.next()

    expect(stepStarted).toHaveBeenCalledTimes(1)
    expect(onStepChange).toHaveBeenCalledTimes(1)
    expect(onStepChange).toHaveBeenLastCalledWith({
      currentIndex: 0,
      totalSteps: 1,
      currentLabel: 'step-1',
      isFirst: false,
      isLast: true,
    })

    resolveStep?.()
    await nextPromise
  })

  it('replay existing snapshot should not re-run step mutation', async () => {
    const { viz, stepper, steps } = createStepper(2)

    await stepper.next()
    await stepper.next()
    expect(steps[0]).toHaveBeenCalledTimes(1)
    expect(steps[1]).toHaveBeenCalledTimes(1)
    expect(viz.modelValue).toBe(2)
    expect(viz.renderValue).toBe(2)

    await stepper.prev()
    expect(viz.modelValue).toBe(2)
    expect(viz.renderValue).toBe(1)

    await stepper.next()
    expect(steps[1]).toHaveBeenCalledTimes(1)
    expect(viz.modelValue).toBe(2)
    expect(viz.renderValue).toBe(2)

    await stepper.prev()
    await stepper.next()
    expect(steps[1]).toHaveBeenCalledTimes(1)
    expect(viz.renderValue).toBe(2)
  })

  it('next should execute mutation when target snapshot does not exist', async () => {
    const { viz, stepper, steps } = createStepper(3)

    await stepper.next()
    expect(steps[0]).toHaveBeenCalledTimes(1)
    expect(steps[1]).toHaveBeenCalledTimes(0)

    await stepper.prev()
    await stepper.next()
    expect(steps[0]).toHaveBeenCalledTimes(1)
    expect(viz.renderValue).toBe(1)

    await stepper.next()
    expect(steps[1]).toHaveBeenCalledTimes(1)
    expect(viz.modelValue).toBe(2)
    expect(viz.renderValue).toBe(2)

    await stepper.prev()
    await stepper.next()
    expect(steps[1]).toHaveBeenCalledTimes(1)
    expect(viz.renderValue).toBe(2)
    expect(steps[2]).toHaveBeenCalledTimes(0)
  })

  it('mixed navigation keeps deterministic state', async () => {
    const pure = createStepper(4)
    await pure.stepper.next()
    await pure.stepper.next()
    await pure.stepper.next()
    await pure.stepper.next()

    const mixed = createStepper(4)
    await mixed.stepper.next()
    await mixed.stepper.next()
    await mixed.stepper.next()
    await mixed.stepper.prev()
    await mixed.stepper.prev()
    await mixed.stepper.next()
    await mixed.stepper.next()
    await mixed.stepper.next()

    expect(mixed.stepper.currentIndex).toBe(pure.stepper.currentIndex)
    expect(mixed.viz.renderValue).toBe(pure.viz.renderValue)
    expect(mixed.steps[0]).toHaveBeenCalledTimes(1)
    expect(mixed.steps[1]).toHaveBeenCalledTimes(1)
    expect(mixed.steps[2]).toHaveBeenCalledTimes(1)
    expect(mixed.steps[3]).toHaveBeenCalledTimes(1)
  })
})
