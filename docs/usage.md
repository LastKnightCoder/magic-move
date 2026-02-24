# algo-viz 使用文档

## 安装

```bash
npm install algo-viz leafer-ui @leafer-in/animate
# 如果使用 React
npm install algo-viz leafer-ui @leafer-in/animate react react-dom
```

> 从当前版本开始，`algo-viz` 会在核心入口自动注册 `@leafer-in/animate` 插件。  
> 在绝大多数场景下不需要再手动 `import '@leafer-in/animate'`。  
> 如果你使用非常规打包入口或强 tree-shaking 配置，仍可手动导入作为兜底。

---

## 快速开始

### 原生 JS/TS

```typescript
import { Scene, ArrayViz } from 'algo-viz'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const scene = new Scene(canvas, { height: 160, background: '#f8fafc' }) // width 自适应

const arr = new ArrayViz(scene, [5, 3, 8, 1, 9, 2])
scene.add(arr)

// 高亮前两个元素，交换，然后标记已排序
await arr.highlightAt([0, 1])
await arr.swap(0, 1, { duration: 0.4, easing: 'ease-in-out' })
await arr.unhighlightAt([0, 1])
await arr.markSorted([5])
```

### React

```tsx
import { SceneProvider, SceneCanvas, Text, TextMorph } from 'algo-viz/react'

function TextDemo() {
  return (
    <SceneProvider height={220} background="#f8fafc">
      <SceneCanvas />
      <Text text="Hello World" x={40} y={60} preset="write" />
      <TextMorph from="Hello World" to="Hello React" x={40} y={130} options={{ duration: 0.9 }} />
    </SceneProvider>
  )
}
```

`algo-viz/react` 使用 Provider 架构：`Scene` 生命周期由 `SceneProvider` 统一管理，组件和 hooks 通过 context 获取 scene。

---

## Scene API

`Scene` 是所有动画的编排入口。

```typescript
const scene = new Scene(canvas, {
  width: 800,       // 可选，省略时自适应父容器宽度（ResizeObserver）
  height: 600,      // 必填，逻辑高度（px）
  background: '#ffffff',  // 背景色，默认白色
})
```

### scene.play(...animations)

并行执行多个动画，等待全部完成。

```typescript
await scene.play(
  arr.highlightAt([0, 1]),
  tree.highlight('circle-root', '#6366f1')
)
```

### scene.wait(seconds)

暂停指定秒数。

```typescript
await arr.highlightAt([0])
await scene.wait(0.5)
await arr.unhighlightAt([0])
```

### scene.sequence(...steps)

顺序执行多个步骤，每个步骤是一个返回 `Promise<void>` 的回调。

```typescript
// 注意：传入的是回调函数，不是 Promise
await scene.sequence(
  () => arr.highlightAt([0, 1]),
  () => arr.swap(0, 1),
  () => arr.unhighlightAt([0, 1]),
  () => scene.wait(0.2),
  () => arr.markSorted([5]),
)
```

> 为什么是回调而不是 Promise？Promise 创建时就开始执行，传入 `sequence` 时所有步骤已经同时启动了。回调让 `sequence` 控制每步的启动时机。

### scene.morph(viz, mutateFn, options?)

Magic Move 便捷方法：快照当前状态 → 执行变更函数 → 自动过渡到新状态。

```typescript
const data = [5, 3, 8, 1]
const arr = new ArrayViz(scene, data)

await scene.morph(arr, () => {
  data.sort((a, b) => a - b)
}, { duration: 0.6, easing: 'spring' })
```

### scene.transition(viz, newState, options?)

低级 Magic Move：直接传入目标 `VizState`。

```typescript
const before = arr.getState()
// ... 手动构建 after state
await scene.transition(arr, after, { duration: 0.5 })
```

### scene.add(viz) / scene.remove(viz) / scene.clear()

管理场景中的可视化器。

---

## AnimationOptions

所有动画方法都接受可选的 `AnimationOptions`：

```typescript
interface AnimationOptions {
  duration?: number    // 秒，默认 0.4~0.5（各方法略有不同）
  easing?: EasingName  // 默认 'ease-in-out'
  delay?: number       // 延迟秒数，默认 0
}
```

`Scene.transition()` / `Scene.morph()` 额外支持：

