import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveActivation } from '../../src/lib/activationMilestones.ts';

const empty = { botConfig: null, connectedChannels: 0, successfulDispatches: 0, automaticDispatches: 0 };
const ids = state => state.milestones.map(m => m.id);
const doneIds = state => state.milestones.filter(m => m.done).map(m => m.id);

test('conta sem bot_configs: tudo pendente e proxima acao e conectar o Telegram', () => {
  const state = deriveActivation(empty);
  assert.deepEqual(ids(state), ['telegram', 'marketplaces', 'source', 'destination', 'test_dispatch', 'automatic_offer']);
  assert.equal(state.completed, 0);
  assert.equal(state.percent, 0);
  assert.equal(state.allDone, false);
  assert.equal(state.next?.id, 'telegram');
});

test('sessao do Telegram presente conclui o marco telegram', () => {
  const state = deriveActivation({ ...empty, botConfig: { telegram_session: 'abc' } });
  assert.deepEqual(doneIds(state), ['telegram']);
});

test('status active sem sessao tambem conclui telegram', () => {
  const state = deriveActivation({ ...empty, botConfig: { status: 'active' } });
  assert.deepEqual(doneIds(state), ['telegram']);
});

test('sessao so com espacos nao conta', () => {
  const state = deriveActivation({ ...empty, botConfig: { telegram_session: '   ' } });
  assert.deepEqual(doneIds(state), []);
});

test('uma tag de afiliado basta para marketplaces', () => {
  const state = deriveActivation({ ...empty, botConfig: { mercadolivre_tag: 'minha-tag' } });
  assert.deepEqual(doneIds(state), ['marketplaces']);
});

test('tags em branco nao concluem marketplaces', () => {
  const state = deriveActivation({ ...empty, botConfig: { amazon_tag: '  ', mercadolivre_tag: '' } });
  assert.deepEqual(doneIds(state), []);
});

test('grupos_origem vazio, nulo ou ausente nao conclui source', () => {
  for (const grupos of [[], null, undefined]) {
    const state = deriveActivation({ ...empty, botConfig: { grupos_origem: grupos } });
    assert.equal(doneIds(state).includes('source'), false);
  }
  const ok = deriveActivation({ ...empty, botConfig: { grupos_origem: ['canal-x'] } });
  assert.deepEqual(doneIds(ok), ['source']);
});

test('canal de destino conectado conclui destination', () => {
  const state = deriveActivation({ ...empty, connectedChannels: 1 });
  assert.deepEqual(doneIds(state), ['destination']);
});

test('oferta automatica implica teste de disparo concluido', () => {
  const state = deriveActivation({ ...empty, automaticDispatches: 1 });
  assert.deepEqual(doneIds(state), ['test_dispatch', 'automatic_offer']);
});

test('disparo manual com sucesso conclui so test_dispatch', () => {
  const state = deriveActivation({ ...empty, successfulDispatches: 2 });
  assert.deepEqual(doneIds(state), ['test_dispatch']);
});

test('proxima acao e o primeiro pendente mesmo com marcos posteriores prontos', () => {
  const state = deriveActivation({ ...empty, connectedChannels: 1, successfulDispatches: 1 });
  assert.equal(state.next?.id, 'telegram');
  assert.equal(state.completed, 2);
  assert.equal(state.percent, 33);
});

test('tudo pronto: next nulo, 100% e allDone', () => {
  const state = deriveActivation({
    botConfig: { telegram_session: 's', amazon_tag: 'a', grupos_origem: ['c'] },
    connectedChannels: 1,
    successfulDispatches: 1,
    automaticDispatches: 1,
  });
  assert.equal(state.next, null);
  assert.equal(state.percent, 100);
  assert.equal(state.allDone, true);
});

test('nenhum texto de marco usa travessao', () => {
  for (const m of deriveActivation(empty).milestones) {
    assert.doesNotMatch(`${m.title} ${m.description} ${m.actionLabel}`, /—/);
  }
});
