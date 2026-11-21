import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import worker from '../src/worker.ts';
import { environment } from './d1.mjs';

let realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ success: true, action: 'correction', hostname: 'laureati.fr' });
});
afterEach(() => { globalThis.fetch = realFetch; });

function post(values = {}, ip = '192.0.2.1') {
  return new Request('https://laureati.fr/api/correction', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': ip }, body: new URLSearchParams({ page: '/vignerons/0123456789-exemple/', producer_id: 'producer:exemple', champ: 'adresse', valeur_proposee: '1 rue Exemple', commentaire: '', contact: '', site_web_2: '', 'cf-turnstile-response': 'jeton', ...values }) });
}
test('POST valide stocke la correction et uniquement une empreinte quotidienne de l’IP', async () => {
  const env = environment();
  try {
    const response = await worker.fetch(post(), env);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('Location'), '/correction-merci/');
    assert.equal(await response.text(), '');
    const rows = env.db.prepare('SELECT * FROM correction').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].valeur_proposee, '1 rue Exemple');
    assert.match(rows[0].ip_hash, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(rows).includes('192.0.2.1'));
    assert.match(rows[0].recu_le, /^\d{4}-\d{2}-\d{2}T.*Z$/);
  } finally { env.db.close(); }
});
test('validation stricte refuse les valeurs invalides sans écriture ni reflet', async () => {
  const invalid = [
    { champ: 'inconnu' }, { valeur_proposee: '' }, { valeur_proposee: 'x'.repeat(501) },
    { commentaire: 'x'.repeat(2001) }, { contact: 'x'.repeat(201) }, { producer_id: 'x'.repeat(201) },
    { page: '//evil.test/vignerons/a' }, { page: '/vignerons/../autre/' },
    { page: '/vignerons/%2e%2e/autre/' }, { page: '/appellations/a/?secret=1' },
    { page: '/vignerons/a/#x' }, { page: '/vignerons/a\\b/' },
    { page: 'https://evil.test/vignerons/a' }, { page: '/autre/' }, { extra: 'inconnu' },
  ];
  const env = environment();
  try {
    for (const values of invalid) {
      const response = await worker.fetch(post(values), env);
      assert.equal(response.status, 303);
      assert.ok(response.headers.get('Location').startsWith('/correction-erreur/?motif='), JSON.stringify(values));
      assert.equal(await response.text(), '');
    }
    const duplicate = post();
    const body = `${await duplicate.text()}&champ=nom`;
    const response = await worker.fetch(new Request(duplicate.url, { method: 'POST', headers: duplicate.headers, body }), env);
    assert.ok(response.headers.get('Location').startsWith('/correction-erreur/'));
    assert.equal(env.db.prepare('SELECT count(*) n FROM correction').get().n, 0);
    for (const values of [{ page: '/appellations/exemple/', producer_id: '', valeur_proposee: '😀'.repeat(500), commentaire: 'x'.repeat(2000), contact: 'x'.repeat(200) }, { champ: 'autre' }]) {
      assert.equal((await worker.fetch(post(values), env)).headers.get('Location'), '/correction-merci/');
    }
  } finally { env.db.close(); }
});

test('piège rempli retourne merci sans accès D1', async () => {
  const response = await worker.fetch(post({ site_web_2: 'robot', page: 'invalide' }), {});
  assert.equal(response.headers.get('Location'), '/correction-merci/');
});

test('quota quotidien atomique : dix acceptés même en concurrence, autre IP et autre jour indépendants', async () => {
  const env = environment();
  try {
    const responses = await Promise.all(Array.from({ length: 11 }, () => worker.fetch(post(), env)));
    assert.equal(responses.filter(r => r.headers.get('Location') === '/correction-merci/').length, 10);
    const refused = responses.find(r => r.headers.get('Location') !== '/correction-merci/');
    assert.match(decodeURIComponent(refused.headers.get('Location')), /10.*jour/);
    assert.equal(env.db.prepare('SELECT count(*) n FROM correction').get().n, 10);
    assert.equal((await worker.fetch(post({}, '192.0.2.2'), env)).headers.get('Location'), '/correction-merci/');
    env.db.exec("UPDATE correction SET recu_le = '2000-01-01T00:00:00.000Z'");
    assert.equal((await worker.fetch(post(), env)).headers.get('Location'), '/correction-merci/');
  } finally { env.db.close(); }
});

test('transport borné, erreur D1 générique et assets préservés', async () => {
  const env = environment();
  try {
    for (const request of [new Request('https://laureati.fr/api/correction', { method: 'POST', body: '{}' }), new Request('https://laureati.fr/api/correction', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'x'.repeat(40001) })]) {
      assert.ok((await worker.fetch(request, env)).headers.get('Location').startsWith('/correction-erreur/'));
    }
    const response = await worker.fetch(post(), { DB: { prepare() { throw new Error('private details'); } }, TURNSTILE_SECRET_KEY: 'secret-test' });
    assert.ok(response.headers.get('Location').startsWith('/correction-erreur/'));
    assert.ok(!response.headers.get('Location').includes('private'));
    assert.equal(await (await worker.fetch(new Request('https://laureati.fr/'), env)).text(), 'static');
  } finally { env.db.close(); }
});

test('un site tiers ne peut pas envoyer pour le visiteur ; absence Origin et même origine restent acceptées', async () => {
  for (const headers of [{ Origin: 'https://attaquant.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const request = post();
    for (const [name, value] of Object.entries(headers)) request.headers.set(name, value);
    const foreignEnv = environment();
    try {
      const response = await worker.fetch(request, foreignEnv);
      assert.ok(response.headers.get('Location').startsWith('/correction-erreur/'));
      assert.equal(foreignEnv.db.prepare('SELECT count(*) n FROM correction').get().n, 0);
    } finally { foreignEnv.db.close(); }
  }
  const env = environment();
  try {
    const request = post(); request.headers.set('Origin', 'https://laureati.fr');
    assert.equal((await worker.fetch(request, env)).headers.get('Location'), '/correction-merci/');
  } finally { env.db.close(); }
});

test('GET correction est refusé avant tout accès D1', async () => {
  const response = await worker.fetch(new Request('https://laureati.fr/api/correction'), {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
});