```typescript
interface MagicMoveOptions extends AnimationOptions {
  enterAnimation?: 'fade' | 'scale' | 'slide' | 'draw'
  exitAnimation?: 'fade' | 'scale' | 'slide'
  enterLagRatio?: number   // 新增节点错峰系数，默认 0.06
  enterOvershoot?: number  // 新增节点轻微过冲，默认 1.03
}
```

可用的 easing：

| 值 | 效果 |
|---|---|
| `'linear'` | 匀速 |
| `'ease'` | 标准缓入缓出 |
| `'ease-in'` | 缓入 |
| `'ease-out'` | 缓出 |
| `'ease-in-out'` | 缓入缓出（默认） |
| `'spring'` | 弹簧效果，有轻微过冲 |
| `'bounce'` | 弹跳效果 |

---

## 动画序列化协议（JSON v1）

为了支持动画持久化与复现，库提供版本化协议与编解码工具。

```typescript
import type { SerializedAnimation } from 'algo-viz'
import { ANIMATION_SCHEMA_VERSION } from 'algo-viz'
```

协议主结构：

```typescript
interface SerializedAnimation {
  schemaVersion: '1.0'
  meta?: {
    name?: string
    createdAt?: string
    engine?: 'algo-viz'
    engineVersion?: string
    tags?: string[]
  }
  visualizers: Array<{
    id: string
    type?: string
    name?: string
    meta?: Record<string, unknown>
  }>
  snapshotTrack: Array<{
    t: number
    label?: string
    states: Array<{
      vizId: string
      nodes: NodeState[]
      edges?: EdgeState[]
    }>
  }>
  operationTrack?: Array<{
    t: number
    vizId: string
    op: 'highlight' | 'unhighlight' | 'setNodeProp' | 'transition' | string
    args?: unknown
    options?: AnimationOptions | MagicMoveOptions
  }>
}
```

最小 JSON 示例：

```json
{
  "schemaVersion": "1.0",
  "visualizers": [{ "id": "array-main", "type": "ArrayViz" }],
  "snapshotTrack": [
    {
      "t": 0,
      "label": "init",
      "states": [
        {
          "vizId": "array-main",
          "nodes": [{ "id": "cell-0", "x": 0, "y": 0, "width": 60, "height": 60, "fill": "#e2e8f0", "opacity": 1 }]
        }
      ]
    }
  ]
}
```

> 建议保持 `schemaVersion` 固定为 `ANIMATION_SCHEMA_VERSION`，并在读取时先调用校验器。

---

## 录制动画（serialize）

### 1) 使用 Stepper 录制快照轨

```typescript
import { Stepper, serializeStepperSession } from 'algo-viz'

const stepper = new Stepper([arr]).init()

stepper
  .step('highlight-first', async () => {
    await arr.highlightAt([0], '#6366f1')
  })
  .step('swap-0-1', async () => {
    await arr.swap(0, 1)
  })

await stepper.next()
await stepper.next()

const payload = serializeStepperSession(stepper, {
  visualizers: [
    { viz: arr, descriptor: { id: 'array-main', type: 'ArrayViz', name: 'Main Array' } },
  ],
  frameInterval: 0.4,
  operationTrack: [
    { t: 0.4, vizId: 'array-main', op: 'custom', args: { note: 'step-1-complete' } },
  ],
  meta: { name: 'bubble-sort-demo', tags: ['sort', 'demo'] },
})

const json = JSON.stringify(payload, null, 2)
```

### 2) 手工序列化单个 VizState（可选）

```typescript
import { serializeVizState } from 'algo-viz'

const state = arr.getState()
const serialized = serializeVizState('array-main', state)
```

---

## 加载与回放（deserialize + play）

### 1) 读取并校验

```typescript
import { validateAnimationSchema, deserializeAnimation } from 'algo-viz'

const raw = JSON.parse(jsonText)
const check = validateAnimationSchema(raw)
if (!check.valid) {
  throw new Error(check.errors.join('\n'))
}
const animation = deserializeAnimation(raw)
```

### 2) 使用 AnimationPlayer 回放（推荐）

```typescript
import { AnimationPlayer } from 'algo-viz'

await AnimationPlayer.play(scene, { 'array-main': arr }, animation, {
  mode: 'snapshot-first',
  snapshot: { respectFrameTime: true },
})
```

也可以单独使用操作轨：

