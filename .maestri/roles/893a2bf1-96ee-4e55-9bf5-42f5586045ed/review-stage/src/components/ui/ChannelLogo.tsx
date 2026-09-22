import React, { useState } from 'react';
import { getChannelLogo, detectChannelType } from '../../lib/logos';

interface ChannelLogoProps {
  /** Tipo do canal: 'telegram', 'discord', 'whatsapp' */
  type?: string;
  /** Nome do canal (usado como fallback para detectar tipo se 'type' não for fornecido) */
  name?: string;
  /** Tamanho em classes Tailwind (ex: 'w-4 h-4', 'w-6 h-6') */
  size?: string;
  /** Classes extras para o container */
  className?: string;
}

/**
 * Componente reutilizável que renderiza o logo SVG real de um canal.
 * Se a imagem falhar, faz fallback para emoji.
 */
const ChannelLogo: React.FC<ChannelLogoProps> = ({ 
  type, 
  name = '', 
  size = 'w-4 h-4', 
  className = '' 
}) => {
  const [imgError, setImgError] = useState(false);

  const resolvedType = type || detectChannelType(name);
  const logo = getChannelLogo(resolvedType);

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

export default ChannelLogo;
