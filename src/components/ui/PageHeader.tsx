import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  children
}) => {
  return (
    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
      <div className="space-y-1">
        <h1 className="text-xl md:text-2xl font-bold text-[#F8FAFC] tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-xs md:text-sm font-medium text-[#94A3B8]">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2 flex-wrap">
          {children}
        </div>
      )}
    </div>
  );
};