```typescript
await AnimationPlayer.playFromOperations(scene, { 'array-main': arr }, animation.operationTrack ?? [], {
  respectEventTime: true,
  handlers: {
    custom: async ({ event }) => {
      console.log('custom op:', event.args)
    },
  },
})
```

### 3) React 场景用法（SceneProvider + SceneCanvas）

```tsx
import { useEffect } from 'react'
import { SceneProvider, SceneCanvas, useScene, useSceneControls } from 'algo-viz/react'
import { ArrayViz, AnimationPlayer, deserializeAnimation } from 'algo-viz'

function PlaybackInner({ jsonText }: { jsonText: string }) {
  const { scene, isReady } = useScene()
  const { wait } = useSceneControls()

  useEffect(() => {
    if (!scene || !isReady) return
    let mounted = true
    const run = async () => {
      await wait(0.05)
      if (!mounted) return

      const arr = new ArrayViz(scene, [5, 3, 8, 1], { x: 20, y: 40 })
      scene.add(arr)

      const animation = deserializeAnimation(JSON.parse(jsonText))
      await AnimationPlayer.play(scene, { 'array-main': arr }, animation)
    }
    void run()
    return () => {
      mounted = false
    }
  }, [isReady, jsonText, scene, wait])

  return null
}

function PlaybackDemo({ jsonText }: { jsonText: string }) {
  return (
    <SceneProvider height={180} background="#f8fafc">
      <SceneCanvas />
      <PlaybackInner jsonText={jsonText} />
    </SceneProvider>
  )
}
```

### 4) Timeline 与 Step（React）

```tsx
import { useEffect, useMemo } from 'react'
import { SceneProvider, SceneCanvas, StepControls, useScene, useStep, useTimeline } from 'algo-viz/react'
import { ArrayViz } from 'algo-viz'

function TimelineStepInner() {
  const { scene } = useScene()
  const timeline = useTimeline()

  const arr = useMemo(() => {
    if (!scene) return null
    return new ArrayViz(scene, [5, 3, 8, 1], { x: 20, y: 60 })
  }, [scene])

  useEffect(() => {
    if (!scene || !arr) return
    scene.add(arr)
    timeline
      .at(0, async () => arr.highlightAt([0, 1]))
      .at(0.4, async () => arr.swap(0, 1))
      .at(0.8, async () => arr.unhighlightAt([0, 1]))
    void timeline.run()

    return () => {
      scene.remove(arr)
    }
  }, [arr, scene, timeline])

  const { state, next, prev, reset } = useStep({
    visualizers: arr ? [arr] : [],
    steps: arr
      ? [
          { label: 'highlight', run: async () => arr.highlightAt([0, 1]) },
          { label: 'swap', run: async () => arr.swap(0, 1) },
          { label: 'unhighlight', run: async () => arr.unhighlightAt([0, 1]) },
        ]
      : [],
  })

  return <StepControls state={state} onPrev={prev} onNext={next} onReset={reset} />
}
```

```tsx
function TimelineStepDemo() {
  return (
    <SceneProvider height={220} background="#f8fafc">
      <SceneCanvas />
      <TimelineStepInner />
    </SceneProvider>
  )
}
```

---

## BaseViz 通用 API

所有可视化器都继承 `BaseViz`，以下方法在所有可视化器上都可用。

节点 ID 是稳定的字符串，各可视化器的 ID 命名规则见各自章节。

```typescript
// 按 ID 高亮节点（默认会协同处理 fill + stroke）
await viz.highlight('circle-root', '#6366f1')

// 可选：自定义高亮描边
await viz.highlight('circle-root', '#6366f1', {
  highlightStrokeColor: '#4338ca',
  highlightStrokeWidth: 2.5,
})

// 按 ID 恢复高亮前的原始样式（fill/stroke/strokeWidth）
await viz.unhighlight('circle-root')

// 按 ID 动画任意属性
await viz.setNodeProp('circle-root', { fill: '#f59e0b', opacity: 0.5 })

// 获取当前状态快照（纯数据）
const state = viz.getState()

// 动画过渡到指定状态
await viz.applyState(newState, { duration: 0.5 })
```

---

## ArrayViz

数组可视化器，每个元素渲染为一个带标签的方块。

节点 ID 规则：`cell-{index}`（方块）、`label-{index}`（文字）、`ptr-{label}`（指针）

