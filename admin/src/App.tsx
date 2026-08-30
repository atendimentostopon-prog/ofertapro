import { ENV } from './lib/env';
import { isAllowedHost } from './lib/hostname-guard';

export default function App() {
  if (!isAllowedHost(window.location.hostname, ENV.isProd, ENV.adminHostname)) {
    return (
      <div style={{ padding: 40, fontFamily: 'system-ui' }}>
        <h1>Acesso nao autorizado</h1>
        <p>Este endereco nao expoe o painel administrativo.</p>
      </div>
    );
  }
  return <div style={{ padding: 40, fontFamily: 'system-ui' }}>Aflyo Admin</div>;
}
