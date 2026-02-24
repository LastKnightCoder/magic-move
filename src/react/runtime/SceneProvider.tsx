import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Scene } from '../../core/Scene'
import type { SceneOptions } from '../../core/Scene'
import { SceneContext } from './SceneContext'

export interface SceneProviderProps extends SceneOptions {
  children: ReactNode
  onReady?: (scene: Scene) => void
  onDestroy?: () => void
}

export function SceneProvider({
  children,
  onReady,
  onDestroy,
  ...options
}: SceneProviderProps): ReactElement {
  const { background, fps, height, width } = options
  const [canvasElement, setCanvasElementState] = useState<HTMLCanvasElement | null>(null)
  const [scene, setScene] = useState<Scene | null>(null)
  const sceneRef = useRef<Scene | null>(null)
  const optionsRef = useRef<SceneOptions>(options)
  const onReadyRef = useRef(onReady)
  const onDestroyRef = useRef(onDestroy)
  optionsRef.current = options
  onReadyRef.current = onReady
  onDestroyRef.current = onDestroy

  const setCanvasElement = useCallback((node: HTMLCanvasElement | null) => {
    setCanvasElementState(node)
  }, [])

  useEffect(() => {
    if (!canvasElement) return

    const created = new Scene(canvasElement, optionsRef.current)
    sceneRef.current = created
    setScene(created)
    onReadyRef.current?.(created)

    return () => {
      if (sceneRef.current) {
        sceneRef.current.destroy()
        sceneRef.current = null
      }
      setScene(null)
      onDestroyRef.current?.()
    }
  }, [background, canvasElement, fps, height, width])

  const contextOptions = useMemo(() => ({ width, height, background, fps }), [background, fps, height, width])

  const value = useMemo(() => ({
    scene,
    isReady: !!scene,
    options: contextOptions,
    canvasElement,
    setCanvasElement,
  }), [canvasElement, contextOptions, scene, setCanvasElement])

  return (
    <SceneContext.Provider value={value}>
      {children}
    </SceneContext.Provider>
  )
}
