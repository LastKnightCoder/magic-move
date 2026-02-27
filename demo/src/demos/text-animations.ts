import {
  FontManager,
  Scene,
  Stepper,
  TextViz,
  charByCharAnimation,
  showCreationAnimation,
  wordByWordAnimation,
  writeAnimation,
} from '../../src'
import type { StepperDemoSetupResult } from '../registry'
import { createStepTextOverlay } from './step-text-overlay'

const FONT_URL = '/fonts/Inter-Regular.ttf'

export async function textAnimationsStepperSetup(canvas: HTMLCanvasElement): Promise<StepperDemoSetupResult> {
  canvas.height = 500
  const scene = new Scene(canvas, { width: 720, height: 500, background: '#f8fafc' })

  const font = await FontManager.load(FONT_URL)
  FontManager.setDefault(font)

  const text1 = new TextViz(scene, 'Hello World', { x: 40, y: 30, fontSize: 48, fill: '#6366f1' })
  await text1.init()
  scene.add(text1)

  const text2 = new TextViz(scene, 'Manim Style', {
    x: 40,
    y: 110,
    fontSize: 42,
    fill: '#1e293b',
    stroke: '#e11d48',
    strokeWidth: 1.5,
  })
  await text2.init()
  scene.add(text2)

  const text3 = new TextViz(scene, 'Character by Character', { x: 40, y: 200, fontSize: 36, fill: '#059669' })
  await text3.init()
  scene.add(text3)

  const text4 = new TextViz(scene, 'Word By Word Animation', { x: 40, y: 270, fontSize: 36, fill: '#d97706' })
  await text4.init()
  scene.add(text4)

  const text5 = new TextViz(scene, 'Hello World', { x: 40, y: 370, fontSize: 48, fill: '#6366f1' })
  await text5.init()
  scene.add(text5)

  setVizOpacity(text1, 0)
  setVizOpacity(text2, 0)
  setVizOpacity(text3, 0)
  setVizOpacity(text4, 0)
  setVizOpacity(text5, 0)

  const stepper = new Stepper([text1, text2, text3, text4, text5]).init()
  const descriptions: string[] = []

  function addStep(label: string, description: string, fn: () => Promise<void>) {
    descriptions.push(description)
    stepper.step(label, fn)
  }

  addStep(
    'Write: Hello World',
    '先显示第一行文本，再执行 Write 动画，按笔画描边后填充。',
    async () => {
      setVizOpacity(text1, 1)
      await writeAnimation(text1, { duration: 2 })
    }
  )

  addStep(
    'ShowCreation: Manim Style',
    '第二行使用 ShowCreation，只绘制描边路径，强调“线条被写出”的过程。',
    async () => {
      setVizOpacity(text2, 1)
      await showCreationAnimation(text2, { duration: 2.5, strokeColor: '#e11d48', strokeWidth: 2 })
    }
  )

  addStep(
    'CharByChar: 逐字显现',
    '第三行按字符逐个淡入，适合强调单字出现顺序。',
    async () => {
      setVizOpacity(text3, 1)
      await charByCharAnimation(text3, { duration: 1.5 })
    }
  )

  addStep(
    'WordByWord: 逐词显现',
    '第四行按单词批次显示，让阅读节奏更接近自然语言。',
    async () => {
      setVizOpacity(text4, 1)
      await wordByWordAnimation(text4, { duration: 1.2 })
    }
  )

  addStep(
    'Write: Hello World (底部)',
    '底部文本先执行一次 Write，为后续形态变化提供起点。',
    async () => {
      setVizOpacity(text5, 1)
      await writeAnimation(text5, { duration: 1 })
    }
  )

  addStep(
    'Morph: Hello World -> Hello Manim',
    '通过 setText 触发 Magic Move，将相同字符平滑复用并过渡到新文本。',
    async () => {
      await text5.setText('Hello Manim', { duration: 1, easing: 'ease-in-out' })
    }
  )

  const intro = '文本动画示例已拆成单步操作，你可以逐步观察不同动画策略的视觉差异。'
  const onStepChange = await createStepTextOverlay(scene, { descriptions, intro, x: 430, y: 12 })

  return {
    stepper,
    descriptions,
    intro,
    onStepChange,
    cleanup: () => scene.destroy(),
  }
}

function setVizOpacity(viz: TextViz, opacity: number): void {
  for (const entry of viz.getGlyphEntries()) {
    ;(entry.node as unknown as { opacity?: number }).opacity = opacity
  }
}
