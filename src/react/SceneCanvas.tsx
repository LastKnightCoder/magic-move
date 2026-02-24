import { useCallback } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { useScene } from './hooks/useScene'

export interface SceneCanvasProps {
  className?: string
  style?: CSSProperties
}

export function SceneCanvas({ className, style }: SceneCanvasProps): ReactElement {
  const { options, setCanvasElement } = useScene()

  const bindRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvasElement(node)
  }, [setCanvasElement])

  return (
    <canvas
      ref={bindRef}
      width={options.width}
      height={options.height}
      className={className}
      style={{
        display: 'block',
        width: options.width ? `${options.width}px` : '100%',
        height: `${options.height}px`,
        ...style,
      }}
    />
  )
}
