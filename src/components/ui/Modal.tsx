import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: ModalSize;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  showCloseButton?: boolean;
  className?: string;
  bodyClassName?: string;
}

const SIZE_MAP: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
};

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
  closeOnBackdrop = true,
  closeOnEsc = true,
  showCloseButton = true,
  className = '',
  bodyClassName = '',
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  const hasHeader = !!(title || description || showCloseButton);

  return createPortal(
    <dialog
      ref={dialogRef}
      onCancel={event => { event.preventDefault(); if (closeOnEsc) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? `${id}-title` : undefined}
      aria-describedby={description ? `${id}-description` : undefined}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 text-ink z-50 flex items-center justify-center p-4 bg-graphite/48 backdrop-blur-xs animate-fade-in"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${SIZE_MAP[size]} bg-surface-0 border border-line rounded-2xl shadow-lg max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-scale-in ${className}`}
      >
        {hasHeader && (
          <div className="shrink-0 flex items-start justify-between gap-4 px-4 sm:px-6 pt-6 pb-4 border-b border-line">
            <div className="min-w-0 flex-1">
              {title && (
                <h2 id={`${id}-title`} className="text-base font-bold text-ink tracking-tight font-display">
                  {title}
                </h2>
              )}
              {description && (
                <p id={`${id}-description`} className="text-xs text-ink-secondary mt-1 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="p-2 -m-1 rounded-lg text-ink-tertiary hover:text-ink hover:bg-surface-1 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        <div className={`min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 ${bodyClassName}`}>
          {children}
        </div>
        {footer && (
          <div className="shrink-0 px-4 sm:px-6 py-4 border-t border-line bg-surface-1 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </dialog>,
    document.body
  );
};
