import { ArrayViz, Scene, Stepper } from '../../src'
import type { StepperDemoSetupResult } from '../registry'
import { createStepTextOverlay } from './step-text-overlay'

export async function stepperSortSetup(canvas: HTMLCanvasElement): Promise<StepperDemoSetupResult> {
  canvas.height = 200
  const scene = new Scene(canvas, { width: 720, height: 200, background: '#f8fafc' })
  const data = [9, 6, 4, 7, 2, 8]
  const arr = new ArrayViz(scene, data, { x: 72, y: 60, cellWidth: 84, cellHeight: 72, gap: 8 })
  scene.add(arr)

  const stepper = new Stepper([arr]).init()
  const descriptions: string[] = []
  const d = [...data]

  function addStep(label: string, description: string, fn: () => Promise<void>) {
    descriptions.push(description)
    stepper.step(label, fn)
  }

  for (let i = 0; i < d.length - 1; i++) {
    let swapped = false

    for (let j = 0; j < d.length - i - 1; j++) {
      const left = d[j]
      const right = d[j + 1]

      addStep(
        `第 ${i + 1} 轮：比较 ${left} 和 ${right}`,
        `比较第 ${j} 与 ${j + 1} 号位元素，决定是否执行交换。`,
        async () => {
          await arr.highlightAt([j, j + 1])
        }
      )

      if (left > right) {
        swapped = true
        addStep(
          `交换 ${left} 与 ${right}`,
          `${left} > ${right}，将更小元素向左移动，维持局部有序。`,
          async () => {
            await arr.unhighlightAt([j, j + 1])
            await arr.swap(j, j + 1, { duration: 0.35, easing: 'ease-in-out' })
          }
        )
        ;[d[j], d[j + 1]] = [d[j + 1], d[j]]
      } else {
        addStep(
          `保持顺序 ${left} <= ${right}`,
          `当前相邻元素已经有序，取消高亮后继续下一次比较。`,
          async () => {
            await arr.unhighlightAt([j, j + 1])
          }
        )
      }
    }

    const sortedIndex = d.length - 1 - i
    addStep(
      `标记索引 ${sortedIndex} 已就位`,
      `本轮结束后，最右侧未排序区的最大值已固定。`,
      async () => {
        await arr.markSorted([sortedIndex])
      }
    )

    if (!swapped) {
      addStep(
        '提前结束',
        '这一轮没有发生交换，说明整体已经有序，冒泡排序可以提前停止。',
        async () => Promise.resolve()
      )
      break
    }
  }

  addStep(
    '补全标记全部有序',
    '将所有元素标记为有序状态，展示最终排序结果。',
    async () => {
      await arr.markSorted(Array.from({ length: d.length }, (_, idx) => idx))
    }
  )

  const intro = '这是一个“可提前停止”的冒泡排序版本，用于展示优化后何时可以终止比较。'
  const onStepChange = await createStepTextOverlay(scene, { descriptions, intro, x: 16, y: 8 })

  return {
    stepper,
    descriptions,
    intro,
    onStepChange,
    cleanup: () => scene.destroy(),
  }
}
