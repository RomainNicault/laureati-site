import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/worker.ts';
import { environment } from './d1.mjs';

function post(values = {}, ip = '192.0.2.9', origin = 'https://laureati.fr') {
  return new Request(`${origin}/api/correction`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': ip }, body: new URLSearchParams({ page: '/vignerons/0123456789-exemple/', producer_id: 'producer:exemple', champ: 'adresse', valeur_proposee: '1 rue Exemple', commentaire: '', contact: '', site_web_2: '', ...values }) });
}
const motif = (response) => new URL(response.headers.get('Location') ?? '/', 'https://laureati.test').searchParams.get('motif');
const rows = (env) => env.db.prepare('SELECT count(*) n FROM correction').get().n;

async function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await run(); } finally { globalThis.fetch = original; }
}

test('jeton valide : vérifié avant écriture, une seule ligne, secret et jeton transmis', async () => {
  const env = environment();
  let seen;
  try {
    const response = await withFetch(async (url, init) => {
      seen = { url: String(url), body: init.body };
      return Response.json({ success: true, action: 'correction', hostname: 'laureati.fr' });
    }, () => worker.fetch(post({ 'cf-turnstile-response': 'jeton-valide' }), env));
    assert.equal(response.headers.get('Location'), '/correction-merci/');
    assert.equal(rows(env), 1);
    assert.equal(seen.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(seen.body.get('secret'), 'secret-test');
    assert.equal(seen.body.get('response'), 'jeton-valide');
  } finally { env.db.close(); }
});

test('jeton refusé : aucune écriture D1 et motif explicite', async () => {
  const env = environment();
  try {
    const response = await withFetch(async () => Response.json({ success: false, 'error-codes': ['invalid-input-response'] }), () => worker.fetch(post({ 'cf-turnstile-response': 'faux' }), env));
    assert.equal(rows(env), 0);
    assert.match(motif(response), /refusée/);
  } finally { env.db.close(); }
});

test('jeton expiré : aucune écriture D1 et motif dédié', async () => {
  const env = environment();
  try {
    const response = await withFetch(async () => Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] }), () => worker.fetch(post({ 'cf-turnstile-response': 'expire' }), env));
    assert.equal(rows(env), 0);
    assert.match(motif(response), /expirée/);
  } finally { env.db.close(); }
});

test('réseau en panne : aucune écriture D1, motif indisponible, journal sans secret ni jeton', async () => {
  const env = environment();
  const logs = [];
  const original = console.error;
  console.error = (...args) => logs.push(args.join(' '));
  try {
    const response = await withFetch(async () => { throw new Error('réseau'); }, () => worker.fetch(post({ 'cf-turnstile-response': 'jeton-secret' }), env));
    assert.equal(rows(env), 0);
    assert.match(motif(response), /indisponible/);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /reseau/);
    assert.ok(!logs.join(' ').includes('secret-test'));
    assert.ok(!logs.join(' ').includes('jeton-secret'));
  } finally { console.error = original; env.db.close(); }
});

test('secret absent : refus immédiat, aucune requête siteverify, journalisation', async () => {
  const env = environment();
  delete env.TURNSTILE_SECRET_KEY;
  let calls = 0;
  const logs = [];
  const original = console.error;
  console.error = (...args) => logs.push(args.join(' '));
  try {
    const response = await withFetch(async () => { calls++; return Response.json({ success: true }); }, () => worker.fetch(post({ 'cf-turnstile-response': 'jeton' }), env));
    assert.equal(calls, 0);
    assert.equal(rows(env), 0);
    assert.match(motif(response), /indisponible/);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /secret-absent/);
  } finally { console.error = original; env.db.close(); }
});

test('hôte inattendu ou action différente : aucune écriture', async () => {
  for (const result of [
    { success: true, action: 'correction', hostname: 'attaquant.example' },
    { success: true, action: 'itineraire', hostname: 'laureati.fr' },
    { success: true, hostname: 'laureati.fr' },
  ]) {
    const env = environment();
    try {
      const response = await withFetch(async () => Response.json(result), () => worker.fetch(post({ 'cf-turnstile-response': 'jeton' }), env));
      assert.equal(rows(env), 0);
      assert.match(motif(response), /refusée/);
    } finally { env.db.close(); }
  }
});

