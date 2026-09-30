import { SWARM_THEME } from '../../types/ui';
import type { OpticalLedPipProps } from '../../types/ui';

/** A small optical-lens LED with a 3s breathing halo. Tone colours live in index.css. */
export function OpticalLedPip({
  tone,
  sizePx = 2,
  label,
  still = false,
  className,
  style,
  ...rest
}: OpticalLedPipProps) {
  const accessibleLabel = label === undefined ? SWARM_THEME.led[tone].label : label;
  const classes = ['led-pip', `led-pip--${tone}`, still ? 'led-pip--still' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <span
      {...rest}
      role={accessibleLabel === null ? undefined : 'img'}
      aria-label={accessibleLabel === null ? undefined : accessibleLabel}
      aria-hidden={accessibleLabel === null ? true : undefined}
      className={classes}
      style={{ width: sizePx, height: sizePx, ...style }}
    />
  );
}

export default OpticalLedPip;
