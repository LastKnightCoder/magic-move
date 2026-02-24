import opentype from 'opentype.js'

/**
 * 字体加载与缓存管理器（静态单例）。
 */
export class FontManager {
  private static cache: Map<string, opentype.Font> = new Map()
  private static defaultFont: opentype.Font | null = null

  /** 从 URL 加载字体，结果会按 URL 缓存。 */
  static async load(url: string): Promise<opentype.Font> {
    const cached = FontManager.cache.get(url)
    if (cached) return cached

    const font = await opentype.load(url)
    FontManager.cache.set(url, font)
    return font
  }

  /** 从 ArrayBuffer 解析字体并以 key 缓存。 */
  static parse(buffer: ArrayBuffer, key: string): opentype.Font {
    const cached = FontManager.cache.get(key)
    if (cached) return cached

    const font = opentype.parse(buffer)
    FontManager.cache.set(key, font)
    return font
  }

  static setDefault(font: opentype.Font): void {
    FontManager.defaultFont = font
  }

  static getDefault(): opentype.Font {
    if (!FontManager.defaultFont) {
      throw new Error('[algo-viz] No default font set. Call FontManager.load() and FontManager.setDefault() first.')
    }
    return FontManager.defaultFont
  }

  static hasDefault(): boolean {
    return FontManager.defaultFont !== null
  }
}
