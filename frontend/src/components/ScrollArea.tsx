import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { cx } from '@/lib/cx';
import { scrollRegionProps } from '@/lib/scrollRegion';
import scrollStyles from '@/styles/scrollbars.module.css';

type ScrollAxis = 'both' | 'x' | 'y' | 'edge-y';

type ScrollAreaProps<T extends ElementType = 'div'> = {
  as?: T;
  axis?: ScrollAxis;
  children: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLElement>, 'className'>;

const axisClass: Record<ScrollAxis, string> = {
  both: scrollStyles.scrollArea,
  y: scrollStyles.scrollAreaY,
  x: scrollStyles.scrollAreaX,
  'edge-y': scrollStyles.scrollAreaEdgeY,
};

function ScrollAreaInner<T extends ElementType = 'div'>(
  {
    as,
    axis = 'y',
    children,
    className,
    ...props
  }: ScrollAreaProps<T>,
  ref: Ref<HTMLElement>,
) {
  const Tag = (as ?? 'div') as ElementType;

  return (
    <Tag
      ref={ref}
      {...scrollRegionProps}
      className={cx(axisClass[axis], className)}
      {...props}
    >
      {children}
    </Tag>
  );
}

const ScrollArea = forwardRef(ScrollAreaInner) as <T extends ElementType = 'div'>(
  props: ScrollAreaProps<T> & { ref?: Ref<HTMLElement> },
) => ReturnType<typeof ScrollAreaInner>;

export default ScrollArea;
