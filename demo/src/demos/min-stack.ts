import { Scene, ArrayViz } from '../../src'

export async function minStackDemo(canvas: HTMLCanvasElement) {
  canvas.height = 300
  const scene = new Scene(canvas, { width: 720, height: 300, background: '#f8fafc' })

  const INPUT_DATA = [5, 4, 6, 2, 3, 1]

  // 输入数组放在顶部居中，每一步都会从左侧弹出一个元素。
  const CELL_W = 44
  const CELL_H = 40
  const GAP = 4
  const totalInputWidth = INPUT_DATA.length * (CELL_W + GAP) - GAP
  const inputX = Math.round((720 - totalInputWidth) / 2)

  const inputArr = new ArrayViz<number>(scene, [...INPUT_DATA], {
    x: inputX,
    y: 20,
    cellWidth: CELL_W,
    cellHeight: CELL_H,
    gap: GAP,
    fillColor: '#e2e8f0',
    strokeColor: '#94a3b8',
    fontSize: 17,
  })

  // 主栈：向右增长。
  const mainStack = new ArrayViz<number>(scene, [], {
    x: 100,
    y: 110,
    cellWidth: CELL_W + 8,
    cellHeight: CELL_H,
    gap: GAP,
    fillColor: '#bbf7d0',
    strokeColor: '#4ade80',
    fontSize: 17,
  })

  // 辅助栈：向右增长。
  const auxStack = new ArrayViz<number>(scene, [], {
    x: 100,
    y: 210,
    cellWidth: CELL_W + 8,
    cellHeight: CELL_H,
    gap: GAP,
    fillColor: '#bfdbfe',
    strokeColor: '#60a5fa',
    fontSize: 17,
  })

  scene.add(inputArr)
  scene.add(mainStack)
  scene.add(auxStack)

  scene.addText(18, 122, '栈', { fontSize: 14, fontWeight: 'bold' })
  scene.addText(18, 222, '辅助线', { fontSize: 14, fontWeight: 'bold' })

  const remaining = [...INPUT_DATA]
  const mainData: number[] = []
  const auxData: number[] = []

  await scene.wait(0.3)

  for (let i = 0; i < INPUT_DATA.length; i++) {
    const value = INPUT_DATA[i]

    // 高亮输入数组最左侧元素（当前将要入栈的值）。
    await inputArr.highlightAt([0], '#f59e0b', { duration: 0.25 })
    await scene.wait(0.25)

    // 输入数组左移：移除首元素。
    remaining.shift()
    await inputArr.setData([...remaining], { duration: 0.35 })

    // 压入主栈。
    mainData.push(value)
    await mainStack.setData([...mainData], { duration: 0.35 })

    // 压入辅助栈：记录到当前为止的最小值。
    const currentMin = auxData.length === 0 ? value : Math.min(value, auxData[auxData.length - 1])
    auxData.push(currentMin)
    await auxStack.setData([...auxData], { duration: 0.35 })

    await scene.wait(0.3)
  }

  return () => scene.destroy()
}
