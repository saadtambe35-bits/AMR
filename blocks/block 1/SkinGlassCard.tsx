import { createElement } from 'react';
import type { SkinGlassCardProps } from '../../types/ui';

/** Frosted glass card with a specular top-edge sheen and layered drop shadows. */
export function SkinGlassCard({
  as = 'div',
  padding = 'md',
  interactive = false,
  className,
  children,
  ...rest
}: SkinGlassCardProps) {
  const classes = [
    'skin-glass',
    `skin-glass--pad-${padding}`,
    interactive ? 'skin-glass--interactive' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return createElement(as, { ...rest, className: classes }, children);
}

export default SkinGlassCard;
