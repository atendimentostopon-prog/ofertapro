import React, { useState } from 'react';
import { getMarketplaceLogo } from '../../lib/logos';

interface MarketplaceLogoProps {
  /** Valor do marketplace: 'amazon', 'mercadolivre', 'shopee', etc. */
  value: string;
  /** Tamanho em classes Tailwind (ex: 'w-4 h-4', 'w-6 h-6') */
  size?: string;
  /** Classes extras para o container */
  className?: string;
}

/**
 * Componente reutilizável que renderiza o logo SVG real de um marketplace.
 * Se a imagem falhar, faz fallback para emoji.
 */
const MarketplaceLogo: React.FC<MarketplaceLogoProps> = ({ 
  value, 
  size = 'w-4 h-4', 
  className = '' 
}) => {
  const [imgError, setImgError] = useState(false);

  const logo = getMarketplaceLogo(value);

  if (imgError || !logo.src) {
    return <span className={className}>{logo.emoji}</span>;
  }

  return (
    <img
      src={logo.src}
      alt={logo.label}
      className={`${size} object-contain flex-shrink-0 ${className}`}
      onError={() => setImgError(true)}
    />
  );
};

export default MarketplaceLogo;
