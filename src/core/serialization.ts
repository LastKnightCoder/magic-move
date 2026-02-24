import type { BaseViz } from './BaseViz'
import type { Stepper } from './Stepper'
import type { AnimationOptions, EdgeState, MagicMoveOptions, NodeState, VizState } from './types'

export const ANIMATION_SCHEMA_VERSION = '1.0' as const

export interface SerializedAnimationMeta {
  name?: string
  createdAt?: string
  engine?: 'algo-viz'
  engineVersion?: string
  tags?: string[]
  extra?: Record<string, unknown>
}

export interface VisualizerDescriptor {
  id: string
  type?: string
  name?: string
  meta?: Record<string, unknown>
}

export interface SerializedVizState {
  vizId: string
  nodes: NodeState[]
  edges?: EdgeState[]
}

export interface SnapshotFrame {
  t: number
  label?: string
  states: SerializedVizState[]
}

export type BuiltinOperationName = 'highlight' | 'unhighlight' | 'setNodeProp' | 'transition' | 'custom'

export interface OperationEvent {
  t: number
  vizId: string
  op: BuiltinOperationName | (string & {})
  args?: unknown
  options?: AnimationOptions | MagicMoveOptions
  meta?: Record<string, unknown>
}

export interface SerializedAnimationV1 {
  schemaVersion: typeof ANIMATION_SCHEMA_VERSION
  meta?: SerializedAnimationMeta
  visualizers: VisualizerDescriptor[]
  snapshotTrack: SnapshotFrame[]
  operationTrack?: OperationEvent[]
}

/**
 * Public alias to keep a stable external name while preserving internal versioned types.
 */
export type SerializedAnimation = SerializedAnimationV1

export interface SerializeStepperSessionOptions {
  visualizers: Array<{ viz: BaseViz; descriptor: VisualizerDescriptor }>
  frameInterval?: number
  operationTrack?: OperationEvent[]
  meta?: SerializedAnimationMeta
}

export interface AnimationSchemaValidationResult {
  valid: boolean
  schemaVersion?: string
  errors: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(3))
}

function cloneNodeState(node: NodeState): NodeState {
  const cloned: NodeState = { ...node }
  if (node.points) cloned.points = [...node.points]
  if (node.dashPattern) cloned.dashPattern = [...node.dashPattern]
  if (node.meta && typeof node.meta === 'object') cloned.meta = { ...node.meta }
  return cloned
}

function cloneEdgeState(edge: EdgeState): EdgeState {
  return { ...edge }
}

function cloneUnknownShallow(value: unknown): unknown {
  if (Array.isArray(value)) return [...value]
  if (isRecord(value)) return { ...value }
  return value
}

function cloneOperationEvent(event: OperationEvent): OperationEvent {
  return {
    ...event,
    args: cloneUnknownShallow(event.args),
    options: event.options ? { ...event.options } : undefined,
    meta: event.meta ? { ...event.meta } : undefined,
  }
}

export function serializeVizState(vizId: string, state: VizState): SerializedVizState {
  if (!vizId.trim()) {
    throw new Error('serializeVizState requires a non-empty vizId.')
  }
  const nodes = [...state.nodes.values()].map((node) => cloneNodeState(node))
  const edges = state.edges ? [...state.edges.values()].map((edge) => cloneEdgeState(edge)) : undefined
  return { vizId, nodes, edges }
}

export function deserializeVizState(serialized: Pick<SerializedVizState, 'nodes' | 'edges'>): VizState {
  const nodes = new Map<string, NodeState>()
  for (const node of serialized.nodes) {
    nodes.set(node.id, cloneNodeState(node))
  }

  let edges: Map<string, EdgeState> | undefined
  if (serialized.edges) {
    edges = new Map<string, EdgeState>()
    for (const edge of serialized.edges) {
      edges.set(edge.id, cloneEdgeState(edge))
    }
  }

  return { nodes, edges }
}

