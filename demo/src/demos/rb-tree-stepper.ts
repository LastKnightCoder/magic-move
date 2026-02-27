import { Scene, Stepper, TreeViz } from '../../../src'
import type { TreeNodeData } from '../../../src'
import type { StepperDemoSetupResult } from '../registry'
import { createStepTextOverlay } from './step-text-overlay'

const RED = '#ef4444'
const BLACK = '#334155'

function cloneTree(node: TreeNodeData<number> | undefined): TreeNodeData<number> | undefined {
  if (!node) return undefined
  return {
    id: node.id,
    value: node.value,
    left: cloneTree(node.left),
    right: cloneTree(node.right),
  }
}

function cloneRoot(root: TreeNodeData<number>): TreeNodeData<number> {
  return cloneTree(root)!
}

async function colorNodes(tree: TreeViz<number>, entries: Array<[string, string]>): Promise<void> {
  await Promise.all(entries.map(([id, color]) => tree.paintNode(id, color, { duration: 0.25 })))
}

export async function rbTreeStepperSetup(canvas: HTMLCanvasElement): Promise<StepperDemoSetupResult> {
  canvas.height = 400
  const scene = new Scene(canvas, { width: 720, height: 400, background: '#f8fafc' })

  const stateA: TreeNodeData<number> = {
    id: 'n10',
    value: 10,
    left: { id: 'n5', value: 5 },
    right: { id: 'n15', value: 15 },
  }

  const tree = new TreeViz(scene, cloneRoot(stateA), { x: 80, y: 20, nodeRadius: 28, levelHeight: 92 })
  scene.add(tree)

  const stepper = new Stepper([tree]).init()
  const descriptions: string[] = []

  function addStep(label: string, description: string, fn: () => Promise<void>) {
    descriptions.push(description)
    stepper.step(label, fn)
  }

  addStep(
    '初始化颜色',
    '先设置红黑树初始配色：根和叔节点为黑，左子节点为红。',
    async () => {
      await colorNodes(tree, [
        ['n10', BLACK],
        ['n5', RED],
        ['n15', BLACK],
      ])
    }
  )

  addStep(
    '插入节点 1 (红)',
    '在节点 5 的左侧插入新节点 1，并保持新插入节点初始为红色。',
    async () => {
      await tree.insertChild('n5', 'left', { id: 'n1', value: 1 }, { duration: 0.45 })
      await colorNodes(tree, [['n1', RED]])
    }
  )

  addStep(
    '右旋准备',
    '突出旋转支点 10 与其左子 5，准备执行右旋重构。',
    async () => {
      await colorNodes(tree, [
        ['n10', RED],
        ['n5', BLACK],
      ])
    }
  )

  addStep(
    '右旋步骤 1：断开 10.left',
    '先断开 10 到 5 的左连接，为重新挂载子树腾出位置。',
    async () => {
      await tree.setChild('n10', 'left', undefined, { duration: 0.45 })
    }
  )

  addStep(
    '右旋步骤 2：5 成为新根',
    '把 5 提升为根节点，原根 10 下沉到右侧，形成右旋结果。',
    async () => {
      await tree.setRoot(
        {
          id: 'n5',
          value: 5,
          left: { id: 'n1', value: 1 },
          right: { id: 'n10', value: 10, right: { id: 'n15', value: 15 } },
        },
        { duration: 0.45 }
      )
    }
  )

  addStep(
    '右旋后重着色',
    '旋转后调整颜色，恢复红黑性质：5 黑，10 红，1/15 黑。',
    async () => {
      await colorNodes(tree, [
        ['n5', BLACK],
        ['n10', RED],
        ['n1', BLACK],
        ['n15', BLACK],
      ])
    }
  )

  addStep(
    '插入节点 12 (红)',
    '在节点 15 左侧插入 12，制造下一次左旋的局部结构。',
    async () => {
      await tree.insertChild('n15', 'left', { id: 'n12', value: 12 }, { duration: 0.45 })
      await colorNodes(tree, [['n12', RED]])
    }
  )

  addStep(
    '左旋准备',
    '突出支点 10 与右子 15，准备执行左旋。',
    async () => {
      await colorNodes(tree, [
        ['n10', RED],
        ['n15', BLACK],
      ])
    }
  )

  addStep(
    '左旋步骤 1：10.right 指向 12',
    '先把 10 的右子改为 12，处理左旋中的“中间子树”迁移。',
    async () => {
      await tree.rewireChild('n10', 'right', 'n12', { duration: 0.45 })
    }
  )

  addStep(
    '左旋步骤 2：15.left 指向 10',
    '将 10 挂到 15 的左侧，完成支点关系翻转。',
    async () => {
      await tree.rewireChild('n15', 'left', 'n10', { duration: 0.45 })
    }
  )

  addStep(
    '左旋步骤 3：15 接回 5.right',
    '把 15 重新接回上层节点 5 的右侧，闭合整棵树结构。',
    async () => {
      await tree.rewireChild('n5', 'right', 'n15', { duration: 0.45 })
    }
  )

  addStep(
    '最终重着色',
    '完成颜色修复，保持黑高平衡，红节点仅作为局部子节点。',
    async () => {
      await colorNodes(tree, [
        ['n5', BLACK],
        ['n15', BLACK],
        ['n1', BLACK],
        ['n10', RED],
        ['n12', RED],
      ])
    }
  )

  const intro = '示例按“插入 + 旋转 + 重着色”拆成细粒度步骤，便于观察红黑树平衡调整过程。'
  const onStepChange = await createStepTextOverlay(scene, { descriptions, intro, x: 410, y: 12 })

  return {
    stepper,
    descriptions,
    intro,
    onStepChange,
    cleanup: () => scene.destroy(),
  }
}
