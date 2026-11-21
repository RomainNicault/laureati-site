import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { buildTree, corridorEntries, corridorEntry, decodePolyline, famille, formatDuration, locate, parseTripQuery, pathLengthKm, producerCard, readSavedTrip, resample, sameTrip, simplifyGeometry, takeMapLoad, takeSearch, timeline, tripQuery, vertexCount, zoomBand } from '../src/lib/itineraire.ts';
import { routeLinks } from '../src/lib/ui.ts';
import * as ui from '../src/lib/ui.ts';
import { dataset } from '../src/lib/data.ts';

const square = (lng, lat, size = 0.2) => ({ type: 'Polygon', coordinates: [[[lng, lat], [lng + size, lat], [lng + size, lat + size], [lng, lat + size], [lng, lat]]] });
const line = [{ lat: 46, lng: 1 }, { lat: 46, lng: 5 }];

test('actions partagées : appel, site sûr, itinéraires avec et sans place_id ou données absentes', () => {
  for (const google_place_id of [undefined, 'ChIJ test']) {
    const producer = { telephone: '+33 (0)1 23 45', site: 'https://example.org', latitude: 46, longitude: 4, google_place_id };
    assert.deepEqual(ui.producerActions(producer), { phone: ui.telHref('+33 (0)1 23 45'), website: 'https://example.org', routes: routeLinks(producer) });
  }
  assert.deepEqual(ui.producerActions({ site: 'javascript:alert(1)' }), { phone: undefined, website: undefined, routes: [] });
});

test('couloir : distance au segment et kilomètre le long du tracé', () => {
  const p = locate({ lat: 46.0899, lng: 3 }, line);
  assert.ok(p.distanceKm > 9.9 && p.distanceKm < 10.1);
  assert.ok(Math.abs(p.alongKm - pathLengthKm([line[0], { lat: 46, lng: 3 }])) < 0.5);
  const samples = resample(line, 1);
  assert.ok(Math.abs(samples.at(-1).km - pathLengthKm(line)) < 1e-6);
  assert.ok(samples.every((s, i) => !i || s.km > samples[i - 1].km));
});

test('aires : traversée, frôlée, hors couloir, ordre d’entrée', () => {
  const samples = resample(line, 1);
  assert.equal(corridorEntry(square(2.9, 45.9), samples, 5) > 0, true, 'aire traversée');
  assert.equal(corridorEntry(square(3, 46.05), samples, 10) !== undefined, true, 'aire à 5,5 km, couloir de 10 km');
  assert.equal(corridorEntry(square(3, 46.05), samples, 5), undefined, 'aire à 5,5 km, couloir de 5 km');
  assert.equal(corridorEntry(square(3, 47), samples, 30), undefined);
  const entries = corridorEntries([{ properties: { slug: 'est' }, geometry: square(4.5, 45.9) }, { properties: { slug: 'ouest' }, geometry: square(1.5, 45.9) }], samples, 5);
  assert.deepEqual([...entries].sort((a, b) => a[1] - b[1]).map(e => e[0]), ['ouest', 'est']);
});