test('jeton absent : aucune requête siteverify et aucune écriture', async () => {
  const env = environment();
  let calls = 0;
  try {
    const response = await withFetch(async () => { calls++; return Response.json({ success: true }); }, () => worker.fetch(post(), env));
    assert.equal(calls, 0);
    assert.equal(rows(env), 0);
    assert.match(motif(response), /absente/);
  } finally { env.db.close(); }
});

test('clés de test Cloudflare : acceptées uniquement avec TURNSTILE_TEST_KEYS', async () => {
  const result = { success: true, hostname: 'example.com', metadata: { result_with_testing_key: true } };
  const strict = environment();
  try {
    const response = await withFetch(async () => Response.json(result), () => worker.fetch(post({ 'cf-turnstile-response': 'test' }), strict));
    assert.equal(rows(strict), 0);
    assert.match(motif(response), /refusée/);
  } finally { strict.db.close(); }
  const preview = { ...environment(), TURNSTILE_TEST_KEYS: 'true' };
  try {
    const response = await withFetch(async () => Response.json(result), () => worker.fetch(post({ 'cf-turnstile-response': 'test' }, '192.0.2.9', 'https://feat-turnstile-correction-laureati-site.romain-c96.workers.dev'), preview));
    assert.equal(response.headers.get('Location'), '/correction-merci/');
    assert.equal(rows(preview), 1);
  } finally { preview.db.close(); }
});

test('TURNSTILE_DISABLED ferme le formulaire même avec un jeton valide', async () => {
  const env = { ...environment(), TURNSTILE_DISABLED: 'true' };
  let calls = 0;
  const original = console.error;
  console.error = () => {};
  try {
    const response = await withFetch(async () => { calls++; return Response.json({ success: true }); }, () => worker.fetch(post({ 'cf-turnstile-response': 'jeton' }), env));
    assert.equal(calls, 0);
    assert.equal(rows(env), 0);
    assert.match(motif(response), /indisponible/);
  } finally { console.error = original; env.db.close(); }
});

test('TURNSTILE_TEST_KEYS ignoré sur laureati.fr et www.laureati.fr', async () => {
  const result = { success: true, hostname: 'example.com', metadata: { result_with_testing_key: true } };
  for (const origin of ['https://laureati.fr', 'https://www.laureati.fr']) {
    const env = { ...environment(), TURNSTILE_TEST_KEYS: 'true' };
    try {
      const response = await withFetch(async () => Response.json(result), () => worker.fetch(post({ 'cf-turnstile-response': 'test' }, '192.0.2.9', origin), env));
      assert.equal(rows(env), 0, origin);
      assert.match(motif(response), /refusée/);
    } finally { env.db.close(); }
  }
});

async function indisponible(handler) {
  const env = environment();
  const logs = [];
  const original = console.error;
  console.error = (...args) => logs.push(args.join(' '));
  try {
    const response = await withFetch(handler, () => worker.fetch(post({ 'cf-turnstile-response': 'jeton-secret' }), env));
    assert.equal(rows(env), 0);
    assert.equal(response.status, 303);
    assert.match(motif(response), /indisponible/);
    assert.equal(logs.length, 1);
    assert.ok(!logs[0].includes('secret-test') && !logs[0].includes('jeton-secret'));
    return JSON.parse(logs[0]);
  } finally { console.error = original; env.db.close(); }
}

test('Siteverify en 5xx : aucune écriture D1, motif indisponible, statut journalisé', async () => {
  for (const status of [500, 503]) {
    const log = await indisponible(async () => new Response('erreur', { status }));
    assert.deepEqual(log, { turnstile: 'indisponible', cause: 'siteverify', status });
  }
});

test('Siteverify renvoie un JSON illisible : aucune écriture D1, motif indisponible', async () => {
  for (const body of ['<html>pas du JSON</html>', 'null', '']) {
    const log = await indisponible(async () => new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }));
    assert.equal(log.cause, 'reponse-illisible');
  }
});

test('Siteverify dépasse le délai : requête annulée par AbortSignal, aucune écriture D1', async () => {
  const timeout = AbortSignal.timeout;
  let requested;
  AbortSignal.timeout = (ms) => { requested = ms; return timeout.call(AbortSignal, 5); };
  try {
    const log = await indisponible((url, init) => new Promise((resolve, reject) => {
      assert.ok(init.signal instanceof AbortSignal);
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }));
    assert.equal(requested, 10000);
    assert.equal(log.cause, 'delai');
  } finally { AbortSignal.timeout = timeout; }
});
