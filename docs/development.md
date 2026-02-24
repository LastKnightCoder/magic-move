# algo-viz 开发文档

## 环境准备

- Node.js >= 18
- pnpm >= 9

```bash
git clone <repo>
cd magic-move
pnpm install
```

---

## 目录结构

```
magic-move/
├── src/                  # 库源码
│   ├── core/             # 动画引擎核心
│   ├── data-structures/  # 数据结构可视化器
│   └── react/            # React 集成
├── demo/                 # Vite 开发 demo
│   ├── index.html
│   └── src/
│       ├── main.ts       # 注册所有 demo
│       ├── registry.ts   # demo 框架（导航 + 运行按钮）
│       └── demos/        # 各 demo 实现
├── docs/                 # 文档
├── dist/                 # 构建产物（gitignore）
├── package.json
├── tsconfig.json
├── tsup.config.ts        # 库打包配置
└── vite.config.ts        # demo 开发服务器配置
```

---

## 常用命令

```bash
# 启动 demo 开发服务器（热更新，浏览器自动打开）
pnpm demo

# 构建库（输出到 dist/）
pnpm build

# TypeScript 类型检查（不输出文件）
pnpm typecheck

# 运行测试
pnpm test
pnpm test:watch
```

---

## 开发工作流

### 修改库代码

1. 修改 `src/` 下的文件
2. `pnpm demo` 会通过 Vite 的 alias 直接引用 `src/`，无需先 build
3. 浏览器热更新，即时看到效果

### 添加新 demo

在 `demo/src/demos/` 下新建文件：

```typescript
// demo/src/demos/my-algo.ts
import { Scene, ArrayViz } from '../../src'

export async function myAlgoDemo(canvas: HTMLCanvasElement) {
  const scene = new Scene(canvas, { width: 720, height: 200, background: '#f8fafc' })
  // ...
}
```

在 `demo/src/main.ts` 中注册：

```typescript
import { myAlgoDemo } from './demos/my-algo'
registerDemo('我的算法', 'my-algo', myAlgoDemo)
```

### 添加新可视化器

1. 在 `src/data-structures/` 下新建文件，继承 `BaseViz`
2. 实现 `computeState()` 和 `protected defaultFill`
3. 在 `src/data-structures/index.ts` 中导出
4. 在 `src/index.ts` 中导出

最小骨架：

```typescript
// src/data-structures/MyViz.ts
import { Rect } from 'leafer-ui'
import type { Scene } from '../core/Scene'
import type { VizState } from '../core/types'
import { BaseViz } from '../core/BaseViz'

export interface MyVizOptions {
  x?: number
  y?: number
  fillColor?: string
}

export class MyViz extends BaseViz {
  protected defaultFill: string
  private scene: Scene
  private opts: Required<MyVizOptions>

  constructor(scene: Scene, options?: MyVizOptions) {
    const opts = { x: 0, y: 0, fillColor: '#e2e8f0', ...options }
    super(opts.x, opts.y)
    this.scene = scene
    this.opts = opts
    this.defaultFill = opts.fillColor
    this._build()
  }

  computeState(): VizState {
    // 根据数据模型计算目标状态（不修改 DOM）
    return { nodes: new Map() }
  }

  private _build(): void {
    // 创建 LeaferJS 节点并调用 this.register(id, node)
  }
}
```

---

## 核心模块说明

### BaseViz

所有可视化器的基类，位于 `src/core/BaseViz.ts`。

关键点：
- `animateProp(node, props, opts)` 是唯一直接调用 LeaferJS `node.animate()` 的地方，所有子类通过它驱动动画
- `register(id, node)` 同时将节点加入 `group`（LeaferJS 场景图）和 `nodeMap`（ID 索引）
- `getState()` 遍历 `nodeMap`，将每个节点的属性序列化为 `NodeState`
- `defaultFill` 是 `unhighlight()` 恢复颜色时使用的值，子类必须设置
- `commitMutation(mutate, rebuild, options)` 是推荐的数据更新入口：统一处理快照、重建和 MagicMove 过渡
- `createCenteredLabel(text, bounds, options)` 是推荐的文本构建入口：避免手写偏移造成的视觉不居中

### MagicMove

位于 `src/core/MagicMove.ts`，是整个库最核心的模块。

