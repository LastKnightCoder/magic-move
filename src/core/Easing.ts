import type { EasingName } from './types'

/**
 * 将内部 EasingName 映射为 @leafer-in/animate 可识别的字符串。
 */
export const EASING_MAP: Record<EasingName, string> = {
  linear: 'linear',
  ease: 'ease',
  'ease-in': 'ease-in',
  'ease-out': 'ease-out',
  'ease-in-out': 'ease-in-out',
  spring: 'spring(1, 80, 10, 0)',
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
}

export function resolveEasing(easing?: EasingName): string {
  return EASING_MAP[easing ?? 'ease-in-out']
}
