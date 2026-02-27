import { describe, expect, it, vi } from 'vitest'
import { MagicMove } from './MagicMove'
import type { VizState } from './types'

describe('MagicMove enter color transition', () => {
  it('uses meta.enterFromFill as enter color before transitioning to target fill', async () => {
    let capturedFrames: Array<Record<string, unknown>> = []
    const node = {
      animate: vi.fn((keyframes: unknown) => {
        capturedFrames = keyframes as Array<Record<string, unknown>>
        return {
          on: (event: string, cb: () => void) => {
            if (event === 'completed') cb()
          },
        }
      }),
    }

    const before: VizState = { nodes: new Map() }
    const after: VizState = {
      nodes: new Map([
        [
          'circle-n1',
          {
            id: 'circle-n1',
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            opacity: 1,
            fill: '#ef4444',
            meta: { enterFromFill: '#bfdbfe' },
          },
        ],
      ]),
    }

    await MagicMove.animate(new Map([['circle-n1', node as never]]), before, after, { enterAnimation: 'fade' })

    expect(capturedFrames.length).toBe(3)
    expect(capturedFrames[0]?.fill).toBe('#bfdbfe')
    expect(capturedFrames[1]?.fill).toBe('#bfdbfe')
    expect(capturedFrames[2]?.fill).toBe('#ef4444')
  })

  it('does not stagger or scale label enter animation', async () => {
    const calls = new Map<string, { keyframes: Array<Record<string, unknown>>; options: Record<string, unknown> }>()
    const makeNode = (id: string) => ({
      animate: vi.fn((keyframes: unknown, options: unknown) => {
        calls.set(id, {
          keyframes: keyframes as Array<Record<string, unknown>>,
          options: options as Record<string, unknown>,
        })
        return {
          on: (event: string, cb: () => void) => {
            if (event === 'completed') cb()
          },
        }
      }),
    })

    const nodeMap = new Map<string, never>([
      ['circle-a', makeNode('circle-a') as never],
      ['circle-b', makeNode('circle-b') as never],
      ['label-a', makeNode('label-a') as never],
    ])

    const before: VizState = { nodes: new Map() }
    const after: VizState = {
      nodes: new Map([
        ['circle-a', { id: 'circle-a', x: 0, y: 0, width: 10, height: 10, opacity: 1, fill: '#ef4444' }],
        ['circle-b', { id: 'circle-b', x: 20, y: 0, width: 10, height: 10, opacity: 1, fill: '#334155' }],
        ['label-a', { id: 'label-a', x: 0, y: 0, width: 10, height: 10, opacity: 1, fill: '#ffffff' }],
      ]),
    }

    await MagicMove.animate(nodeMap, before, after, {
      duration: 1,
      enterLagRatio: 0.2,
      enterAnimation: 'scale',
    })

    const delayedCircle = calls.get('circle-b')
    const label = calls.get('label-a')
    expect(delayedCircle).toBeTruthy()
    expect(label).toBeTruthy()
    expect((delayedCircle?.options.delay as number) > 0).toBe(true)
    expect(label?.options.delay).toBe(0)
    expect(label?.keyframes.length).toBe(2)
    expect(Object.prototype.hasOwnProperty.call(label?.keyframes[0] ?? {}, 'scaleX')).toBe(false)
  })
})
