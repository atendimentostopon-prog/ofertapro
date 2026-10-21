import test from 'node:test';
import assert from 'node:assert/strict';
import { reasonLabel, REASON_LABELS, statusLabel } from '../../src/lib/sourceReasons.ts';

const REASONS = ['no_access', 'bot_paused', 'outside_hours', 'no_link', 'unsupported_marketplace', 'missing_credentials',
  'ml_session_invalid', 'conversion_failed', 'duplicate', 'no_destination', 'no_price'];

test('todo motivo do processador tem texto em pt-BR sem travessão', () => {
  for (const k of REASONS) {
    assert.ok(REASON_LABELS[k]?.length > 0, `sem texto para ${k}`);
    assert.doesNotMatch(REASON_LABELS[k], /—/);
  }
});

test('motivo desconhecido e nulo', () => {
  assert.equal(reasonLabel(null), '');
  assert.equal(reasonLabel('dispatch HTTP 503: x'), 'Falha temporária. O Aflyo tenta de novo sozinho.');
  assert.equal(reasonLabel('toString'), 'Falha temporária. O Aflyo tenta de novo sozinho.');
});

test('status tem rótulo', () => {
  assert.equal(statusLabel('dispatched'), 'Enviada');
  assert.equal(statusLabel('skipped'), 'Ignorada');
  assert.equal(statusLabel('failed'), 'Falhou');
  assert.equal(statusLabel('pending'), 'Na fila');
  assert.equal(statusLabel('processing'), 'Na fila');
});
