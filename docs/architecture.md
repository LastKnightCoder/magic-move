# algo-viz 架构说明

## 概述

algo-viz 是一个基于 Canvas 的算法可视化动画引擎，设计目标是让算法演示代码像 Python manim 一样自然——用 async/await 描述动画序列，而不是手动管理关键帧和时间轴。

底层渲染引擎选用 [LeaferJS](https://www.leaferjs.com/)，它提供了高性能的 Canvas 场景图、内置 HiDPI 支持和属性动画系统，让我们专注于上层的动画编排逻辑。

---

## 分层架构

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 3  数据结构可视化器                                     │
│  ArrayViz / TreeViz / GraphViz / StackViz / LinkedListViz    │
│  领域 API：swap、push/pop、markVisited、traverse …            │
├──────────────────────────────────────────────────────────────┤
│  Layer 2.5  BaseViz（通用基类）                               │
│  highlight(id) / unhighlight(id) / setNodeProp(id, props)    │
│  animateProp() / register() / unregister() / clearAll()      │
├──────────────────────────────────────────────────────────────┤
│  Layer 2  动画引擎核心                                         │
│  Scene（编排）/ MagicMove（diff 引擎）/ Timeline（时序）       │
├──────────────────────────────────────────────────────────────┤
│  Layer 1  LeaferJS                                           │
│  Canvas 渲染 / HiDPI / 场景图 / Animate 属性插值              │
└──────────────────────────────────────────────────────────────┘
```

每一层只依赖下面的层，上层可以被替换或扩展而不影响下层。

---

## 核心概念

### VizState — 纯数据快照

所有可视化器的状态都用 `VizState` 表示，它是一个纯数据对象，不持有任何 LeaferJS 节点引用：

```typescript
interface VizState {
  nodes: Map<string, NodeState>  // id → 节点的位置、尺寸、颜色等
  edges?: Map<string, EdgeState> // 可选，用于图结构
}
```

这个设计是 Magic Move 能工作的基础：在动画开始前快照一份 `before`，变更数据后计算 `after`，MagicMove 对两份快照做 diff，再驱动 LeaferJS 做插值动画。纯数据快照轻量、可序列化，也方便测试。

### MagicMove — diff 引擎

`MagicMove.diff(before, after)` 将节点分为三类：

- **morph**：两个状态都存在的节点 → 插值所有变化的属性（位置、颜色、尺寸等）
- **enter**：只在 after 中存在 → fade/scale/slide in
- **exit**：只在 before 中存在 → fade/scale/slide out

所有动画并行执行，通过 `Promise.all` 等待全部完成。

```
before state          after state
┌──────────────┐      ┌──────────────┐
│ A  B  C      │ diff │ A  C  D      │
└──────────────┘      └──────────────┘
                         │
              ┌──────────┼──────────┐
           morph(A,C)  exit(B)   enter(D)
```

### BaseViz — 通用基类

所有可视化器继承 `BaseViz`，它提供：

- `getState()` / `applyState()` 的通用实现（遍历 nodeMap 序列化属性）
- `highlight(id, color)` / `unhighlight(id)` — 按节点 ID 改颜色
- `setNodeProp(id, props)` — 按节点 ID 动画任意属性
- `animateProp(node, props)` — 核心动画原语，封装 LeaferJS `node.animate()`
- `commitMutation(mutate, rebuild, options)` — 通用“快照→数据变更→重建→过渡”事务
- `createCenteredLabel(text, bounds, options)` — 统一文本水平/垂直居中
- `register(id, node)` / `unregister(id)` / `clearAll()` — nodeMap 管理

节点 ID 是稳定的字符串标识符（如 `circle-root`、`cell-3`），不依赖数组下标，避免 swap 后 ID 语义混乱。

### 运行时插件初始化与降级

`algo-viz` 在核心入口会自动导入 `@leafer-in/animate`。  
若运行环境异常导致插件不可用，`BaseViz.animateProp()` 与 `MagicMove` 会降级为“直接应用终态并安全 resolve”，从而避免 `reading 'on'` 之类的运行时崩溃。

### IVisualizer — 可视化器契约

```typescript
interface IVisualizer {
  readonly group: IUI          // LeaferJS Group，挂载到 Scene
  getState(): VizState         // 快照当前状态
  applyState(state, opts?): Promise<void>  // 动画过渡到新状态
}
```

此外，每个可视化器还暴露 `nodeMap: Map<string, IUI>` 和 `computeState(): VizState`，供 `Scene.morph()` 使用。

### Scene — 编排器

`Scene` 是用户的主要入口，提供 manim 风格的 async/await API：

```typescript
// 并行
await scene.play(anim1, anim2)

// 顺序（接收回调，不是 Promise，确保按序启动）
await scene.sequence(
  () => arr.swap(0, 1),
  () => scene.wait(0.3),
)

// Magic Move 便捷方法
await scene.morph(arr, () => { data.sort() })
```

`sequence()` 接收回调而非 Promise 的原因：Promise 是 eager 的，创建时就开始执行。如果传入 Promise，所有步骤会同时启动，失去顺序控制。

---

## 文件结构

```
src/
├── index.ts                        # 统一导出入口
│
├── core/
│   ├── types.ts                    # 所有共享接口（EasingName、VizState、IVisualizer 等）
│   ├── Easing.ts                   # EasingName → LeaferJS easing 字符串映射
│   ├── BaseViz.ts                  # 通用基类（highlight/setNodeProp/animateProp 等）
│   ├── NodeWrapper.ts              # LeaferJS 节点 + 稳定 ID 的桥接工具
│   ├── MagicMove.ts                # diff 引擎 + 动画驱动（最核心）
│   ├── Timeline.ts                 # 低级时序原语（at/then/run）
│   ├── Scene.ts                    # 用户主入口（play/wait/sequence/morph）
│   └── index.ts
│
├── data-structures/
│   ├── ArrayViz.ts                 # 数组：highlightAt/swap/markSorted/showPointer
│   ├── StackViz.ts                 # 栈：push/pop/peek
│   ├── LinkedListViz.ts            # 链表：insertAfter/remove/traverse
│   ├── TreeViz.ts                  # 二叉树：markVisited/setRoot（递归布局）
│   ├── GraphViz.ts                 # 图：markVisited/markEdgeTraversed（circular/manual 布局）
│   └── index.ts
│
├── react/
│   ├── SceneCanvas.tsx             # React 组件，管理 canvas 生命周期
│   ├── useScene.ts                 # React hook
│   └── index.ts
│
demo/                               # Vite 开发 demo（pnpm demo 启动）
├── index.html
└── src/
    ├── main.ts
    ├── registry.ts
    └── demos/
        ├── bubble-sort.ts
        ├── bfs.ts
        ├── tree.ts
        ├── stack.ts
        └── linked-list.ts
```

---

## 数据流

一次典型的 `arr.swap(i, j)` 调用的完整数据流：

```
用户代码
  await arr.swap(0, 1)
       │
ArrayViz.swap()
  1. 读取 nodeMap 中 cell-0 和 cell-1 的当前 x 坐标
  2. 调用 this.animateProp(nodeI, { x: xj }) 和 this.animateProp(nodeJ, { x: xi })
       │
BaseViz.animateProp()
  3. 调用 LeaferJS node.animate({ keyframes: [{ x: newX }] }, { duration, easing })
  4. 监听 'completed' 事件，resolve Promise
       │
LeaferJS Animate
  5. 在每一帧插值 x 属性，驱动 Canvas 重绘
  6. 动画结束后触发 'completed'
       │
Promise resolve → await 返回
```

---

## HiDPI 处理

LeaferJS 内部自动处理 `window.devicePixelRatio`，将 Canvas 的物理像素尺寸设为逻辑尺寸的 `dpr` 倍，同时保持 CSS 尺寸不变。我们在 `Scene` 中只需传入逻辑尺寸（如 `height: 600`），LeaferJS 负责底层缩放，所有坐标计算都在逻辑像素空间进行。

## 自适应宽度

`Scene` 的 `width` 参数是可选的。省略时，Scene 会读取 `canvas.clientWidth` 作为初始宽度，并通过 `ResizeObserver` 监听父容器尺寸变化，自动更新 Leafer 和 Frame 的宽度。

```typescript
// 固定宽度
const scene = new Scene(canvas, { width: 800, height: 400 })

// 自适应父容器宽度
const scene = new Scene(canvas, { height: 400 })
```

---

## 扩展：自定义可视化器

继承 `BaseViz` 即可接入 `Scene` 的所有能力：

```typescript
import { Group, Rect } from 'leafer-ui'
import type { VizState, AnimationOptions } from 'algo-viz/core'
import { BaseViz } from 'algo-viz/core'

export class QueueViz extends BaseViz {
  protected defaultFill = '#e0f2fe'
  private data: number[] = []

  constructor(scene: Scene, data: number[]) {
    super(0, 0)  // x, y
    this.data = [...data]
    this._build()
  }

  computeState(): VizState {
    const nodes = new Map()
    this.data.forEach((_, i) => {
      nodes.set(`cell-${i}`, { id: `cell-${i}`, x: i * 70, y: 0, width: 60, height: 60, fill: this.defaultFill })
    })
    return { nodes }
  }

  async enqueue(value: number, opts?: AnimationOptions): Promise<void> {
    this.data.push(value)
    const before = this.getState()
    this.clearAll()
    this._build()
    await this.applyState(this.computeState(), { enterAnimation: 'slide', ...opts })
  }

  private _build() {
    this.data.forEach((v, i) => {
      const rect = new Rect({ x: i * 70, y: 0, width: 60, height: 60, fill: this.defaultFill })
      this.register(`cell-${i}`, rect)
    })
  }
}
```

---

## 依赖关系

| 依赖 | 角色 | 是否必须 |
|------|------|----------|
| `leafer-ui` | Canvas 渲染、场景图、HiDPI | 必须（peer dep） |
| `@leafer-in/animate` | 属性动画插值 | 必须（peer dep） |
| `react` | React 集成层 | 可选（peer dep） |

核心包（`algo-viz/core` 和 `algo-viz/data-structures`）不依赖 React，可在任何环境使用。
