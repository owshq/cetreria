import StatusDot from '@/components/StatusDot';
import ui from '@/styles/shared.module.css';

type ViewGroupTitleProps = {
  label: string;
  dotColor?: string;
  badgeClassName?: string;
  className?: string;
  as?: 'span' | 'h2';
};

export default function ViewGroupTitle({
  label,
  dotColor,
  badgeClassName,
  className,
  as: Tag = 'span',
}: ViewGroupTitleProps) {
  const content = badgeClassName ? (
    <span className={badgeClassName}>
      <span className={ui.statusWithDot}>
        {dotColor && <StatusDot color={dotColor} />}
        {label}
      </span>
    </span>
  ) : (
    <>
      {dotColor && <StatusDot color={dotColor} />}
      {label}
    </>
  );

  if (className) {
    return (
      <Tag className={className}>
        <span className={ui.viewGroupTitleLayout}>{content}</span>
      </Tag>
    );
  }

  return <Tag className={ui.viewGroupTitle}>{content}</Tag>;
}
