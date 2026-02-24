import { Scene, ArrayViz, Stepper } from '../../src'

export async function stepperSortSetup(canvas: HTMLCanvasElement): Promise<Stepper> {
  const scene = new Scene(canvas, { width: 720, height: 200, background: '#f8fafc' })
  const data = [5, 3, 8, 1, 9, 2, 7, 4]
  const arr = new ArrayViz(scene, data, { x: 20, y: 60, cellWidth: 72, cellHeight: 72, gap: 6 })
  scene.add(arr)

  const stepper = new Stepper([arr])
  stepper.init()

  const d = [...data]
  for (let i = 0; i < d.length - 1; i++) {
    for (let j = 0; j < d.length - i - 1; j++) {
      const ci = i, cj = j
      stepper.step(`比较 [${cj}] 和 [${cj + 1}]`, async () => {
        await arr.highlightAt([cj, cj + 1])
      })
      if (d[cj] > d[cj + 1]) {
        stepper.step(`交换 [${cj}] 和 [${cj + 1}]`, async () => {
          await arr.unhighlightAt([cj, cj + 1])
          await arr.swap(cj, cj + 1, { duration: 0.35, easing: 'ease-in-out' })
        })
        ;[d[cj], d[cj + 1]] = [d[cj + 1], d[cj]]
      } else {
        stepper.step(`无需交换，取消高亮`, async () => {
          await arr.unhighlightAt([cj, cj + 1])
        })
      }
    }
    const si = i
    stepper.step(`第 ${si + 1} 轮结束，标记已排序`, async () => {
      await arr.markSorted([d.length - 1 - si])
    })
  }

  return stepper
}
