import { Scene, GraphViz } from '../../src'
import type { GraphEdgeData } from '../../src'

export async function bfsDemo(canvas: HTMLCanvasElement) {
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

  const graph = new GraphViz(scene, nodes, edges, { x: 60, y: 10, width: 600, height: 400, layout: 'circular', nodeRadius: 28 })
  scene.add(graph)

  const adj = new Map<string, Array<{ nodeId: string; edgeId: string }>>()
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, [])
    adj.get(e.from)!.push({ nodeId: e.to, edgeId: e.id })
  }

  const visited = new Set<string>()
  const queue = ['A']
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    await graph.markVisited(id, { duration: 0.3 })
    await scene.wait(0.3)
    for (const { nodeId, edgeId } of adj.get(id) ?? []) {
      if (!visited.has(nodeId)) {
        await graph.markEdgeTraversed(edgeId, { duration: 0.25 })
        queue.push(nodeId)
      }
    }
  }

  return () => scene.destroy()
}