test('arbre : régions dans l’ordre du trajet, puis appellations, puis vignerons par score', () => {
  const data = {
    regions: [{ slug: 'est', nom: 'Est' }, { slug: 'ouest', nom: 'Ouest' }],
    appellations: [{ slug: 'a-est', nom: 'A Est', regions: [0] }, { slug: 'b-ouest', nom: 'B Ouest', regions: [1] }, { slug: 'c-ouest', nom: 'C Ouest', regions: [1] }, { slug: 'vide', nom: 'Vide', regions: [1] }],
    producers: [
      { nom: 'Fin', url: '/v/fin/', latitude: 46, longitude: 4.9, classements: [[0, 'Rouge', 1, 4, 30, [0, 1, 0, 0, 0]]] },
      { nom: 'Faible', url: '/v/faible/', latitude: 46.01, longitude: 1.6, classements: [[2, 'Rouge', 2, 9, 10, [0, 0, 1, 0, 0]]] },
      { nom: 'Fort', url: '/v/fort/', latitude: 46.02, longitude: 1.7, classements: [[2, 'Rouge', 1, 9, 20, [1, 0, 0, 0, 0]], [2, 'Effervescent blanc', 1, 2, 5, [0, 0, 0, 1, 0]]] },
      { nom: 'Premier', url: '/v/premier/', latitude: 46, longitude: 1.2, classements: [[1, 'Blanc', 3, 5, 8, [0, 1, 0, 0, 0]]] },
      { nom: 'Loin', url: '/v/loin/', latitude: 47, longitude: 3, classements: [[1, 'Rouge', 1, 1, 99, [1, 0, 0, 0, 0]]] },
    ],
  };
  const tree = buildTree(data, line, 10, { aires: new Map([['vide', 50]]) });
  assert.deepEqual(tree.map(r => r.slug), ['ouest', 'est']);
  assert.deepEqual(tree[0].appellations.map(a => a.slug), ['b-ouest', 'c-ouest']);
  const c = tree[0].appellations[1];
  assert.deepEqual(c.colours.map(x => x.couleur), ['Rouge', 'Effervescent blanc']);
  assert.deepEqual(c.colours[0].rows.map(r => r.nom), ['Fort', 'Faible']);
  assert.deepEqual(c.familles, ['Rouge', 'Effervescent']);
  assert.equal(c.count, 2);
  assert.equal(tree[0].count, 3);
  assert.deepEqual(tree[0].nearby, [{ slug: 'vide', nom: 'Vide' }]);
  assert.ok(tree.every(r => r.appellations.every(a => a.colours.every(x => x.rows.every(row => row.distanceKm <= 10)))));
  // L'entrée d'une région dans le couloir prime sur son premier vigneron.
  assert.deepEqual(buildTree(data, line, 10, { regions: new Map([['est', 1], ['ouest', 30]]) }).map(r => r.slug), ['est', 'ouest']);
  // Fiche courte du panneau : classements nommés, triés par score.
  assert.deepEqual(producerCard(data.producers[2], data).map(c => [c.appellation, c.couleur, c.rang, c.total, c.score]), [['C Ouest', 'Rouge', 1, 9, 20], ['C Ouest', 'Effervescent blanc', 1, 2, 5]]);
  assert.equal(producerCard(data.producers[2], data)[1].tone, 'bulles');
});

test('carte : densité selon le zoom et géométries allégées pour l’affichage', () => {
  assert.deepEqual([5, 7, 8, 9, 10, 14].map(zoomBand), ['regions', 'regions', 'appellations', 'appellations', 'vignerons', 'vignerons']);
  // Cercle de 400 sommets, rayon 0,2° : la tolérance de 0,003° garde la forme avec beaucoup moins de sommets.
  const ring = Array.from({ length: 400 }, (_, i) => [3 + 0.2 * Math.cos(i / 400 * 2 * Math.PI), 46 + 0.2 * Math.sin(i / 400 * 2 * Math.PI)]);
  ring.push(ring[0]);
  const circle = { type: 'MultiPolygon', coordinates: [[ring], [square(5, 45, 0.01).coordinates[0]]] };
  const light = simplifyGeometry(circle, 0.003);
  assert.ok(vertexCount(light) < vertexCount(circle) / 4, `${vertexCount(light)} sommets`);
  assert.deepEqual(light.coordinates[0][0].at(0), light.coordinates[0][0].at(-1), 'anneau fermé');
  assert.ok(light.coordinates.every(p => p.every(r => r.length >= 4)));
  // Le couloir calculé sur la géométrie d'origine ne dépend pas de l'allègement.
  assert.ok(corridorEntry(light, resample(line, 1), 10) !== undefined);
});

test('adresse de partage : libellés, lieux, couloir ; valeurs invalides écartées', () => {
  const q = { depart: 'Paris', arrivee: 'Bordeaux, France', departId: 'ChIJD7fiBh9u5kcRYJSMaMOCCwQ', couloir: 15 };
  const back = parseTripQuery('?' + tripQuery(q));
  assert.deepEqual(back, { ...q, arriveeId: undefined });
  assert.equal(tripQuery(q), 'depart=Paris&arrivee=Bordeaux%2C+France&depart_id=ChIJD7fiBh9u5kcRYJSMaMOCCwQ&couloir=15');
  assert.equal(parseTripQuery('?depart=Paris'), undefined);
  assert.deepEqual(parseTripQuery('?depart=Paris&arrivee=Bordeaux&couloir=12&depart_id=%3Cscript%3E'), { depart: 'Paris', arrivee: 'Bordeaux', departId: undefined, arriveeId: undefined, couloir: 10 });
  assert.equal(parseTripQuery('?depart=Paris&arrivee=Bordeaux').couloir, 10, 'couloir de 10 km par défaut');
  assert.ok(sameTrip(back, { ...back, couloir: 30 }));
  assert.ok(!sameTrip(back, { ...back, arriveeId: 'autre' }));
  // Sauvegarde de session : relue seulement si complète.
  const saved = { v: 1, trip: q, route: { polyline: '_p~iF~ps|U', distanceMeters: 585000, staticDuration: '20000s', steps: [{ distanceMeters: 585000, staticDuration: '20000s' }] } };
  assert.equal(readSavedTrip(JSON.stringify(saved)).route.polyline, '_p~iF~ps|U');
  for (const raw of [null, '', '{', JSON.stringify({ ...saved, v: 2 }), JSON.stringify({ ...saved, route: { steps: [] } }), JSON.stringify({ ...saved, trip: { depart: 'P' } })]) assert.equal(readSavedTrip(raw), undefined, String(raw));
});

