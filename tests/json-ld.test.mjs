import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

test('les données JSON-LD ne peuvent pas fermer leur balise script', async () => {
  let serialize;
  try { ({ serializeJsonLd: serialize } = await import(pathToFileURL(resolve('src/lib/json-ld.ts')).href)); } catch {}
  assert.equal(typeof serialize, 'function', 'le sérialiseur sûr doit exister');
  const value = { name: '</script><script>alert(1)</script>' };
  const encoded = serialize(value);
  assert.ok(!encoded.includes('<'));
  assert.deepEqual(JSON.parse(encoded), value);
});
