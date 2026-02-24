import { useCallback, useEffect, useMemo, useState } from 'react'
import { Stepper } from '../../core/Stepper'
import type { StepperState } from '../../core/types'
import type { BaseViz } from '../../core/BaseViz'

export interface StepDefinition {
  label: string
  run: () => Promise<void>
}

export interface UseStepOptions {
  visualizers: BaseViz[]
  steps?: StepDefinition[]
}

const INITIAL_STATE: StepperState = {
  currentIndex: -1,
  totalSteps: 0,
  currentLabel: undefined,
  isFirst: true,
  isLast: true,
}

export function useStep({ visualizers, steps = [] }: UseStepOptions) {
  const [state, setState] = useState<StepperState>(INITIAL_STATE)

  const stepper = useMemo(() => {
    const instance = new Stepper(visualizers).init()
    for (const step of steps) {
      instance.step(step.label, step.run)
    }
    return instance
  }, [steps, visualizers])

  useEffect(() => {
    stepper.onStepChange = setState
    setState({
      currentIndex: stepper.currentIndex,
      totalSteps: stepper.totalSteps,
      currentLabel: stepper.currentIndex >= 0 ? stepper.stepLabels[stepper.currentIndex] : undefined,
      isFirst: stepper.isFirst,
      isLast: stepper.isLast,
    })
    return () => {
      stepper.onStepChange = undefined
    }
  }, [stepper])

  const next = useCallback(() => stepper.next(), [stepper])
  const prev = useCallback(() => stepper.prev(), [stepper])
  const reset = useCallback(() => stepper.reset(), [stepper])
  const goto = useCallback((index: number) => stepper.goto(index), [stepper])

  return {
    stepper,
    state,
    next,
    prev,
    reset,
    goto,
  }
}
