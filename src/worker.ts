interface Environment {
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_DISABLED?: string;
  // Uniquement sur une prévisualisation avec les clés de test Cloudflare.
  TURNSTILE_TEST_KEYS?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: { prepare(sql: string): { bind(...values: (string | null)[]): { run(): Promise<{ meta: { changes: number } }> } } };
}

interface ScheduledController {
  scheduledTime: number;
}

type TurnstileVerdict = 'ok' | 'refus' | 'expire' | 'indisponible';

interface TurnstileResult {
  success?: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
  metadata?: { result_with_testing_key?: boolean };
}

// Shared by every Turnstile-protected form. Fails closed when the secret is absent
// or when Cloudflare cannot be reached. A real secret never yields the test-key
// metadata; TURNSTILE_TEST_KEYS only lets a preview built with Cloudflare test keys
// exercise the success path (hostname example.com, no action). It is ignored on the
// production hosts, so a misconfigured production Worker still refuses test tokens.
const PRODUCTION_HOSTS = new Set(['laureati.fr', 'www.laureati.fr']);
const SITEVERIFY_TIMEOUT_MS = 10000;

export async function verifyTurnstile(env: Environment, token: string | null, action: string, hostname: string): Promise<TurnstileVerdict> {
  if (!env.TURNSTILE_SECRET_KEY || env.TURNSTILE_DISABLED === 'true') {
    console.error(JSON.stringify({ turnstile: 'indisponible', cause: env.TURNSTILE_SECRET_KEY ? 'desactive' : 'secret-absent' }));
    return 'indisponible';
  }
  if (!token || token.length > 2048) return 'refus';
  let response: Response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
  } catch (error) {
    const cause = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'delai' : 'reseau';
    console.error(JSON.stringify({ turnstile: 'indisponible', cause }));
    return 'indisponible';
  }
  if (!response.ok) {
    console.error(JSON.stringify({ turnstile: 'indisponible', cause: 'siteverify', status: response.status }));
    return 'indisponible';
  }
  let result: TurnstileResult;
  try {
    result = await response.json() as TurnstileResult;
    if (typeof result !== 'object' || result === null) throw new TypeError('reponse');
  } catch (error) {
    const cause = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'delai' : 'reponse-illisible';
    console.error(JSON.stringify({ turnstile: 'indisponible', cause }));
    return 'indisponible';
  }
  // A refusal is logged with Cloudflare's reason, never the token: without it a
  // wrong secret and a robot look the same in the Worker logs.
  const refuse = (verdict: 'refus' | 'expire', cause: string): TurnstileVerdict => {
    const codes = Array.isArray(result['error-codes'])
      ? result['error-codes'].filter((code): code is string => typeof code === 'string').slice(0, 5).map(code => code.slice(0, 64))
      : [];
    console.warn(JSON.stringify({ turnstile: verdict, cause, codes, action, action_ok: result.action === action, hostname_ok: result.hostname === hostname }));
    return verdict;
  };
  if (!result.success) return refuse(result['error-codes']?.includes('timeout-or-duplicate') ? 'expire' : 'refus', 'siteverify');
  if (result.metadata?.result_with_testing_key === true) {
    return env.TURNSTILE_TEST_KEYS === 'true' && !PRODUCTION_HOSTS.has(hostname) ? 'ok' : refuse('refus', 'cle-de-test');
  }
  if (result.action !== action) return refuse('refus', 'action');
  if (result.hostname !== hostname) return refuse('refus', 'hote');
  return 'ok';
}

function redirect(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path, 'Cache-Control': 'no-store' } });
}

// Calendar months in UTC. A day missing from the target month (29 February) falls
// back to its last day, so retention never exceeds twelve months.
function monthsBefore(date: Date, months: number): Date {
  const shifted = new Date(date.getTime());
  const day = shifted.getUTCDate();
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(day, lastDay));
  return shifted;
}

// Dates are stored as toISOString(), so text comparison is chronological.
export function retention(now: Date): { receivedBefore: string; hashedBefore: string } {
  return {
    receivedBefore: monthsBefore(now, 12).toISOString(),
    hashedBefore: new Date(now.getTime() - 48 * 3600000).toISOString(),
  };
}

