/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'true' liga o módulo de Instagram (sidebar e rotas /instagram*). Padrão: desligado. */
  readonly VITE_FEATURE_INSTAGRAM?: string;
}
