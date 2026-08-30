export function ErrorState({
  title = 'Algo deu errado',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-danger/25 bg-danger-bg px-6 py-12 text-center">
      <p className="text-sm font-semibold text-danger-ink">{title}</p>
      <p className="text-xs text-danger-ink/80">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-lg border border-danger/30 bg-surface-0 px-3 py-1.5 text-xs font-semibold text-danger-ink transition-colors hover:bg-surface-1"
        >
          Tentar de novo
        </button>
      )}
    </div>
  );
}