// Idempotent: a second run at the same instant deletes and updates nothing.
// Both statements run independently (shortest obligation first); any failure is rethrown after both.
export async function purge(env: Environment, now: Date): Promise<{ deleted: number; anonymized: number }> {
  const { receivedBefore, hashedBefore } = retention(now);
  let anonymized = 0, deleted = 0, failure: unknown = null;
  try {
    anonymized = (await env.DB.prepare('UPDATE correction SET ip_hash = NULL WHERE recu_le < ? AND ip_hash IS NOT NULL').bind(hashedBefore).run()).meta.changes;
  } catch (error) { failure = error; }
  try {
    deleted = (await env.DB.prepare('DELETE FROM correction WHERE recu_le < ?').bind(receivedBefore).run()).meta.changes;
  } catch (error) { failure ??= error; }
  if (failure) throw failure;
  return { deleted, anonymized };
}

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    if (new URL(request.url).pathname === '/api/turnstile') {
      const reply = (status: number, ok = false) => Response.json({ ok }, { status, headers: { 'Cache-Control': 'no-store' } });
      if (request.method !== 'POST') return reply(405);
      if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return reply(403);
      if (!env.TURNSTILE_SECRET_KEY || env.TURNSTILE_DISABLED === 'true') return reply(503);
      try {
        if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply(400);
        const reader = request.body?.getReader(); let body = ''; let size = 0;
        if (reader) while (true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>4096) {await reader.cancel();return reply(400);} body+=new TextDecoder().decode(value); }
        const { token } = JSON.parse(body);
        if (typeof token !== 'string' || !token || token.length > 2048) return reply(400);
        const verdict = await verifyTurnstile(env, token, 'itineraire', new URL(request.url).hostname);
        if (verdict === 'ok') return reply(200, true);
        return reply(verdict === 'indisponible' ? 503 : 403);
      } catch { return reply(503); }
    }
    if (new URL(request.url).pathname !== '/api/correction') return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    const origin = request.headers.get('Origin');
    if ((origin !== null && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
      return redirect(`/correction-erreur/?motif=${encodeURIComponent('Envoyez la correction depuis une page de ce site.')}`);
    }
    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') {
      return redirect(`/correction-erreur/?motif=${encodeURIComponent('Format de formulaire non accepté.')}`);
    }
    try {
    // Bound the stream, including requests without Content-Length.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 40000) {
          await reader.cancel();
          return redirect(`/correction-erreur/?motif=${encodeURIComponent('Formulaire trop volumineux.')}`);
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const form = new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (form.getAll('site_web_2').some(value => value.length > 0)) return redirect('/correction-merci/');
    const allowed = new Set(['page', 'producer_id', 'champ', 'valeur_proposee', 'commentaire', 'contact', 'site_web_2', 'cf-turnstile-response']);
    const length = (value: string) => Array.from(value).length;
    const invalid = [...form].some(([key, value]) => !allowed.has(key) || form.getAll(key).length !== 1 || value.includes('\0'));
    const page = form.get('page') ?? '';
    const value = form.get('valeur_proposee') ?? '';
    if (invalid || !/^\/(vignerons|appellations)\/[a-z0-9]+(?:[-a-z0-9]*[a-z0-9])?\/$/.test(page) || page.length > 500 ||
        !['adresse', 'telephone', 'site', 'nom', 'medaille', 'autre'].includes(form.get('champ') ?? '') ||
        !value.trim() || length(value) > 500 || length(form.get('commentaire') ?? '') > 2000 ||
        length(form.get('contact') ?? '') > 200 || length(form.get('producer_id') ?? '') > 200 ||
        length(form.get('cf-turnstile-response') ?? '') > 2048) {
      return redirect(`/correction-erreur/?motif=${encodeURIComponent('Formulaire invalide. Vérifiez les champs et leurs longueurs.')}`);
    }
    const token = form.get('cf-turnstile-response');
    const verdict = await verifyTurnstile(env, token, 'correction', new URL(request.url).hostname);
    if (verdict !== 'ok') {
      const motif = verdict === 'indisponible'
        ? 'Vérification anti-robot indisponible. Réessayez plus tard.'
        : verdict === 'expire'
          ? 'Vérification anti-robot expirée. Rechargez la page et réessayez.'
          : token ? 'Vérification anti-robot refusée. Rechargez la page et réessayez.' : 'Vérification anti-robot absente. Rechargez la page et réessayez.';
      return redirect(`/correction-erreur/?motif=${encodeURIComponent(motif)}`);
    }
    const now = new Date().toISOString();
    // Public salt, not a credential. Rotate the digest every UTC day.
    const input = `${request.headers.get('CF-Connecting-IP') ?? 'unknown'}${now.slice(0, 10)}laureati-correction-v1`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    // One SQL statement makes the quota check and insert indivisible in D1.
    const result = await env.DB.prepare(`INSERT INTO correction (recu_le, page, producer_id, champ, valeur_proposee, commentaire, contact, ip_hash)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM correction WHERE ip_hash = ? AND recu_le >= ? AND recu_le < ?) < 10`).bind(now, page, form.get('producer_id') || null,
      form.get('champ'), value, form.get('commentaire') ?? '', form.get('contact') || null, hash,
      hash, `${now.slice(0, 10)}T00:00:00.000Z`, new Date(Date.parse(`${now.slice(0, 10)}T00:00:00.000Z`) + 86400000).toISOString()).run();
    if (result.meta.changes === 0) return redirect(`/correction-erreur/?motif=${encodeURIComponent('Limite de 10 envois par jour atteinte. Réessayez demain.')}`);
    return redirect('/correction-merci/');
    } catch {
      // Never log the request, raw IP, submitted fields or database error.
      return redirect(`/correction-erreur/?motif=${encodeURIComponent('Envoi impossible pour le moment. Réessayez plus tard.')}`);
    }
  },

  // Daily Cron Trigger: no request, no assets, no response.
  async scheduled(controller: ScheduledController, env: Environment): Promise<void> {
    try {
      // Counts only: no personal data in logs.
      console.log(JSON.stringify({ purge: await purge(env, new Date(controller.scheduledTime)) }));
    } catch (error) {
      console.error('purge échouée');
      throw error;
    }
  },
};
