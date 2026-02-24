import type { Stepper, StepperState } from '../../src'

type DemoCleanup = () => void

export interface DemoConfig {
  title: string
  slug: string
  run: (canvas: HTMLCanvasElement) => Promise<void | DemoCleanup>
}

const demos: DemoConfig[] = []

export function registerDemo(title: string, slug: string, run: (canvas: HTMLCanvasElement) => Promise<void | DemoCleanup>) {
  demos.push({ title, slug, run })
  renderNav()
  renderSection({ title, slug, run })
}

function renderNav() {
  const nav = document.getElementById('nav')!
  nav.innerHTML = demos.map((d, i) =>
    `<button data-slug="${d.slug}" class="${i === 0 ? 'active' : ''}">${d.title}</button>`
  ).join('')
  nav.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      nav.querySelectorAll('button').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      document.querySelectorAll('.demo-section').forEach((s) => s.classList.remove('active'))
      document.getElementById(`demo-${btn.getAttribute('data-slug')}`)?.classList.add('active')
    })
  })
}

function renderSection(demo: DemoConfig) {
  const main = document.getElementById('main')!
  const isFirst = demos.length === 1

  const section = document.createElement('div')
  section.className = `demo-section${isFirst ? ' active' : ''}`
  section.id = `demo-${demo.slug}`

  let canvas = document.createElement('canvas')
  canvas.width = 720

  section.innerHTML = `<h2>${demo.title}</h2><p></p>`
  const wrap = document.createElement('div')
  wrap.className = 'canvas-wrap'
  wrap.appendChild(canvas)
  section.appendChild(wrap)

  const controls = document.createElement('div')
  controls.className = 'controls'
  const runBtn = document.createElement('button')
  runBtn.textContent = '▶ 运行'
  controls.appendChild(runBtn)
  section.appendChild(controls)
  main.appendChild(section)

  let running = false
  let cleanup: DemoCleanup | undefined
  runBtn.addEventListener('click', async () => {
    if (running) return
    running = true
    runBtn.disabled = true
    runBtn.textContent = '运行中…'

    if (cleanup) {
      try {
        cleanup()
      } catch (error) {
        console.warn('[demo] Failed to cleanup previous scene before rerun.', error)
      } finally {
        cleanup = undefined
      }

      // Leafer destroy() 之后旧 canvas 上下文可能失效，重建一个新 canvas 再运行。
      const freshCanvas = document.createElement('canvas')
      freshCanvas.width = canvas.width
      freshCanvas.height = canvas.height
      canvas.replaceWith(freshCanvas)
      canvas = freshCanvas
    }

    // 演示未提供 cleanup 时，保留一次基础清屏兜底。
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)

    try {
      const maybeCleanup = await demo.run(canvas)
      cleanup = typeof maybeCleanup === 'function' ? maybeCleanup : undefined
    } finally {
      running = false
      runBtn.disabled = false
      runBtn.textContent = '▶ 重新运行'
    }
  })

  // 首个 demo 默认自动运行。
  if (isFirst) runBtn.click()
}

export function registerStepperDemo(
  title: string,
  slug: string,
  setup: (canvas: HTMLCanvasElement) => Promise<Stepper>
) {
  demos.push({ title, slug, run: async () => {} })
  renderNav()
  renderStepperSection(title, slug, setup)
}

function renderStepperSection(
  title: string,
  slug: string,
  setup: (canvas: HTMLCanvasElement) => Promise<Stepper>
) {
  const main = document.getElementById('main')!
  const isFirst = demos.length === 1

  const section = document.createElement('div')
  section.className = `demo-section${isFirst ? ' active' : ''}`
  section.id = `demo-${slug}`

  section.innerHTML = `<h2>${title}</h2>`

  const canvas = document.createElement('canvas')
  canvas.width = 720
  const wrap = document.createElement('div')
  wrap.className = 'canvas-wrap'
  wrap.appendChild(canvas)
  section.appendChild(wrap)

  const label = document.createElement('div')
  label.className = 'stepper-label'
  label.textContent = '点击"初始化"开始'
  section.appendChild(label)

  const controls = document.createElement('div')
  controls.className = 'controls'

  const initBtn = document.createElement('button')
  initBtn.textContent = '▶ 初始化'

  const prevBtn = document.createElement('button')
  prevBtn.textContent = '← 上一步'
  prevBtn.disabled = true

  const nextBtn = document.createElement('button')
  nextBtn.textContent = '下一步 →'
  nextBtn.disabled = true

  const resetBtn = document.createElement('button')
  resetBtn.textContent = '↺ 重置'
  resetBtn.disabled = true

  controls.append(initBtn, prevBtn, nextBtn, resetBtn)
  section.appendChild(controls)
  main.appendChild(section)

  let stepper: Stepper | null = null

  function updateUI(state: StepperState) {
    prevBtn.disabled = state.isFirst
    nextBtn.disabled = state.isLast
    resetBtn.disabled = false
    const idx = state.currentIndex
    if (idx < 0) {
      label.textContent = `共 ${state.totalSteps} 步，尚未开始`
    } else {
      label.textContent = `步骤 ${idx + 1} / ${state.totalSteps}：${state.currentLabel ?? ''}`
    }
  }

  initBtn.addEventListener('click', async () => {
    initBtn.disabled = true
    stepper = await setup(canvas)
    stepper.onStepChange = updateUI
    updateUI({
      currentIndex: -1,
      totalSteps: stepper.totalSteps,
      isFirst: true,
      isLast: false,
    })
    nextBtn.disabled = false
    prevBtn.disabled = true
    resetBtn.disabled = false
    initBtn.textContent = '↺ 重新初始化'
    initBtn.disabled = false
  })

  prevBtn.addEventListener('click', () => stepper?.prev())
  nextBtn.addEventListener('click', () => stepper?.next())
  resetBtn.addEventListener('click', () => stepper?.reset())
}
