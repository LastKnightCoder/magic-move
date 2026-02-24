import { Scene, StackViz } from '../../src'

export async function stackDemo(canvas: HTMLCanvasElement) {
  canvas.height = 340
  const scene = new Scene(canvas, { width: 720, height: 340, background: '#f8fafc' })

  const stack = new StackViz(scene, [], { x: 30, y: 10, cellWidth: 120, cellHeight: 44, maxVisible: 6 })
  scene.add(stack)

  const ops: Array<{ type: 'push'; value: number } | { type: 'pop' }> = [
    { type: 'push', value: 10 },
    { type: 'push', value: 25 },
    { type: 'push', value: 7 },
    { type: 'peek' } as unknown as { type: 'pop' },
    { type: 'push', value: 42 },
    { type: 'pop' },
    { type: 'push', value: 3 },
    { type: 'pop' },
    { type: 'pop' },
  ]

  for (const op of ops) {
    if ((op as { type: string }).type === 'peek') {
      await stack.peek()
    } else if (op.type === 'push') {
      await stack.push((op as { type: 'push'; value: number }).value, { duration: 0.35 })
    } else {
      await stack.pop({ duration: 0.35 })
    }
    await scene.wait(0.2)
  }

  return () => scene.destroy()
}
