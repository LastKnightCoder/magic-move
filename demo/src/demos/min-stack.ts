import { ArrayViz, Scene, Stepper } from '../../../src'
import type { StepperDemoSetupResult } from '../registry'
import { createStepTextOverlay } from './step-text-overlay'

export async function minStackStepperSetup(canvas: HTMLCanvasElement): Promise<StepperDemoSetupResult> {
  canvas.height = 300
  const scene = new Scene(canvas, { width: 720, height: 300, background: '#f8fafc' })

  const inputData = [5, 4, 6, 2, 3, 1]

  const cellWidth = 44
  const cellHeight = 40
  const gap = 4
  const totalInputWidth = inputData.length * (cellWidth + gap) - gap
  const inputX = Math.round((720 - totalInputWidth) / 2)

  const inputArr = new ArrayViz<number>(scene, [...inputData], {
    x: inputX,
    y: 20,
    cellWidth,
    cellHeight,
    gap,
    fillColor: '#e2e8f0',
    strokeColor: '#94a3b8',
    fontSize: 17,
  })

  const mainStack = new ArrayViz<number>(scene, [], {
    x: 160,
    y: 110,
    cellWidth: cellWidth + 8,
    cellHeight,
    gap,
    fillColor: '#bbf7d0',
    strokeColor: '#4ade80',
    fontSize: 17,
  })

  const auxStack = new ArrayViz<number>(scene, [], {
    x: 160,
    y: 210,
    cellWidth: cellWidth + 8,
    cellHeight,
    gap,
    fillColor: '#bfdbfe',
    strokeColor: '#60a5fa',
    fontSize: 17,
  })

  scene.add(inputArr)
  scene.add(mainStack)
  scene.add(auxStack)

  scene.addText(18, 122, '主栈', { fontSize: 14, fontWeight: 'bold' })
  scene.addText(18, 222, '辅助栈(最小值)', { fontSize: 14, fontWeight: 'bold' })

  const stepper = new Stepper([inputArr, mainStack, auxStack]).init()
  const descriptions: string[] = []

  const remaining = [...inputData]
  const mainData: number[] = []
  const auxData: number[] = []

  function addStep(label: string, description: string, fn: () => Promise<void>) {
    descriptions.push(description)
    stepper.step(label, fn)
  }

  for (const value of inputData) {
    const currentValue = value

    addStep(
      `读取输入值 ${currentValue}`,
      `高亮输入序列最左元素 ${currentValue}，表示这一轮准备入栈的数字。`,
      async () => {
        await inputArr.highlightAt([0], '#f59e0b', { duration: 0.25 })
      }
    )

    remaining.shift()
    mainData.push(currentValue)
    const inputAfterStep = [...remaining]
    const mainAfterStep = [...mainData]

    addStep(
      `将 ${currentValue} 压入主栈`,
      `输入序列左移一位，同时把 ${currentValue} 追加到主栈尾部。`,
      async () => {
        await inputArr.unhighlightAt([0], { duration: 0.2 })
        await inputArr.setData(inputAfterStep, { duration: 0.35 })
        await mainStack.setData(mainAfterStep, { duration: 0.35 })
      }
    )

    const currentMin = auxData.length === 0 ? currentValue : Math.min(currentValue, auxData[auxData.length - 1])
    auxData.push(currentMin)
    const auxAfterStep = [...auxData]

    addStep(
      `更新辅助栈最小值 ${currentMin}`,
      `辅助栈第 i 项保存“到当前位置的最小值”，可在 O(1) 时间读到当前最小值。`,
      async () => {
        await auxStack.setData(auxAfterStep, { duration: 0.35 })
      }
    )
  }

  const intro = '最小栈用两个栈同步维护：主栈保存原始值，辅助栈保存当前位置的最小值。'
  const onStepChange = await createStepTextOverlay(scene, { descriptions, intro, x: 16, y: 252 })

  return {
    stepper,
    descriptions,
    intro,
    onStepChange,
    cleanup: () => scene.destroy(),
  }
}
