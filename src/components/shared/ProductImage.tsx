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
    return (
      <div className={`flex flex-col items-center justify-center bg-[#070A12] border border-white/[0.04] text-slate-500 rounded-xl p-4 gap-2 ${className}`}>
        <Package className="w-8 h-8 text-slate-655" />
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sem Imagem</span>
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
      className={className}
      onError={() => {
        console.warn(`[ProductImage] Falha ao carregar imagem: ${src}`);
        setError(true);
      }}
    />
  );
};

export default ProductImage;
