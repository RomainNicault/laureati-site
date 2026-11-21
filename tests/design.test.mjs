import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { dataset } from '../src/lib/data.ts';
import { colorAnchor, safeWebsite } from '../src/lib/site.ts';
import { displayPlace, producerType } from '../src/lib/ui.ts';
import { candidatesUne } from '../src/lib/une.ts';

const page = (path = '') => readFileSync(join('dist', path, 'index.html'), 'utf8');
const htmlFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? htmlFiles(path) : path.endsWith('.html') ? [path] : [];
});
const regionPath = r => `/regions/${r.slug}/`;
const appellationPath = a => `/appellations/${a.slug}/`;
const producers = new Map(dataset.producers.map(p => [p.url, p]));
const appellations = new Map(dataset.appellations.map(a => [a.id, a]));
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&#39;');
const href = value => `href="${escapeHtml(value)}"`;
// Lignes compactes de vignerons (hors positions de fiche).
const cards = html => [...html.matchAll(/<article class="rank-row(?: rank-row--lead)?">(.*?)<\/article>/gs)].map(m => m[1]);
const positions = html => [...html.matchAll(/<a class="position"[^>]*>.*?<\/a>/gs)].map(m => m[0]);
const mapLinks = html => [...(html.match(/<figure class="carte">.*?<\/figure>/s)?.[0] ?? '').matchAll(/<a tabindex="-1" href="([^"]+)"/g)].map(m => m[1]);
const before = (html, first, second) => {
  assert.ok(html.includes(first), first);
  assert.ok(html.includes(second), second);
  assert.ok(html.indexOf(first) < html.indexOf(second), `${first} avant ${second}`);
};

function assertActions(html, producer, missingPhone = false) {
  const call = html.match(/<a class="[^"]*\bact-call\b[^"]*"[^>]*>/g) ?? [];
  assert.equal(call.length, producer.telephone ? 1 : 0, `${producer.url} : appel`);
  if (producer.telephone) assert.ok(call[0].includes(href(`tel:${producer.telephone.replace(/[^+0-9]/g, '')}`)));
  else if (missingPhone) assert.match(html, /class="note contact-missing"[^>]*>Téléphone non renseigné/);
  const site = html.match(/<a class="[^"]*\bact-site\b[^"]*"[^>]*>/g) ?? [];
  const website = safeWebsite(producer.site);
  assert.equal(site.length, website ? 1 : 0, `${producer.url} : site`);
  if (website) assert.ok(site[0].includes(href(website)));
  const routes = [...html.matchAll(/<details class="route act-route">(.*?)<\/details>/gs)];
  const geolocated = producer.latitude !== undefined && producer.longitude !== undefined;
  assert.equal(routes.length, geolocated ? 1 : 0, `${producer.url} : itinéraires`);
  if (geolocated) {
    const ll = `${producer.latitude},${producer.longitude}`;
    const links = [...routes[0][1].matchAll(/<a\b[^>]*>.*?<\/a>/gs)].map(m => m[0]);
    assert.equal(links.length, 3);
    for (const [label, url] of [
      ['Apple Plans', `https://maps.apple.com/?daddr=${ll}`],
      ['Google Maps', `https://www.google.com/maps/dir/?api=1&destination=${ll}`],
      ['Waze', `https://waze.com/ul?ll=${ll}&navigate=yes`],
    ]) assert.ok(links.some(link => link.includes(href(url)) && link.includes(label)), `${producer.url} : ${label}`);
  }
}

