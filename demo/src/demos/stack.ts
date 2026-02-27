import { Scene, StackViz, Stepper } from '../../../src'
import type { StepperDemoSetupResult } from '../registry'
import { createStepTextOverlay } from './step-text-overlay'

type StackOp =
  | { type: 'push'; value: number }
  | { type: 'pop' }
  | { type: 'peek' }

export async function stackStepperSetup(canvas: HTMLCanvasElement): Promise<StepperDemoSetupResult> {
  canvas.height = 340
  const scene = new Scene(canvas, { width: 720, height: 340, background: '#f8fafc' })

  const stack = new StackViz(scene, [], {
    x: 30,
    y: 10,
    cellWidth: 120,
    cellHeight: 44,
    maxVisible: 6,
  })
  scene.add(stack)

  const ops: StackOp[] = [
    { type: 'push', value: 10 },
    { type: 'push', value: 25 },
    { type: 'push', value: 7 },
    { type: 'peek' },
    { type: 'push', value: 42 },
    { type: 'pop' },
    { type: 'push', value: 3 },
    { type: 'pop' },
    { type: 'pop' },
  ]

  const simulated: number[] = []
  const stepper = new Stepper([stack]).init()
  const descriptions: string[] = []

  function addStep(label: string, description: string, fn: () => Promise<void>) {
    descriptions.push(description)
    stepper.step(label, fn)
  }

  for (const op of ops) {
    if (op.type === 'peek') {
      const top = simulated.length > 0 ? simulated[simulated.length - 1] : '空栈'
      addStep(
        'peek 查看栈顶',
        `只读取栈顶元素，不移除。当前栈顶是 ${top}。`,
        async () => {
          await stack.peek({ duration: 0.35 })
        }
      )
      continue
    }

    if (op.type === 'push') {
      simulated.push(op.value)
      addStep(
        `push(${op.value})`,
        `入栈操作把 ${op.value} 放到顶部，栈大小变为 ${simulated.length}。`,
        async () => {
          await stack.push(op.value, { duration: 0.35 })
        }
      )
      continue
    }

    const popped = simulated.length > 0 ? simulated.pop() : undefined
    addStep(
      'pop()',
      popped === undefined
        ? '栈为空时 pop 不会移除元素，用于演示边界场景。'
        : `弹出栈顶元素 ${popped}，栈大小变为 ${simulated.length}。`,
      async () => {
        await stack.pop({ duration: 0.35 })
      }
    )
  }

  const intro = '栈遵循后进先出（LIFO）。你可以逐步观察 push / pop / peek 对栈顶的影响。'
  const onStepChange = await createStepTextOverlay(scene, { descriptions, intro, x: 220, y: 12 })

  return {
    stepper,
    descriptions,
    intro,
    onStepChange,
    cleanup: () => scene.destroy(),
  }
}
