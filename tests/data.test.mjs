import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { loadData, producerPath } from '../src/lib/data.ts';

test('les six fichiers sont requis, sans repli devant un export incomplet', () => {
  const root = mkdtempSync(join(process.cwd(), '.data-test-'));
  const writeDataset = (dir, name) => {
    mkdirSync(dir, { recursive: true });
    for (const [file, value] of Object.entries({ producers: [], appellations: [], regions: [], competitions: [], redirects: [], meta: { exporte_le: name } })) {
      writeFileSync(join(dir, `${file}.json`), JSON.stringify(value));
    }
  };
  try {
    writeDataset(join(root, 'sample'), 'sample');
    assert.deepEqual(loadData(root).regions, []);
    assert.equal(loadData(root).meta.exporte_le, 'sample');
    writeDataset(join(root, 'export'), 'export');
    assert.equal(loadData(root).meta.exporte_le, 'export');
    for (const file of ['regions', 'competitions', 'redirects', 'meta']) {
      rmSync(join(root, `export/${file}.json`));
      assert.throws(() => loadData(root), new RegExp(`${file}.json`));
      writeDataset(join(root, 'export'), 'export');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('la route vigneron utilise le chemin exporté avec identifiant court', () => {
  assert.equal(producerPath({ id: 'producer:identite-complete', id_court: '0123456789', slug: 'exemple', url: '/vignerons/0123456789-exemple/' }), '/vignerons/0123456789-exemple/');
});