test('familles de couleur et temps depuis le départ', () => {
  assert.deepEqual(['Rouge', 'Blanc floral', 'Gris de Gris', 'Effervescent rosé', 'Vin de paille', 'Demi-sec', 'Jaune', 'Poiré'].map(famille), ['Rouge', 'Blanc', 'Rosé', 'Effervescent', 'Doux', 'Doux', 'Jaune', 'Cidre']);
  const at = timeline([{ distanceMeters: 1000, staticDuration: '60s' }, { distanceMeters: 99000, staticDuration: '3540s' }], 100);
  assert.equal(at(0), 0);
  assert.equal(at(1), 60);
  assert.equal(at(100), 3600);
  assert.equal(formatDuration(at(100)), '1 h');
  assert.equal(formatDuration(130 * 60), '2 h 10');
  assert.equal(formatDuration(33 * 60), '35 min');
});

test('polyligne Google décodée sans appel externe', () => {
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }]);
});

test('dix recherches par session, onzième refusée', () => {
  const values = new Map(); const store = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  for (let i = 0; i < 10; i++) assert.equal(takeSearch(store), true);
  assert.equal(takeSearch(store), false);
});

test('vingt cartes Google par session, vingt et unième refusée, compteur séparé des recherches', () => {
  const values = new Map(); const store = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  for (let i = 0; i < 20; i++) assert.equal(takeMapLoad(store), true);
  assert.equal(takeMapLoad(store), false);
  assert.equal(values.get('laureati-cartes'), '20');
  assert.equal(takeSearch(store), true, 'recherches non consommées par les cartes');
  values.set('laureati-cartes', 'abc'); assert.equal(takeMapLoad(store), false, 'valeur illisible = plafond atteint');
});

test('Y aller privilégie place_id et conserve les coordonnées sans identifiant', () => {
  const coords = { latitude: 46, longitude: 4 };
  assert.match(routeLinks({ ...coords, google_place_id: 'ChIJ test' })[1].href, /destination=46,4&destination_place_id=ChIJ%20test$/);
  assert.equal(routeLinks(coords)[1].href, 'https://www.google.com/maps/dir/?api=1&destination=46,4');
});

test('contrat géo : régions et aires WGS84, slugs du site, 4 décimales', () => {
  const regions = JSON.parse(readFileSync('data/geo/regions.json', 'utf8'));
  assert.equal(regions.type, 'FeatureCollection');
  const slugs = new Set(dataset.regions.map(r => r.slug)), appSlugs = new Set(dataset.appellations.map(a => a.slug));
  const decimals = (coords) => coords.flat(Infinity).every(n => Math.abs(n * 1e4 - Math.round(n * 1e4)) < 1e-6);
  for (const f of regions.features) {
    assert.deepEqual(Object.keys(f.properties).sort(), ['bbox', 'nom', 'slug']);
    if (dataset.regions.length > 3) assert.ok(slugs.has(f.properties.slug), f.properties.slug);
    assert.ok(['Polygon', 'MultiPolygon'].includes(f.geometry.type));
    const [w, s, e, n] = f.properties.bbox;
    assert.ok(w >= -5.5 && e <= 10 && s >= 41 && n <= 51.5 && w < e && s < n, f.properties.slug);
    assert.ok(decimals(f.geometry.coordinates), f.properties.slug);
    assert.ok(existsSync(`data/geo/aires/${f.properties.slug}.json`), f.properties.slug);
  }
  for (const file of readdirSync('data/geo/aires')) {
    const aires = JSON.parse(readFileSync(`data/geo/aires/${file}`, 'utf8'));
    for (const f of aires.features) {
      assert.deepEqual(Object.keys(f.properties).sort(), ['nom', 'region', 'slug']);
      assert.equal(`${f.properties.region}.json`, file);
      if (dataset.appellations.length > 3) assert.ok(appSlugs.has(f.properties.slug), f.properties.slug);
      assert.ok(decimals(f.geometry.coordinates));
    }
  }
});

