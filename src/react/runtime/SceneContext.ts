import { createContext } from 'react'
import type { Scene } from '../../core/Scene'
import type { SceneOptions } from '../../core/Scene'

export interface SceneContextValue {
  scene: Scene | null
  isReady: boolean
  options: SceneOptions
  canvasElement: HTMLCanvasElement | null
  setCanvasElement: (node: HTMLCanvasElement | null) => void
}

export const SceneContext = createContext<SceneContextValue | null>(null)
