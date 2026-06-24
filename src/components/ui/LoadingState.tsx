import React from 'react';

interface LoadingStateProps {
  type?: 'spinner' | 'skeleton-grid' | 'skeleton-list';
  count?: number;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  type = 'spinner',
  count = 4
}) => {
  if (type === 'spinner') {
    return (
      <div className="flex items-center justify-center py-20 w-full">
        <div className="relative">
          <div className="w-8 h-8 border-[3px] border-brand-500/15 border-t-brand-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (type === 'skeleton-grid') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 w-full">
        {Array.from({ length: count }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-2xl border border-white/[0.04] bg-surface-2 overflow-hidden"
          >
            <div className="h-40 shimmer w-full" />
            <div className="p-4 space-y-3">
              <div className="flex gap-1.5">
                <div className="h-5 shimmer rounded-full w-16" />
                <div className="h-5 shimmer rounded-full w-14" />
              </div>
              <div className="h-4 shimmer rounded-full w-5/6" />
              <div className="h-3 shimmer rounded-full w-1/2" />
              <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                <div className="h-4 shimmer rounded-full w-16" />
                <div className="h-5 shimmer rounded-full w-14" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 w-full">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-white/[0.04] bg-surface-2 p-4 flex items-center gap-4"
        >
          <div className="w-12 h-12 shimmer rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 shimmer rounded-full w-1/3" />
            <div className="h-3 shimmer rounded-full w-1/2" />
          </div>
          <div className="w-20 h-7 shimmer rounded-lg" />
        </div>
      ))}
    </div>
  );
};