test('page itinéraire : promesse, saisie compacte, accord au clic, couloir sous la carte, sans filtres, aucun script tiers dans le HTML', () => {
  const page = readFileSync('dist/itineraire/index.html', 'utf8');
  const main = page.slice(page.indexOf('<main'));
  assert.match(main, /<h1[^>]*>Un voyage prévu \? Trouvez le bon vigneron sur votre trajet\.<\/h1>/);
  assert.ok(main.indexOf('id="trajet"') < main.indexOf('id="carte-statique"') && main.indexOf('id="carte-statique"') < main.indexOf('id="arbre-trajet"'));
  assert.doesNotMatch(page, /id="accord-google"/);
  const mention = main.match(/<p id="mention-google"[^>]*>([\s\S]*?)<\/p>/)[1];
  assert.match(mention, /Calculer envoie vos adresses et votre IP à Google, avec un contrôle anti-robot Cloudflare\./);
  const choix = main.match(/<p id="choix-google"[^>]*>([\s\S]*?)<\/p>/)[1];
  assert.match(choix, /Google activé sur cet appareil, sans cookie\./);
  assert.match(choix, />Oublier<\/button>/);
  assert.match(choix, /href="\/confidentialite\/#itineraire"/);
  assert.match(main, /<p id="google-attribution"[^>]*>Google Maps<\/p>/);
  assert.doesNotMatch(page, /Powered by Google/);
  // Sans trajet, la carte statique est affichée (masquée seulement quand une liste Routes s'affiche).
  assert.match(main, /<figure id="carte-statique"(?![^>]*\bhidden\b)[^>]*>/);
  assert.match(mention, /href="\/confidentialite\/#itineraire"/);
  assert.ok(mention.replace(/<[^>]+>/g, '').length <= 110, 'mention courte');
  assert.ok(main.indexOf('id="carte-cadre"') < main.indexOf('id="couloir"') && main.indexOf('id="couloir"') < main.indexOf('id="arbre-trajet"'), 'couloir sous la carte');
  assert.match(main, /id="couloir"[^>]*value="10"/);
  assert.doesNotMatch(main, /filtre-couleur|filtre-medaille/);
  assert.match(main, /placeholder="Ex\. Paris"/); assert.match(main, /placeholder="Ex\. Bordeaux"/);
  assert.equal((main.match(/data-step="/g) ?? []).length, 4);
  assert.match(main, /id="panneau"[^>]*role="dialog"/);
  assert.doesNotMatch(page, /<script[^>]+src="https?:/);
  assert.doesNotMatch(page, /googleapis|gstatic/);
  assert.ok(existsSync('dist/itineraire/geo/regions.json'));
  const data = JSON.parse(readFileSync('dist/itineraire/donnees.json', 'utf8'));
  assert.equal(data.producers.length, dataset.producers.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).length);
  const confidentialite = readFileSync('dist/confidentialite/index.html', 'utf8');
  assert.match(confidentialite, /id="itineraire"/);
  // Stockage décrit tel qu'il est : session de l'onglet, adresse de la page, rien chez Laureati.
  const section = confidentialite.slice(confidentialite.indexOf('id="itineraire"')).split('</section>')[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.doesNotMatch(section, /en mémoire de la page/);
  assert.match(section, /Laureati ne reçoit ni les lieux saisis ni le trajet : ils ne sont jamais envoyés à ses serveurs\./);
  assert.match(section, /placée après le signe #\. Les navigateurs ne transmettent jamais cette partie au serveur/);
  const journaux = confidentialite.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.doesNotMatch(journaux, /n’active aucun journal/);
  assert.match(journaux, /Il est conservé 3 jours/);
  assert.match(section, /stockage de session de l’onglet : les lieux saisis et le trajet calculé par Google\./);
  assert.match(section, /effacés à la fermeture de l’onglet/);
  assert.match(section, /adresse de la page : le départ, l’arrivée/);
  assert.match(section, /historique de votre navigateur et dans tout lien que vous copiez ou partagez/);
  assert.match(section, /vingt chargements de la carte Google/);
  assert.doesNotMatch(confidentialite.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' '), /[\u2013\u2014]/);
});