export function serializeStepperSession(stepper: Stepper, options: SerializeStepperSessionOptions): SerializedAnimationV1 {
  const frameInterval = options.frameInterval ?? 1
  if (!isFiniteNumber(frameInterval) || frameInterval < 0) {
    throw new Error('serializeStepperSession requires frameInterval >= 0.')
  }

  const descriptorByViz = new Map<BaseViz, VisualizerDescriptor>()
  const descriptorIds = new Set<string>()
  for (const item of options.visualizers) {
    const id = item.descriptor.id.trim()
    if (!id) throw new Error('visualizer descriptor id cannot be empty.')
    if (descriptorIds.has(id)) throw new Error(`duplicated visualizer descriptor id: "${id}".`)
    descriptorIds.add(id)
    descriptorByViz.set(item.viz, {
      ...item.descriptor,
      id,
      meta: item.descriptor.meta ? { ...item.descriptor.meta } : undefined,
    })
  }

  const snapshots = stepper.exportSnapshots()
  const labels = stepper.stepLabels
  const snapshotTrack: SnapshotFrame[] = snapshots.map((snapshot, index) => {
    const states: SerializedVizState[] = []
    for (const [viz, state] of snapshot.entries()) {
      const descriptor = descriptorByViz.get(viz)
      if (!descriptor) continue
      states.push(serializeVizState(descriptor.id, state))
    }
    states.sort((a, b) => a.vizId.localeCompare(b.vizId))
    return {
      t: roundSeconds(index * frameInterval),
      label: index > 0 ? labels[index - 1] : undefined,
      states,
    }
  })

  const visualizers = options.visualizers.map((item) => ({
    ...item.descriptor,
    id: item.descriptor.id.trim(),
    meta: item.descriptor.meta ? { ...item.descriptor.meta } : undefined,
  }))

  return {
    schemaVersion: ANIMATION_SCHEMA_VERSION,
    meta: {
      engine: 'algo-viz',
      createdAt: new Date().toISOString(),
      ...options.meta,
    },
    visualizers,
    snapshotTrack,
    operationTrack: options.operationTrack?.map((event) => cloneOperationEvent(event)),
  }
}

export function buildStepperSnapshotsFromTrack(
  snapshotTrack: SnapshotFrame[],
  visualizersById: Map<string, BaseViz>
): Array<Map<BaseViz, VizState>> {
  return snapshotTrack.map((frame) => {
    const snapshot = new Map<BaseViz, VizState>()
    for (const state of frame.states) {
      const viz = visualizersById.get(state.vizId)
      if (!viz) continue
      snapshot.set(viz, deserializeVizState(state))
    }
    return snapshot
  })
}

