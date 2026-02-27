import { LinkedListViz, Scene, Stepper } from '../../../src'
import type { StepperDemoSetupResult } from '../registry'
import { createStepTextOverlay } from './step-text-overlay'

export async function linkedListStepperSetup(canvas: HTMLCanvasElement): Promise<StepperDemoSetupResult> {
  canvas.height = 200
  const scene = new Scene(canvas, { width: 720, height: 200, background: '#f8fafc' })

  const list = new LinkedListViz(scene, [
    { id: 'a', value: 1, next: 'b' },
    { id: 'b', value: 3, next: 'c' },
    { id: 'c', value: 5 },
  ], { x: 20, y: 70, nodeWidth: 90, nodeHeight: 50, gap: 44 })
  scene.add(list)

  const stepper = new Stepper([list]).init()
  const descriptions: string[] = []

  function addStep(label: string, description: string, fn: () => Promise<void>) {
    descriptions.push(description)
    stepper.step(label, fn)
  }

  addStep(
    '在 1 后插入 2',
    '将值为 2 的新节点插入 a 与 b 之间，链表变为 1 -> 2 -> 3 -> 5。',
    async () => {
      await list.insertAfter('a', { id: 'd', value: 2, next: 'b' }, { duration: 0.4 })
    }
  )

  addStep(
    '在 3 后插入 4',
    '继续在中间插入新节点，链表扩展为 1 -> 2 -> 3 -> 4 -> 5。',
    async () => {
      await list.insertAfter('b', { id: 'e', value: 4, next: 'c' }, { duration: 0.4 })
    }
  )

  addStep(
    '从头到尾遍历',
    '高亮遍历所有节点，演示单链表只能沿 next 指针单向前进。',
    async () => {
      await list.traverse({ duration: 0.3 })
    }
  )

  addStep(
    '删除值为 3 的节点',
    '删除节点 b（值 3），并把前后节点重新连接，链表保持连续。',
    async () => {
      await list.remove('b', { duration: 0.4 })
    }
  )

  const intro = '这个示例展示单链表的插入、遍历和删除，每一步都只做一个结构变化。'
  const onStepChange = await createStepTextOverlay(scene, { descriptions, intro, x: 16, y: 8 })

  return {
    stepper,
    descriptions,
    intro,
    onStepChange,
    cleanup: () => scene.destroy(),
  }
}
