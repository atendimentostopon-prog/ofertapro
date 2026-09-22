import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Rede de segurança contra tela branca: captura qualquer erro de render
 * abaixo dele e mostra uma tela de recuperação com "Recarregar" / "Ir para o
 * login" em vez de deixar a árvore desmontada sem saída.
 */
class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] erro de render capturado:', error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-1 p-6 text-center text-ink">
        <div className="w-16 h-16 rounded-2xl bg-danger-bg border border-danger/25 flex items-center justify-center mb-6 text-danger-ink shadow-sm text-2xl font-bold">
          ⚠️
        </div>
        <h2 className="text-xl font-bold text-ink tracking-tight font-display">Algo deu errado ao abrir esta tela</h2>
        <p className="text-sm text-ink-secondary mt-2 max-w-sm leading-relaxed">
          Tivemos um problema para carregar o painel. Recarregue a página para tentar de novo.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <button onClick={this.handleReload} className="btn-gradient px-6 py-2.5 font-bold text-sm">
            Recarregar
          </button>
          <a
            href="/login"
            className="btn-secondary px-6 py-2.5 font-semibold text-sm inline-flex items-center justify-center"
          >
            Ir para o login
          </a>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
