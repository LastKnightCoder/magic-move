import type { Scene } from './Scene'
import type { AnimationOptions, IVisualizer, MagicMoveOptions } from './types'
import type { OperationEvent, SerializedAnimation, SerializedVizState, SnapshotFrame } from './serialization'
import { deserializeVizState } from './serialization'

type VisualizerMapInput<T extends IVisualizer = IVisualizer> = Map<string, T> | Record<string, T>

interface HighlightableVisualizer extends IVisualizer {
  highlight: (id: string, color: string, opts?: MagicMoveOptions) => Promise<void>
}

interface UnhighlightableVisualizer extends IVisualizer {
  unhighlight: (id: string, opts?: AnimationOptions) => Promise<void>
}

interface SetNodePropVisualizer extends IVisualizer {
  setNodeProp: (id: string, props: Record<string, unknown>, opts?: AnimationOptions) => Promise<void>
}

export interface SnapshotPlaybackOptions {
  respectFrameTime?: boolean
  animationOptions?: AnimationOptions
  strict?: boolean
}

export interface OperationPlaybackOptions {
  respectEventTime?: boolean
  defaultOptions?: AnimationOptions | MagicMoveOptions
  handlers?: Record<string, OperationHandler>
  strict?: boolean
}

export interface PlayAnimationOptions {
  mode?: 'snapshot-first' | 'operations-first' | 'snapshots-only' | 'operations-only'
  snapshot?: SnapshotPlaybackOptions
  operation?: OperationPlaybackOptions
}

export interface OperationContext {
  scene: Scene
  visualizer: IVisualizer
  event: OperationEvent
  strict: boolean
  mergedOptions?: AnimationOptions | MagicMoveOptions
}

export type OperationHandler = (context: OperationContext) => Promise<void>

