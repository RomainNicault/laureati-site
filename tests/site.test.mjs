import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { dataset } from '../src/lib/data.ts';

const htmlFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? htmlFiles(path) : path.endsWith('.html') ? [path] : [];
});
const html = (url) => readFileSync(join('dist', url, 'index.html'), 'utf8');
const schemas = (page) => [...page.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));

test('le site est statique, français, indexable hors pages techniques et indexé par Pagefind', () => {
  assert.ok(existsSync('dist/pagefind/pagefind.js'));
  assert.ok(existsSync('dist/sitemap-index.xml'));
  const pages = htmlFiles('dist');
  // 10 pages fixes : accueil, recherche, méthodologie, itinéraire, mentions, confidentialité, 404, deux retours de correction, guide de style.
  // Puis concours : index, une page par concours et une par campagne absorbée.
  const campaignPages = dataset.competitions.reduce((total, competition) => total + competition.campagnes_absorbees.length, 0);
  assert.equal(pages.length, 10 + 1 + dataset.competitions.length + campaignPages
    + dataset.producers.length + dataset.appellations.length + dataset.regions.length);
  for (const path of pages) {
    const page = readFileSync(path, 'utf8');
    assert.match(page, /<html lang="fr"/);
    if (/\/(styleguide|correction-merci|correction-erreur)\/|\/404\.html$/.test(path)) assert.match(page, /<meta name="robots" content="noindex"/, path);
    else assert.doesNotMatch(page, /<meta name="robots"/, path);
    if (path.endsWith('/404.html')) {
      // Servie à toute adresse inconnue : ni canonique ni fil d'Ariane.
      assert.doesNotMatch(page, /rel="canonical"|og:url|class="crumbs"/, path);
      assert.ok(!schemas(page).some(s => s['@type'] === 'BreadcrumbList'), path);
    } else {
      assert.match(page, /<link rel="canonical" href="https:\/\/laureati.fr\//);
      assert.ok(schemas(page).some(s => s['@type'] === 'BreadcrumbList'));
    }
    assert.doesNotMatch(page, /fonts\.googleapis|fonts\.gstatic/);
    assert.equal(page.includes('data-pagefind-body'), /\/vignerons\/|\/appellations\//.test(path), path);
    const executable = [...page.matchAll(/<script\b([^>]*)>/g)].filter(([, attrs]) => !attrs.includes('application/ld+json'));
    if (/\/vignerons\/|\/appellations\/|\/styleguide\//.test(path)) {
      assert.ok(executable.length <= 1, path);
      for (const [, attrs] of executable) assert.match(attrs, /type="module"/, path);
      assert.doesNotMatch(page, /<script[^>]+src=/, path);
      if (executable.length) assert.ok(page.includes('data-turnstile-sitekey'), path);
    } else if (!path.includes('/recherche/') && !path.includes('/itineraire/')) assert.equal(executable.length, 0, path);
  }
});

test('la fiche suit les positions exportées et réserve la correction', () => {
  for (const p of dataset.producers) {
    const page = html(p.url);
    assert.equal((page.match(/class="medal /g) ?? []).length, p.medailles.length, 'toutes les médailles restent affichées');
    const missingLabels = p.medailles.filter(m => !dataset.appellations.some(a => a.id === m.appellation_id)).length;
    assert.equal((page.match(/Appellation hors classement : libellé non fourni/g) ?? []).length, missingLabels);
    assert.doesNotMatch(page, /appellation:[a-f0-9]{64}/, 'un identifiant technique ne remplace pas un libellé public');
    assert.match(page, /href="#correction"/);
    assert.match(page, /id="correction"/);
    const winery = schemas(page).find(s => s['@type'] === 'Winery');
    assert.equal(winery.name, p.nom);
    if (p.latitude !== undefined && p.longitude !== undefined) {
      assert.equal(winery.geo.latitude, p.latitude);
      assert.ok(page.includes('https://www.openstreetmap.org/?mlat='));
    }
    if (p.telephone) assert.ok(page.includes('href="tel:'));
    if (p.vigneron_independant) assert.ok(page.includes('Vigneron Indépendant'));
    if (p.groupe) assert.ok(page.includes(`Domaine détenu par ${p.groupe}`));
    else assert.ok(!page.includes('class="flag-groupe"'));
    const scores = [...page.matchAll(/data-position-score="([^"]+)"/g)].map(m => Number(m[1]));
    assert.deepEqual(scores, [...p.appellations].sort((a,b) => b.score-a.score).map(x => x.score));
    for (const position of p.appellations) {
      assert.ok(page.includes(`Rang ${position.rang} / ${position.total_vignerons_medailles}`));
    }
    assert.equal((page.match(/class="top5"/g) ?? []).length, p.appellations.filter(x => x.top5).length);
  }
});

test('les classements ont leurs ancres, médailles, fraîcheur et ItemList', () => {
  for (const a of dataset.appellations) {
    const page = html(`/appellations/${a.slug}/`);
    assert.ok(page.includes('vignerons médaillés recensés, pas tous les producteurs'));
    if (!a.regions?.length) {
      assert.ok(page.includes('Aucune région rattachée dans les données.'));
      assert.doesNotMatch(page, /href="\/regions\//);
    }
    const lists = schemas(page).find(s => s['@graph'])['@graph'];
    for (const group of a.classements) {
      assert.ok(page.includes(`id="${group.ancre}"`));
      const list = lists.find(s => s['@id'].endsWith(`#${group.ancre}`));
      assert.deepEqual(list.itemListElement.map(x => x.position), group.vignerons.map(x => x.rang));
    }
    assert.ok(page.includes('/methodologie/'));
    assert.ok(page.includes('Dernière campagne'));
  }
  for (const r of dataset.regions) {
    const page = html(`/regions/${r.slug}/`);
    for (const id of r.appellations) {
      const a = dataset.appellations.find(x => x.id === id);
      assert.ok(page.includes(`/appellations/${a.slug}/`));
    }
  }
});
