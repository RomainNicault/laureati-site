import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { texteSchema } from '../src/lib/textes.ts';
import { urlAutorisee, violationsMarkdown } from '../src/lib/markdown-guard.mjs';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

const fixtureRoot = resolve('tests/fixtures/textes');
let out;
function buildFixture() {
  if (out) return out;
  out = mkdtempSync(join(tmpdir(), 'laureati-textes-'));
  execFileSync(process.execPath, [resolve('node_modules/astro/bin/astro.mjs'), 'build',
    '--outDir', out, '--force'], {
    cwd: process.cwd(),
    env: { ...process.env, LAUREATI_TEXTES_ROOT: fixtureRoot },
    stdio: 'pipe', timeout: 180000,
  });
  return out;
}
const page = (path) => readFileSync(join(buildFixture(), path, 'index.html'), 'utf8');
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('un texte d’appellation suit le classement et « Pourquoi ce classement ? », avec ses sources', () => {
  const html = page('/appellations/morgon/');
  const editorial = html.indexOf('class="editorial"');
  const ranking = html.indexOf('class="ranking"');
  const why = html.indexOf('class="why"');
  const sources = html.indexOf('>Sources<');
  const correction = html.indexOf('id="correction"');
  assert.ok(editorial > 0, 'texte rendu');
  assert.ok(ranking > 0 && ranking < why && why < editorial, 'classement, puis « Pourquoi ce classement ? », puis texte');
  assert.ok(sources > editorial && sources < correction, 'sources après le texte et avant la correction');
  assert.ok(text(html).includes('Fixture de test. Le Morgon est une appellation de cru du Beaujolais'), 'corps rendu');
  assert.ok(html.includes('https://www.inao.gouv.fr/'), 'lien de source');
  assert.ok(html.includes('Texte mis à jour le'), 'date de mise à jour');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), [], 'identifiants uniques malgré un titre « Sources »');
  assert.match(html, /aria-labelledby="sources-editoriales"/);
  assert.match(html, /<h2 id="sources-editoriales">/);
  assert.doesNotMatch(html, /rel="noopener/, 'pas de rel inutile sans target');
});

test('un texte de région et un texte de concours suivent la même règle', () => {
  const region = page('/regions/beaujolais/');
  assert.ok(region.indexOf('class="editorial"') > 0);
  assert.ok(region.indexOf('class="editorial"') < region.indexOf('id="appellations"'));
  assert.match(region, />Sources</);
  const concours = page('/concours/cga/');
  assert.ok(concours.indexOf('class="editorial"') > 0);
  assert.ok(concours.indexOf('class="editorial"') < concours.indexOf('id="bareme"'));
  assert.match(concours, />Sources</);
});

test('sans texte, la page reste inchangée', () => {
  const html = page('/appellations/chateauneuf-du-pape/');
  assert.doesNotMatch(html, /class="editorial"/);
  assert.doesNotMatch(html, />Sources</);
});

test('le schéma refuse un frontmatter incomplet ou invalide', () => {
  const valid = {
    type: 'appellation', slug: 'morgon', nom: 'Morgon', statut: 'relu',
    sources: [{ titre: 'INAO', url: 'https://www.inao.gouv.fr/' }], maj: '2026-11-15',
  };
  assert.equal(texteSchema.safeParse(valid).success, true);
  assert.equal(texteSchema.safeParse({ ...valid, maj: new Date('2026-11-15') }).data.maj, '2026-11-15');
  for (const invalid of [
    { ...valid, sources: undefined },
    { ...valid, sources: [{ titre: 'INAO', url: 'ftp://example.org/' }] },
    { ...valid, sources: [{ titre: 'INAO', url: 'http://www.inao.gouv.fr/' }] },
    { ...valid, sources: [{ titre: 'INAO', url: 'https://example.org/"onmouseover="x' }] },
    { ...valid, slug: 'Morgon' },
    { ...valid, maj: '2026-13-01' },
    { ...valid, type: 'cepage' },
    { ...valid, nom: '' },
  ]) assert.equal(texteSchema.safeParse(invalid).success, false, JSON.stringify(invalid));
});

const mdast = (markdown) => unified().use(remarkParse).use(remarkGfm).parse(markdown);

test('la garde Markdown refuse HTML, images et liens hors https://, / et #', () => {
  for (const piege of [
    '<script>alert(1)</script>',
    '<iframe src="https://example.org/"></iframe>',
    'Texte <img src="x" onerror="alert(1)"> inline.',
    'Texte <span onclick="x">inline</span>.',
    '![image](https://example.org/x.png)',
    '![ref][i]\n\n[i]: https://example.org/x.png',
    '[lien](javascript:alert(1))',
    '[lien](JAVASCRIPT:alert(1))',
    '[lien](data:text/html;base64,PHNjcmlwdD4=)',
    '[lien](http://example.org/)',
    '[lien](//example.org/)',
    '[lien](/\\example.org/)',
    '[lien](mailto:a@example.org)',
    '[ref][r]\n\n[r]: javascript:alert(1)',
    '<javascript:alert(1)>',
    'www.example.org',
  ]) assert.ok(violationsMarkdown(mdast(piege)).length > 0, piege);
  for (const sain of [
    'Un **texte** avec [une source](https://www.inao.gouv.fr/), [une page](/methodologie/) et [une ancre](#rouge).',
    '- liste\n- [interne](/appellations/morgon/#rouge)',
  ]) assert.deepEqual(violationsMarkdown(mdast(sain)), [], sain);
  assert.equal(urlAutorisee('https://example.org/'), true);
  assert.equal(urlAutorisee(' https://example.org/'), false);
});

test('un texte piégé fait échouer le build', () => {
  const evilOut = mkdtempSync(join(tmpdir(), 'laureati-piege-'));
  let failure;
  try {
    execFileSync(process.execPath, [resolve('node_modules/astro/bin/astro.mjs'), 'build', '--outDir', evilOut, '--force'], {
      cwd: process.cwd(),
      env: { ...process.env, LAUREATI_TEXTES_ROOT: resolve('tests/fixtures/textes-piegees') },
      stdio: 'pipe', timeout: 180000,
    });
  } catch (error) {
    failure = error;
  } finally {
    rmSync(evilOut, { recursive: true, force: true });
  }
  assert.ok(failure, 'le build aurait dû échouer');
  assert.notEqual(failure.status, 0);
  const log = `${failure.stdout}${failure.stderr}`;
  assert.match(log, /Markdown éditorial refusé/);
  for (const motif of ['HTML brut interdit', 'image interdite', 'javascript:', 'data:text/html', '//example.org/', 'http://example.org/']) {
    assert.ok(log.includes(motif), motif);
  }
});
