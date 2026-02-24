import type { Scene } from '../core/Scene'
import { MagicMove } from '../core/MagicMove'
import type { MagicMoveOptions } from '../core/types'
import type { TextViz } from './TextViz'

export interface MatchBlock {
  sourceStart: number
  targetStart: number
  length: number
}

/**
 * 查找两个字符串之间的最长公共子串匹配块（类似 Python difflib.SequenceMatcher）。
 */
export function findMatchingBlocks(source: string, target: string): MatchBlock[] {
  const m = source.length
  const n = target.length
  if (m === 0 || n === 0) return []

  // DP 求 LCS 长度表
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (source[i - 1] === target[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // 回溯 LCS 得到匹配对
  const pairs: Array<[number, number]> = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (source[i - 1] === target[j - 1]) {
      pairs.push([i - 1, j - 1])
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }
  pairs.reverse()

  // 将连续匹配对合并为块
  const blocks: MatchBlock[] = []
  for (const [si, ti] of pairs) {
    const last = blocks[blocks.length - 1]
    if (last && si === last.sourceStart + last.length && ti === last.targetStart + last.length) {
      last.length++
    } else {
      blocks.push({ sourceStart: si, targetStart: ti, length: 1 })
    }
  }

  return blocks
}

export interface TransformOptions extends MagicMoveOptions {
  /** 强制匹配的子串列表。 */
  matchedKeys?: string[]
  /** 源→目标子串映射。 */
  keyMap?: Record<string, string>
}

/**
 * TransformMatchingStrings：通过 LCS diff 找到匹配字符，
 * 为匹配字符分配共享 ID，然后利用 MagicMove 引擎驱动过渡。
 */
export async function transformMatchingStrings(
  sourceViz: TextViz,
  targetViz: TextViz,
  scene: Scene,
  options?: TransformOptions
): Promise<void> {
  const sourceText = sourceViz.getText()
  const targetText = targetViz.getText()

  const blocks = findMatchingBlocks(sourceText, targetText)

  // 构建 ID 映射
  const sourceIds: string[] = Array.from({ length: sourceText.length }, (_, i) => `src-${i}`)
  const targetIds: string[] = Array.from({ length: targetText.length }, (_, i) => `tgt-${i}`)

  // 匹配的字符共享 ID
  let matchIdx = 0
  for (const block of blocks) {
    for (let k = 0; k < block.length; k++) {
      const sharedId = `matched-${matchIdx++}`
      sourceIds[block.sourceStart + k] = sharedId
      targetIds[block.targetStart + k] = sharedId
    }
  }

  // 重映射两个 viz 的字符 ID
  sourceViz.setCharIds(sourceIds)
  targetViz.setCharIds(targetIds)

  // 获取 source 当前状态作为 before，target 状态作为 after
  const before = sourceViz.getState()
  const after = targetViz.computeState()

  // 确保 target group 在场景中，以保留其自身 x/y 偏移。
  if (!targetViz.group.parent) {
    scene.add(targetViz)
  }

  // 先隐藏 target 全量节点，避免与 source 匹配字符重叠闪现。
  for (const [, node] of targetViz.nodeMap) {
    ;(node as unknown as Record<string, unknown>).opacity = 0
  }

  // 将 target 的新增节点注册到合并 nodeMap 中（匹配节点继续使用 source 执行 morph）。
  const mergedNodeMap = new Map(sourceViz.nodeMap)
  for (const [id, node] of targetViz.nodeMap) {
    if (!mergedNodeMap.has(id)) {
      mergedNodeMap.set(id, node)
    }
  }

  await MagicMove.animate(mergedNodeMap, before, after, {
    duration: options?.duration ?? 0.8,
    easing: options?.easing,
    delay: options?.delay,
    enterAnimation: options?.enterAnimation ?? 'fade',
    exitAnimation: options?.exitAnimation ?? 'fade',
  })

  // 过渡完成后切换到 target：移除 source，并恢复 target 全量可见。
  scene.remove(sourceViz)
  for (const [, node] of targetViz.nodeMap) {
    ;(node as unknown as Record<string, unknown>).opacity = 1
  }
}
