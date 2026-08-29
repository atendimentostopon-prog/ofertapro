// src/config/cakto.ts
declare global { interface Window { Cakto?: { CaktoSDK: new (opts: { client_id: string }) => CaktoSdk } } }

export interface CaktoSdk {
  initAntifraud(): Promise<void>;
  createToken(card: { holderName: string; cardNumber: string; cvv: string; expMonth: string; expYear: string }): Promise<{ cardToken: string }>;
  authenticate3DS(args: { card: unknown; customer: unknown }): Promise<{ success: boolean; cavv?: string; eci?: string; xid?: string; referenceId?: string; version?: string; error?: string }>;
  completeAntifraudProfile(): Promise<void>;
  getAntifraudReference(): string;
  cleanupAntifraud?(): void;
}

const CLIENT_ID = import.meta.env.VITE_CAKTO_CLIENT_ID as string | undefined;
let instance: CaktoSdk | null = null;

export async function getCaktoSdk(): Promise<CaktoSdk> {
  if (instance) return instance;
  if (!CLIENT_ID) throw new Error('VITE_CAKTO_CLIENT_ID nao configurada.');
  const start = Date.now();
  while (!window.Cakto) {
    if (Date.now() - start > 10_000) throw new Error('SDK da Cakto nao carregou.');
    await new Promise(r => setTimeout(r, 100));
  }
  instance = new window.Cakto.CaktoSDK({ client_id: CLIENT_ID });
  return instance;
}
