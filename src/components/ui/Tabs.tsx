import React, { createContext, useContext, useState } from 'react';

interface TabsContextValue {
  value: string;
  setValue: (v: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

const useTabs = () => {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error('TabsList/TabsTrigger/TabsContent devem estar dentro de <Tabs>');
  }
  return ctx;
};

interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  value: controlledValue,
  defaultValue = '',
  onValueChange,
  children,
  className = '',
}) => {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  const setValue = (next: string) => {
    if (!isControlled) setInternalValue(next);
    onValueChange?.(next);
  };

  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
};

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
  scrollable?: boolean;
}

export const TabsList: React.FC<TabsListProps> = ({
  children,
  className = '',
  scrollable = false,
}) => {
  const list = (
    <div
      role="tablist"
      className={`inline-flex items-center gap-1 bg-surface-1 border border-line rounded-xl p-1 ${
        scrollable ? 'flex-nowrap min-w-max' : ''
      } ${className}`}
    >
      {children}
    </div>
  );

  if (scrollable) {
    return (
      <div className="w-full overflow-x-auto scrollbar-none">{list}</div>
    );
  }

  return list;
};

interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  disabled?: boolean;
}

export const TabsTrigger: React.FC<TabsTriggerProps> = ({
  value,
  children,
  icon: Icon,
  className = '',
  disabled = false,
}) => {
  const { value: currentValue, setValue } = useTabs();
  const isActive = currentValue === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => setValue(value)}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex-shrink-0 focus:outline-none focus-visible:shadow-focus ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${
        isActive
          ? 'bg-surface-0 text-ink shadow-sm'
          : 'text-ink-tertiary hover:text-ink-secondary hover:bg-surface-0/60'
      } ${className}`}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
};

interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export const TabsContent: React.FC<TabsContentProps> = ({
  value,
  children,
  className = '',
}) => {
  const { value: currentValue } = useTabs();
  if (currentValue !== value) return null;
  return (
    <div role="tabpanel" className={className}>
      {children}
    </div>
  );
};
