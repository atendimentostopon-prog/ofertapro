import { BotControlPanel } from '../components/BotControlPanel';

export default function Bot() {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Bot</h1>
        <p className="mt-1 text-sm text-ink-secondary">Status, controle e logs do bot.</p>
      </header>
      <BotControlPanel />
    </section>
  );
}
