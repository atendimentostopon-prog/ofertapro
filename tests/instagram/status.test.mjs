import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSaveStatus } from '../../src/lib/instagram.ts';

test('nova automação: desligada vira rascunho, ligada vira ativa', () => {
  assert.equal(resolveSaveStatus(null, false), 'draft');
  assert.equal(resolveSaveStatus(null, true), 'active');
});

test('automação pausada salva sem ligar continua pausada', () => {
  assert.equal(resolveSaveStatus('paused', false), 'paused');
});

test('automação pausada ligada no editor vira ativa', () => {
  assert.equal(resolveSaveStatus('paused', true), 'active');
});

test('rascunho e ativa mantêm o comportamento atual', () => {
  assert.equal(resolveSaveStatus('draft', false), 'draft');
  assert.equal(resolveSaveStatus('active', true), 'active');
  assert.equal(resolveSaveStatus('active', false), 'draft');
});
