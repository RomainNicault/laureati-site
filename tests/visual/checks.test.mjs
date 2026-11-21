// Non-régression des portes visuelles sur des pages construites. Exige Chromium (Playwright).
// Usage : node --test tests/visual/*.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { mainText, smallTargets } from './checks.mjs';
import { lighthouseFailures } from './lighthouse.mjs';

test('Lighthouse pur : seuils et mesures absentes ou illisibles', () => {
  const pages = [{ id: 'page', lighthouse: true }, { id: 'hors-mesure' }];
  assert.deepEqual(lighthouseFailures({ page: { performance: 90, accessibility: 95 } }, pages), []);
  for (const [category, threshold] of [['performance', 90], ['accessibility', 95]]) {
    for (const value of [threshold - 0.01, 0, null, undefined, '100', NaN, Infinity, 101, -1]) {
      assert.ok(lighthouseFailures({ page: { performance: 100, accessibility: 100, [category]: value } }, pages).some(f => f.includes(category)), `${category}=${value}`);
    }
  }
  for (const scores of [undefined, null, {}, { page: null }]) assert.equal(lighthouseFailures(scores, pages).length, 2);
});

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const lighthousePages = JSON.parse(readFileSync(new URL('./pages.json', import.meta.url))).filter(p => p.lighthouse).map(p => p.id);
const goodReport = () => ({ gates_ok: true, pages: {}, lighthouse: Object.fromEntries(lighthousePages.map(id => [id, { performance: 90, accessibility: 95 }])) });
test('porte Lighthouse : seuils inclusifs, scores insuffisants et rapports absents ou illisibles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lighthouse-gate-'));
  try {
    const report = goodReport();
    const cases = [
      ['seuil exact', JSON.stringify(report), 0],
      ['performance insuffisante', JSON.stringify({ ...report, lighthouse: { ...report.lighthouse, accueil: { performance: 89, accessibility: 95 } } }), 1],
      ['accessibilité insuffisante', JSON.stringify({ ...report, lighthouse: { ...report.lighthouse, accueil: { performance: 90, accessibility: 94 } } }), 1],
      ['zéro', JSON.stringify({ ...report, lighthouse: { accueil: { performance: 0, accessibility: 0 } } }), 1],
      ['Lighthouse absent', JSON.stringify({ gates_ok: true }), 1],
      ['page absente', JSON.stringify({ ...report, lighthouse: { accueil: report.lighthouse.accueil } }), 1],
      ['JSON illisible', '{', 1],
      ['fichier absent', null, 1],
    ];
    for (const [name, content, expected] of cases) {
      const file = join(dir, name + '.json');
      if (content !== null) writeFileSync(file, content);
      const result = spawnSync(process.execPath, ['tests/visual/gate.mjs', file], { encoding: 'utf8' });
      assert.equal(result.status, expected, `${name}: ${result.stdout} ${result.stderr}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const launch = process.env.CHROME ? { executablePath: process.env.CHROME } : {};
const TEXTE = 'Texte principal lisible. '.repeat(20);

async function sonde(html, fn) {
  const browser = await chromium.launch(launch);
  try {
    const page = await (await browser.newContext({ viewport: { width: 360, height: 780 } })).newPage();
    await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
    return await page.evaluate(fn);
  } finally {
    await browser.close();
  }
}

test('cible : largeur et hauteur contrôlées séparément', async () => {
  assert.equal((await sonde('<a href="/" style="display:inline-block;width:30px;height:44px">x</a>', smallTargets)).length, 1);
  assert.equal((await sonde('<a href="/" style="display:inline-block;width:44px;height:30px">x</a>', smallTargets)).length, 1);
  assert.deepEqual(await sonde('<a href="/" style="display:inline-block;width:44px;height:44px">x</a>', smallTargets), []);
});

test('cible : invisibles ignorées, label cliquable compté, lien de paragraphe exempté', async () => {
  for (const st of ['visibility:hidden', 'opacity:0', 'display:none']) {
    assert.deepEqual(await sonde(`<a href="/" style="display:inline-block;width:30px;height:30px;${st}">x</a>`, smallTargets), [], st);
  }
  assert.deepEqual(await sonde('<label style="display:flex;width:120px;height:44px"><input type="checkbox" style="width:16px;height:16px">Choix</label>', smallTargets), []);
  assert.equal((await sonde('<input type="checkbox" style="width:16px;height:16px">', smallTargets)).length, 1);
  assert.deepEqual(await sonde('<p>Un <a href="/">lien</a> dans le texte.</p>', smallTargets), []);
});

test('cible : aire de carte exemptée seulement avec un lien équivalent conforme hors carte', async () => {
  const carte = '<svg aria-hidden="true" viewBox="0 0 10 10" width="20" height="20"><a tabindex="-1" href="/regions/x/"><path d="M0 0h10v10H0z"/></a></svg>';
  const lien = '<a href="/regions/x/" style="display:inline-block;width:120px;height:44px">X</a>';
  assert.deepEqual(await sonde(carte + lien, smallTargets), []);
  assert.equal((await sonde(carte, smallTargets)).length, 1, 'sans équivalent');
  assert.equal((await sonde(carte + '<a href="/regions/x/" style="display:inline-block;width:20px;height:20px">X</a>', smallTargets)).length, 2, 'équivalent trop petit');
  assert.equal((await sonde(carte.replace(' aria-hidden="true"', '') + lien, smallTargets)).length, 1, 'carte exposée');
  assert.equal((await sonde(carte.replace(' tabindex="-1"', '') + lien, smallTargets)).length, 1, 'aire tabulable');
});

test('contenu sans JavaScript : <main> présent, visible et fourni', async () => {
  assert.ok((await sonde(`<main>${TEXTE}</main>`, mainText)) >= 200);
  assert.equal(await sonde(`<div>${TEXTE}</div>`, mainText), -1);
  for (const st of ['display:none', 'visibility:hidden', 'opacity:0']) {
    assert.equal(await sonde(`<main style="${st}">${TEXTE}</main>`, mainText), -2, st);
  }
  assert.ok((await sonde('<main>court</main>', mainText)) < 200);
});
