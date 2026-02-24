import { useCallback, useEffect, useRef, useState } from 'react'
import type { MagicMoveOptions } from '../../core/types'
import { TextViz } from '../../text/TextViz'
import type { TextVizOptions } from '../../text/TextViz'
import { useScene } from './useScene'

export interface UseTextVizOptions {
  text: string
  options?: TextVizOptions
  autoAdd?: boolean
}

export interface UseTextVizResult {
  textViz: TextViz | null
  isReady: boolean
  setText: (nextText: string, transition?: MagicMoveOptions) => Promise<void>
}

export function useTextViz({ text, options, autoAdd = true }: UseTextVizOptions): UseTextVizResult {
  const { scene, isReady } = useScene()
  const vizRef = useRef<TextViz | null>(null)
  const latestTextRef = useRef(text)
  const [vizReady, setVizReady] = useState(false)
  const x = options?.x
  const y = options?.y
  const fontSize = options?.fontSize
  const fill = options?.fill
  const stroke = options?.stroke
  const strokeWidth = options?.strokeWidth
  const letterSpacing = options?.letterSpacing
  const fontUrl = options?.fontUrl

  useEffect(() => {
    if (!scene) return

    let cancelled = false
    const viz = new TextViz(scene, latestTextRef.current, { x, y, fontSize, fill, stroke, strokeWidth, letterSpacing, fontUrl })
    vizRef.current = viz

    const init = async () => {
      await viz.init()
      if (cancelled) return
      if (autoAdd) scene.add(viz)
      setVizReady(true)
    }

    void init()

    return () => {
      cancelled = true
      if (autoAdd) scene.remove(viz)
      if (vizRef.current === viz) vizRef.current = null
      setVizReady(false)
    }
  }, [autoAdd, fill, fontSize, fontUrl, letterSpacing, scene, stroke, strokeWidth, x, y])

  useEffect(() => {
    latestTextRef.current = text
  }, [text])

  useEffect(() => {
    if (!vizReady || !vizRef.current) return
    if (vizRef.current.getText() === text) return
    void vizRef.current.setText(text)
  }, [text, vizReady])

  const setText = useCallback(async (nextText: string, transition?: MagicMoveOptions) => {
    const viz = vizRef.current
    if (!viz) return
    await viz.setText(nextText, transition)
  }, [])

  return {
    textViz: vizRef.current,
    isReady: isReady && vizReady,
    setText,
  }
}
