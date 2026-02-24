import type { ReactElement } from 'react'
import type { StepperState } from '../../core/types'

export interface StepControlsProps {
  state: StepperState
  onNext: () => Promise<void> | void
  onPrev: () => Promise<void> | void
  onReset?: () => Promise<void> | void
  className?: string
}

export function StepControls({ state, onNext, onPrev, onReset, className }: StepControlsProps): ReactElement {
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" disabled={state.isFirst} onClick={() => void onPrev()}>
        Prev
      </button>
      <button type="button" disabled={state.isLast} onClick={() => void onNext()}>
        Next
      </button>
      {onReset ? (
        <button type="button" onClick={() => void onReset()}>
          Reset
        </button>
      ) : null}
      <span style={{ fontSize: 12, color: '#475569' }}>
        Step {Math.max(state.currentIndex + 1, 0)} / {state.totalSteps}
        {state.currentLabel ? ` (${state.currentLabel})` : ''}
      </span>
    </div>
  )
}
