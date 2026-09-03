import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROLES } from '../../lib/roles';
import { callAdminApi, AdminApiError } from '../../lib/admin-api';
import { useToast } from '../../context/ToastContext';

const CODE_MESSAGES: Record<string, string> = {
  not_found: 'Essa pessoa precisa criar uma conta no Aflyo primeiro.',
  conflict: 'Já é administrador.',
};

export default function InviteAdmin() {
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [roleKeys, setRoleKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function toggleRole(key: string) {
    setRoleKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await callAdminApi('admins', 'invite', { email: email.trim(), roleKeys });
      toast('Convite enviado.', 'success');
      navigate('/admins');
    } catch (err) {
      if (err instanceof AdminApiError && CODE_MESSAGES[err.code]) {
        setFormError(CODE_MESSAGES[err.code]);
      } else {
        setFormError(err instanceof Error ? err.message : 'Falha ao convidar.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-lg space-y-4">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Convidar admin</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          A pessoa já precisa ter uma conta no Aflyo. Ela recebe os cargos escolhidos na hora.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-line bg-surface-0 p-6">
        <label className="block" htmlFor="invite-email">
          <span className="text-xs font-semibold text-ink-secondary">E-mail</span>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus"
          />
        </label>

        <fieldset>
          <legend className="text-xs font-semibold text-ink-secondary">Cargos</legend>
          <div className="mt-2 space-y-2">
            {ROLES.map((role) => (
              <label key={role.key} className="flex items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={roleKeys.includes(role.key)}
                  onChange={() => toggleRole(role.key)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">{role.label}</span>
                  <span className="block text-xs text-ink-tertiary">{role.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {formError && (
          <p className="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-xs font-semibold text-danger-ink">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Link
            to="/admins"
            className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-1"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-graphite-900 px-3 py-2 text-sm font-semibold text-ink-inverse transition-colors hover:bg-graphite-700 disabled:opacity-60"
          >
            {busy ? 'Convidando...' : 'Convidar'}
          </button>
        </div>
      </form>
    </section>
  );
}