```typescript
const arr = new ArrayViz(scene, [5, 3, 8, 1], {
  x: 20, y: 40,
  cellWidth: 60, cellHeight: 60, gap: 4,
  fillColor: '#e2e8f0',
  highlightColor: '#f59e0b',
  sortedColor: '#86efac',
  fontSize: 18,
  strokeColor: '#94a3b8',
})
scene.add(arr)
```

### 方法

```typescript
// 按下标高亮（内部转为 cell-{i} ID）
await arr.highlightAt([0, 1], '#f59e0b')
await arr.unhighlightAt([0, 1])

// 也可以直接用 BaseViz 的 ID 方式
await arr.highlight('cell-0', '#f59e0b')

// 交换两个元素（带位置动画，同步更新 nodeMap 映射）
await arr.swap(i, j, { duration: 0.4 })

// 标记为已排序（绿色）
await arr.markSorted([5, 6, 7])

// 修改单个元素的值（带淡入淡出）
await arr.setValue(2, 99)

// 全量替换数据，Magic Move 过渡
await arr.setData([1, 2, 3, 4, 5])

// 显示 / 隐藏指针标签
await arr.showPointer(2, 'i')
await arr.showPointer(5, 'j')
await arr.hidePointer('i')
```

### 完整示例：冒泡排序

```typescript
async function bubbleSort(scene: Scene, arr: ArrayViz<number>, data: number[]) {
  const d = [...data]
  for (let i = 0; i < d.length; i++) {
    for (let j = 0; j < d.length - i - 1; j++) {
      await arr.highlightAt([j, j + 1])
      if (d[j] > d[j + 1]) {
        await arr.swap(j, j + 1, { duration: 0.4, easing: 'ease-in-out' })
        ;[d[j], d[j + 1]] = [d[j + 1], d[j]]
      }
      await arr.unhighlightAt([j, j + 1])
    }
    await arr.markSorted([d.length - 1 - i])
  }
}
```

---

## StackViz

栈可视化器，元素从下往上堆叠。

节点 ID 规则：`cell-{index}`（方块）、`label-{index}`（文字）

```typescript
const stack = new StackViz(scene, [1, 2, 3], {
  x: 20, y: 20,
  cellWidth: 100, cellHeight: 48, gap: 3,
  maxVisible: 8,
})
scene.add(stack)
```

### 方法

```typescript
await stack.push(42)           // 入栈，带滑入动画
const val = await stack.pop()  // 出栈，带滑出动画，返回弹出的值
await stack.peek()             // 高亮栈顶元素后恢复

// 通用 highlight 也可用（按 ID）
await stack.highlight('cell-2', '#f59e0b')
```

---

## LinkedListViz

链表可视化器，节点横向排列，带箭头连接。

节点 ID 规则：`rect-{nodeId}`（方块）、`label-{nodeId}`（文字）、`arrow-{nodeId}`（箭头）

```typescript
const list = new LinkedListViz(scene, [
  { id: 'a', value: 1, next: 'b' },
  { id: 'b', value: 2, next: 'c' },
  { id: 'c', value: 3 },
], { x: 20, y: 60, nodeWidth: 80, nodeHeight: 48, gap: 40 })
scene.add(list)
```

### 方法

```typescript
// 通用 highlight（按 ID）
await list.highlight('rect-b', '#f59e0b')
await list.unhighlight('rect-b')

// 在指定节点后插入（afterId 为 null 则插入头部）
await list.insertAfter('a', { id: 'd', value: 99, next: 'b' })

// 删除节点（自动更新前驱节点的 next 指针）
await list.remove('b')

// 动画遍历（指针逐节点高亮）
await list.traverse()
```

---

## TreeViz

二叉树可视化器，自动计算布局（中序遍历分配 x 坐标，深度决定 y 坐标）。

节点 ID 规则：`circle-{nodeId}`（圆形）、`label-{nodeId}`（文字）、`edge-{childId}`（边）

```typescript
const root: TreeNodeData<number> = {
  id: 'root', value: 4,
  left: { id: 'l', value: 2, left: { id: 'll', value: 1 }, right: { id: 'lr', value: 3 } },
  right: { id: 'r', value: 6, left: { id: 'rl', value: 5 }, right: { id: 'rr', value: 7 } },
}

const tree = new TreeViz(scene, root, {
  x: 20, y: 20,
  nodeRadius: 26, levelHeight: 80,
  fillColor: '#bfdbfe', highlightColor: '#6366f1', visitedColor: '#86efac',
})
scene.add(tree)
```

