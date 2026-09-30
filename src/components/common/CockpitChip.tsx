import type { CockpitChipProps } from '../../types/ui';
import { OpticalLedPip } from './OpticalLedPip';

/** Smoked-umber pill badge with mono text and a hover shimmer sweep. */
export function CockpitChip({
  icon: Icon,
  ledTone,
  size = 'md',
  className,
  children,
  ...rest
}: CockpitChipProps) {
  const classes = ['cockpit-chip', `cockpit-chip--${size}`, className ?? ''].filter(Boolean).join(' ');
  const iconPx = size === 'sm' ? 10 : 12;

  return (
    <span {...rest} className={classes}>
      {ledTone ? <OpticalLedPip tone={ledTone} sizePx={size === 'sm' ? 4 : 5} label={null} /> : null}
      {Icon ? <Icon size={iconPx} strokeWidth={2.25} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export default CockpitChip;
