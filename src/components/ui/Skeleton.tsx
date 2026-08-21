import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  className?: string;
  style?: React.CSSProperties;
}

const RADIUS_MAP: Record<NonNullable<SkeletonProps['radius']>, string> = {
  none: 'rounded-none',
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-xl',
  xl: 'rounded-2xl',
  '2xl': 'rounded-3xl',
  full: 'rounded-full',
};

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  radius = 'md',
  className = '',
  style,
}) => {
  const inlineStyle: React.CSSProperties = { ...style };
  if (width !== undefined) inlineStyle.width = typeof width === 'number' ? `${width}px` : width;
  if (height !== undefined) inlineStyle.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`shimmer ${RADIUS_MAP[radius]} ${className}`}
      style={inlineStyle}
      aria-hidden="true"
    />
  );
};
