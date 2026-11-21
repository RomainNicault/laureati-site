import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTree, corridorEntries, resample } from '../src/lib/itineraire.ts';

// Tracé approximatif Paris → Bordeaux (A10 par Orléans, Tours, Poitiers), encodé comme une polyligne Google.
const PATH = [[48.857, 2.352], [48.4, 2.05], [47.9, 1.9], [47.59, 1.33], [47.39, 0.69], [46.58, 0.34], [46.32, -0.46], [45.75, -0.63], [45.2, -0.6], [44.84, -0.58]].map(([lat, lng]) => ({ lat, lng }));
function encode(points) {
  let out = '', plat = 0, plng = 0;
  const one = (v) => { v = v < 0 ? ~(v << 1) : v << 1; while (v >= 0x20) { out += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } out += String.fromCharCode(v + 63); };
  for (const p of points) { const lat = Math.round(p.lat * 1e5), lng = Math.round(p.lng * 1e5); one(lat - plat); one(lng - plng); plat = lat; plng = lng; }
  return out;
}
// Simulacre de Maps JavaScript : enregistre couches, écouteurs, zoom et infobulles pour les assertions.
const MAPS_STUB = `(() => {
  const on = (o) => { o.handlers = {}; o.addListener = (n, f) => { o.handlers[n] = f; }; };
  class Overlay { constructor(o = {}) { on(this); this.map = o.map ?? null; } setMap(m) { this.map = m; } getMap() { return this.map; } }
  class Layer extends Overlay { constructor(o){ super(o); (window.__layers ||= []).push(this); this.features = []; } addGeoJson(g){ this.features.push(...g.features); return []; } setStyle(s){ this.style = s; } }
  class Marker extends Overlay { constructor(o){ super(o); (window.__labels ||= []).push(this); this.text = o.label?.text; } }
  class Map_ { constructor(){ on(this); this.zoom = 7; window.__map = this; window.__maps = (window.__maps ?? 0) + 1; } fitBounds(){} getZoom(){ return this.zoom; } setZoom(z){ this.zoom = z; this.handlers.zoom_changed?.(); } panTo(){} }
  class InfoWindow { setContent(c){ window.__bulle = c; } setPosition(){} open(){ window.__bulleOuverte = true; } close(){ window.__bulleOuverte = false; } }
  window.google = { maps: { Map: Map_, Data: Layer, Marker, InfoWindow, Polyline: class extends Overlay {}, LatLngBounds: class { extend(){} }, SymbolPath: { CIRCLE: 0 } } };
  window.laureatiMapsReady(); })();`;