### 方法

```typescript
// 通用 highlight（需要带 circle- 前缀）
await tree.highlight('circle-root', '#6366f1')
await tree.unhighlight('circle-root')

// 标记为已访问（绿色，封装了 highlight）
await tree.markVisited('root')

// 替换整棵树，Magic Move 过渡到新布局
await tree.setRoot(newRoot)

// 在指定父节点相对位置插入子节点（parentId 为 null 时等价于设置根）
await tree.insertChild('l', 'right', { id: 'lx', value: 9 })

// 局部旋转（缺少必要子节点时会安全 no-op）
await tree.rotateLeft('root')
await tree.rotateRight('root')

// 显式设置节点颜色（会同时维护文字对比色）
await tree.paintNode('root', '#334155')

// 细粒度重连：用于拆分演示“断开/连接”过程
await tree.setChild('root', 'left', undefined)      // 断开 root.left
await tree.rewireChild('root', 'left', 'lr')        // 将 lr 作为 root.left

// 按顺序高亮一组节点（演示遍历路径）
await tree.showTraversalPath(['root', 'l', 'll'])
```

### 完整示例：中序遍历

```typescript
async function inorder(tree: TreeViz<number>, node: TreeNodeData<number> | undefined) {
  if (!node) return
  await inorder(tree, node.left)
  await tree.highlight(`circle-${node.id}`, '#6366f1')
  await scene.wait(0.3)
  await tree.markVisited(node.id)
  await inorder(tree, node.right)
}
await inorder(tree, root)
```

### 红黑树操作（步进 Demo）

项目 demo 中新增了“红黑树操作”步进示例（`红黑树操作 / rb-tree-ops`），用于演示：

- 相对节点插入（`insertChild`）
- 左旋 / 右旋（`rotateLeft` / `rotateRight`）
- 细粒度连接重排（`setChild` / `rewireChild`），可拆解“断开 -> 旋转 -> 重连”
- 红黑颜色表达（通过 `highlight`，不扩展 `TreeNodeData` 结构）

颜色建议：

```typescript
const RED = '#ef4444'
const BLACK = '#334155'
await tree.highlight('circle-n10', BLACK)
await tree.highlight('circle-n12', RED)
```

---

## GraphViz

图可视化器，支持有向/无向图，提供 `circular`（圆形布局）和 `manual`（手动坐标）两种布局。

节点 ID 规则：`circle-{nodeId}`（圆形）、`label-{nodeId}`（文字）、`edge-{edgeId}`（边）

```typescript
const graph = new GraphViz(scene, nodes, edges, {
  x: 0, y: 0, width: 500, height: 500,
  layout: 'circular', nodeRadius: 24,
})
scene.add(graph)
```

手动布局时，在节点数据中提供 `x`、`y`：

```typescript
{ id: 'A', value: 'A', x: 100, y: 50 }
```

### 方法

```typescript
// 通用 highlight（需要带 circle- 前缀）
await graph.highlight('circle-A', '#f43f5e')

// 标记已访问（封装了 highlight）
await graph.markVisited('A')

// 高亮边（封装了 setNodeProp）
await graph.markEdgeTraversed('AB')

// 动态增删节点和边
await graph.addNode({ id: 'E', value: 'E' })
await graph.removeNode('D')
await graph.addEdge({ id: 'AE', from: 'A', to: 'E' })
await graph.removeEdge('AC')
```

### 完整示例：BFS

```typescript
async function bfs(graph: GraphViz<string>, startId: string) {
  const adj = buildAdjacency(edges)
  const visited = new Set<string>()
  const queue = [startId]

  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    await graph.markVisited(id)
    await scene.wait(0.4)
    for (const { nodeId, edgeId } of adj.get(id) ?? []) {
      if (!visited.has(nodeId)) {
        await graph.markEdgeTraversed(edgeId, { duration: 0.3 })
        queue.push(nodeId)
      }
    }
  }
}
```

---

## 自定义可视化器

继承 `BaseViz` 即可接入 `Scene` 的所有能力：

