import { useEffect } from 'react'
import type { ReactElement } from 'react'
import type { TransformOptions } from '../../text'
import { TextViz } from '../../text/TextViz'
import type { TextVizOptions } from '../../text/TextViz'
import { useScene } from '../hooks/useScene'
import { useTextAnimation } from '../hooks/useTextAnimation'

export interface TextMorphProps extends TextVizOptions {
  from: string
  to: string
  options?: TransformOptions
  autoPlay?: boolean
}

export function TextMorph({ from, to, options, autoPlay = true, ...textOptions }: TextMorphProps): ReactElement | null {
  const { scene } = useScene()
  const { transform } = useTextAnimation()
  const x = textOptions.x
  const y = textOptions.y
  const fontSize = textOptions.fontSize
  const fill = textOptions.fill
  const stroke = textOptions.stroke
  const strokeWidth = textOptions.strokeWidth
  const letterSpacing = textOptions.letterSpacing
  const fontUrl = textOptions.fontUrl

  useEffect(() => {
    if (!scene || !autoPlay) return

    let cancelled = false
    let source: TextViz | null = null
    let target: TextViz | null = null

    const run = async () => {
      const vizOptions = { x, y, fontSize, fill, stroke, strokeWidth, letterSpacing, fontUrl }
      source = new TextViz(scene, from, vizOptions)
      target = new TextViz(scene, to, vizOptions)

      await source.init()
      await target.init()
      if (cancelled) return

      scene.add(source)
      await transform(source, target, options)
    }

    void run()

    return () => {
      cancelled = true
      if (source && source.group.parent) scene.remove(source)
      if (target && target.group.parent) scene.remove(target)
    }
  }, [autoPlay, fill, fontSize, fontUrl, from, letterSpacing, options, scene, stroke, strokeWidth, to, transform, x, y])

  return null
}