export function validateAnimationSchema(payload: unknown): AnimationSchemaValidationResult {
  const errors: string[] = []
  if (!isRecord(payload)) {
    return { valid: false, errors: ['payload must be an object.'] }
  }

  const schemaVersion = payload.schemaVersion
  if (typeof schemaVersion !== 'string') {
    errors.push('schemaVersion must be a string.')
  } else if (schemaVersion !== ANIMATION_SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion "${schemaVersion}".`)
  }

  const visualizers = payload.visualizers
  if (!Array.isArray(visualizers)) {
    errors.push('visualizers must be an array.')
  } else {
    for (let i = 0; i < visualizers.length; i++) {
      const descriptor = visualizers[i]
      if (!isRecord(descriptor)) {
        errors.push(`visualizers[${i}] must be an object.`)
        continue
      }
      if (typeof descriptor.id !== 'string' || !descriptor.id.trim()) {
        errors.push(`visualizers[${i}].id must be a non-empty string.`)
      }
    }
  }

  const snapshotTrack = payload.snapshotTrack
  if (!Array.isArray(snapshotTrack)) {
    errors.push('snapshotTrack must be an array.')
  } else {
    for (let i = 0; i < snapshotTrack.length; i++) {
      const frame = snapshotTrack[i]
      if (!isRecord(frame)) {
        errors.push(`snapshotTrack[${i}] must be an object.`)
        continue
      }
      if (!isFiniteNumber(frame.t) || frame.t < 0) {
        errors.push(`snapshotTrack[${i}].t must be a finite number >= 0.`)
      }
      if (!Array.isArray(frame.states)) {
        errors.push(`snapshotTrack[${i}].states must be an array.`)
        continue
      }
      for (let j = 0; j < frame.states.length; j++) {
        const state = frame.states[j]
        if (!isRecord(state)) {
          errors.push(`snapshotTrack[${i}].states[${j}] must be an object.`)
          continue
        }
        if (typeof state.vizId !== 'string' || !state.vizId.trim()) {
          errors.push(`snapshotTrack[${i}].states[${j}].vizId must be a non-empty string.`)
        }
        if (!Array.isArray(state.nodes)) {
          errors.push(`snapshotTrack[${i}].states[${j}].nodes must be an array.`)
          continue
        }
        for (let k = 0; k < state.nodes.length; k++) {
          const node = state.nodes[k]
          if (!isRecord(node)) {
            errors.push(`snapshotTrack[${i}].states[${j}].nodes[${k}] must be an object.`)
            continue
          }
          if (typeof node.id !== 'string' || !node.id.trim()) {
            errors.push(`snapshotTrack[${i}].states[${j}].nodes[${k}].id must be a non-empty string.`)
          }
          if (!isFiniteNumber(node.x) || !isFiniteNumber(node.y)) {
            errors.push(`snapshotTrack[${i}].states[${j}].nodes[${k}] must include numeric x/y.`)
          }
          if (!isFiniteNumber(node.width) || !isFiniteNumber(node.height)) {
            errors.push(`snapshotTrack[${i}].states[${j}].nodes[${k}] must include numeric width/height.`)
          }
        }
        if (state.edges !== undefined) {
          if (!Array.isArray(state.edges)) {
            errors.push(`snapshotTrack[${i}].states[${j}].edges must be an array when provided.`)
          } else {
            for (let k = 0; k < state.edges.length; k++) {
              const edge = state.edges[k]
              if (!isRecord(edge)) {
                errors.push(`snapshotTrack[${i}].states[${j}].edges[${k}] must be an object.`)
                continue
              }
              if (typeof edge.id !== 'string' || !edge.id.trim()) {
                errors.push(`snapshotTrack[${i}].states[${j}].edges[${k}].id must be a non-empty string.`)
              }
              if (typeof edge.fromId !== 'string' || typeof edge.toId !== 'string') {
                errors.push(`snapshotTrack[${i}].states[${j}].edges[${k}] must include string fromId/toId.`)
              }
            }
          }
        }
      }
    }
  }

  const operationTrack = payload.operationTrack
  if (operationTrack !== undefined) {
    if (!Array.isArray(operationTrack)) {
      errors.push('operationTrack must be an array when provided.')
    } else {
      for (let i = 0; i < operationTrack.length; i++) {
        const event = operationTrack[i]
        if (!isRecord(event)) {
          errors.push(`operationTrack[${i}] must be an object.`)
          continue
        }
        if (!isFiniteNumber(event.t) || event.t < 0) {
          errors.push(`operationTrack[${i}].t must be a finite number >= 0.`)
        }
        if (typeof event.vizId !== 'string' || !event.vizId.trim()) {
          errors.push(`operationTrack[${i}].vizId must be a non-empty string.`)
        }
        if (typeof event.op !== 'string' || !event.op.trim()) {
          errors.push(`operationTrack[${i}].op must be a non-empty string.`)
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    schemaVersion: typeof schemaVersion === 'string' ? schemaVersion : undefined,
    errors,
  }
}

export function deserializeAnimation(payload: unknown): SerializedAnimation {
  const result = validateAnimationSchema(payload)
  if (!result.valid) {
    throw new Error(`Invalid animation schema: ${result.errors.join(' ')}`)
  }
  return payload as SerializedAnimation
}