```typescript
import { Rect } from 'leafer-ui'
import type { VizState, AnimationOptions } from 'algo-viz/core'
import { BaseViz } from 'algo-viz/core'

export class QueueViz extends BaseViz {
  protected defaultFill = '#e0f2fe'
  private data: number[] = []

  constructor(scene: Scene, data: number[]) {
    super(0, 0)
    this.data = [...data]
    this._build()
  }

  computeState(): VizState {
    const nodes = new Map()
    this.data.forEach((_, i) => {
      nodes.set(`cell-${i}`, { id: `cell-${i}`, x: i * 70, y: 0, width: 60, height: 60, fill: this.defaultFill, opacity: 1 })
    })
    return { nodes }
  }

  async enqueue(value: number, opts?: AnimationOptions): Promise<void> {
    await this.commitMutation(
      () => {
        this.data.push(value)
      },
      () => {
        this._build()
      },
      { enterAnimation: 'slide', ...opts }
    )
  }

  async dequeue(opts?: AnimationOptions): Promise<number | undefined> {
    if (!this.data.length) return
    const val = this.data.shift()!
    const before = this.getState()
    this.clearAll()
    this._build()
    await this.applyState(this.computeState(), { exitAnimation: 'fade', ...opts })
    return val
  }

  private _build() {
    this.data.forEach((v, i) => {
      this.register(`cell-${i}`, new Rect({ x: i * 70, y: 0, width: 60, height: 60, fill: this.defaultFill }))
    })
  }
}
```

---

## 常见问题

**Q: 动画结束后节点消失了？**

LeaferJS Animate 的 `ending` 参数控制动画结束后的状态，algo-viz 内部统一设置为 `'to'`（保持终态）。如果你直接调用 LeaferJS API，记得加上 `ending: 'to'`。

**Q: 控制台出现 `please install and import plugin: @leafer-in/animate` 或 `reading 'on'`？**

先确认是否通过 `algo-viz` 的标准入口导入（如 `import { Scene } from 'algo-viz'`）。  
如果是非常规构建入口，手动加一行：

```typescript
import '@leafer-in/animate'
```

另外，库内部已经在动画调用处做了降级保护：即使插件异常，也会降级为直接应用终态，避免运行时崩溃。

**Q: 为什么有时只剩最后一个 label，或 label 位置不居中？**

请在自定义可视化器里避免手写文本偏移公式，优先使用 `BaseViz` 提供的：

- `createCenteredLabel(...)`：统一水平/垂直居中
- `commitMutation(...)`：快照 → 变更数据 → 重建节点 → 过渡，避免 after-state 丢失 label/arrow 这类非主节点

**Q: 如何在 React StrictMode 下使用？**

`SceneProvider + SceneCanvas` 在 StrictMode 下可正常工作。  
开发环境会触发 effect 双调用（mount → unmount → mount），`SceneProvider` 会在 cleanup 中销毁 Scene 并在下一次 mount 重建，行为可预期。

**Q: 如何控制动画速度（全局加速/减速）？**

目前没有全局速度控制，可以封装一个 helper：

```typescript
const SPEED = 0.5  // 全局速度系数

function opts(duration = 0.4): AnimationOptions {
  return { duration: duration * SPEED, easing: 'ease-in-out' }
}

await arr.swap(0, 1, opts())
await arr.highlightAt([2], undefined, opts(0.2))
```

**Q: demo 里点击“重新运行”为什么以前会闪一下，现在如何保证稳定？**

demo 框架现在会在重跑前执行上次运行返回的 cleanup（通常是 `scene.destroy()`），然后再启动新一轮动画。  
如果你写自定义 demo，建议在 `run(canvas)` 末尾返回清理函数：

```typescript
export async function myDemo(canvas: HTMLCanvasElement) {
  const scene = new Scene(canvas, { width: 720, height: 200 })
  // ... animation logic
  return () => scene.destroy()
}
```

**Q: TreeViz 的布局算法是什么？**

当前使用简单的递归布局：中序遍历分配 x 坐标（等间距），深度决定 y 坐标。对于大多数演示场景足够用。如果需要更紧凑的布局，可以替换为 Reingold-Tilford 算法。

**Q: GraphViz 支持力导向布局吗？**

当前支持 `circular`（圆形）和 `manual`（手动坐标）。力导向布局（`d3-force`）在路线图中，可以通过提供 `x`、`y` 坐标的方式手动模拟。
