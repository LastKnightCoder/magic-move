import { Group, Path } from 'leafer-ui'
import type { IUI } from 'leafer-ui'
import { FontManager } from '../text/FontManager'
import { layoutText } from '../text/GlyphPath'
import type { GlyphInfo, TextLayout } from '../text/GlyphPath'

export interface PathGlyphEntry {
  node: IUI
  info: GlyphInfo
}

export interface PathLabelData {
  group: Group
  glyphs: PathGlyphEntry[]
  layout: TextLayout
  text: string
  fontSize: number
  fill: string
}

export interface LabelResult {
  node: IUI
  pathData?: PathLabelData
}

export function createPathLabel(
  text: string,
  bounds: { x: number; y: number; width: number; height: number },
  options?: { fontSize?: number; fill?: string }
): PathLabelData {
  const font = FontManager.getDefault()
  const fontSize = options?.fontSize ?? 16
  const fill = options?.fill ?? '#1e293b'

  const layout = layoutText(String(text), font, fontSize)
  const offsetX = bounds.x + (bounds.width - layout.totalWidth) / 2
  const offsetY = bounds.y + (bounds.height - layout.lineHeight) / 2

  const group = new Group({ x: offsetX, y: offsetY })
  const glyphs: PathGlyphEntry[] = []

  for (const glyph of layout.glyphs) {
    if (glyph.char.trim() === '' || !glyph.pathData) continue
    const node = new Path({
      path: glyph.pathData,
      fill,
      opacity: 1,
    })
    group.add(node)
    glyphs.push({ node, info: glyph })
  }

  return { group, glyphs, layout, text: String(text), fontSize, fill }
}

export function createPathLabelAt(
  text: string,
  x: number,
  y: number,
  options?: { fontSize?: number; fill?: string }
): PathLabelData {
  const font = FontManager.getDefault()
  const fontSize = options?.fontSize ?? 16
  const fill = options?.fill ?? '#1e293b'

  const layout = layoutText(String(text), font, fontSize)
  const group = new Group({ x, y })
  const glyphs: PathGlyphEntry[] = []

  for (const glyph of layout.glyphs) {
    if (glyph.char.trim() === '' || !glyph.pathData) continue
    const node = new Path({
      path: glyph.pathData,
      fill,
      opacity: 1,
    })
    group.add(node)
    glyphs.push({ node, info: glyph })
  }

  return { group, glyphs, layout, text: String(text), fontSize, fill }
}
