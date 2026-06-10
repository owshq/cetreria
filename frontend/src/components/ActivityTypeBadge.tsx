import type { ButtonHTMLAttributes } from 'react';
import type { ActivityType } from '@shared/types';
import { getActivityTypeLabel, resolveActivityType } from '@shared/types';
import { getActivityEmoji } from '@/lib/activityIcons';
import { cx } from '@/lib/cx';
import styles from './ActivityTypeBadge.module.css';

type ActivityTypeBadgeBaseProps = {
  typeRef: string;
  activityTypes: ActivityType[];
  className?: string;
  hideEmoji?: boolean;
  solid?: boolean;
};

type ActivityTypeBadgeSpanProps = ActivityTypeBadgeBaseProps & {
  as?: 'span';
};

type ActivityTypeBadgeButtonProps = ActivityTypeBadgeBaseProps & {
  as: 'button';
} & Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'title' | 'aria-label' | 'aria-haspopup' | 'aria-expanded'
>;

export type ActivityTypeBadgeProps = ActivityTypeBadgeSpanProps | ActivityTypeBadgeButtonProps;

export default function ActivityTypeBadge(props: ActivityTypeBadgeProps) {
  const { typeRef, activityTypes, className, hideEmoji = false, solid = false } = props;
  const type = resolveActivityType(typeRef, activityTypes);
  const label = getActivityTypeLabel(typeRef, activityTypes);
  const emoji = getActivityEmoji(type?.icon ?? 'other');

  const typeColor = type?.color ?? '#a3a3a3';
  const badgeClass = cx(styles.badge, solid && styles.badgeSolid, className);
  const badgeStyle = { '--type-color': typeColor } as React.CSSProperties;
  const content = (
    <>
      {!hideEmoji && (
        <span className={styles.emoji} aria-hidden>
          {emoji}
        </span>
      )}
      <span className={styles.label}>{label}</span>
    </>
  );

  if (props.as === 'button') {
    const {
      onClick,
      title,
      'aria-label': ariaLabel,
      'aria-haspopup': ariaHaspopup,
      'aria-expanded': ariaExpanded,
    } = props;
    return (
      <button
        type="button"
        className={cx(badgeClass, styles.badgeBtn)}
        style={badgeStyle}
        onClick={onClick}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup={ariaHaspopup}
        aria-expanded={ariaExpanded}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={badgeClass} style={badgeStyle}>
      {content}
    </span>
  );
}
