import { useCallback } from 'react'
import {
  charByCharAnimation,
  showCreationAnimation,
  transformMatchingStrings,
  wordByWordAnimation,
  writeAnimation,
} from '../../text'
import type {
  CharByCharOptions,
  ShowCreationOptions,
  TransformOptions,
  WordByWordOptions,
  WriteOptions,
} from '../../text'
import type { TextViz } from '../../text/TextViz'
import { useScene } from './useScene'

export type TextAnimationPreset = 'write' | 'showCreation' | 'charByChar' | 'wordByWord'

export function useTextAnimation() {
  const { scene } = useScene()

  const runPreset = useCallback(async (
    viz: TextViz,
    preset: TextAnimationPreset,
    options?: WriteOptions | ShowCreationOptions | CharByCharOptions | WordByWordOptions
  ) => {
    if (preset === 'write') return writeAnimation(viz, options as WriteOptions | undefined)
    if (preset === 'showCreation') return showCreationAnimation(viz, options as ShowCreationOptions | undefined)
    if (preset === 'charByChar') return charByCharAnimation(viz, options as CharByCharOptions | undefined)
    return wordByWordAnimation(viz, options as WordByWordOptions | undefined)
  }, [])

  const transform = useCallback(async (sourceViz: TextViz, targetViz: TextViz, options?: TransformOptions) => {
    if (!scene) throw new Error('Scene is not ready. Ensure <SceneCanvas /> is mounted.')
    return transformMatchingStrings(sourceViz, targetViz, scene, options)
  }, [scene])

  return {
    runPreset,
    write: writeAnimation,
    showCreation: showCreationAnimation,
    charByChar: charByCharAnimation,
    wordByWord: wordByWordAnimation,
    transform,
  }
}