test('navigateur : zéro requête tierce avant « Calculer », progression, carte par densité, panneau, trajet conservé et partagé', async () => {
  // Requêtes reçues par le serveur du site (adresse et Referer) : les lieux du trajet ne doivent jamais y figurer.
  const served = [];
  const server = createServer(async (req, res) => {
    served.push(`${req.url} ${req.headers.referer ?? ''}`);
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://local').pathname); if (path.endsWith('/')) path += 'index.html';
      let content = await readFile(resolve('dist', '.' + path));
      if (path === '/itineraire/index.html') content = Buffer.from(content.toString().replace(/data-key(?:="[^"]*")?(?=\s|>)/, 'data-key="test-browser"').replace(/data-turnstile(?:="[^"]*")?(?=\s|>)/, 'data-turnstile="test-widget"'));
      res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.json') ? 'application/json' : path.endsWith('.css') ? 'text/css' : 'text/html');
      res.end(content);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const calls = [], local = [], thirdParties = []; let clicked = false, verified = false, busyDuringRoute; const busyDuringMap = [];
  const mocked = new Set(['places.googleapis.com', 'maps.googleapis.com', 'routes.googleapis.com', 'challenges.cloudflare.com']);
  // Garde général d'abord (dernière route enregistrée = première exécutée) : tout hôte tiers avant le clic est bloqué et noté.
  async function guard(context) {
    await context.route('https://places.googleapis.com/**', async route => { calls.push({ kind: 'autocomplete', body: route.request().postDataJSON() }); await route.fulfill({ json: { suggestions: [{ placePrediction: { placeId: 'lieu-test', text: { text: 'Bordeaux, France' } } }] } }); });
    await context.route('https://maps.googleapis.com/**', async route => { calls.push({ kind: 'map' }); busyDuringMap.push(await route.request().frame().page().evaluate(() => { const b = document.querySelector('#calculer'); return [b.disabled, b.textContent]; })); await route.fulfill({ contentType: 'text/javascript', body: MAPS_STUB }); });
    await context.route('https://challenges.cloudflare.com/**', async route => { calls.push({ kind: 'turnstile' }); await route.fulfill({ contentType: 'text/javascript', body: 'window.turnstile={render:(el,o)=>o.callback("jeton-test")};' }); });
    await context.route('**/api/turnstile', async route => { served.push(`${route.request().url()} ${route.request().headers().referer ?? ''}`); calls.push({ kind: 'verify' }); verified = true; await route.fulfill({ json: { ok: true } }); });
    await context.route('https://routes.googleapis.com/**', async route => {
      assert.equal(verified, true, 'Turnstile vérifié avant Routes');
      calls.push({ kind: 'route', body: route.request().postDataJSON(), mask: route.request().headers()['x-goog-fieldmask'] });
      busyDuringRoute = await route.request().frame().page().evaluate(() => { const b = document.querySelector('#calculer'); return { disabled: b.disabled, busy: b.getAttribute('aria-busy'), text: b.textContent, trajet: document.querySelector('[data-step="trajet"]').dataset.state, robot: document.querySelector('[data-step="robot"]').dataset.state }; });
      await route.fulfill({ json: { routes: [{ distanceMeters: 585000, staticDuration: '19800s', polyline: { encodedPolyline: encode(PATH) }, legs: [{ steps: [{ distanceMeters: 300000, staticDuration: '10000s' }, { distanceMeters: 285000, staticDuration: '9800s' }] }] }] } });
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) { local.push(url.pathname); return route.fallback(); }
      if (!clicked || !mocked.has(url.hostname)) { thirdParties.push(url.hostname); return route.abort(); }
      return route.fallback();
    });
  }
  const count = kind => calls.filter(c => c.kind === kind).length;
  const clickProducer = (p, u, n) => p.evaluate(([url, nom]) => window.__layers[2].handlers.click({ feature: { getProperty: k => ({ url, nom })[k] } }), [u, n]);
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); await guard(context);
    const page = await context.newPage();
    await page.goto(`${origin}/itineraire/`); await page.waitForLoadState('networkidle');
    // Avant le clic : saisie libre, aucune requête tierce, aucune donnée lourde chargée.
    await page.locator('#depart').fill('Paris'); await page.locator('#arrivee').fill('Bordeaux'); await page.waitForTimeout(600);
    assert.deepEqual(thirdParties, [], `Domaines tiers avant le clic : ${thirdParties.join(', ')}`);
    assert.equal(calls.length, 0);
    assert.equal(await page.locator('#arrivee-suggestions').isVisible(), false);
    assert.ok(!local.some(p => p.includes('/itineraire/geo/') || p.endsWith('donnees.json')), 'géo et données chargées seulement après le clic');
    for (const host of ['nouveau.googleapis.com', 'tiers.example.org']) { await page.evaluate(h => fetch(`https://${h}/sonde`).catch(() => {}), host); assert.equal(thirdParties.pop(), host); }

    // Calcul : bouton occupé, progression par étape, puis résultat.
    clicked = true; await page.locator('#calculer').click();
    await page.waitForFunction(() => document.querySelector('#etat-trajet')?.textContent?.startsWith('Trajet calculé'));
    assert.deepEqual(busyDuringRoute, { disabled: true, busy: 'true', text: 'Calcul en cours…', trajet: 'doing', robot: 'done' });
    assert.deepEqual(await page.$$eval('#etapes li', ls => ls.map(l => `${l.dataset.step}:${l.dataset.state}`)), ['robot:done', 'trajet:done', 'vignerons:done', 'carte:done']);
    assert.deepEqual(await page.$eval('#calculer', b => [b.disabled, b.getAttribute('aria-busy'), b.textContent]), [false, 'false', 'Calculer']);
    assert.equal(await page.evaluate(() => localStorage.getItem('laureati-google-maps-v1')), 'oui', 'le clic mémorise l’accord');
    const routeCall = calls.find(c => c.kind === 'route');
    assert.equal(count('route'), 1); assert.equal(count('map'), 1);
    assert.deepEqual([routeCall.body.origin, routeCall.body.destination], [{ address: 'Paris' }, { address: 'Bordeaux' }], 'géocodage par Routes, sans appel Places');
    assert.equal(routeCall.body.routingPreference, 'TRAFFIC_UNAWARE');
    assert.match(routeCall.mask, /routes\.legs\.steps\.staticDuration/);
    assert.equal(count('autocomplete'), 0);
    assert.ok(calls.findIndex(c => c.kind === 'verify') < calls.findIndex(c => c.kind === 'route'));
    if (process.env.CAPTURES) await page.screenshot({ path: `${process.env.CAPTURES}/mobile-resultat.png`, fullPage: true });
    // Adresse unique de partage, couloir de 10 km par défaut.
    // Lieux dans le fragment (#) : jamais dans la partie de l'adresse envoyée au serveur.
    assert.equal(new URL(page.url()).search, '');
    assert.equal(new URL(page.url()).hash, '#depart=Paris&arrivee=Bordeaux&couloir=10');

    // Géo : seulement les régions du couloir, après le clic.
    const regions = JSON.parse(readFileSync('dist/itineraire/geo/regions.json', 'utf8')).features;
    const samples = resample(PATH, 1), regionEntries = corridorEntries(regions, samples, 10);
    const loaded = local.filter(p => p.startsWith('/itineraire/geo/aires/')).map(p => p.split('/').pop().replace('.json', ''));
    assert.deepEqual(new Set(loaded), new Set(regionEntries.keys()));
    assert.ok(loaded.length > 0 && loaded.length < regions.length);

    // Arbre « Sur votre trajet » : même ordre que le calcul de référence, régions par kilomètre croissant.
    const data = JSON.parse(readFileSync('dist/itineraire/donnees.json', 'utf8'));
    const aires = loaded.flatMap(slug => JSON.parse(readFileSync(`dist/itineraire/geo/aires/${slug}.json`, 'utf8')).features);
    const areaEntries = corridorEntries(aires, samples, 10);
    const expected = buildTree(data, PATH, 10, { regions: regionEntries, aires: areaEntries });
    const shown = await page.$$eval('#arbre details.tree-region', ds => ds.map(d => d.dataset.region));
    assert.deepEqual(shown, expected.map(r => r.slug));
    assert.ok(expected.every((r, i) => !i || r.alongKm >= expected[i - 1].alongKm));
    assert.ok(shown.length > 0, 'au moins une région sur Paris → Bordeaux');
    const firstApps = await page.evaluate(() => [...document.querySelector('#arbre details.tree-region').querySelectorAll('details.tree-app')].map(d => d.dataset.appellation));
    assert.deepEqual(firstApps, expected[0].appellations.map(a => a.slug));
    assert.equal(await page.locator('#filtre-couleur, #filtre-medaille').count(), 0, 'filtres retirés');

    // Carte : régions du couloir, seules les appellations avec vigneron retenu, un point par vigneron.
    const kept = new Set(expected.flatMap(r => r.appellations.map(a => a.slug)));
    const layers = await page.evaluate(() => window.__layers.map(l => l.features.map(f => f.properties.slug ?? f.properties.url)));
    assert.equal(layers.length, 3);
    assert.equal(layers[0].length, regionEntries.size, 'aires des régions du couloir');
    assert.ok(layers[1].length > 0 && layers[1].every(s => kept.has(s)), 'appellations dessinées = appellations avec vigneron retenu');
    const empty = [...areaEntries.keys()].filter(s => !kept.has(s));
    assert.ok(empty.every(s => !layers[1].includes(s)), `appellations sans vigneron absentes de la carte : ${empty.join(', ')}`);
    assert.equal(new Set(layers[2]).size, Number(await page.locator('#itineraire').getAttribute('data-vignerons')));
    const [before, after] = (await page.locator('#itineraire').getAttribute('data-sommets')).split('>').map(Number);
    assert.ok(after < before, `géométries allégées : ${before} → ${after} sommets`);
    console.log(`Paris → Bordeaux, couloir 10 km : ${layers[0].length} régions, ${layers[1].length} appellations dessinées (${empty.length} sans vigneron écartées), ${layers[2].length} vignerons ; sommets affichés ${before} → ${after}`);

    // Densité selon le zoom : régions (zoom ≤ 7), appellations (8-9), vignerons (10+), sans recréer les couches.
    const state = () => page.evaluate(() => ({ densite: document.querySelector('#itineraire').dataset.densite, maps: window.__layers.map(l => !!l.map), labels: window.__labels.filter(m => m.map).length, layers: window.__layers.length }));
    let s = await state(); assert.equal(s.densite, 'regions'); assert.deepEqual(s.maps, [true, false, false]); assert.equal(s.labels, regionEntries.size);
    await page.evaluate(() => window.__map.setZoom(9)); s = await state(); assert.equal(s.densite, 'appellations'); assert.deepEqual(s.maps, [true, true, false]); assert.equal(s.labels, layers[1].length);
    await page.evaluate(() => window.__map.setZoom(11)); s = await state(); assert.equal(s.densite, 'vignerons'); assert.deepEqual(s.maps, [true, true, true]); assert.equal(s.labels, 0);
    assert.equal(s.layers, 3, 'aucune couche recréée au zoom');

    // Infobulle d'aire : la page ne change pas, le lien est dans la bulle.
    const url = page.url();
    const bulle = await page.evaluate(slug => { window.__layers[0].handlers.click({ feature: { getProperty: k => ({ slug, nom: 'Test', bbox: [0, 45, 1, 46] })[k] }, latLng: {} }); return { open: window.__bulleOuverte, links: [...window.__bulle.querySelectorAll('a')].map(a => a.getAttribute('href')), text: window.__bulle.textContent }; }, expected[0].slug);
    assert.equal(page.url(), url); assert.equal(bulle.open, true);
    assert.deepEqual(bulle.links, [`/regions/${expected[0].slug}/`]); assert.match(bulle.text, /vigneron/);

    // Panneau vigneron depuis la carte : infos utiles, actions, fiche complète, focus, Échap.
    const first = expected[0].appellations[0].colours[0].rows[0];
    await clickProducer(page, first.url, first.nom);
    const panel = page.locator('#panneau');
    assert.equal(await panel.isVisible(), true); assert.equal(page.url(), url);
    assert.equal(await panel.locator('h2').textContent(), first.nom);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'panneau-titre');
    assert.equal(await panel.locator('a.route-panel__full').getAttribute('href'), first.url);
    assert.ok(await panel.locator('.route-panel__list > li').count() >= 1);
    assert.match(await panel.textContent(), /points/);
    if (first.producer.telephone) assert.equal(await panel.locator('a.act-call').count(), 1);
    assert.equal(await panel.locator('details.act-route summary').count(), 1);
    const small = await panel.evaluate(p => [...p.querySelectorAll('a.btn, button, summary, .route-panel__app a')].filter(e => e.getBoundingClientRect().height < 44).map(e => e.textContent));
    assert.deepEqual(small, [], 'cibles de 44 px');
    // Échap dans un champ : ferme seulement les suggestions, ni le panneau ni le focus ne bougent.
    await page.locator('#depart').focus(); await page.keyboard.press('Escape');
    assert.equal(await panel.isVisible(), true, 'Échap dans un champ ne ferme pas le panneau');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'depart');
    await page.locator('#panneau-titre').focus();
    await page.keyboard.press('Escape'); assert.equal(await panel.isVisible(), false);

    // Plein écran : la carte occupe la fenêtre, le panneau s'ouvre par-dessus, Échap ferme puis quitte.
    await page.locator('#plein-ecran').click();
    assert.equal(await page.locator('#carte-zone').evaluate(z => z.classList.contains('is-plein') && getComputedStyle(z).position), 'fixed');
    assert.equal(await page.locator('#couloir').isVisible(), true, 'couloir sous la carte en plein écran');
    // Reste de la page inerte : Tab ne sort pas de la zone carte.
    assert.equal(await page.evaluate(() => !!document.querySelector('#trajet').closest('[inert]') && !document.querySelector('#carte-zone').closest('[inert]')), true);
    const outside = [];
    for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); const o = await page.evaluate(() => { const a = document.activeElement; return a && a !== document.body && !document.querySelector('#carte-zone').contains(a) ? `${a.tagName}#${a.id}.${a.className}` : null; }); if (o) outside.push(o); }
    assert.deepEqual(outside, [], 'focus confiné à la carte en plein écran');
    // Statut en plein écran : le message principal est masqué, il est recopié sous la carte (visible, aria-live).
    await page.evaluate(() => { const all = Promise.all; Promise.all = () => { Promise.all = all; return Promise.reject(new Error('échec simulé')); }; });
    await page.locator('#couloir').fill('20'); // fill déclenche input puis change
    await page.waitForFunction(() => document.querySelector('#densite-carte')?.textContent === 'Calcul local impossible.');
    assert.equal(await page.locator('#densite-carte').isVisible(), true, 'statut visible en plein écran');
    assert.equal(await page.locator('#densite-carte').getAttribute('aria-live'), 'polite');
    assert.equal(await page.locator('#etat-trajet').evaluate(e => !!e.closest('[inert]')), true, 'statut principal toujours inerte');
    await clickProducer(page, first.url, first.nom);
    const box = await panel.boundingBox(); assert.ok(box.y > 200 && box.width >= 380, `panneau en bas sur mobile : ${JSON.stringify(box)}`);
    if (process.env.CAPTURES) await page.screenshot({ path: `${process.env.CAPTURES}/mobile-plein-ecran-panneau.png` });
    await page.keyboard.press('Escape'); assert.equal(await panel.isVisible(), false); assert.equal(await page.locator('#carte-zone.is-plein').count(), 1);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#carte-zone.is-plein').count(), 0);
    assert.equal(await page.locator('[inert]').count(), 0, 'inert retiré en sortie de plein écran');

    // Couloir : calcul local, aucun appel Google supplémentaire, adresse à jour.
    const googleBefore = calls.length;
    await page.locator('#couloir').fill('30'); await page.locator('#couloir').dispatchEvent('change');
    await page.waitForFunction(() => location.hash.includes('couloir=30'));
    assert.equal(calls.length, googleBefore);
    // R7 : l'échec local précédent ne reste pas affiché après un calcul réussi.
    assert.deepEqual(await page.locator('#etat-trajet').evaluate(e => [e.classList.contains('is-error'), e.textContent === 'Calcul local impossible.']), [false, false]);

    // Retour depuis une fiche : départ, arrivée, couloir et résultat restaurés sans Routes ni Turnstile.
    await page.locator('#arbre details.tree-region').first().locator('summary').first().click();
    await page.locator('#arbre details.tree-app').first().locator('summary').first().click();
    const name = page.locator('#arbre .c-row a.c-name').first(), fiche = await name.getAttribute('href');
    assert.match(fiche, /^\/vignerons\//);
    await name.click(); await page.waitForURL(u => new URL(u).pathname === fiche);
    await page.goBack(); await page.waitForFunction(() => /^Trajet (restauré|calculé)/.test(document.querySelector('#etat-trajet')?.textContent ?? ''));
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#depart').value, document.querySelector('#arrivee').value, document.querySelector('#couloir').value]), ['Paris', 'Bordeaux', '30']);
    assert.ok(await page.locator('#arbre details.tree-region').count() > 0);
    assert.equal(count('route'), 1); assert.equal(count('verify'), 1);
    // Rechargement : restauration depuis la session, une carte chargée, aucun Routes ni Turnstile.
    served.length = 0;
    await page.reload(); await page.waitForFunction(() => document.querySelector('#etat-trajet')?.textContent?.startsWith('Trajet restauré'));
    assert.deepEqual(await page.$$eval('#etapes li', ls => ls.map(l => l.dataset.state)), ['skip', 'skip', 'done', 'done']);
    assert.equal(await page.locator('#couloir').inputValue(), '30');
    assert.equal(count('route'), 1); assert.equal(count('verify'), 1); assert.equal(count('turnstile'), 1);
    assert.equal(await page.evaluate(() => window.__maps), 1, 'une seule carte par chargement');
    assert.deepEqual(busyDuringMap.at(-1), [true, 'Restauration…'], '« Calculer » désactivé pendant la restauration');
    assert.deepEqual(await page.$eval('#calculer', b => [b.disabled, b.textContent]), [false, 'Calculer']);
    assert.ok(served.some(r => r.startsWith('/itineraire/')), 'page rechargée depuis le serveur');
    assert.deepEqual(served.filter(r => r.includes('Bordeaux')), [], 'aucun lieu du trajet reçu par le serveur du site (adresse ni Referer)');
    // Lien d'évitement (#contenu) : le fragment du trajet est réécrit, le focus reste sur la cible du lien.
    const trajetHash = new URL(page.url()).hash;
    await page.evaluate(() => { window.__hashchanges = 0; addEventListener('hashchange', () => window.__hashchanges++); });
    await page.locator('.skip-link').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(h => window.__hashchanges > 0 && location.hash === h, trajetHash);
    assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'depart', 'focus non déplacé vers le formulaire');
    await page.reload(); await page.waitForFunction(() => document.querySelector('#etat-trajet')?.textContent?.startsWith('Trajet restauré'));
    assert.equal(count('route'), 1); assert.equal(count('verify'), 1);
    // Même trajet, autre couloir collé dans l'onglet : rechargement, restauration au nouveau couloir, sans Routes.
    await page.evaluate(h => { setTimeout(() => { location.hash = h.replace('couloir=30', 'couloir=5'); }); }, trajetHash);
    await page.waitForFunction(() => document.querySelector('#couloir')?.value === '5' && document.querySelector('#etat-trajet')?.textContent?.startsWith('Trajet restauré'));
    assert.equal(count('route'), 1); assert.equal(count('verify'), 1);
    await page.evaluate(h => { setTimeout(() => { location.hash = h; }); }, trajetHash);
    await page.waitForFunction(() => document.querySelector('#couloir')?.value === '30' && document.querySelector('#etat-trajet')?.textContent?.startsWith('Trajet restauré'));
    // R9 : même trajet, paramètres dans un autre ordre : aucun rechargement, adresse remise à la forme canonique.
    const desordre = '#' + new URLSearchParams([...new URLSearchParams(trajetHash.slice(1))].reverse()).toString();
    assert.notEqual(desordre, trajetHash);
    await page.evaluate(() => { window.__r9 = 0; addEventListener('hashchange', () => window.__r9++); });
    await page.evaluate(h => { setTimeout(() => { location.hash = h; }); }, desordre);
    await page.waitForFunction(h => window.__r9 > 0 && location.hash === h, trajetHash);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__r9), 1, 'même document, sans rechargement');

    // Plafond de session.
    await page.evaluate(() => sessionStorage.setItem('laureati-recherches', '10'));
    await page.locator('#calculer').click(); assert.match(await page.locator('#etat-trajet').textContent(), /Limite de 10/);
    assert.equal(count('route'), 1);

    // Plafond de 20 cartes Google par session : au-delà, arbre et carte statique, bouton soumis au même plafond.
    const mapsBefore = count('map'), etat = () => page.locator('#etat-trajet').textContent();
    await page.evaluate(() => sessionStorage.setItem('laureati-cartes', '20'));
    await page.reload(); await page.waitForFunction(() => /Limite de 20 cartes/.test(document.querySelector('#etat-trajet')?.textContent ?? ''));
    assert.equal(count('map'), mapsBefore, 'aucun chargement Maps au-delà du plafond');
    // R8 : un changement de couloir réussi n'efface pas l'erreur de plafond, toujours vraie.
    await page.locator('#couloir').fill('25'); await page.locator('#couloir').dispatchEvent('change');
    await page.waitForFunction(() => location.hash.includes('couloir=25'));
    assert.match(await etat(), /Limite de 20 cartes/);
    assert.deepEqual([await page.locator('#carte-statique').isVisible(), await page.locator('#carte-cadre').isVisible(), await page.locator('#charger-carte').isVisible()], [true, false, true]);
    assert.ok(await page.locator('#arbre details.tree-region').count() > 0, 'arbre restauré sans carte');
    await page.locator('#charger-carte').click(); await page.waitForFunction(() => !document.querySelector('#calculer').disabled);
    assert.match(await etat(), /Limite de 20 cartes/); assert.equal(count('map'), mapsBefore, 'bouton refusé au plafond');
    await page.evaluate(() => sessionStorage.setItem('laureati-cartes', '19'));
    await page.locator('#charger-carte').click(); await page.waitForFunction(() => document.querySelector('#etat-trajet')?.textContent?.startsWith('Carte Google affichée'));
    assert.equal(count('map'), mapsBefore + 1);
    assert.deepEqual([await page.locator('#carte-cadre').isVisible(), await page.locator('#charger-carte').isVisible()], [true, false]);
    assert.ok(await page.locator('#arbre .act-map').count() > 0, 'arbre redessiné avec « Sur la carte »');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('laureati-cartes')), '20');
    await page.evaluate(() => sessionStorage.removeItem('laureati-cartes'));

    // Accord mémorisé : suggestions Places pendant la saisie, choix transmis par placeId.
    await page.goto(`${origin}/itineraire/`); await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#choix-google').isVisible(), true);
    assert.equal(await page.locator('#mention-google').isVisible(), false, 'une seule ligne d\'accord');
    assert.equal(await page.locator('#calculer').getAttribute('aria-describedby'), 'choix-google');
    await page.evaluate(() => sessionStorage.removeItem('laureati-recherches'));
    await page.locator('#arrivee').fill('Borde'); await page.locator('#arrivee-suggestions button').click();
    assert.equal(count('autocomplete'), 1);
    assert.ok(calls.find(c => c.kind === 'autocomplete').body.sessionToken);
    await page.locator('#depart').fill('Paris'); await page.waitForTimeout(500);
    await page.locator('#calculer').click(); await page.waitForFunction(() => document.querySelector('#etat-trajet')?.textContent?.startsWith('Trajet calculé'));
    assert.deepEqual(calls.filter(c => c.kind === 'route').at(-1).body.destination, { placeId: 'lieu-test' });
    assert.match(page.url(), /arrivee=Bordeaux%2C\+France&arrivee_id=lieu-test&couloir=10$/);

    // Oubli : choix effacé, retour à la saisie libre.
    clicked = false; await page.locator('#oublier-google').click(); await page.waitForLoadState('networkidle');
    assert.equal(await page.evaluate(() => localStorage.getItem('laureati-google-maps-v1')), null);
    const n = calls.length; await page.locator('#arrivee').fill('Bordeaux'); await page.waitForTimeout(600);
    assert.equal(calls.length, n);
    assert.deepEqual(thirdParties, [], `Domaines tiers inattendus : ${thirdParties.join(', ')}`);
    await context.close();

    // Adresse partagée, appareil neuf : champs préremplis, zéro requête tierce, le calcul attend « Calculer ».
    const fresh = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await guard(fresh);
    const other = await fresh.newPage(); local.length = 0;
    await other.goto(`${origin}/itineraire/#depart=Paris&arrivee=Bordeaux%2C+France&arrivee_id=lieu-test&couloir=15`); await other.waitForLoadState('networkidle');
    assert.deepEqual(await other.evaluate(() => [document.querySelector('#depart').value, document.querySelector('#arrivee').value, document.querySelector('#couloir').value, document.querySelector('#distance-couloir').textContent]), ['Paris', 'Bordeaux, France', '15', '15 km']);
    assert.match(await other.locator('#etat-trajet').textContent(), /Cliquez sur « Calculer »/);
    if (process.env.CAPTURES) await other.screenshot({ path: `${process.env.CAPTURES}/bureau-lien-partage.png` });
    assert.deepEqual(thirdParties, []); assert.equal(calls.length, n);
    assert.ok(!local.some(p => p.includes('/itineraire/geo/') || p.endsWith('donnees.json')));
    clicked = true; await other.locator('#calculer').click(); await other.waitForFunction(() => document.querySelector('#etat-trajet')?.textContent?.startsWith('Trajet calculé'));
    const last = calls.filter(c => c.kind === 'route').at(-1).body;
    assert.deepEqual([last.origin, last.destination], [{ address: 'Paris' }, { placeId: 'lieu-test' }]);
    // Bureau : panneau sur le côté.
    await clickProducer(other, first.url, first.nom);
    const side = await other.locator('#panneau').boundingBox(), stage = await other.locator('#carte-cadre').boundingBox();
    assert.ok(side.width <= 380 && side.x > stage.x + stage.width / 2, 'panneau sur le côté sur bureau');
    if (process.env.CAPTURES) { await other.locator('#carte-cadre').scrollIntoViewIfNeeded(); await other.screenshot({ path: `${process.env.CAPTURES}/bureau-panneau.png` }); }
    // B2 : lien d'un autre trajet collé dans l'onglet (même document) : rechargement, champs du lien, aucun calcul.
    const champs = () => other.evaluate(() => [document.querySelector('#depart').value, document.querySelector('#arrivee').value, document.querySelector('#couloir').value]);
    const routesAvant = count('route');
    await other.evaluate(() => { setTimeout(() => { location.hash = 'depart=Lyon&arrivee=Marseille&couloir=20'; }); });
    await other.waitForFunction(() => document.querySelector('#depart')?.value === 'Lyon' && /Trajet prérempli/.test(document.querySelector('#etat-trajet')?.textContent ?? ''));
    assert.deepEqual(await champs(), ['Lyon', 'Marseille', '20']);
    // Sans trajet affiché, un nouveau lien collé préremplit aussi.
    await other.evaluate(() => { setTimeout(() => { location.hash = 'depart=Nice&arrivee=Lille&couloir=10'; }); });
    await other.waitForFunction(() => document.querySelector('#depart')?.value === 'Nice' && /Trajet prérempli/.test(document.querySelector('#etat-trajet')?.textContent ?? ''));
    assert.deepEqual(await champs(), ['Nice', 'Lille', '10']);
    // R4 : lien d'évitement sur un trajet prérempli : le fragment est rétabli, le rechargement garde les champs.
    await other.locator('.skip-link').focus(); await other.keyboard.press('Enter');
    await other.waitForFunction(() => location.hash.startsWith('#depart=Nice'));
    await other.reload(); await other.waitForFunction(() => /Trajet prérempli/.test(document.querySelector('#etat-trajet')?.textContent ?? ''));
    assert.deepEqual(await champs(), ['Nice', 'Lille', '10']);
    assert.equal(count('route'), routesAvant, 'aucun calcul sans « Calculer »');
    await fresh.close();
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
});
