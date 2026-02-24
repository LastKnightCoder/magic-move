import { Scene, ArrayViz } from '../../src'

export async function bubbleSortDemo(canvas: HTMLCanvasElement) {
  const scene = new Scene(canvas, { width: 720, height: 200, background: '#f8fafc' })
  const data = [5, 3, 8, 1, 9, 2, 7, 4]
  const arr = new ArrayViz(scene, data, { x: 20, y: 60, cellWidth: 72, cellHeight: 72, gap: 6 })
  scene.add(arr)

  const d = [...data]
  for (let i = 0; i < d.length; i++) {
    for (let j = 0; j < d.length - i - 1; j++) {
      await arr.highlightAt([j, j + 1])
      if (d[j] > d[j + 1]) {
        await arr.swap(j, j + 1, { duration: 0.35, easing: 'ease-in-out' })
        ;[d[j], d[j + 1]] = [d[j + 1], d[j]]
      }
      await arr.unhighlightAt([j, j + 1])
    }
    await arr.markSorted([d.length - 1 - i])
  }

  return () => scene.destroy()
}
