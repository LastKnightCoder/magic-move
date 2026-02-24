import { useCallback } from 'react'
import type { IUI } from 'leafer-ui'
import type { Scene } from '../../core/Scene'
import type { IVisualizer, MagicMoveOptions, VizState } from '../../core/types'
import { useScene } from './useScene'

type MorphableViz = IVisualizer & { nodeMap: Map<string, IUI>; computeState(): VizState }
type TransitionableViz = IVisualizer & { nodeMap: Map<string, IUI> }

function assertScene(scene: ReturnType<typeof useScene>['scene']): asserts scene is Scene {
  if (!scene) throw new Error('Scene is not ready. Ensure <SceneCanvas /> is mounted.')
}

function getSceneOrThrow(scene: ReturnType<typeof useScene>['scene']): Scene {
  assertScene(scene)
  return scene
}

export function useSceneControls() {
  const { scene, isReady } = useScene()

  const play = useCallback(async (...animations: Promise<void>[]) => {
    const target = getSceneOrThrow(scene)
    return target.play(...animations)
  }, [scene])

  const wait = useCallback(async (seconds: number) => {
    const target = getSceneOrThrow(scene)
    return target.wait(seconds)
  }, [scene])

  const sequence = useCallback(async (...steps: Array<() => Promise<void>>) => {
    const target = getSceneOrThrow(scene)
    return target.sequence(...steps)
  }, [scene])

  const transition = useCallback(async (viz: TransitionableViz, newState: VizState, options?: MagicMoveOptions) => {
    const target = getSceneOrThrow(scene)
    return target.transition(viz, newState, options)
  }, [scene])

  const morph = useCallback(async (viz: MorphableViz, mutate: () => void, options?: MagicMoveOptions) => {
    const target = getSceneOrThrow(scene)
    return target.morph(viz, mutate, options)
  }, [scene])

  const clear = useCallback(() => {
    const target = getSceneOrThrow(scene)
    target.clear()
  }, [scene])

  return {
    scene,
    isReady,
    play,
    wait,
    sequence,
    transition,
    morph,
    clear,
  }
}
