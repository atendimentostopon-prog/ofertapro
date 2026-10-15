import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVATION_GUIDES, getGuide } from '../../src/config/activationGuides.ts';
import { deriveActivation } from '../../src/lib/activationMilestones.ts';

const empty = { botConfig: null, connectedChannels: 0, successfulDispatches: 0, automaticDispatches: 0 };

test('todo marco tem guia com titulo, intro e ao menos 3 passos', () => {
  for (const milestone of deriveActivation(empty).milestones) {
    const guide = ACTIVATION_GUIDES[milestone.id];
    assert.ok(guide, `guia ausente para ${milestone.id}`);
    assert.equal(guide.id, milestone.id);
    assert.ok(guide.title.length > 0 && guide.intro.length > 0);
    assert.ok(guide.steps.length >= 3, `poucos passos em ${milestone.id}`);
  }
});

test('getGuide devolve nulo para id desconhecido ou vazio', () => {
  assert.equal(getGuide('nope'), null);
  assert.equal(getGuide(''), null);
  assert.equal(getGuide(null), null);
  assert.equal(getGuide('telegram')?.id, 'telegram');
});

test('links externos usam https e nenhum texto usa travessao', () => {
  for (const guide of Object.values(ACTIVATION_GUIDES)) {
    if (guide.link) assert.match(guide.link.href, /^https:\/\//);
    const text = [guide.title, guide.intro, guide.tip ?? '', ...guide.steps.map(s => s.text)].join(' ');
    assert.doesNotMatch(text, /—/);
  }
});
