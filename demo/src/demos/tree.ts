import { Scene, Stepper, TreeViz } from '../../src'
import type { TreeNodeData } from '../../src'
import type { StepperDemoSetupResult } from '../registry'
import { createStepTextOverlay } from './step-text-overlay'

export async function treeStepperSetup(canvas: HTMLCanvasElement): Promise<StepperDemoSetupResult> {
  canvas.height = 360
  const scene = new Scene(canvas, { width: 720, height: 360, background: '#f8fafc' })

  const root: TreeNodeData<number> = {
    id: 'root', value: 4,
    left: {
      id: 'l', value: 2,
      left: { id: 'll', value: 1 },
      right: { id: 'lr', value: 3 },
    },
    right: {
      id: 'r', value: 6,
      left: { id: 'rl', value: 5 },
      right: { id: 'rr', value: 7 },
    },
  }

  const tree = new TreeViz(scene, root, { x: 60, y: 20, nodeRadius: 28, levelHeight: 90 })
  scene.add(tree)

  const stepper = new Stepper([tree]).init()
  const descriptions: string[] = []

  function addStep(label: string, description: string, fn: () => Promise<void>) {
    descriptions.push(description)
    stepper.step(label, fn)
  }

  function buildInorderSteps(node: TreeNodeData<number> | undefined) {
    if (!node) return

    buildInorderSteps(node.left)

    addStep(
      `定位节点 ${node.value}`,
      `中序遍历遵循“左 -> 根 -> 右”。当前回到根节点 ${node.value}，先高亮表示即将访问。`,
      async () => {
        await tree.highlight(`circle-${node.id}`, '#6366f1', { duration: 0.3 })
      }
    )

    addStep(
      `访问节点 ${node.value}`,
      `节点 ${node.value} 正式加入遍历输出序列，并标记为已访问状态。`,
      async () => {
        await tree.markVisited(node.id, { duration: 0.3 })
      }
    )

    buildInorderSteps(node.right)
  }

  buildInorderSteps(root)

  const intro = '这个示例按中序遍历执行：先访问左子树，再访问当前节点，最后访问右子树。'
  const onStepChange = await createStepTextOverlay(scene, { descriptions, intro, x: 400, y: 12 })

  return {
    stepper,
    descriptions,
    intro,
    onStepChange,
    cleanup: () => scene.destroy(),
  }
}
