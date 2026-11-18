import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { packArtwork, packPoster, packBrand, packIsRestocking, currentPackItem } from '../src/lib/pack-artwork.ts';

const artwork = { version: 1, design_key: 'p|example', poster_url: 'https://www.dyli.io/poster.webp', texture_url: 'https://www.dyli.io/front.webp', model_url: 'https://www.dyli.io/model.glb' };
const item = { id: '2397', raw: { artwork, inventory_count: 12 }, image: '/legacy.webp', price: 15, availability: 12 };

test('catalog artwork accepts versioned public assets and falls back for unsupported or unsafe designs', () => {
  assert.equal(packArtwork(item).model_url, artwork.model_url);
  assert.equal(packPoster(item), artwork.poster_url);
  for (const override of [{ version: 2 }, { model_url: 'javascript:alert(1)' }, { texture_url: 'https://user:password@host.test/file' }, { poster_url: '' }]) {
    const invalid = { ...item, raw: { artwork: { ...artwork, ...override } } };
    assert.equal(packArtwork(invalid), null);
    assert.equal(packPoster(invalid), '/legacy.webp');
  }
  assert.equal(packArtwork({ raw: {} }), null);
  assert.equal(packArtwork({}), null, 'old saved purchase records can omit raw metadata');
  assert.equal(packPoster(item, { artwork: { ...artwork, poster_url: 'https://www.dyli.io/new.webp' } }), 'https://www.dyli.io/new.webp');
  assert.equal(packBrand('Pokemon'), 'Pokémon');
  assert.equal(packBrand('Vibes'), 'Vibes');
});

test('fresh detail stock and pricing replace stale catalog presentation without mutating its purchase instructions', () => {
  assert.equal(packIsRestocking(item), false);
  assert.equal(packIsRestocking(item, { inventory_count: 0 }), true);
  assert.equal(packIsRestocking(item, { restocking: true }), true);
  assert.equal(packIsRestocking({ ...item, raw: { restocking: true }, availability: 0 }, { inventory_count: 2, restocking: false }), false);
  const next = currentPackItem(item, { price_usd: 20, inventory_count: 4 });
  assert.equal(next.price, 20); assert.equal(next.availability, 4);
  assert.equal(item.price, 15); assert.equal(item.availability, 12);
  assert.equal(currentPackItem(item, { price_usd: 'bad' }).price, 15);
  assert.equal(currentPackItem(item, { price_usd: 0 }).price, 0);
});

test('the lazy renderer is pinned to the audited DYLI content hash', () => {
  const meta = JSON.parse(readFileSync(new URL('../sdk/pack-renderer.version.json', import.meta.url)));
  const bytes = readFileSync(new URL('../sdk/pack-renderer.mjs', import.meta.url));
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash, meta.sha256);
  assert.equal(meta.source, `https://www.dyli.io/commerce-assets/v1/pack-renderer.${hash.slice(0,16)}.mjs`);
});

test('native finish metadata preserves foil colors and rejects invalid gradients', () => {
  const materials = { body_top: '#007AC2', body_bottom: '#003C70', body_blend: [0, 1], matte: false, iridescence: .8 };
  const source = { ...item, raw: { artwork: { ...artwork, materials } } };
  assert.deepEqual(packArtwork(source).materials, materials);
  assert.equal(packArtwork({ ...item, raw: { artwork: { ...artwork, materials: { ...materials, body_blend: [1,0] } } } }).materials, undefined);
  assert.equal(packArtwork({ ...item, raw: { artwork: { ...artwork, materials: { ...materials, body_top: 'bad' } } } }).materials, undefined);
});
