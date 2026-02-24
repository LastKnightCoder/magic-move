import { Scene, Stepper, TreeViz } from '../../src'
import type { TreeNodeData } from '../../src'

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
  await Promise.all(
    entries.map(([id, color]) => tree.paintNode(id, color, { duration: 0.25 }))
  )
}

export async function rbTreeStepperSetup(canvas: HTMLCanvasElement): Promise<Stepper> {
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

  const stepper = new Stepper([tree])
  stepper.init()

  stepper.step('初始化颜色：根节点与叔节点为黑，左子为红', async () => {
    await colorNodes(tree, [
      ['n10', BLACK],
      ['n5', RED],
      ['n15', BLACK],
    ])
  })

  stepper.step('相对节点插入：在 5 的左侧插入 1（红）', async () => {
    await tree.insertChild('n5', 'left', { id: 'n1', value: 1 }, { duration: 0.45 })
    await colorNodes(tree, [['n1', RED]])
  })

  stepper.step('旋转准备：突出支点 10 与其左子 5', async () => {
    await colorNodes(tree, [
      ['n10', RED],
      ['n5', BLACK],
    ])
  })

  stepper.step('右旋步骤 1：断开 10 与 5 的直连（10.left = null）', async () => {
    await tree.setChild('n10', 'left', undefined, { duration: 0.45 })
  })

  stepper.step('右旋步骤 2：将 5 接到原父位（5 成为新根）', async () => {
    await tree.setRoot({ id: 'n5', value: 5, left: { id: 'n1', value: 1 }, right: { id: 'n10', value: 10, right: { id: 'n15', value: 15 } } }, { duration: 0.45 })
  })

  stepper.step('右旋结果着色：5 黑，10 红，1/15 黑', async () => {
    await colorNodes(tree, [
      ['n5', BLACK],
      ['n10', RED],
      ['n1', BLACK],
      ['n15', BLACK],
    ])
  })

  stepper.step('相对节点插入：在 15 的左侧插入 12（红）', async () => {
    await tree.insertChild('n15', 'left', { id: 'n12', value: 12 }, { duration: 0.45 })
    await colorNodes(tree, [['n12', RED]])
  })

  stepper.step('左旋准备：突出支点 10 与其右子 15', async () => {
    await colorNodes(tree, [
      ['n10', RED],
      ['n15', BLACK],
    ])
  })

  stepper.step('左旋步骤 1：断开 10 与 15 的直连（10.right = 12）', async () => {
    await tree.rewireChild('n10', 'right', 'n12', { duration: 0.45 })
  })

  stepper.step('左旋步骤 2：将 10 挂到 15 的左侧（15.left = 10）', async () => {
    await tree.rewireChild('n15', 'left', 'n10', { duration: 0.45 })
  })

  stepper.step('左旋步骤 3：将 15 接回 5 的右侧（5.right = 15）', async () => {
    await tree.rewireChild('n5', 'right', 'n15', { duration: 0.45 })
  })

  stepper.step('最终着色：保持黑高，红节点作为局部子节点', async () => {
    await colorNodes(tree, [
      ['n5', BLACK],
      ['n15', BLACK],
      ['n1', BLACK],
      ['n10', RED],
      ['n12', RED],
    ])
  })

  return stepper
}
