import { APP_NAME } from '../config/app';

export default function AdminMoved() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-1 p-6 text-center text-ink">
      <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-6 text-2xl font-bold">
        404
      </div>
      <h1 className="text-xl font-bold tracking-tight font-display">Pagina nao encontrada</h1>
      <p className="text-sm text-ink-secondary mt-2 max-w-sm leading-relaxed">
        Este endereco saiu do ar. O painel administrativo do {APP_NAME} agora fica em um endereco proprio,
        acessivel apenas para a equipe.
      </p>
    </div>
  );
}
