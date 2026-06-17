import React, { useState, useEffect } from 'react';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  className = ''
}) => {
  const [error, setError] = useState(false);

  // Se o src mudar, resetar o erro
  useEffect(() => {
    setError(false);
  }, [src]);

  const getInitials = (nameStr: string) => {
    if (!nameStr || typeof nameStr !== 'string') return 'U';
    const parts = nameStr.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };
  const initials = getInitials(name);

  const sizes = {
    sm: 'w-7 h-7 text-[10px]',
    md: 'w-10 h-10 text-[12px] font-bold',
    lg: 'w-14 h-14 text-base font-bold',
    xl: 'w-20 h-20 text-xl font-black'
  };

  const rounded = size === 'sm' || size === 'md' ? 'rounded-full' : 'rounded-2xl';

  return (
    <div
      className={`relative flex-shrink-0 flex items-center justify-center overflow-hidden border border-white/10 select-none ${sizes[size]} ${rounded} ${className}`}
    >
      {src && !error ? (
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setError(true)}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-purple-900 text-[#F8FAFC] flex items-center justify-center uppercase font-bold">
          {initials}
        </div>
      )}
    </div>
  );
};
