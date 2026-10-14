import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMediaColumns } from '../../src/lib/instagram.ts';

const ref = { id: 'm1', permalink: 'https://ig/p/1', thumbnail: 'https://ig/t/1.jpg' };

test('any_media zera todas as colunas de midia', () => {
  assert.deepEqual(
    resolveMediaColumns({ targetScope: 'any_media', mediaId: 'm1', media: ref }),
    { media_id: null, media_permalink: null, media_thumbnail_url: null },
  );
});

test('specific_media com midia correspondente mantem permalink e thumbnail', () => {
  assert.deepEqual(
    resolveMediaColumns({ targetScope: 'specific_media', mediaId: 'm1', media: ref }),
    { media_id: 'm1', media_permalink: ref.permalink, media_thumbnail_url: ref.thumbnail },
  );
});

test('specific_media com midia de outro id zera metadados mas mantem media_id', () => {
  assert.deepEqual(
    resolveMediaColumns({ targetScope: 'specific_media', mediaId: 'm2', media: ref }),
    { media_id: 'm2', media_permalink: null, media_thumbnail_url: null },
  );
});

test('specific_media sem media mantem media_id com colunas nulas', () => {
  assert.deepEqual(
    resolveMediaColumns({ targetScope: 'specific_media', mediaId: 'm1', media: null }),
    { media_id: 'm1', media_permalink: null, media_thumbnail_url: null },
  );
});
