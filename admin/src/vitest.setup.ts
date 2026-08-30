import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Sem test.globals no vitest.config, o auto-cleanup do RTL nao registra sozinho.
afterEach(() => {
  cleanup();
});
