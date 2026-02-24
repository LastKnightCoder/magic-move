import { Scene, LinkedListViz } from '../../src'

export async function linkedListDemo(canvas: HTMLCanvasElement) {
  canvas.height = 200
  const scene = new Scene(canvas, { width: 720, height: 200, background: '#f8fafc' })

  const list = new LinkedListViz(scene, [
    { id: 'a', value: 1, next: 'b' },
    { id: 'b', value: 3, next: 'c' },
    { id: 'c', value: 5 },
  ], { x: 20, y: 70, nodeWidth: 90, nodeHeight: 50, gap: 44 })
  scene.add(list)

  await scene.wait(0.5)

  // 在 a 与 b 之间插入值 2。
  await list.insertAfter('a', { id: 'd', value: 2, next: 'b' }, { duration: 0.4 })
  await scene.wait(0.4)

  // 在 b 与 c 之间插入值 4。
  await list.insertAfter('b', { id: 'e', value: 4, next: 'c' }, { duration: 0.4 })
  await scene.wait(0.4)

  // 遍历整条链表。
  await list.traverse({ duration: 0.3 })
  await scene.wait(0.4)

  // 删除节点 b（值为 3）。
  await list.remove('b', { duration: 0.4 })

  return () => scene.destroy()
}