test('l’accueil : promesse et recherche, carte des régions, trois classements à la une, confiance', () => {
  const html = page();
  before(html, 'class="promise"', 'class="search"');
  before(html, 'class="search"', '<figure class="carte">');
  before(html, '<figure class="carte">', 'id="une"');
  before(html, 'id="une"', 'id="confiance"');
  assert.doesNotMatch(html, /podium-card|class="steps"|method-card/);
  // Carte : chaque région a son aire, liée à sa page, et la liste voisine porte les mêmes liens.
  const links = mapLinks(html);
  assert.deepEqual([...links].sort(), dataset.regions.map(regionPath).sort());
  for (const r of dataset.regions) assert.ok(html.includes(`<a href="${regionPath(r)}">`), r.slug);
  // Appellations sans région (cidre, poiré, pommeau) : liées depuis l'accueil.
  const inRegion = new Set(dataset.regions.flatMap(r => r.appellations));
  for (const a of dataset.appellations.filter(x => !inRegion.has(x.id))) assert.ok(html.includes(href(appellationPath(a))), a.slug);
  // À la une : trois classements au plus, tirés parmi les appellations connues, en top 3 compact.
  const candidates = new Map(candidatesUne(dataset.appellations).map(c => [`${appellationPath(c.appellation)}#${c.group.ancre}`, c]));
  const une = html.split('<article class="une"').slice(1).map(block => block.split('class="une__more"')[0]);
  assert.equal(une.length, Math.min(3, candidates.size));
  for (const block of une) {
    const destination = block.match(/<h3><a href="([^"]+)"/)[1];
    assert.ok(candidates.has(destination), destination);
    assert.equal(cards(block).length, Math.min(3, candidates.get(destination).group.vignerons.length));
  }
});

test('chaque ligne de classement porte score, médailles, commune et actions adaptées', () => {
  const paths = ['', ...dataset.appellations.map(appellationPath)];
  for (const path of paths) {
    const html = page(path);
    const entries = cards(html);
    assert.ok(entries.length > 0, path || 'accueil');
    assert.match(html, /\/methodologie\//);
    for (const card of entries) {
      const url = card.match(/<h[34] class="rank-row__name"><a href="([^"]+)"/)[1];
      const producer = producers.get(url);
      assert.ok(producer, url);
      assert.match(card, /class="rank-row__score"><strong>[^<]+<\/strong><span>points concours<\/span>/);
      assert.match(card, /class="tally"/);
      assert.ok(card.includes(`<p class="rank-row__place">${escapeHtml(displayPlace(producer.commune) ?? 'Commune non renseignée')}`), url);
      assert.match(card, /<details class="rank-row__more">/);
      assertActions(card, producer, true);
    }
  }
});

