import { GraphViz, Scene, Stepper } from '../../src'
import type { GraphEdgeData } from '../../src'
import type { StepperDemoSetupResult } from '../registry'
import { createStepTextOverlay } from './step-text-overlay'

export async function bfsStepperSetup(canvas: HTMLCanvasElement): Promise<StepperDemoSetupResult> {
  canvas.height = 420
  const scene = new Scene(canvas, { width: 720, height: 420, background: '#f8fafc' })

  const nodes = [
    { id: 'A', value: 'A' }, { id: 'B', value: 'B' },
    { id: 'C', value: 'C' }, { id: 'D', value: 'D' },
    { id: 'E', value: 'E' }, { id: 'F', value: 'F' },
  ]
  const edges: GraphEdgeData[] = [
    { id: 'AB', from: 'A', to: 'B' }, { id: 'AC', from: 'A', to: 'C' },
    { id: 'BD', from: 'B', to: 'D' }, { id: 'BE', from: 'B', to: 'E' },
    { id: 'CF', from: 'C', to: 'F' },
  ]

  const graph = new GraphViz(scene, nodes, edges, {
    x: 60,
    y: 10,
    width: 600,
    height: 400,
    layout: 'circular',
    nodeRadius: 28,
  })
  scene.add(graph)

  const adj = new Map<string, Array<{ nodeId: string; edgeId: string }>>()
  for (const edge of edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, [])
    adj.get(edge.from)!.push({ nodeId: edge.to, edgeId: edge.id })
  }

  const stepper = new Stepper([graph]).init()
  const descriptions: string[] = []

  function addStep(label: string, description: string, fn: () => Promise<void>) {
    descriptions.push(description)
    stepper.step(label, fn)
  }

  const queue: string[] = ['A']
  const visited = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()!

    if (visited.has(current)) {
      addStep(
        `跳过已访问节点 ${current}`,
        `节点 ${current} 已经在 visited 集合中，避免重复访问。`,
        async () => Promise.resolve()
      )
      continue
    }

    visited.add(current)
    addStep(
      `访问节点 ${current}`,
      `出队节点 ${current} 并标记为已访问，这是 BFS 的核心访问动作。`,
      async () => {
        await graph.markVisited(current, { duration: 0.3 })
      }
    )

    for (const { nodeId, edgeId } of adj.get(current) ?? []) {
      if (visited.has(nodeId)) {
        addStep(
          `检查边 ${edgeId}（${current}→${nodeId}）`,
          `目标节点 ${nodeId} 已访问，本次不入队，只保留“检查”语义。`,
          async () => Promise.resolve()
        )
        continue
      }

      queue.push(nodeId)
      addStep(
        `遍历边 ${edgeId} 并入队 ${nodeId}`,
        `通过边 ${edgeId} 发现新节点 ${nodeId}，将其加入队列尾部等待后续访问。`,
        async () => {
          await graph.markEdgeTraversed(edgeId, { duration: 0.25 })
        }
      )
    }
  }

  const intro = 'BFS 按“队列先进先出”扩展节点。每一步会明确展示出队访问和沿边发现新节点的动作。'
  const onStepChange = await createStepTextOverlay(scene, { descriptions, intro, x: 380, y: 12 })

  return {
    stepper,
    descriptions,
    intro,
    onStepChange,
    cleanup: () => scene.destroy(),
  }
}
