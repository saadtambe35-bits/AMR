import { createElement } from 'react';
import type { LedTone, RecessedProgressProps, RecessedWellProps } from '../../types/ui';

/** Neumorphic inset well for meters, readouts and inputs. */
export function RecessedWell({
  as = 'div',
  variant = 'well',
  padding,
  className,
  children,
  ...rest
}: RecessedWellProps) {
  const classes = [
    'recessed-well',
    variant === 'well' ? '' : `recessed-well--${variant}`,
    padding ? `recessed-well--pad-${padding}` : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return createElement(as, { ...rest, className: classes }, children);
}

/** Progress bar seated in a recessed track. Fill colour follows the LED tone. */
export function RecessedProgress({
  value,
  tone = 'emerald',
  label,
  className,
  ...rest
}: RecessedProgressProps) {
  const clamped = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const toneClass: `tone-${LedTone}` = `tone-${tone}`;
  const classes = ['recessed-well', 'recessed-progress', toneClass, className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      {...rest}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={classes}
    >
      <div className="recessed-progress__fill" style={{ width: `${clamped}%` }} />
    </div>
  );
}

export default RecessedWell;
