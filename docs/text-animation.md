# 文字渲染与动画

## 概述

`algo-viz/text` 模块将 Manim 的核心文字渲染与动画思路移植到浏览器环境。利用 [opentype.js](https://opentype.js.org/) 将文字转为 Bézier 路径，再通过 LeaferJS `Path` 节点 + `dashOffset` 动画实现丰富的文字效果。

**管线对比：**

| Manim | algo-viz |
|---|---|
| `manimpango.text2svg()` | opentype.js `font.getPath()` → `path.toSVG()` |
| `VMobject` (Bézier 点阵) | LeaferJS `Path` 节点 |
| `pointwise_become_partial` | `dashPattern` + `dashOffset` 动画 |
| `DrawBorderThenFill` (Write) | 两阶段：dashOffset 描边 → fillOpacity 填充 |
| `lag_ratio` 交错 | 计算每字符 `delay` 偏移量 |
| `TransformMatchingStrings` | LCS 文本 diff → 共享 ID → MagicMove 引擎 |

---

## 文件结构

```
src/text/
├── index.ts              # barrel export
├── FontManager.ts        # 字体加载与缓存
├── GlyphPath.ts          # 文字排版 + SVG 路径提取 + 路径长度计算
├── TextViz.ts            # 文字可视化器 (extends BaseViz)
├── TextAnimations.ts     # Write / ShowCreation / CharByChar / WordByWord
└── TextDiff.ts           # 文本 diff + TransformMatchingStrings
```

---

## 快速开始

```typescript
import { Scene, FontManager, TextViz, writeAnimation } from 'algo-viz'

// 1. 加载字体（必须在创建 TextViz 之前）
const font = await FontManager.load('/fonts/Inter-Regular.ttf')
FontManager.setDefault(font)

// 2. 创建文字可视化器
const scene = new Scene(canvas, { width: 720, height: 200, background: '#f8fafc' })
const text = new TextViz(scene, 'Hello World', { x: 40, y: 40, fontSize: 48, fill: '#6366f1' })
await text.init()
scene.add(text)

// 3. 播放 Write 动画
await writeAnimation(text, { duration: 2 })
```

---

## FontManager — 字体管理

opentype.js 需要实际的字体文件二进制数据，无法直接访问浏览器系统字体。`FontManager` 提供静态方法加载和缓存字体。

```typescript
// 从 URL 加载（结果按 URL 缓存，重复调用不会重新请求）
const font = await FontManager.load('/fonts/MyFont.ttf')

// 从 ArrayBuffer 解析（适用于拖拽上传等场景）
const font = FontManager.parse(buffer, 'my-font')

// 设置项目级默认字体，后续 TextViz 不传 fontUrl 时自动使用
FontManager.setDefault(font)

// 获取默认字体（未设置时会抛错）
const defaultFont = FontManager.getDefault()
```

支持的字体格式：`.ttf`、`.otf`、`.woff`（opentype.js 支持的所有格式）。

> **推荐做法**：将字体文件放在项目的静态资源目录下（如 `public/fonts/`），通过相对路径加载，避免跨域和 CDN 可用性问题。

---

## TextViz — 文字可视化器

`TextViz` 继承 `BaseViz`，将每个字符渲染为独立的 LeaferJS `Path` 节点。

### 构造与初始化

```typescript
const text = new TextViz(scene, '要显示的文字', {
  x: 40,              // 水平位置，默认 0
  y: 40,              // 垂直位置，默认 0
  fontSize: 48,       // 字号（px），默认 48
  fill: '#1e293b',    // 填充色，默认 '#1e293b'
  stroke: '#e11d48',  // 描边色，可选
  strokeWidth: 1.5,   // 描边宽度，默认 0
  letterSpacing: 2,   // 字间距（px），默认 0
  fontUrl: '/fonts/Other.ttf',  // 可选，不传则使用 FontManager 默认字体
})

// init() 是异步的：加载字体 + 构建字形节点
await text.init()
scene.add(text)
```

### 节点 ID 规则

每个非空白字符生成一个 `Path` 节点，ID 为 `char-{index}`（按文本位置索引）。空白字符不创建节点，仅影响后续字符的水平偏移。

### 更新文本

```typescript
// 通过 commitMutation 触发 MagicMove diff 过渡
// 同位置同字符自动匹配为 morph，新增字符 enter，删除字符 exit
await text.setText('New Text', { duration: 0.6 })
```

### 其他方法

```typescript
text.getText()           // 获取当前文本
text.getGlyphEntries()   // 获取所有字形条目 [{ id, node, info }]
text.getWordGroups()     // 按空白字符分组，返回词组数组
text.getLayout()         // 获取排版信息（totalWidth, ascender, descender 等）
text.getCharId(index)    // ���取指定位置的字符 ID
text.setCharIds(ids)     // 重映射字符 ID（用于 TextDiff）
```

---

## 动画

所有动画函数都是独立的，接收 `TextViz` 实例作为第一个参数。

### writeAnimation — Write (DrawBorderThenFill)

Manim 中最经典的文字动画：先描边绘制，再填充淡入，字符间通过 `lagRatio` 交错。

```typescript
import { writeAnimation } from 'algo-viz'

await writeAnimation(text, {
  duration: 2,           // 总时长（秒），默认 1.5
  lagRatio: 0.15,        // 字符间交错系数，默认 min(4/(n+1), 0.2)
  strokeColor: '#e11d48', // 描边颜色，默认使用 fill 色
  strokeWidth: 2,        // 描边宽度，默认 2
  delay: 0.5,            // 延迟开始（秒）
})
```

**原理：**
1. 初始化：所有字形 `fillOpacity=0`，`dashPattern=[pathLength, pathLength]`，`dashOffset=pathLength`
2. Phase 1（前半段）：`dashOffset` 从 `pathLength` → `0`（描边逐渐显现）
3. Phase 2（后半段）：`fillOpacity` 从 `0` → `1`（填充淡入），`strokeOpacity` 从 `1` → `0`
4. 字符间通过 `delay` 偏移实现交错，`lagRatio` 控制交错程度

### showCreationAnimation — ShowCreation

仅描边绘制路径，不填充。默认 `lagRatio=1.0`（完全顺序绘制）。

```typescript
import { showCreationAnimation } from 'algo-viz'

await showCreationAnimation(text, {
  duration: 2.5,          // 总时长，默认 2
  lagRatio: 1.0,          // 默认 1.0（完全顺序）
  strokeColor: '#e11d48', // 描边颜色，默认 '#1e293b'
  strokeWidth: 2,         // 描边宽度，默认 2
})
```

### charByCharAnimation — 逐字显现

按索引顺序逐字符淡入。

```typescript
import { charByCharAnimation } from 'algo-viz'

await charByCharAnimation(text, {
  duration: 1.5,       // 总时长，默认 1.5
  charDuration: 0.15,  // 每字符淡入时长，默认 0.15
})
```

### wordByWordAnimation — 逐词显现

按空白字符分词，逐词淡入。

```typescript
import { wordByWordAnimation } from 'algo-viz'

await wordByWordAnimation(text, {
  duration: 1.2,       // 总时长，默认 1.5
  wordDuration: 0.2,   // 每词淡入时长，默认 0.2
})
```

---

## TextDiff — TransformMatchingStrings

通过 LCS（最长公共子序列）算法找到两段文本的匹配字符，为匹配字符分配共享 ID，然后利用 MagicMove 引擎驱动过渡——匹配字符平滑移动到新位置，未匹配的旧字符淡出，新字符淡入。

### 基本用法

```typescript
import { TextViz, writeAnimation, transformMatchingStrings } from 'algo-viz'

// 创建 source 文字并显示
const textA = new TextViz(scene, 'Hello World', { x: 40, y: 40, fontSize: 48, fill: '#6366f1' })
await textA.init()
scene.add(textA)
await writeAnimation(textA, { duration: 1 })

// 创建 target 文字（不需要 add 到 scene）
const textB = new TextViz(scene, 'Hello Manim', { x: 40, y: 40, fontSize: 48, fill: '#6366f1' })
await textB.init()

// 执行变形过渡
await transformMatchingStrings(textA, textB, scene, { duration: 1 })
```

### findMatchingBlocks

底层 LCS 匹配函数，可独立使用：

```typescript
import { findMatchingBlocks } from 'algo-viz'

const blocks = findMatchingBlocks('Hello World', 'Hello Manim')
// [{ sourceStart: 0, targetStart: 0, length: 6 }]
// "Hello " 是共同前缀，匹配为一个块
```

### 工作原理

1. 对 source/target 文本执行 `findMatchingBlocks()` 得到 LCS 匹配块
2. 匹配的字符对分配相同 ID（如 `matched-0`, `matched-1`...）
3. 未匹配的 source 字符保留原 ID → MagicMove 视为 `exit`（淡出）
4. 未匹配的 target 字符分配新 ID → MagicMove 视为 `enter`（淡入）
5. 通过 `setCharIds()` 重映射两个 viz 的字符 ID
6. 调用 `MagicMove.animate()` 驱动整个过渡

---

## GlyphPath — 排版与路径提取

`layoutText()` 是底层排版函数，将文本转为逐字形的 SVG 路径数据：

```typescript
import { layoutText } from 'algo-viz'

const layout = layoutText('Hello', font, 48, { letterSpacing: 2 })

layout.glyphs     // GlyphInfo[]，每个字符的路径和度量
layout.totalWidth // 文本总宽度（px）
layout.ascender   // 上升线高度
layout.descender  // 下降线高度（负值）
layout.lineHeight // 行高 = ascender - descender
```

每个 `GlyphInfo` 包含：

```typescript
interface GlyphInfo {
  char: string          // 字符
  pathData: string      // SVG path data（如 "M10 20 C30 40..."）
  advanceWidth: number  // 水平推进量（px）
  xOffset: number       // 累计 x 偏移（含 kerning）
  bounds: { x: number; y: number; width: number; height: number }
  pathLength: number    // 路径总长度（用于 dashOffset 动画）
}
```

路径长度通过 Bézier 弧长采样近似计算（二次曲线 16 步，三次曲线 20 步），无需依赖 DOM。

---

## NodeState 扩展字段

为支持路径渲染动画，`NodeState` 新增了以下字段：

| 字段 | 类型 | 用途 |
|---|---|---|
| `pathData` | `string` | SVG path data |
| `dashPattern` | `number[]` | 如 `[pathLength, pathLength]` |
| `dashOffset` | `number` | 从 `pathLength` → `0` 实现描边动画 |
| `fillOpacity` | `number` | 独立于 `opacity`，用于 Write 动画填充阶段 |
| `strokeOpacity` | `number` | 独立于 `opacity`，用于描边可见性控制 |

`MagicMove.morphNode()` 已支持对 `dashOffset`、`fillOpacity`、`strokeOpacity` 做插值动画。

---

## 完整示例

```typescript
import {
  Scene, FontManager, TextViz,
  writeAnimation, showCreationAnimation,
  charByCharAnimation, wordByWordAnimation,
  transformMatchingStrings,
} from 'algo-viz'

async function demo(canvas: HTMLCanvasElement) {
  const scene = new Scene(canvas, { width: 720, height: 500, background: '#f8fafc' })

  const font = await FontManager.load('/fonts/Inter-Regular.ttf')
  FontManager.setDefault(font)

  // Write
  const t1 = new TextViz(scene, 'Hello World', { x: 40, y: 30, fontSize: 48, fill: '#6366f1' })
  await t1.init()
  scene.add(t1)
  await writeAnimation(t1, { duration: 2 })

  // ShowCreation
  const t2 = new TextViz(scene, 'Manim Style', { x: 40, y: 110, fontSize: 42, stroke: '#e11d48' })
  await t2.init()
  scene.add(t2)
  await showCreationAnimation(t2, { duration: 2.5, strokeColor: '#e11d48' })

  // CharByChar
  const t3 = new TextViz(scene, 'Character by Character', { x: 40, y: 200, fontSize: 36, fill: '#059669' })
  await t3.init()
  scene.add(t3)
  await charByCharAnimation(t3, { duration: 1.5 })

  // WordByWord
  const t4 = new TextViz(scene, 'Word By Word', { x: 40, y: 270, fontSize: 36, fill: '#d97706' })
  await t4.init()
  scene.add(t4)
  await wordByWordAnimation(t4, { duration: 1.2 })

  // TransformMatchingStrings
  const tA = new TextViz(scene, 'Hello World', { x: 40, y: 370, fontSize: 48, fill: '#6366f1' })
  await tA.init()
  scene.add(tA)
  await writeAnimation(tA, { duration: 1 })

  const tB = new TextViz(scene, 'Hello Manim', { x: 40, y: 370, fontSize: 48, fill: '#6366f1' })
  await tB.init()
  await transformMatchingStrings(tA, tB, scene, { duration: 1 })

  return () => scene.destroy()
}
```

---

## 常见问题

**Q: 为什么不能直接使用系统字体？**

opentype.js 需要解析字体文件的二进制数据来提取字形的 Bézier 路径。浏览器的 Canvas API 虽然可以用系统字体渲染文字，但无法获取字形的路径数据。Manim 通过 Pango（系统级文字渲染库）解决这个问题，而浏览器环境下 opentype.js 是最成熟的替代方案。

**Q: 支持中文吗？**

支持，只要加载的字体文件包含对应字符的字形。推荐使用 Noto Sans SC、思源黑体等覆盖 CJK 字符集的字体。注意 CJK 字体文件通常较大（5-20MB），建议使用子集化工具裁剪。

**Q: pathLength 计算准确吗？**

`GlyphPath` 使用 Bézier 弧长采样近似（非精确积分），对于 `dashOffset` 动画来说精度足够。如果需要更高精度，可以创建隐藏的 `<svg><path/>` 元素调用 `getTotalLength()`。

**Q: TransformMatchingStrings 支持路径形变吗？**

当前版本使用交叉淡入淡出策略（旧字符淡出 + 新字符淡入 + 匹配字符位移）。真正的路径形变（morph）需要引入 `flubber` 等路径插值库，作为后续扩展方向。
