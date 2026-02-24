import type opentype from 'opentype.js'

export interface GlyphInfo {
  char: string
  pathData: string
  advanceWidth: number
  xOffset: number
  bounds: { x: number; y: number; width: number; height: number }
  pathLength: number
}

export interface TextLayout {
  glyphs: GlyphInfo[]
  totalWidth: number
  ascender: number
  descender: number
  lineHeight: number
}

/**
 * 将文本排版为逐字形的 SVG 路径数据。
 */
export function layoutText(
  text: string,
  font: opentype.Font,
  fontSize: number,
  options?: { letterSpacing?: number }
): TextLayout {
  const scale = fontSize / font.unitsPerEm
  const ascender = font.ascender * scale
  const descender = font.descender * scale
  const lineHeight = ascender - descender
  const letterSpacing = options?.letterSpacing ?? 0

  const glyphs: GlyphInfo[] = []
  let xCursor = 0

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const glyph = font.charToGlyph(char)
    const advanceWidth = (glyph.advanceWidth ?? 0) * scale

    // 获取 kerning
    let kerning = 0
    if (i > 0) {
      const prevGlyph = font.charToGlyph(text[i - 1])
      kerning = font.getKerningValue(prevGlyph, glyph) * scale
      xCursor += kerning
    }

    // 生成路径（baseline 在 y=ascender 处，使文字顶部对齐 y=0）
    const path = glyph.getPath(xCursor, ascender, fontSize)
    const pathData = path.toSVG(2)
    // 提取 d 属性值（toSVG 返回 <path d="..."/>）
    const dMatch = pathData.match(/d="([^"]*)"/)
    const d = dMatch ? dMatch[1] : ''

    const bb = path.getBoundingBox()
    const bounds = {
      x: bb.x1,
      y: bb.y1,
      width: bb.x2 - bb.x1,
      height: bb.y2 - bb.y1,
    }

    const pathLength = d ? estimatePathLength(path.commands) : 0

    glyphs.push({
      char,
      pathData: d,
      advanceWidth,
      xOffset: xCursor,
      bounds,
      pathLength,
    })

    xCursor += advanceWidth + letterSpacing
  }

  return {
    glyphs,
    totalWidth: xCursor - letterSpacing,
    ascender,
    descender,
    lineHeight,
  }
}

/** Bézier 弧长近似（线段采样法）。 */
function estimatePathLength(commands: opentype.PathCommand[]): number {
  let length = 0
  let cx = 0
  let cy = 0

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        cx = cmd.x
        cy = cmd.y
        break
      case 'L':
        length += dist(cx, cy, cmd.x, cmd.y)
        cx = cmd.x
        cy = cmd.y
        break
      case 'Q':
        length += quadBezierLength(cx, cy, cmd.x1, cmd.y1, cmd.x, cmd.y)
        cx = cmd.x
        cy = cmd.y
        break
      case 'C':
        length += cubicBezierLength(cx, cy, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y)
        cx = cmd.x
        cy = cmd.y
        break
      case 'Z':
        break
    }
  }
  return length
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}

function quadBezierLength(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  steps = 16
): number {
  let len = 0
  let px = x0, py = y0
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const mt = 1 - t
    const nx = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2
    const ny = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2
    len += dist(px, py, nx, ny)
    px = nx
    py = ny
  }
  return len
}

function cubicBezierLength(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  steps = 20
): number {
  let len = 0
  let px = x0, py = y0
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const mt = 1 - t
    const nx = mt ** 3 * x0 + 3 * mt ** 2 * t * x1 + 3 * mt * t ** 2 * x2 + t ** 3 * x3
    const ny = mt ** 3 * y0 + 3 * mt ** 2 * t * y1 + 3 * mt * t ** 2 * y2 + t ** 3 * y3
    len += dist(px, py, nx, ny)
    px = nx
    py = ny
  }
  return len
}
