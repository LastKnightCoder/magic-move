import { Scene, TreeViz } from '../../src'
import type { TreeNodeData } from '../../src'

export async function treeDemo(canvas: HTMLCanvasElement) {
  canvas.height = 360
  const scene = new Scene(canvas, { width: 720, height: 360, background: '#f8fafc' })

  const root: TreeNodeData<number> = {
    id: 'root', value: 4,
    left: {
      id: 'l', value: 2,
      left:  { id: 'll', value: 1 },
      right: { id: 'lr', value: 3 },
    },
    right: {
      id: 'r', value: 6,
      left:  { id: 'rl', value: 5 },
      right: { id: 'rr', value: 7 },
    },
  }

  const tree = new TreeViz(scene, root, { x: 60, y: 20, nodeRadius: 28, levelHeight: 90 })
  scene.add(tree)

  // 中序遍历：左 -> 根 -> 右。
  async function inorder(node: TreeNodeData<number> | undefined): Promise<void> {
    if (!node) return
    await inorder(node.left)
    await tree.highlight(`circle-${node.id}`, '#6366f1', { duration: 0.3 })
    await scene.wait(0.25)
    await tree.markVisited(node.id, { duration: 0.3 })
    await inorder(node.right)
  }

  await inorder(root)

  return () => scene.destroy()
}
