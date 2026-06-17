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
        <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-[#7C3AED] rounded-full animate-spin" />
      </div>
    );
  }

  if (type === 'skeleton-grid') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">
        {Array.from({ length: count }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-2xl border border-white/[0.06] bg-[#101827] p-5 space-y-4 animate-pulse"
          >
            <div className="h-44 bg-white/5 rounded-xl w-full" />
            <div className="h-4 bg-white/10 rounded w-1/3" />
            <div className="h-5 bg-white/10 rounded w-5/6" />
            <div className="h-4 bg-white/10 rounded w-1/2" />
            <div className="h-8 bg-white/5 rounded-xl w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 w-full">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-white/[0.06] bg-[#101827] p-4 flex items-center gap-4 animate-pulse"
        >
          <div className="w-16 h-16 bg-white/5 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-white/10 rounded w-1/4" />
            <div className="h-3 bg-white/5 rounded w-1/2" />
          </div>
          <div className="w-20 h-8 bg-white/5 rounded-xl" />
        </div>
      ))}
    </div>
  );
};
