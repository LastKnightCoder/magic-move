import { FontManager, Scene, TextViz } from '../../src'
import type { StepperState } from '../../src'

const FONT_URL = '/fonts/NotoSansCJKsc-Regular.otf'

interface StepTextOverlayOptions {
  descriptions: string[]
  intro?: string
  x?: number
  y?: number
}

export async function createStepTextOverlay(
  scene: Scene,
  options: StepTextOverlayOptions
): Promise<(state: StepperState) => void> {
  const font = await FontManager.load(FONT_URL)
  FontManager.setDefault(font)

  const x = options.x ?? 16
  const y = options.y ?? 10

  const headline = new TextViz(scene, '', {
    x,
    y,
    fontSize: 16,
    fill: '#0f172a',
    fontUrl: FONT_URL,
  })
  await headline.init()
  scene.add(headline)

  const line1 = new TextViz(scene, '', {
    x,
    y: y + 24,
    fontSize: 13,
    fill: '#334155',
    fontUrl: FONT_URL,
  })
  await line1.init()
  scene.add(line1)

  const line2 = new TextViz(scene, '', {
    x,
    y: y + 44,
    fontSize: 13,
    fill: '#334155',
    fontUrl: FONT_URL,
  })
  await line2.init()
  scene.add(line2)

  return (state: StepperState) => {
    const currentTitle = state.currentIndex < 0
      ? `步骤 0/${state.totalSteps}：准备开始`
      : `步骤 ${state.currentIndex + 1}/${state.totalSteps}：${state.currentLabel ?? ''}`

    const detail = state.currentIndex < 0
      ? (options.intro ?? '点击“下一步”开始演示。')
      : (options.descriptions[state.currentIndex] ?? state.currentLabel ?? '该步骤没有额外说明。')

    const lines = wrapLines(detail, 30, 2)

    void headline.setText(currentTitle, { duration: 0.2, easing: 'ease-out' })
    void line1.setText(lines[0] ?? '', { duration: 0.2, easing: 'ease-out' })
    void line2.setText(lines[1] ?? '', { duration: 0.2, easing: 'ease-out' })
  }
}

function wrapLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxCharsPerLine) return [normalized]

  const lines: string[] = []
  let cursor = 0

  while (cursor < normalized.length && lines.length < maxLines) {
    const slice = normalized.slice(cursor, cursor + maxCharsPerLine)
    lines.push(slice)
    cursor += maxCharsPerLine
  }

  if (cursor < normalized.length && lines.length > 0) {
    const last = lines.length - 1
    lines[last] = `${lines[last].slice(0, Math.max(maxCharsPerLine - 1, 1))}…`
  }

  return lines
}
