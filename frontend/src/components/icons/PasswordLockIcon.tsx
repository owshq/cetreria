import type { SVGProps } from 'react';

type PasswordLockIconProps = SVGProps<SVGSVGElement> & {
  unlocked?: boolean;
};

const svgProps = {
  width: 12,
  height: 12,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
} as const;

export function PasswordLockIcon({ unlocked = false, className, ...props }: PasswordLockIconProps) {
  return (
    <svg className={className} aria-hidden {...svgProps} {...props}>
      <rect
        x="3"
        y="11"
        width="18"
        height="11"
        rx="2"
        ry="2"
        fill="currentColor"
        fillOpacity={0.32}
      />
      <path
        d={unlocked ? 'M7 11V7a5 5 0 0 1 9.9-1' : 'M7 11V7a5 5 0 0 1 10 0v4'}
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
