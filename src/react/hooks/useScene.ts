import { useContext } from 'react'
import { SceneContext } from '../runtime/SceneContext'
import type { SceneContextValue } from '../runtime/SceneContext'

export function useScene(): SceneContextValue {
  const context = useContext(SceneContext)
  if (!context) {
    throw new Error('useScene must be used inside <SceneProvider>.')
  }
  return context
}
