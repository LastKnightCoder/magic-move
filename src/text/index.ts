export { FontManager } from './FontManager'
export { layoutText } from './GlyphPath'
export type { GlyphInfo, TextLayout } from './GlyphPath'
export { TextViz } from './TextViz'
export type { TextVizOptions } from './TextViz'
export {
  writeAnimation,
  showCreationAnimation,
  charByCharAnimation,
  wordByWordAnimation,
  writeGlyphs,
  showCreationGlyphs,
  charByCharGlyphs,
  wordByWordGlyphs,
} from './TextAnimations'
export type {
  WriteOptions,
  ShowCreationOptions,
  CharByCharOptions,
  WordByWordOptions,
} from './TextAnimations'
export { findMatchingBlocks, transformMatchingStrings } from './TextDiff'
export type { MatchBlock, TransformOptions } from './TextDiff'
