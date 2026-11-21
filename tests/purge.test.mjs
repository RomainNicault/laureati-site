import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import worker, { purge, retention } from '../src/worker.ts';
import { environment, insertCorrection } from './d1.mjs';

let realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ success: true, action: 'correction', hostname: 'laureati.fr' });
});
afterEach(() => { globalThis.fetch = realFetch; });

const NOW = new Date('2026-11-16T03:17:00.000Z');
const HOUR = 3600000;

function rows(db) {
  return db.prepare('SELECT id, recu_le, ip_hash FROM correction ORDER BY id').all().map(row => ({ ...row }));
}

test('bornes de conservation : douze mois et quarante-huit heures, en UTC', () => {
  assert.deepEqual(retention(NOW), { receivedBefore: '2025-11-16T03:17:00.000Z', hashedBefore: '2026-11-14T03:17:00.000Z' });
  // 29 février : le jour absent de l'année cible ramène au 28, jamais au 1er mars.
  assert.equal(retention(new Date('2028-02-29T00:00:00.000Z')).receivedBefore, '2027-02-28T00:00:00.000Z');
  assert.equal(retention(new Date('2026-01-01T00:00:00.000Z')).receivedBefore, '2025-01-01T00:00:00.000Z');
});

test('purge : exactement douze mois conservé, une milliseconde de plus supprimée, empreinte effacée au-delà de quarante-huit heures', async () => {
  const env = environment();
  try {
    const due = insertCorrection(env.db, { recu_le: '2025-11-16T03:17:00.000Z' });
    const overdue = insertCorrection(env.db, { recu_le: '2025-11-16T03:16:59.999Z' });
    const hashed = insertCorrection(env.db, { recu_le: '2026-11-14T03:17:00.000Z' });
    const cleared = insertCorrection(env.db, { recu_le: '2026-11-14T03:16:59.999Z' });
    const recent = insertCorrection(env.db, { recu_le: new Date(NOW.getTime() - HOUR).toISOString() });

    // L'empreinte est effacée avant la suppression : la ligne expirée compte aussi.
    assert.deepEqual(await purge(env, NOW), { deleted: 1, anonymized: 3 });
    assert.deepEqual(rows(env.db), [
      { id: due, recu_le: '2025-11-16T03:17:00.000Z', ip_hash: null },
      { id: hashed, recu_le: '2026-11-14T03:17:00.000Z', ip_hash: 'a'.repeat(64) },
      { id: cleared, recu_le: '2026-11-14T03:16:59.999Z', ip_hash: null },
      { id: recent, recu_le: new Date(NOW.getTime() - HOUR).toISOString(), ip_hash: 'a'.repeat(64) },
    ]);
    assert.ok(!rows(env.db).some(row => row.id === overdue));
  } finally { env.db.close(); }
});

test('purge idempotente : une seconde exécution au même instant ne change rien', async () => {
  const env = environment();
  try {
    insertCorrection(env.db, { recu_le: '2024-01-01T00:00:00.000Z' });
    insertCorrection(env.db, { recu_le: '2024-06-01T00:00:00.000Z' });
    insertCorrection(env.db, { recu_le: '2026-11-14T00:00:00.000Z' });
    insertCorrection(env.db, { recu_le: '2026-11-16T02:00:00.000Z' });
    assert.deepEqual(await purge(env, NOW), { deleted: 2, anonymized: 3 });
    const after = rows(env.db);
    assert.deepEqual(await purge(env, NOW), { deleted: 0, anonymized: 0 });
    assert.deepEqual(rows(env.db), after);
    assert.equal(after.filter(row => row.recu_le === '2026-11-14T00:00:00.000Z')[0].ip_hash, null);
    assert.equal(after.filter(row => row.recu_le === '2026-11-16T02:00:00.000Z')[0].ip_hash, 'a'.repeat(64));
  } finally { env.db.close(); }
});

test('tâche planifiée : l’heure de déclenchement pilote la purge, sans toucher aux assets', async () => {
  const env = environment();
  try {
    const old = insertCorrection(env.db, { recu_le: '2024-01-01T00:00:00.000Z' });
    insertCorrection(env.db, { recu_le: '2026-11-14T00:00:00.000Z' });
    insertCorrection(env.db, { recu_le: '2026-11-16T02:00:00.000Z' });
    await worker.scheduled({ scheduledTime: NOW.getTime() }, env);
    assert.equal(rows(env.db).length, 2);
    assert.ok(!rows(env.db).some(row => row.id === old));
    assert.equal(await (await worker.fetch(new Request('https://laureati.fr/'), env)).text(), 'static');
  } finally { env.db.close(); }
});

test('quota quotidien intact après purge : dix envois acceptés, empreintes effacées hors quota', async () => {
  const env = environment();
  try {
    insertCorrection(env.db, { recu_le: '2025-01-01T00:00:00.000Z', ip_hash: null });
    insertCorrection(env.db, { recu_le: new Date(Date.now() - 49 * HOUR).toISOString() });
    const request = () => new Request('https://laureati.fr/api/correction', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '192.0.2.1' }, body: new URLSearchParams({ page: '/vignerons/0123456789-exemple/', producer_id: 'producer:exemple', champ: 'adresse', valeur_proposee: '1 rue Exemple', commentaire: '', contact: '', site_web_2: '', 'cf-turnstile-response': 'jeton' }) });
    const accepted = await Promise.all(Array.from({ length: 10 }, () => worker.fetch(request(), env)));
    assert.equal(accepted.filter(response => response.headers.get('Location') === '/correction-merci/').length, 10);
    await purge(env, new Date());
    // La ligne de 2025 est supprimée ; seule celle de 49 h perd son empreinte ; celles du jour la gardent et le quota tient.
    assert.equal(env.db.prepare('SELECT count(*) n FROM correction WHERE ip_hash IS NULL').get().n, 1);
    assert.equal(env.db.prepare('SELECT count(*) n FROM correction WHERE ip_hash IS NOT NULL AND recu_le >= ?').get(new Date(Date.now() - HOUR).toISOString()).n, 10);
    const eleventh = await worker.fetch(request(), env);
    assert.match(decodeURIComponent(eleventh.headers.get('Location')), /10.*jour/);
  } finally { env.db.close(); }
});
