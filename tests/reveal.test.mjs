import test from 'node:test';
import assert from 'node:assert/strict';
import { revealClues, rarityAccent } from '../src/lib/reveal.ts';

test('reveal clues only use real metadata, in platform year/grade/rarity order', () => {
  assert.deepEqual(revealClues({ name: '1999 Charizard PSA 9' }, 'Rare'), [
    { label: 'Year', value: '1999' }, { label: 'Grade', value: 'PSA 9' }, { label: 'Rarity', value: 'Rare' },
  ]);
  assert.deepEqual(revealClues({ name: 'Booster pack', brand: 'Pokemon' }, 'Common'), [{ label: 'Rarity', value: 'Common' }]);
  assert.deepEqual(revealClues({}, null), []);
  assert.deepEqual(revealClues({ grader: 'CGC', grade: '9.5' }), [{ label: 'Grade', value: 'CGC 9.5' }]);
});
test('rarity colors are case insensitive and unknown rarities remain neutral', () => {
  assert.equal(rarityAccent(' LEGENDARY '), rarityAccent('legendary'));
  assert.equal(rarityAccent(null), rarityAccent('common'));
});
