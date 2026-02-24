import {
  Scene,
  FontManager,
  TextViz,
  writeAnimation,
  showCreationAnimation,
  charByCharAnimation,
  wordByWordAnimation,
  transformMatchingStrings,
} from '../../src'

// 使用本地 Inter 字体（放在 demo/public/fonts/ 下）
const FONT_URL = '/fonts/Inter-Regular.ttf'

export async function textAnimationsDemo(canvas: HTMLCanvasElement) {
  const scene = new Scene(canvas, { width: 720, height: 500, background: '#f8fafc' })

  // 加载字体
  const font = await FontManager.load(FONT_URL)
  FontManager.setDefault(font)

  // --- 1. Write 动画 ---
  const text1 = new TextViz(scene, 'Hello World', { x: 40, y: 30, fontSize: 48, fill: '#6366f1' })
  await text1.init()
  scene.add(text1)
  await writeAnimation(text1, { duration: 2 })

  await scene.wait(0.5)

  // --- 2. ShowCreation 描边绘制 ---
  const text2 = new TextViz(scene, 'Manim Style', {
    x: 40, y: 110, fontSize: 42, fill: '#1e293b',
    stroke: '#e11d48', strokeWidth: 1.5,
  })
  await text2.init()
  scene.add(text2)
  await showCreationAnimation(text2, { duration: 2.5, strokeColor: '#e11d48', strokeWidth: 2 })

  await scene.wait(0.5)

  // --- 3. CharByChar 逐字显现 ---
  const text3 = new TextViz(scene, 'Character by Character', { x: 40, y: 200, fontSize: 36, fill: '#059669' })
  await text3.init()
  scene.add(text3)
  await charByCharAnimation(text3, { duration: 1.5 })

  await scene.wait(0.5)

  // --- 4. WordByWord 逐词显现 ---
  const text4 = new TextViz(scene, 'Word By Word Animation', { x: 40, y: 270, fontSize: 36, fill: '#d97706' })
  await text4.init()
  scene.add(text4)
  await wordByWordAnimation(text4, { duration: 1.2 })

  await scene.wait(0.8)

  // --- 5. TransformMatchingStrings ---
  const textA = new TextViz(scene, 'Hello World', { x: 40, y: 370, fontSize: 48, fill: '#6366f1' })
  await textA.init()
  scene.add(textA)
  // 先让 source 可见
  await writeAnimation(textA, { duration: 1 })

  await scene.wait(0.5)

  const textB = new TextViz(scene, 'Hello Manim', { x: 40, y: 370, fontSize: 48, fill: '#6366f1' })
  await textB.init()
  // 不 add textB 到 scene，transformMatchingStrings 会处理节点

  await transformMatchingStrings(textA, textB, scene, { duration: 1 })

  return () => scene.destroy()
}
