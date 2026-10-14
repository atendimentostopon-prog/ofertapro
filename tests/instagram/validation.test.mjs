import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseKeywords, parseReplies, renderDmPreview, validateAutomation,
} from '../../src/lib/instagram.ts';

const valid = {
  name: 'Link da oferta', igAccountId: 'acc-1', targetScope: 'specific_media', mediaId: 'm1',
  matchMode: 'contains', keywordsRaw: 'quero, link', excludeRaw: '', publicRepliesRaw: 'Te mandei no direct!',
  dmText: 'Oi {{usuario}}! {{link}}', linkUrl: 'https://go.aflyo.com.br/o/abc', oncePerContact: true,
};

test('parseKeywords separa por vírgula e quebra de linha, sem duplicar', () => {
  assert.deepEqual(parseKeywords('quero, Link\nquero ,  , preço'), ['quero', 'Link', 'preço']);
});

test('parseReplies separa só por quebra de linha', () => {
  assert.deepEqual(parseReplies('Oi, tudo bem?\n\n  Já te chamei!  '), ['Oi, tudo bem?', 'Já te chamei!']);
});

test('renderDmPreview espelha o servidor', () => {
  assert.equal(renderDmPreview('Oi {{usuario}}! {{link}}', 'https://x.com/p', 'maria'), 'Oi maria! https://x.com/p');
  assert.equal(renderDmPreview('Segue', 'https://x.com/p', 'ana'), 'Segue\n\nhttps://x.com/p');
  assert.equal(renderDmPreview('Olá {{ USUARIO }}', '', 'ana'), 'Olá ana');
});

test('formulário válido não tem erros', () => {
  assert.deepEqual(validateAutomation(valid), {});
});

test('nome, conta e DM são obrigatórios', () => {
  const errs = validateAutomation({ ...valid, name: ' ', igAccountId: '', dmText: '' });
  assert.ok(errs.name && errs.igAccountId && errs.dmText);
});

test('post específico exige mídia escolhida', () => {
  assert.ok(validateAutomation({ ...valid, mediaId: null }).mediaId);
  assert.deepEqual(validateAutomation({ ...valid, targetScope: 'any_media', mediaId: null }), {});
});

test('modo contains/exact exige palavra-chave; any não', () => {
  assert.ok(validateAutomation({ ...valid, keywordsRaw: '' }).keywords);
  assert.deepEqual(validateAutomation({ ...valid, matchMode: 'any', keywordsRaw: '' }), {});
});

test('limite de 20 palavras-chave', () => {
  const raw = Array.from({ length: 21 }, (_, i) => `k${i}`).join(',');
  assert.ok(validateAutomation({ ...valid, keywordsRaw: raw }).keywords);
});

test('DM acima de 1000 bytes é recusada (conta bytes, não caracteres)', () => {
  assert.ok(validateAutomation({ ...valid, dmText: 'ç'.repeat(600) }).dmText);
  assert.deepEqual(validateAutomation({ ...valid, dmText: 'a'.repeat(900), linkUrl: '' }), {});
});

test('variável desconhecida na DM é apontada', () => {
  assert.ok(validateAutomation({ ...valid, dmText: 'Oi {{nome}}' }).dmText);
});

test('link precisa ser http(s)', () => {
  assert.ok(validateAutomation({ ...valid, linkUrl: 'javascript:alert(1)' }).linkUrl);
  assert.ok(validateAutomation({ ...valid, linkUrl: 'nao-eh-url' }).linkUrl);
  assert.deepEqual(validateAutomation({ ...valid, linkUrl: '' }), {});
});

test('respostas públicas: máximo de 5, 300 caracteres e sem variáveis', () => {
  assert.ok(validateAutomation({ ...valid, publicRepliesRaw: 'a\nb\nc\nd\ne\nf' }).publicReplies);
  assert.ok(validateAutomation({ ...valid, publicRepliesRaw: 'x'.repeat(301) }).publicReplies);
  assert.ok(validateAutomation({ ...valid, publicRepliesRaw: 'Oi {{usuario}}' }).publicReplies);
});