test('la région : texte, carte de ses appellations et liste complète, sans classement de vignerons', () => {
  const built = new Set(dataset.appellations.map(appellationPath));
  for (const r of dataset.regions) {
    const region = page(regionPath(r));
    before(region, '<h1>', 'id="appellations"');
    assert.equal(cards(region).length, 0, r.slug);
    const expected = r.appellations.map(id => appellationPath(appellations.get(id)));
    const list = [...region.matchAll(/<li id="ap-[^"]+"[^>]*>\s*<a href="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual([...list].sort(), [...expected].sort(), r.slug);
    const links = mapLinks(region);
    assert.ok(links.length > 0, `${r.slug} : carte`);
    for (const link of links) {
      assert.ok(built.has(link), `${r.slug} : ${link}`);
      assert.ok(expected.includes(link), `${r.slug} : ${link} hors région`);
    }
    // Légende : la pastille de la liste reprend la couleur de la zone sur la carte.
    const fills = new Map([...region.matchAll(/<a tabindex="-1" href="([^"]+)">(?:(?!<\/a>)[\s\S])*?fill="(#[0-9a-fA-F]+)"/g)].map(m => [m[1], m[2]]));
    const keys = new Map([...region.matchAll(/<li id="ap-[^"]+"[^>]*>\s*<a href="([^"]+)"><strong><span class="carte-cle" style="--cle: (#[0-9a-fA-F]+)"/g)].map(m => [m[1], m[2]]));
    assert.equal(fills.size, links.length, `${r.slug} : couleur de chaque aire`);
    assert.deepEqual(keys, fills, `${r.slug} : légende`);
    // Repérage sans JavaScript : chaque aire a sa ligne marquée et sa règle de survol dans l'en-tête.
    const marquees = [...region.matchAll(/<li id="ap-[^"]+" data-aire>\s*<a href="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual([...marquees].sort(), [...fills.keys()].sort(), `${r.slug} : lignes repérées`);
    const tete = region.slice(0, region.indexOf('</head>'));
    for (const link of fills.keys()) assert.ok(tete.includes(`.carte__svg a[href="${link}"] path{`), `${r.slug} : repérage ${link}`);
    assert.match(region, /Contour indicatif, sans portée juridique/);
  }
});

test('les classements nomment les points, déplient le détail et bornent leur portée', () => {
  for (const a of dataset.appellations) {
    const app = page(appellationPath(a));
    assert.match(app, /pas une note sur 20/);
    assert.match(app, /<details class="rank-row__more">/);
    assert.equal((app.match(/pas tous les producteurs/g) ?? []).length, 1, a.slug);
    assert.equal((app.match(/<details class="why"/g) ?? []).length, 1, a.slug);
    before(app, 'class="promise"', 'class="ranking"');
    const lastRanking = app.lastIndexOf('class="ranking"');
    assert.ok(lastRanking < app.indexOf('class="why"'), `${a.slug} : « Pourquoi ce classement ? » sous les listes`);
    before(app, 'class="why"', 'id="correction"');
    assert.doesNotMatch(app, /score__gauge|leaders-panel|rank-card/);
    assert.equal(app.includes('notice-band'), dataset.meta.perimetre === 'fictif', a.slug);
    for (const g of a.classements) assert.ok(cards(app.slice(app.indexOf(`id="${g.ancre}"`))).length >= Math.min(g.vignerons.length, 1));
  }
});

test('la fiche : identité et type, synthèse, actions, coordonnées, classements compacts, médailles repliées', () => {
  for (const producer of dataset.producers) {
    const profile = page(producer.url);
    const entries = positions(profile);
    assert.equal(entries.length, producer.appellations.length, producer.url);
    const expected = producer.appellations.map(p => `${appellationPath(appellations.get(p.appellation_id))}#${colorAnchor(p.couleur)}`);
    assert.deepEqual(entries.map(p => p.match(/href="([^"]+)"/)[1]).sort(), expected.sort());
    const type = producerType(producer);
    if (type) assert.ok(profile.includes(`<span class="profile-type">${escapeHtml(type)}</span>`), producer.url);
    if (producer.type_producteur?.probable) assert.match(profile, /\(probable\)<\/span>/);
    before(profile, '<h1>', 'class="profile-summary"');
    before(profile, 'class="profile-summary"', 'class="contact-strip"');
    before(profile, 'class="contact-strip"', 'id="classements"');
    before(profile, 'data-stamp__date', 'id="classements"');
    before(profile, 'id="classements"', '<details class="medals-fold">');
    before(profile, '<details class="medals-fold">', 'class="why"');
    before(profile, 'class="why"', 'id="correction"');
    assert.match(profile, /id="medailles"/);
    const header = profile.match(/<header class="container profile-head">(.*?)<\/header>/s);
    assert.ok(header);
    assertActions(header[1].split('class="contact-strip"')[0], producer);
  }
});

test('les couleurs restent des ancres non collantes vers leurs classements', () => {
  const css = readFileSync('src/styles/global.css', 'utf8');
  assert.doesNotMatch(css, /[^{}]*\.color-nav\b[^{}]*\{[^}]*position:\s*(?:sticky|fixed)/s);
  const multicolor = dataset.appellations.filter(a => a.classements.length > 1);
  assert.ok(multicolor.length > 0, 'au moins une navigation de couleurs est exercée');
  for (const a of multicolor) {
    const html = page(appellationPath(a));
    const nav = html.match(/<nav class="color-nav"[^>]*>(.*?)<\/nav>/s);
    assert.ok(nav, a.slug);
    const links = [...nav[1].matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(links, a.classements.map(g => g.ancre));
    for (const anchor of links) assert.ok(html.includes(`id="${anchor}"`));
  }
});

test('les années des médailles désignent le concours et non le millésime du vin', () => {
  for (const producer of dataset.producers) {
    const html = page(producer.url);
    assert.match(html, /millésime du vin n’est pas renseigné/);
    assert.match(html, /année ci-dessous est celle du concours/);
    for (const year of new Set(producer.medailles.map(m => m.annee))) assert.ok(html.includes(`Concours ${year}`), producer.url);
  }
});

test('les couleurs et les tailles de texte suivent DESIGN.md', () => {
  const design = readFileSync('DESIGN.md', 'utf8');
  const css = readFileSync('src/styles/tokens.css', 'utf8');
  const colors = design.match(/\ncolors:\n(.*?)\ntypography:/s)[1];
  const palette = [...colors.matchAll(/^  ([\w-]+): "(#[A-Fa-f0-9]{6})"$/gm)];
  assert.ok(palette.length > 0);
  for (const [, name, value] of palette) {
    const token = /^(medal|tone)-/.test(name) ? name : `color-${name}`;
    assert.equal(css.match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1], value, token);
  }
  for (const [token, style] of [['xs', 'body-sm'], ['sm', 'body-sm'], ['md', 'body-md'], ['lg', 'body-lg']]) {
    const size = design.match(new RegExp(`\\n  ${style}:\\n(?:    .*\\n)*?    fontSize: ([^\\n]+)`))?.[1];
    assert.ok(size, style);
    assert.equal(css.match(new RegExp(`--text-${token}:\\s*([^;]+);`))?.[1], size, token);
  }
});

test('chaque fiche affiche son propre code postal complet, jamais réduit au département', () => {
  for (const path of htmlFiles('dist')) assert.doesNotMatch(readFileSync(path, 'utf8'), /\(\d{2}\)/, path);
  const withPostalCode = dataset.producers.filter(p => p.code_postal);
  assert.ok(withPostalCode.length > 0);
  for (const producer of withPostalCode) {
    const header = page(producer.url).match(/<header class="container profile-head">(.*?)<\/header>/s);
    assert.ok(header, producer.url);
    assert.ok(header[1].includes(`(${producer.code_postal})`), `${producer.url} : ${producer.code_postal}`);
  }
});

test('le bandeau fictif suit le périmètre de l’export', () => {
  const fictif = /Données d’exemple fictives/.test(page());
  assert.equal(fictif, dataset.meta.perimetre === 'fictif');
});

test('chaque ancre interne désigne un identifiant de sa page cible', () => {
  const ids = new Map();
  const idsOf = path => {
    if (!ids.has(path)) ids.set(path, new Set([...readFileSync(path, 'utf8').matchAll(/\sid="([^"]+)"/g)].map(m => m[1])));
    return ids.get(path);
  };
  const broken = [];
  for (const file of htmlFiles('dist')) {
    for (const [, target, anchor] of readFileSync(file, 'utf8').matchAll(/href="(\/[^"#]*)?#([^"]+)"/g)) {
      const path = target ? join('dist', target, 'index.html') : file;
      if (!idsOf(path).has(decodeURIComponent(anchor))) broken.push(`${file} → ${target ?? ''}#${anchor}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('les cartes SVG insérées telles quelles ne portent que formes, titres et liens internes', () => {
  const dir = 'src/assets/cartes';
  const files = readdirSync(dir, { recursive: true }).filter(name => String(name).endsWith('.svg'));
  assert.ok(files.length > 0);
  for (const name of files) {
    const svg = readFileSync(join(dir, String(name)), 'utf8');
    const tags = new Set([...svg.matchAll(/<([a-zA-Z][\w:-]*)/g)].map(m => m[1]));
    assert.deepEqual([...tags].filter(t => !['svg', 'desc', 'style', 'a', 'title', 'path'].includes(t)), [], String(name));
    assert.doesNotMatch(svg, /\son\w+\s*=|javascript:|xlink:href|<!ENTITY|@import|url\(/i, String(name));
    assert.equal((svg.match(/<a\b/g) ?? []).length, (svg.match(/<a\b[^>]*\shref="/g) ?? []).length, String(name));
    for (const [, link] of svg.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)) assert.match(link, /^\/(regions|appellations)\/[a-z0-9-]+\/$/, String(name));
  }
});
