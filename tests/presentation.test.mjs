import assert from 'node:assert/strict';
import test from 'node:test';
import * as presentation from '../src/lib/site.ts';

test('le score affiche une décimale au plus et les ancres suivent les couleurs exportées', () => {
  assert.equal(typeof presentation.formatScore, 'function');
  assert.equal(presentation.formatScore(11.333333333), '11,3');
  assert.equal(presentation.formatScore(6), '6');
  assert.equal(typeof presentation.colorAnchor, 'function');
  for (const [color, anchor] of [['Rosé','rose'],['Effervescent blanc','effervescent-blanc'],['Vin de paille','vin-de-paille']]) {
    assert.equal(presentation.colorAnchor(color), anchor);
  }
});
