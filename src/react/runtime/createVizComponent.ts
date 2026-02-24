import { useEffect, useRef } from 'react'
import type { BaseViz } from '../../core/BaseViz'
import type { Scene } from '../../core/Scene'

export interface UseVizLifecycleOptions<TViz extends BaseViz> {
  scene: Scene | null
  enabled?: boolean
  create: (scene: Scene) => Promise<TViz> | TViz
  onDispose?: (viz: TViz) => Promise<void> | void
}

export function useVizLifecycle<TViz extends BaseViz>(options: UseVizLifecycleOptions<TViz>): TViz | null {
  const vizRef = useRef<TViz | null>(null)
  const createRef = useRef(options.create)
  const disposeRef = useRef(options.onDispose)

  createRef.current = options.create
  disposeRef.current = options.onDispose

  useEffect(() => {
    const enabled = options.enabled ?? true
    if (!enabled || !options.scene) return

    let cancelled = false
    let createdViz: TViz | null = null

    const run = async () => {
      const viz = await createRef.current(options.scene as Scene)
      if (cancelled) {
        await disposeRef.current?.(viz)
        return
      }
      createdViz = viz
      vizRef.current = viz
    }

    void run()

    return () => {
      cancelled = true
      const target = createdViz ?? vizRef.current
      if (target) {
        void disposeRef.current?.(target)
      }
      if (vizRef.current === target) {
        vizRef.current = null
      }
    }
  }, [options.enabled, options.scene])

  return vizRef.current
}
