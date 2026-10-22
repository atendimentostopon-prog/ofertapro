import React from 'react';

/** Mascote do assistente Lyo. Corpo mint, asa (o "fly" de Aflyo), olhos que piscam. */
export function LyoMascot({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M32 14c4-7 13-7 13-1s-7 8-12 6" fill="#B4EFD3" />
      <circle cx="22" cy="26" r="17" fill="#3DD98F" />
      <circle cx="15" cy="17" r="3" fill="#FFFFFF" opacity="0.35" />
      <g className="lyo-eyes">
        <ellipse cx="17" cy="25" rx="2.6" ry="3.4" fill="#101418" />
        <ellipse cx="27" cy="25" rx="2.6" ry="3.4" fill="#101418" />
      </g>
      <path d="M17.5 32c2.6 2.4 6.4 2.4 9 0" stroke="#101418" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
