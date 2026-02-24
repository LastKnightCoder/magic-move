import { Path } from 'leafer-ui'
import type { IUI } from 'leafer-ui'
import type opentype from 'opentype.js'
import type { MagicMoveOptions, VizState, NodeState } from '../core/types'
import type { Scene } from '../core/Scene'
import { BaseViz } from '../core/BaseViz'
import { FontManager } from './FontManager'
import { layoutText } from './GlyphPath'
import type { GlyphInfo, TextLayout } from './GlyphPath'

export interface TextVizOptions {
  x?: number
  y?: number
  fontSize?: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  letterSpacing?: number
  fontUrl?: string
}

interface GlyphEntry {
  id: string
  node: IUI
  info: GlyphInfo
}

export class TextViz extends BaseViz {
  protected defaultFill = '#1e293b'

  private scene: Scene
  private text: string
  private fontSize: number
  private fillColor: string
  private strokeColor: string | undefined
  private strokeWidthVal: number
  private letterSpacing: number
  private fontUrl: string | undefined
  private font: opentype.Font | null = null
  private layout: TextLayout | null = null
  private glyphEntries: GlyphEntry[] = []
  private charIds: string[] = []

  constructor(scene: Scene, text: string, options?: TextVizOptions) {
    super(options?.x ?? 0, options?.y ?? 0)
    this.scene = scene
    this.text = text
    this.fontSize = options?.fontSize ?? 48
    this.fillColor = options?.fill ?? '#1e293b'
    this.strokeColor = options?.stroke
    this.strokeWidthVal = options?.strokeWidth ?? 0
    this.letterSpacing = options?.letterSpacing ?? 0
    this.fontUrl = options?.fontUrl
  }

  /** 异步初始化：加载字体并构建字形节点。 */
  async init(): Promise<void> {
    if (this.fontUrl) {
      this.font = await FontManager.load(this.fontUrl)
    } else {
      this.font = FontManager.getDefault()
    }
    this._buildGlyphs()
  }

  computeState(): VizState {
    const nodes = new Map<string, NodeState>()
    for (const entry of this.glyphEntries) {
      const n = entry.node as IUI & Record<string, unknown>
      nodes.set(entry.id, {
        id: entry.id,
        x: (n.x as number) ?? 0,
        y: (n.y as number) ?? 0,
        width: entry.info.bounds.width,
        height: entry.info.bounds.height,
        fill: n.fill as string,
        stroke: n.stroke as string,
        strokeWidth: n.strokeWidth as number,
        opacity: (n.opacity as number) ?? 1,
        pathData: entry.info.pathData,
        dashOffset: n.dashOffset as number | undefined,
        fillOpacity: n.fillOpacity as number | undefined,
        strokeOpacity: n.strokeOpacity as number | undefined,
      })
    }
    return { nodes }
  }

  /** 更新文本内容，通过 commitMutation 触发 MagicMove diff 过渡。 */
  async setText(newText: string, opts?: MagicMoveOptions): Promise<void> {
    await this.commitMutation(
      () => { this.text = newText },
      () => { this._buildGlyphs() },
      opts
    )
  }

  getText(): string {
    return this.text
  }

  getGlyphEntries(): GlyphEntry[] {
    return [...this.glyphEntries]
  }

  getWordGroups(): GlyphEntry[][] {
    if (!this.layout) return []

    const groups: GlyphEntry[][] = []
    let current: GlyphEntry[] = []

    // glyphEntries 不包含空白字符，按 layout 扫描才能正确按“词”分组。
    let entryIdx = 0
    for (const glyph of this.layout.glyphs) {
      if (glyph.char.trim() === '') {
        if (current.length > 0) {
          groups.push(current)
          current = []
        }
        continue
      }

      if (!glyph.pathData) continue
      const entry = this.glyphEntries[entryIdx]
      if (!entry) break

      current.push(entry)
      entryIdx++
    }

    if (current.length > 0) groups.push(current)
    return groups
  }

  getCharId(index: number): string {
    return this.charIds[index] ?? `char-${index}`
  }

  /** 重映射字符 ID（用于 TextDiff 的 TransformMatchingStrings）。 */
  setCharIds(ids: string[]): void {
    // ids 按文本位置索引，但 glyphEntries 跳过了空白字符
    // 需要根据 layout 中的字符位置映射到 glyphEntries
    if (!this.layout) return

    let entryIdx = 0
    for (let charIdx = 0; charIdx < this.layout.glyphs.length; charIdx++) {
      const glyph = this.layout.glyphs[charIdx]
      if (glyph.char.trim() === '' || !glyph.pathData) continue
      if (entryIdx >= this.glyphEntries.length) break

      const entry = this.glyphEntries[entryIdx]
      const oldId = entry.id
      const newId = ids[charIdx] ?? oldId
      if (oldId !== newId) {
        this.nodeMap.delete(oldId)
        this.nodeMap.set(newId, entry.node)
        entry.id = newId
      }
      entryIdx++
    }
    this.charIds = ids
  }

  getLayout(): TextLayout | null {
    return this.layout
  }

  private _buildGlyphs(): void {
    this.clearAll()
    this.glyphEntries = []

    if (!this.font) return

    this.layout = layoutText(this.text, this.font, this.fontSize, {
      letterSpacing: this.letterSpacing,
    })

    let charIndex = 0
    for (const glyph of this.layout.glyphs) {
      const id = this.charIds[charIndex] ?? `char-${charIndex}`

      // 空白字符不创建节点
      if (glyph.char.trim() === '') {
        charIndex++
        continue
      }

      if (!glyph.pathData) {
        charIndex++
        continue
      }

      const node = new Path({
        path: glyph.pathData,
        fill: this.fillColor,
        stroke: this.strokeColor,
        strokeWidth: this.strokeWidthVal,
        opacity: 1,
      })

      this.register(id, node)
      this.glyphEntries.push({ id, node, info: glyph })
      charIndex++
    }
  }
}