function normalizeVisualizers<T extends IVisualizer>(visualizers: VisualizerMapInput<T>): Map<string, T> {
  if (visualizers instanceof Map) return visualizers
  return new Map<string, T>(Object.entries(visualizers))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasHighlight(viz: IVisualizer): viz is HighlightableVisualizer {
  return typeof (viz as HighlightableVisualizer).highlight === 'function'
}

function hasUnhighlight(viz: IVisualizer): viz is UnhighlightableVisualizer {
  return typeof (viz as UnhighlightableVisualizer).unhighlight === 'function'
}

function hasSetNodeProp(viz: IVisualizer): viz is SetNodePropVisualizer {
  return typeof (viz as SetNodePropVisualizer).setNodeProp === 'function'
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function toSerializedStateOrNull(value: unknown, fallbackVizId: string): SerializedVizState | null {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return null
  const vizId = toStringOrUndefined(value.vizId) ?? fallbackVizId
  const state: SerializedVizState = {
    vizId,
    nodes: value.nodes as SerializedVizState['nodes'],
    edges: Array.isArray(value.edges) ? (value.edges as SerializedVizState['edges']) : undefined,
  }
  return state
}

function mergeOptions(
  defaults?: AnimationOptions | MagicMoveOptions,
  current?: AnimationOptions | MagicMoveOptions
): AnimationOptions | MagicMoveOptions | undefined {
  if (!defaults && !current) return undefined
  return { ...(defaults ?? {}), ...(current ?? {}) }
}

async function runBuiltInOperation(context: OperationContext): Promise<boolean> {
  const { visualizer, event, strict, mergedOptions } = context
  const args = isRecord(event.args) ? event.args : {}

  if (event.op === 'highlight') {
    if (!hasHighlight(visualizer)) {
      if (strict) throw new Error(`Visualizer "${event.vizId}" does not support highlight.`)
      return true
    }
    const id = toStringOrUndefined(args.id)
    const color = toStringOrUndefined(args.color)
    if (!id || !color) {
      if (strict) throw new Error(`Operation highlight requires args.id and args.color.`)
      return true
    }
    await visualizer.highlight(id, color, mergedOptions as MagicMoveOptions | undefined)
    return true
  }

  if (event.op === 'unhighlight') {
    if (!hasUnhighlight(visualizer)) {
      if (strict) throw new Error(`Visualizer "${event.vizId}" does not support unhighlight.`)
      return true
    }
    const id = toStringOrUndefined(args.id)
    if (!id) {
      if (strict) throw new Error('Operation unhighlight requires args.id.')
      return true
    }
    await visualizer.unhighlight(id, mergedOptions)
    return true
  }

  if (event.op === 'setNodeProp') {
    if (!hasSetNodeProp(visualizer)) {
      if (strict) throw new Error(`Visualizer "${event.vizId}" does not support setNodeProp.`)
      return true
    }
    const id = toStringOrUndefined(args.id)
    const props = isRecord(args.props) ? args.props : undefined
    if (!id || !props) {
      if (strict) throw new Error('Operation setNodeProp requires args.id and args.props.')
      return true
    }
    await visualizer.setNodeProp(id, props, mergedOptions)
    return true
  }

  if (event.op === 'transition') {
    const stateCandidate = args.state ?? args
    const serializedState = toSerializedStateOrNull(stateCandidate, event.vizId)
    if (!serializedState) {
      if (strict) throw new Error('Operation transition requires serialized state in args.state or args.')
      return true
    }
    await visualizer.applyState(deserializeVizState(serializedState), mergedOptions)
    return true
  }

  return false
}

export class AnimationPlayer {
  static async playFromSnapshots(
    scene: Scene,
    visualizers: VisualizerMapInput,
    snapshotTrack: SnapshotFrame[],
    options: SnapshotPlaybackOptions = {}
  ): Promise<void> {
    const vizMap = normalizeVisualizers(visualizers)
    const sortedFrames = [...snapshotTrack].sort((a, b) => a.t - b.t)
    const respectFrameTime = options.respectFrameTime ?? true
    const strict = options.strict ?? false

    let lastTime = 0
    for (const frame of sortedFrames) {
      if (respectFrameTime) {
        const wait = frame.t - lastTime
        if (wait > 0) await scene.wait(wait)
      }

      const tasks: Promise<void>[] = []
      for (const serializedState of frame.states) {
        const viz = vizMap.get(serializedState.vizId)
        if (!viz) {
          if (strict) throw new Error(`Missing visualizer for snapshot state: "${serializedState.vizId}".`)
          continue
        }
        tasks.push(viz.applyState(deserializeVizState(serializedState), options.animationOptions))
      }
      await Promise.all(tasks)
      lastTime = frame.t
    }
  }

  static async playFromOperations(
    scene: Scene,
    visualizers: VisualizerMapInput,
    operationTrack: OperationEvent[],
    options: OperationPlaybackOptions = {}
  ): Promise<void> {
    const vizMap = normalizeVisualizers(visualizers)
    const sortedEvents = [...operationTrack].sort((a, b) => a.t - b.t)
    const respectEventTime = options.respectEventTime ?? true
    const strict = options.strict ?? false

    let lastTime = 0
    for (const event of sortedEvents) {
      if (respectEventTime) {
        const wait = event.t - lastTime
        if (wait > 0) await scene.wait(wait)
      }

      const viz = vizMap.get(event.vizId)
      if (!viz) {
        if (strict) throw new Error(`Missing visualizer for operation event: "${event.vizId}".`)
        lastTime = event.t
        continue
      }

      const mergedOptions = mergeOptions(options.defaultOptions, event.options)
      const context: OperationContext = { scene, visualizer: viz, event, strict, mergedOptions }
      const handledByBuiltIn = await runBuiltInOperation(context)
      if (!handledByBuiltIn) {
        const customHandler = options.handlers?.[event.op]
        if (!customHandler) {
          if (strict) throw new Error(`No handler found for operation "${event.op}".`)
          lastTime = event.t
          continue
        }
        await customHandler(context)
      }

      lastTime = event.t
    }
  }

  static async play(
    scene: Scene,
    visualizers: VisualizerMapInput,
    animation: SerializedAnimation,
    options: PlayAnimationOptions = {}
  ): Promise<void> {
    const mode = options.mode ?? 'snapshot-first'
    const hasOperations = !!animation.operationTrack?.length

    if (mode === 'snapshots-only') {
      await AnimationPlayer.playFromSnapshots(scene, visualizers, animation.snapshotTrack, options.snapshot)
      return
    }

    if (mode === 'operations-only') {
      if (!hasOperations) return
      await AnimationPlayer.playFromOperations(scene, visualizers, animation.operationTrack ?? [], options.operation)
      return
    }

    if (mode === 'operations-first') {
      if (hasOperations) {
        await AnimationPlayer.playFromOperations(scene, visualizers, animation.operationTrack ?? [], options.operation)
        return
      }
      await AnimationPlayer.playFromSnapshots(scene, visualizers, animation.snapshotTrack, options.snapshot)
      return
    }

    await AnimationPlayer.playFromSnapshots(scene, visualizers, animation.snapshotTrack, options.snapshot)
  }
}
