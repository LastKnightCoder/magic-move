import { useMemo } from 'react'
import { Timeline } from '../../core/Timeline'

export interface TimelineStep {
  at?: number
  run: () => Promise<void>
}

export interface UseTimelineOptions {
  steps?: TimelineStep[]
}

export interface TimelineController {
  timeline: Timeline
  at: (time: number, fn: () => Promise<void>) => TimelineController
  then: (fn: () => Promise<void>) => TimelineController
  run: () => Promise<void>
}

export function useTimeline(options?: UseTimelineOptions): TimelineController {
  const steps = options?.steps
  return useMemo(() => {
    const timeline = new Timeline()

    for (const step of steps ?? []) {
      if (typeof step.at === 'number') {
        timeline.at(step.at, step.run)
      } else {
        timeline.then(step.run)
      }
    }

    const controller: TimelineController = {
      timeline,
      at: (time, fn) => {
        timeline.at(time, fn)
        return controller
      },
      then: (fn) => {
        timeline.then(fn)
        return controller
      },
      run: () => timeline.run(),
    }

    return controller
  }, [steps])
}
