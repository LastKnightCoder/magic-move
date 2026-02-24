import { useEffect } from 'react'
import type { ReactElement } from 'react'
import type { CharByCharOptions, ShowCreationOptions, WordByWordOptions, WriteOptions } from '../../text'
import type { TextVizOptions } from '../../text/TextViz'
import { useTextAnimation } from '../hooks/useTextAnimation'
import { useTextViz } from '../hooks/useTextViz'

type TextPreset = 'write' | 'showCreation' | 'charByChar' | 'wordByWord'

type PresetOptions = WriteOptions | ShowCreationOptions | CharByCharOptions | WordByWordOptions

export interface TextProps extends TextVizOptions {
  text: string
  preset?: TextPreset
  presetOptions?: PresetOptions
  autoPlay?: boolean
}

export function Text({ text, preset, presetOptions, autoPlay = true, ...options }: TextProps): ReactElement | null {
  const { textViz, isReady } = useTextViz({ text, options, autoAdd: true })
  const { runPreset } = useTextAnimation()

  useEffect(() => {
    if (!autoPlay || !preset || !isReady || !textViz) return
    void runPreset(textViz, preset, presetOptions)
  }, [autoPlay, isReady, preset, presetOptions, runPreset, textViz])

  return null
}
