import test from 'node:test';
import assert from 'node:assert/strict';
import { revealClues, rarityAccent, rarityTone, revealStages } from '../src/lib/reveal.ts';

test('reveal clues only use real metadata, in platform year/grade/rarity order', () => {
  assert.deepEqual(revealClues({ name: '1999 Charizard PSA 9' }, 'Rare'), [
    { label: 'Year', value: '1999' }, { label: 'Grade', value: 'PSA 9' }, { label: 'Rarity', value: 'Rare' },
  ]);
  assert.deepEqual(revealClues({ name: 'Booster pack', brand: 'Pokemon' }, 'Common'), [{ label: 'Brand', value: 'Pokemon' }, { label: 'Rarity', value: 'Common' }]);
  assert.deepEqual(revealClues({}, null), []);
  assert.deepEqual(revealClues({ grader: 'CGC', grade: '9.5' }), [{ label: 'Grade', value: 'CGC 9.5' }]);
});

test('production reveal timing retains metadata in Normal and only rarity in Blitz', () => {
  const product = { name: '1999 Charizard PSA 9', brand: 'Pokemon' };
  const normal = revealStages(product, 'Rare');
  assert.deepEqual(normal.map(stage => stage.kind), ['box', 'detail', 'detail', 'detail', 'rarity']);
  assert.deepEqual(normal.map(stage => stage.duration), [3800, 1800, 1800, 1800, 2600]);
  assert.deepEqual(revealStages(product, 'Rare', true), [{ kind: 'rarity', duration: 2600 }]);
  assert.deepEqual(revealStages(product, 'Common', true, true), []);
  assert.equal(rarityTone('Legendary'), 'premium');
  assert.equal(rarityTone('Uncommon'), 'uncommon');
});
test('rarity colors are case insensitive and unknown rarities remain neutral', () => {
  assert.equal(rarityAccent(' LEGENDARY '), rarityAccent('legendary'));
  assert.equal(rarityAccent(null), rarityAccent('common'));
});
