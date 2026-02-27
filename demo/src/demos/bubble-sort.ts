import { ArrayViz, Scene, Stepper } from '../../../src'
import type { StepperDemoSetupResult } from '../registry'
import { createStepTextOverlay } from './step-text-overlay'

export async function bubbleSortStepperSetup(canvas: HTMLCanvasElement): Promise<StepperDemoSetupResult> {
  canvas.height = 200
  const scene = new Scene(canvas, { width: 720, height: 200, background: '#f8fafc' })
  const data = [5, 3, 8, 1, 9, 2, 7, 4]
  const arr = new ArrayViz(scene, data, { x: 20, y: 60, cellWidth: 72, cellHeight: 72, gap: 6 })
  scene.add(arr)

  const stepper = new Stepper([arr]).init()
  const descriptions: string[] = []
  const d = [...data]

  function addStep(label: string, description: string, fn: () => Promise<void>) {
    descriptions.push(description)
    stepper.step(label, fn)
  }

  for (let i = 0; i < d.length - 1; i++) {
    for (let j = 0; j < d.length - i - 1; j++) {
      const left = d[j]
      const right = d[j + 1]
      const pass = i + 1
      addStep(
        `第 ${pass} 轮：比较 [${j}] 和 [${j + 1}]`,
        `比较相邻元素 ${left} 和 ${right}，如果左边更大就交换，让较大值持续向右“冒泡”。`,
        async () => {
          await arr.highlightAt([j, j + 1])
        }
      )

      if (left > right) {
        addStep(
          `交换 [${j}] 和 [${j + 1}]`,
          `${left} > ${right}，执行交换，把更小的 ${right} 放到左侧。`,
          async () => {
            await arr.unhighlightAt([j, j + 1])
            await arr.swap(j, j + 1, { duration: 0.35, easing: 'ease-in-out' })
          }
        )
        ;[d[j], d[j + 1]] = [d[j + 1], d[j]]
      } else {
        addStep(
          `无需交换 [${j}] 和 [${j + 1}]`,
          `${left} <= ${right}，顺序已经正确，取消高亮继续下一组比较。`,
          async () => {
            await arr.unhighlightAt([j, j + 1])
          }
        )
      }
    }

    const sortedIndex = d.length - 1 - i
    addStep(
      `标记已排序：索引 ${sortedIndex}`,
      `第 ${passLabel(i)} 轮结束，最右侧索引 ${sortedIndex} 已经就位，不再参与后续比较。`,
      async () => {
        await arr.markSorted([sortedIndex])
      }
    )
  }

  addStep(
    '标记最终有序元素：索引 0',
    '最后剩下的第 0 个元素也自然有序，整个数组排序完成。',
    async () => {
      await arr.markSorted([0])
    }
  )

  const intro = '冒泡排序通过多轮相邻比较，把当前轮的最大值送到最右侧。每次点击“下一步”执行一个细粒度动作。'
  const onStepChange = await createStepTextOverlay(scene, { descriptions, intro, x: 16, y: 8 })

  return {
    stepper,
    descriptions,
    intro,
    onStepChange,
    cleanup: () => scene.destroy(),
  }
}

function passLabel(index: number): number {
  return index + 1
}
