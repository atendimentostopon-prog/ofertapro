import React, { useState, useEffect } from 'react';
import { Package } from 'lucide-react';

interface ProductImageProps {
  src?: string | null;
  alt: string;
  className?: string;
}

const ProductImage: React.FC<ProductImageProps> = ({ src, alt, className = '' }) => {
  const [error, setError] = useState(false);
  
  // Reseta o estado de erro se o src mudar
  useEffect(() => {
    setError(false);
  }, [src]);

  const isValidUrl = (url?: string | null): boolean => {
    if (!url) return false;
    const trimmed = url.trim();
    if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return false;
    return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/');
  };

  const renderFallback = () => {
    // Filtra classes de redimensionamento de hover ou preenchimento de imagem que quebram o layout do div
    const cleanClasses = className
      .split(' ')
      .filter(c => !c.includes('object-') && !c.includes('hover:') && !c.includes('scale-') && !c.includes('transition-') && !c.includes('duration-'))
      .join(' ');

    return (
      <div className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#0c0f1d] to-[#171b30] border border-white/[0.05] text-[#64748B] select-none text-center gap-1.5 p-3 rounded-2xl ${cleanClasses}`}>
        <Package className="w-7 h-7 text-indigo-400/70 animate-pulse" />
        <span className="text-[10px] font-black text-indigo-300/80 uppercase tracking-widest">Sem Foto</span>
      </div>
    );
  };

  if (error || !isValidUrl(src)) {
    return renderFallback();
  }

  return (
    <img
      src={src!.trim()}
      alt={alt}
      className={`block w-full h-full object-cover ${className}`}
      onError={() => {
        console.warn(`[ProductImage] Falha ao carregar imagem: ${src}`);
        setError(true);
      }}
    />
  );
};

export default ProductImage;
