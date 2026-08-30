export default function Unauthorized() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-1 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface-0 p-8 text-center shadow-card">
        <h1 className="font-display text-lg font-bold text-ink">Acesso nao autorizado</h1>
        <p className="mt-2 text-xs text-ink-secondary">
          Este endereco nao expoe o painel administrativo.
        </p>
      </div>
    </div>
  );
}