工作原理：
1. `diff(before, after)` 对比两个 `VizState`，分类为 enter / exit / morph
2. `animate()` 对三类节点分别调用 `morphNode` / `enterNode` / `exitNode`
3. 所有动画通过 `Promise.all` 并行执行

`morphNode` 的关键逻辑：只对有变化的属性构建 keyframes，避免不必要的动画。

### Scene

位于 `src/core/Scene.ts`，是用户的主要入口。

`width` 可选：省略时读取 `canvas.clientWidth`，并通过 `ResizeObserver` 监听父容器变化。`destroy()` 时会 `disconnect()` observer。

`morph()` 的签名要求可视化器同时实现 `nodeMap` 和 `computeState()`，这两个在 `BaseViz` 中都有提供，所以所有继承 `BaseViz` 的可视化器都可以直接传给 `morph()`。

---

## 构建配置

### tsup.config.ts

打包为 ESM，生成 `.d.ts` 类型声明。入口点对应 `package.json` 的 `exports` 字段：

```
src/index.ts              → dist/index.js
src/core/index.ts         → dist/core/index.js
src/react/index.ts        → dist/react/index.js
src/data-structures/index.ts → dist/data-structures/index.js
```

`leafer-ui`、`@leafer-in/animate`、`react` 都是 external，不打包进产物。

### vite.config.ts

demo 的开发服务器，root 指向 `demo/` 目录。通过 alias 将 `../../src` 映射到项目根的 `src/`，让 demo 代码直接引用源码而不是 dist。

---

## 类型系统

核心类型都在 `src/core/types.ts`，是整个库的类型基础。修改这里会影响所有模块。

关键类型：

```typescript
// 节点状态（纯数据，可序列化）
interface NodeState {
  id: string
  x: number; y: number; width: number; height: number
  fill?: string; stroke?: string; opacity?: number
  cornerRadius?: number; strokeWidth?: number
  label?: string; meta?: Record<string, unknown>
}

// 可视化器状态快照
interface VizState {
  nodes: Map<string, NodeState>
  edges?: Map<string, EdgeState>
}

// 可视化器契约
interface IVisualizer {
  readonly group: IUI
  getState(): VizState
  applyState(state: VizState, options?: AnimationOptions): Promise<void>
}
```

---

## 测试

测试文件放在 `src/__tests__/` 下（待建立）。

MagicMove 的 diff 逻辑是纯函数，不依赖 Canvas，最适合单元测试：

```typescript
// src/__tests__/MagicMove.test.ts
import { describe, it, expect } from 'vitest'
import { MagicMove } from '../core/MagicMove'

describe('MagicMove.diff', () => {
  it('identifies enter, exit, morph correctly', () => {
    const before = { nodes: new Map([
      ['A', { id: 'A', x: 0, y: 0, width: 60, height: 60 }],
      ['B', { id: 'B', x: 70, y: 0, width: 60, height: 60 }],
    ])}
    const after = { nodes: new Map([
      ['A', { id: 'A', x: 0, y: 0, width: 60, height: 60 }],
      ['C', { id: 'C', x: 140, y: 0, width: 60, height: 60 }],
    ])}

    const result = MagicMove.diff(before, after)
    expect(result.enter).toEqual(['C'])
    expect(result.exit).toEqual(['B'])
    expect(result.morph.map(m => m.id)).toEqual(['A'])
  })
})
```

运行：

```bash
pnpm test
```

---

## 常见故障排查

### 控制台提示 `please install and import plugin: @leafer-in/animate`

排查顺序：

1. 确认从标准入口导入（`src/index.ts` / `src/core/index.ts`），这两个入口会自动注册动画插件
2. 若是非常规入口或定制构建，手动补一行：`import '@leafer-in/animate'`
3. 若仍异常，查看 `BaseViz.animateProp()` 与 `MagicMove` 是否进入了降级分支（会打印一次 warning）

### 节点重建后 label/arrow 丢失或错位

通常原因是：`after state` 只描述主节点（例如 `cell-*`），没有覆盖到文字/箭头。

建议：

- 变更数据后统一用 `commitMutation(...)`，不要手写 `before + clearAll + build + applyState(computeState())`
- 文本节点统一用 `createCenteredLabel(...)`，不要用 `fontSize * 常量` 估算偏移

---

## 发布

```bash
# 确认版本号
pnpm version patch  # 或 minor / major

# 构建
pnpm build

# 发布到 npm
npm publish
```

`package.json` 的 `files` 字段只包含 `dist/`，源码不会被发布。
