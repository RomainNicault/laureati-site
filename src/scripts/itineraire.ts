// Page itinéraire. Aucune requête tierce avant le clic sur « Calculer » : ce clic vaut accord, mémorisé
// sur l'appareil (localStorage). Ensuite seulement, saisie automatique Places pendant la saisie.
// Le résultat Routes est gardé en session (sessionStorage) : retour arrière et rechargement le restaurent
// sans nouvel appel Routes ni Turnstile. L'adresse de la page porte le trajet (libellés, lieux, couloir).
// Conditions Google Maps Platform EEE : aucune carte pendant la saisie (suggestions Places possibles) ; trajet affiché
// avec un résumé sans nom de lieu ; repères le long du trajet calculés depuis la polyligne, jamais depuis les étapes.
import { buildTree, corridorEntries, decodePolyline, formatAlong, formatDuration, geometryBounds, pageLayout, parseTripQuery, pathLengthKm, producerCard, readSavedTrip,
  resample, sameTrip, simplifyGeometry, takeMapLoad, takeSearch, CARTES_MAX, ROUTES_FIELD_MASK, tripQuery, vertexCount, zoomBand,
  type GeoFeature, type Point, type RouteData, type RouteProducer, type SavedRoute, type TreeRegion, type TreeRow, type TripQuery, type ZoomBand } from '../lib/itineraire';
import { MEDAL_LABEL, MEDAL_ORDER, ordinalSuffix, producerActions } from '../lib/ui';
import { formatScore } from '../lib/site';

declare global { interface Window { google: any; turnstile: any; laureatiMapsReady: () => void } }
const root = document.querySelector<HTMLElement>('#itineraire')!;
const key = root.dataset.key!, sitekey = root.dataset.turnstile!;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
// En plein écran, le statut principal est masqué et inerte : le message est aussi écrit sous la carte (zone visible, aria-live).
const status = (text: string, error = false) => {
  const s = el('etat-trajet'); s.textContent = text; s.classList.toggle('is-error', error);
  if (el('carte-zone').classList.contains('is-plein')) { const d = el('densite-carte'); d.textContent = text; d.classList.toggle('is-error', error); }
};
const consentKey = 'laureati-google-maps-v1', savedKey = 'laureati-trajet-v1';
let consent = false;
try { consent = localStorage.getItem(consentKey) === 'oui'; } catch { /* stockage indisponible : saisie libre */ }

// Une seule ligne d'accord : la mention avant accord, l'état mémorisé après.
function showConsent() {
  el('choix-google').hidden = !consent; el('mention-google').hidden = consent;
  el('calculer').setAttribute('aria-describedby', consent ? 'choix-google' : 'mention-google');
}
showConsent();
el('oublier-google').addEventListener('click', () => { try { localStorage.removeItem(consentKey); sessionStorage.removeItem(savedKey); } catch { /* rien à retirer */ } location.reload(); });

// Progression visible : anti-robot, trajet, vignerons, carte.
type Step = 'robot' | 'trajet' | 'vignerons' | 'carte';
type StepState = 'todo' | 'doing' | 'done' | 'error' | 'skip';
const STEP_TEXT: Record<StepState, string> = { todo: 'à venir', doing: 'en cours', done: 'fait', error: 'échec', skip: 'déjà fait' };
function step(name: Step, state: StepState) {
  const item = document.querySelector<HTMLElement>(`#etapes [data-step="${name}"]`)!;
  item.dataset.state = state; item.querySelector('.step-state')!.textContent = STEP_TEXT[state];
  if (state === 'doing') item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
}
function resetSteps() { el('progression').hidden = false; for (const s of ['robot', 'trajet', 'vignerons', 'carte'] as Step[]) step(s, 'todo'); }
const button = el<HTMLButtonElement>('calculer');
// Un seul traitement à la fois : calcul, restauration ou chargement de la carte à la demande.
let busy = false;
function setBusy(on: boolean, text = 'Calcul en cours…') {
  busy = on; button.disabled = on; button.setAttribute('aria-busy', String(on));
  button.querySelector('.route-submit__label')!.textContent = on ? text : 'Calculer';
}

// Choix d'une suggestion : identifiant de lieu transmis tel quel à Routes, sans appel Place Details.
const chosen: Record<string, { placeId: string; label: string } | undefined> = {};
/** Suggestions d'un champ annulées : minuterie, réponse en vol et liste. */
const resetSuggestions: Record<string, () => void> = {};
for (const id of ['depart', 'arrivee']) {
  const input = el<HTMLInputElement>(id), list = el(id + '-suggestions');
  let token = '', timer: ReturnType<typeof setTimeout>, sequence = 0;
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  resetSuggestions[id] = () => { clearTimeout(timer); sequence++; list.replaceChildren(); close(); };
  // Focus avec accord : suggestions Places possibles, plus aucune carte visible jusqu'au trajet affiché.
  input.addEventListener('focus', () => { if (consent && key) { token ||= crypto.randomUUID(); el('google-attribution').hidden = false; placesStarted = true; layout(); } });
  input.addEventListener('input', () => {
    if (chosen[id]?.label !== input.value) { delete chosen[id]; layout(); }
    clearTimeout(timer); const serial = ++sequence;
    list.replaceChildren(); close();
    if (!consent || !key || input.value.trim().length < 3) return;
    token ||= crypto.randomUUID();
    timer = setTimeout(async () => {
      try {
        const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text' }, body: JSON.stringify({ input: input.value, sessionToken: token, includedRegionCodes: ['fr', 'ch', 'it', 'be', 'lu', 'de', 'es', 'mc', 'ad'], languageCode: 'fr' }) });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (serial !== sequence) return;
        for (const suggestion of result.suggestions ?? []) {
          const prediction = suggestion.placePrediction; if (!prediction) continue;
          const item = document.createElement('li'); item.setAttribute('role', 'option');
          const choice = document.createElement('button'); choice.type = 'button'; choice.textContent = prediction.text.text;
          choice.addEventListener('click', () => { chosen[id] = { placeId: prediction.placeId, label: prediction.text.text }; input.value = prediction.text.text; token = ''; close(); layout(); input.focus(); });
          item.append(choice); list.append(item);
        }
        list.hidden = !list.children.length; input.setAttribute('aria-expanded', String(!list.hidden));
      } catch { if (serial === sequence) status('Suggestions indisponibles. Saisissez l’adresse complète.'); }
    }, 350);
  });
  input.addEventListener('keydown', event => { if (event.key === 'ArrowDown' && !list.hidden) { event.preventDefault(); list.querySelector('button')?.focus(); } if (event.key === 'Escape') { event.preventDefault(); close(); } });
  list.addEventListener('keydown', event => {
    const buttons = [...list.querySelectorAll('button')], index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    if (event.key === 'Escape') { event.preventDefault(); close(); input.focus(); }
  });
}

// Un seul chargement Maps JavaScript par page, une seule carte. Plafond de CARTES_MAX chargements par session
// d'onglet (calcul, restauration, bouton) : au-delà, aucun script Google n'est injecté.
class MapQuotaError extends Error {}
let mapsPromise: Promise<any> | undefined;
function loadMaps(): Promise<any> {
  if (mapsPromise) return mapsPromise;
  let allowed = false; try { allowed = takeMapLoad(sessionStorage); } catch { /* stockage indisponible : pas de carte */ }
  if (!allowed) return Promise.reject(new MapQuotaError(`Limite de ${CARTES_MAX} cartes Google par session atteinte. L’arbre ci-dessous reste utilisable.`));
  mapsPromise = new Promise((resolve, reject) => {
    window.laureatiMapsReady = () => resolve(window.google.maps);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=laureatiMapsReady&language=fr&region=FR&v=weekly`;
    script.async = true; script.onerror = () => { mapsPromise = undefined; reject(new Error('Carte Google indisponible.')); };
    document.head.append(script);
  });
  return mapsPromise;
}

let turnstilePromise: Promise<void> | undefined;
function verifyHuman(): Promise<void> {
  if (!sitekey) return Promise.reject(new Error('Le contrôle anti-robot est indisponible.'));
  turnstilePromise ||= new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true; s.onload = () => resolve(); s.onerror = () => { turnstilePromise = undefined; reject(new Error('Le contrôle anti-robot est indisponible. Réessayez.')); }; document.head.append(s); });
  return turnstilePromise.then(() => new Promise<void>((resolve, reject) => {
    el('turnstile').replaceChildren();
    const timeout = setTimeout(() => reject(new Error('Le contrôle anti-robot a expiré. Réessayez.')), 120000);
    window.turnstile.render(el('turnstile'), { sitekey, action: 'itineraire', size: 'flexible', appearance: 'interaction-only', callback: async (token: string) => {
      try { const response = await fetch('/api/turnstile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }); if (!response.ok || !(await response.json()).ok) throw new Error(); clearTimeout(timeout); resolve(); }
      catch { clearTimeout(timeout); reject(new Error('Le contrôle anti-robot a échoué. Réessayez.')); }
    }, 'error-callback': () => { clearTimeout(timeout); reject(new Error('Le contrôle anti-robot est indisponible. Réessayez.')); }, 'expired-callback': () => { clearTimeout(timeout); reject(new Error('Le contrôle anti-robot a expiré. Réessayez.')); } });
  }));
}

// État d'un trajet calculé. La largeur du couloir se recalcule localement.
interface Trip { query: TripQuery; route: SavedRoute; path: Point[]; samples: ReturnType<typeof resample>; km: number; seconds: number }
let trip: Trip | undefined, data: RouteData | undefined, regionsGeo: GeoFeature[] = [];
// Affichage dérivé de l'état (pageLayout) : saisie ouverte, suggestions Places possibles, carte Google chargée ou non.
let placesStarted = false, formOpen = true, mapState: 'none' | 'shown' | 'failed' = 'none';
const placesLabel = () => (['depart', 'arrivee'] as const).some(id => chosen[id] !== undefined && chosen[id]!.label === el<HTMLInputElement>(id).value);
function layout() {
  const v = pageLayout({ trip: !!trip, formOpen, placesStarted, placesLabel: placesLabel(), map: mapState });
  el('saisie').hidden = !v.saisie; el('trajet-resume').hidden = !v.resume; el('annuler-ligne').hidden = !(trip && formOpen);
  el('carte-statique').hidden = !v.statique;
  el('carte-cadre').hidden = !v.carte; el('legende-carte').hidden = !v.carte; el('carte-charger').hidden = !v.charger;
  if (v.saisie) root.dataset.mode = 'saisie'; else delete root.dataset.mode;
}
/** Champs remplis depuis un trajet (lien partagé, annulation) : identifiant de lieu repris s'il existe. */
function fillFields(q: TripQuery) {
  for (const id of ['depart', 'arrivee'] as const) {
    const input = el<HTMLInputElement>(id), placeId = id === 'depart' ? q.departId : q.arriveeId;
    resetSuggestions[id]?.(); input.value = q[id]; if (placeId) chosen[id] = { placeId, label: q[id] }; else delete chosen[id];
  }
}
/** Trajet prérempli depuis le lien d'ouverture, tant qu'aucun trajet n'est affiché. */
let prefilled: TripQuery | undefined;
const aires = new Map<string, Promise<GeoFeature[]>>();
const loadJson = async <T,>(url: string): Promise<T> => { const r = await fetch(url); if (!r.ok) throw new Error('Données indisponibles. Réessayez.'); return r.json(); };
const loadAires = (slug: string) => { if (!aires.has(slug)) aires.set(slug, loadJson<{ features: GeoFeature[] }>(`/itineraire/geo/aires/${slug}.json`).then(c => c.features).catch(() => { aires.delete(slug); return []; })); return aires.get(slug)!; };
const width = () => Number(el<HTMLInputElement>('couloir').value);
function setWidth(w: number) { const input = el<HTMLInputElement>('couloir'); input.value = String(w); el('distance-couloir').textContent = `${w} km`; input.setAttribute('aria-valuetext', `${w} kilomètres`); }
const producersByUrl = new Map<string, RouteProducer>();
let currentTree: TreeRegion[] = [];

const create = (tag: string, text?: string, className?: string) => { const n = document.createElement(tag); if (text) n.textContent = text; if (className) n.className = className; return n; };
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
const km1 = (n: number) => `${n.toFixed(1).replace('.', ',')} km du trajet`;

// Carte : couches construites une fois par rendu, affichées selon le zoom sans redessin des géométries.
let map: any, maps: any, info: any, band: ZoomBand | undefined;
interface Layers { regions?: any; areas?: any; producers?: any; line?: any; regionLabels: any[]; areaLabels: any[] }
let layers: Layers = { regionLabels: [], areaLabels: [] };
const PALETTE = ['#7B1830', '#A7833A', '#C04557', '#A4561F', '#5B1428', '#D59722', '#7D838A', '#C98C9A'];
// Régions vues au zoom ≤ 7 (environ 1 km par pixel), appellations au zoom 8-9 (200 à 400 m par pixel).
const TOLERANCE = { regions: 0.02, aires: 0.003 };
const DENSITE: Record<ZoomBand, string> = {
  regions: 'Régions du trajet. Zoomez pour voir les appellations.',
  appellations: 'Appellations avec vigneron retenu. Zoomez pour voir les vignerons.',
  vignerons: 'Vignerons retenus. Touchez un point pour ouvrir sa fiche.',
};
const show = (overlay: any, on: boolean) => { if (overlay && (overlay.getMap() === map) !== on) overlay.setMap(on ? map : null); };
const regionStyle = () => band === 'regions'
  ? { fillColor: '#46363B', fillOpacity: 0.12, strokeColor: '#21141A', strokeWeight: 2.5, strokeOpacity: 0.85, zIndex: 1, clickable: true }
  : { fillOpacity: 0, strokeColor: '#21141A', strokeWeight: 1.5, strokeOpacity: 0.5, zIndex: 1, clickable: false };
const areaStyle = (f: any) => band === 'vignerons'
  ? { fillColor: f.getProperty('colour'), fillOpacity: 0.1, strokeColor: f.getProperty('colour'), strokeWeight: 0.8, zIndex: 2, clickable: false }
  : { fillColor: f.getProperty('colour'), fillOpacity: 0.28, strokeColor: f.getProperty('colour'), strokeWeight: 1.2, zIndex: 2, clickable: true };
function applyBand(force = false) {
  if (!map) return;
  const next = zoomBand(map.getZoom() ?? 6);
  if (next === band && !force) return;
  band = next; root.dataset.densite = next;
  layers.regions?.setStyle(regionStyle);
  layers.areas?.setStyle(areaStyle);
  show(layers.areas, next !== 'regions'); show(layers.producers, next === 'vignerons');
  for (const m of layers.regionLabels) show(m, next === 'regions');
  for (const m of layers.areaLabels) show(m, next === 'appellations');
  el('densite-carte').textContent = DENSITE[next]; el('densite-carte').classList.remove('is-error');
}
const centre = (f: GeoFeature) => { const [w, s, e, n] = f.properties.bbox ?? geometryBounds(f.geometry); return { lat: (s + n) / 2, lng: (w + e) / 2 }; };
const label = (position: Point, text: string, size: string) => new maps.Marker({ position, clickable: false, zIndex: 5, icon: { path: maps.SymbolPath.CIRCLE, scale: 0 }, label: { text, color: '#21141A', fontSize: size, fontWeight: '600', className: 'route-map-label' } });

/** Infobulle d'une aire : repères, zoom sur l'aire, lien vers sa page (la carte ne quitte pas la page au clic). */
function bubble(title: string, lines: string[], link: { href: string; text: string }, zoom: { bounds: number[]; text: string }) {
  const box = create('div', undefined, 'route-bubble'); box.append(create('p', title, 'route-bubble__title'));
  for (const line of lines) box.append(create('p', line));
  const row = create('p', undefined, 'route-bubble__actions');
  const b = create('button', zoom.text, 'btn') as HTMLButtonElement; b.type = 'button';
  b.addEventListener('click', () => { info.close(); const [w, s, e, n] = zoom.bounds; map.fitBounds({ west: w, south: s, east: e, north: n }); });
  const a = create('a', link.text) as HTMLAnchorElement; a.href = link.href;
  row.append(b, a); box.append(row); return box;
}

function draw(regions: GeoFeature[], areas: GeoFeature[], tree: TreeRegion[]) {
  for (const overlay of [layers.regions, layers.areas, layers.producers, layers.line, ...layers.regionLabels, ...layers.areaLabels]) overlay?.setMap(null);
  info ||= new maps.InfoWindow(); info.close();
  const regionInfo = new Map(tree.map(r => [r.slug, r])), appInfo = new Map(tree.flatMap(r => r.appellations.map(a => [a.slug, a] as const)));
  // Affichage allégé (Douglas-Peucker) ; le calcul du couloir garde les géométries d'origine.
  const light = (fs: GeoFeature[], tol: number) => fs.map(f => ({ ...f, properties: { ...f.properties, bbox: f.properties.bbox ?? geometryBounds(f.geometry) }, geometry: simplifyGeometry(f.geometry, tol) }));
  const lightRegions = light(regions, TOLERANCE.regions), lightAreas = light(areas, TOLERANCE.aires);
  const count = (fs: GeoFeature[]) => fs.reduce((n, f) => n + vertexCount(f.geometry), 0);
  root.dataset.sommets = `${count([...regions, ...areas])}>${count([...lightRegions, ...lightAreas])}`;

  const regionLayer = new maps.Data();
  regionLayer.addGeoJson({ type: 'FeatureCollection', features: lightRegions });
  regionLayer.addListener('click', (e: any) => {
    const slug = e.feature.getProperty('slug'), nom = e.feature.getProperty('nom'), r = regionInfo.get(slug);
    const lines = r ? [`${plural(r.count, 'vigneron')} retenu${r.count > 1 ? 's' : ''}, ${plural(r.appellations.length, 'appellation')}.`, `${formatAlong(r.alongKm)}.`] : ['Aucun vigneron retenu dans ce couloir.'];
    info.setContent(bubble(nom, lines, { href: `/regions/${slug}/`, text: `Page de la région` }, { bounds: e.feature.getProperty('bbox'), text: 'Voir les appellations' }));
    info.setPosition(e.latLng); info.open({ map });
  });
  const areaLayer = new maps.Data();
  areaLayer.addGeoJson({ type: 'FeatureCollection', features: lightAreas.map((f, i) => ({ ...f, properties: { ...f.properties, colour: PALETTE[i % PALETTE.length] } })) });
  areaLayer.addListener('click', (e: any) => {
    const slug = e.feature.getProperty('slug'), nom = e.feature.getProperty('nom'), a = appInfo.get(slug);
    const lines = a ? [`${plural(a.count, 'vigneron')} retenu${a.count > 1 ? 's' : ''}.`, `${a.familles.join(', ')}.`] : [];
    info.setContent(bubble(nom, lines, { href: `/appellations/${slug}/`, text: 'Classement complet' }, { bounds: e.feature.getProperty('bbox'), text: 'Voir les vignerons' }));
    info.setPosition(e.latLng); info.open({ map });
  });
  const line = new maps.Polyline({ path: trip!.path, map, strokeColor: '#26060F', strokeWeight: 5, zIndex: 3, clickable: false });
  const seen = new Set<string>(), points = [];
  for (const r of tree.flatMap(x => x.appellations.flatMap(a => a.colours.flatMap(c => c.rows)))) if (!seen.has(r.url)) { seen.add(r.url); points.push({ type: 'Feature', properties: { url: r.url, nom: r.nom }, geometry: { type: 'Point', coordinates: [r.producer.longitude, r.producer.latitude] } }); }
  const producerLayer = new maps.Data();
  producerLayer.addGeoJson({ type: 'FeatureCollection', features: points });
  // Marqueurs légers : symbole vectoriel, infobulle native au survol (title), panneau au clic.
  producerLayer.setStyle((f: any) => ({ title: f.getProperty('nom'), zIndex: 4, icon: { path: maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#5B1428', fillOpacity: 1, strokeColor: '#FFFDF8', strokeWeight: 2 } }));
  producerLayer.addListener('click', (e: any) => { info.close(); openPanel(e.feature.getProperty('url')); });
  layers = {
    regions: regionLayer, areas: areaLayer, producers: producerLayer, line,
    regionLabels: lightRegions.map(f => label(centre(f), f.properties.nom, '14px')),
    areaLabels: lightAreas.map(f => label(centre(f), f.properties.nom, '12px')),
  };
  regionLayer.setMap(map);
  applyBand(true);
}

function meta(alongKm: number, familles: string[], count: number) {
  // Trois repères insécables : moment du trajet, couleurs, nombre de vignerons.
  const span = create('span', undefined, 'tree-meta'), s = count > 1 ? 's' : '';
  const colours = create('span');
  for (const f of familles) { const sw = create('span', undefined, 'swatch'); sw.dataset.tone = { Rouge: 'rouge', Blanc: 'blanc', Rosé: 'rose', Effervescent: 'bulles', Doux: 'liquoreux', Jaune: 'jaune', Cidre: 'cidre' }[f] ?? 'blanc'; sw.setAttribute('aria-hidden', 'true'); colours.append(sw); }
  colours.append(` ${familles.join(', ')}`);
  span.append(create('span', formatAlong(alongKm)), colours, create('span', `${count} vigneron${s} classé${s}`));
  return span;
}
function tally(medals: number[]) {
  const out = create('span', undefined, 'tally'), list = MEDAL_ORDER.map((k, i) => [k, medals[i]] as const).filter(([, n]) => n);
  out.append(create('span', `Médailles : ${list.map(([k, n]) => `${n} ${MEDAL_LABEL[k]}`).join(', ')}`, 'sr-only'));
  for (const [k, n] of list) { const item = create('span', undefined, 'tally__item'); item.setAttribute('aria-hidden', 'true'); item.append(create('span', undefined, `coin coin--${k}`), create('strong', String(n)), create('span', MEDAL_LABEL[k], 'tally__label')); out.append(item); }
  return out;
}
/** Appeler et Y aller : mêmes liens que les fiches (producerActions). */
function actions(producer: RouteProducer, nom: string) {
  const box = create('div', undefined, 'c-actions'), { phone, routes } = producerActions(producer);
  if (phone) { const call = create('a', 'Appeler', 'btn btn--primary act-call') as HTMLAnchorElement; call.href = phone; call.append(create('span', ` ${nom}`, 'sr-only')); box.append(call); }
  if (routes.length) {
    const details = create('details', undefined, 'route act-route'), summary = create('summary', 'Y aller', 'btn'); summary.append(create('span', ` : itinéraire vers ${nom}`, 'sr-only'));
    const menu = create('div', undefined, 'route__menu'), links = create('ul'); menu.append(create('p', 'Ouvrir l’itinéraire avec', 'route__title'));
    for (const route of routes) { const li = create('li'), a = create('a', route.label) as HTMLAnchorElement; a.href = route.href; a.rel = 'noopener noreferrer'; li.append(a); links.append(li); }
    menu.append(links); details.append(summary, menu); box.append(details);
  }
  return box;
}
function row(r: TreeRow) {
  const li = create('li', undefined, 'c-row'); li.dataset.score = String(r.score);
  const rank = create('span', undefined, 'c-rank'); rank.setAttribute('aria-hidden', 'true'); rank.append(String(r.rang), create('sup', ordinalSuffix(r.rang)));
  const id = create('div', undefined, 'c-id'), name = create('a', r.nom, 'c-name') as HTMLAnchorElement; name.href = r.url;
  id.append(create('span', `Rang ${r.rang} sur ${r.total} : `, 'sr-only'), name, create('span', `${r.commune ?? 'Commune non renseignée'} · ${km1(r.distanceKm)}`, 'c-place'));
  const score = create('span', undefined, 'c-score'); score.append(create('strong', formatScore(r.score)), create('span', 'points'));
  const box = actions(r.producer, r.nom);
  if (map) {
    // Même panneau que le clic sur la carte : accès au clavier.
    const onMap = create('button', 'Sur la carte', 'btn act-map') as HTMLButtonElement; onMap.type = 'button';
    onMap.append(create('span', ` : ${r.nom}`, 'sr-only')); onMap.addEventListener('click', () => openPanel(r.url, true)); box.append(onMap);
  }
  li.append(rank, id, score, tally(r.medals), box);
  return li;
}

// Panneau vigneron : sur la carte, sans quitter la page. Bas de l'écran sur mobile, côté sur bureau.
let lastFocus: HTMLElement | null = null;
function openPanel(url: string, centreOn = false) {
  const producer = producersByUrl.get(url); if (!producer || !data) return;
  if (el('panneau').hidden) lastFocus = document.activeElement as HTMLElement | null;
  const body = el('panneau-contenu'); body.replaceChildren();
  const title = create('h2', producer.nom, 'route-panel__title'); title.id = 'panneau-titre'; title.tabIndex = -1;
  const near = currentTree.flatMap(r => r.appellations.flatMap(a => a.colours.flatMap(c => c.rows))).find(r => r.url === url);
  body.append(title, create('p', [producer.commune ?? 'Commune non renseignée', near ? km1(near.distanceKm) : ''].filter(Boolean).join(' · '), 'route-panel__place'));
  body.append(actions(producer, producer.nom));
  body.append(create('h3', 'Appellations classées', 'route-panel__sub'));
  const list = create('ol', undefined, 'route-panel__list');
  for (const c of producerCard(producer, data)) {
    const li = create('li'), head = create('p', undefined, 'route-panel__app'), sw = create('span', undefined, 'swatch'); sw.dataset.tone = c.tone; sw.setAttribute('aria-hidden', 'true');
    const a = create('a', `${c.appellation} ${c.couleur.toLowerCase()}`) as HTMLAnchorElement; a.href = `/appellations/${c.slug}/`;
    head.append(sw, a);
    const line = create('p', undefined, 'route-panel__rank'); line.append(create('span', `${c.rang}${ordinalSuffix(c.rang)} sur ${c.total}`), create('strong', `${formatScore(c.score)} points`));
    li.append(head, line, tally(c.medals)); list.append(li);
  }
  body.append(list);
  const full = create('a', 'Fiche complète', 'btn route-panel__full') as HTMLAnchorElement; full.href = url; full.append(create('span', ` : ${producer.nom}`, 'sr-only'));
  body.append(full);
  el('panneau').hidden = false; root.dataset.panneau = url;
  if (centreOn && map) { map.panTo({ lat: producer.latitude, lng: producer.longitude }); if ((map.getZoom() ?? 0) < 10) map.setZoom(11); el('carte-cadre').scrollIntoView({ block: 'nearest' }); }
  title.focus();
}
function closePanel() {
  const panel = el('panneau'); if (panel.hidden) return false;
  panel.hidden = true; delete root.dataset.panneau;
  (lastFocus && document.contains(lastFocus) && lastFocus !== document.body ? lastFocus : el('carte-google')).focus();
  return true;
}
el('panneau-fermer').addEventListener('click', closePanel);

// Plein écran : la carte occupe la fenêtre, le panneau s'ouvre par-dessus. Échap ferme le panneau, puis le plein écran.
// Reste de la page inerte en plein écran : Tab reste dans la carte, ses contrôles, le couloir et le panneau.
let inerted: HTMLElement[] = [];
function isolate(on: boolean) {
  for (const node of inerted) node.inert = false;
  inerted = [];
  if (!on) return;
  for (let node: HTMLElement | null = el('carte-zone'); node && node !== document.body; node = node.parentElement)
    for (const sibling of node.parentElement?.children ?? []) if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) { sibling.inert = true; inerted.push(sibling); }
}
function fullscreen(on: boolean) {
  isolate(on); el('carte-zone').classList.toggle('is-plein', on); document.documentElement.classList.toggle('route-plein', on);
  const toggle = el('plein-ecran'); toggle.setAttribute('aria-pressed', String(on)); toggle.querySelector('.label')!.textContent = on ? 'Quitter le plein écran' : 'Plein écran';
}
el('plein-ecran').addEventListener('click', () => fullscreen(!el('carte-zone').classList.contains('is-plein')));
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  if (closePanel()) { event.preventDefault(); return; }
  if (el('carte-zone').classList.contains('is-plein')) { event.preventDefault(); fullscreen(false); el('plein-ecran').focus(); }
});

function renderTree(tree: TreeRegion[]) {
  const out = el('arbre'); out.replaceChildren();
  const apps = tree.reduce((n, r) => n + r.appellations.length, 0), producers = new Set(tree.flatMap(r => r.appellations.flatMap(a => a.colours.flatMap(c => c.rows.map(x => x.url))))).size;
  el('resume-trajet').textContent = `Trajet de ${Math.round(trip!.km)} km, ${formatDuration(trip!.seconds)} sans trafic. Dans le couloir de ${width()} km : ${plural(tree.length, 'région')}, ${plural(apps, 'appellation')} avec vigneron classé, ${plural(producers, 'vigneron')}.`;
  root.dataset.regions = String(tree.length); root.dataset.appellations = String(apps); root.dataset.vignerons = String(producers);
  if (!tree.length) { out.append(create('p', 'Aucun vigneron classé dans ce couloir. Élargissez la distance sous la carte.')); return; }
  const list = create('ol', undefined, 'tree-list');
  for (const region of tree) {
    const li = create('li'), details = create('details', undefined, 'tree-region'); details.dataset.region = region.slug;
    const summary = create('summary'); summary.append(create('span', region.nom, 'tree-name'), meta(region.alongKm, region.familles, region.count)); details.append(summary);
    const body = create('div', undefined, 'tree-body');
    if (region.slug) { const p = create('p'), a = create('a', `Découvrir la région ${region.nom}`, 'tree-link') as HTMLAnchorElement; a.href = `/regions/${region.slug}/`; p.append(a); body.append(p); }
    const appList = create('ol', undefined, 'tree-list');
    for (const app of region.appellations) {
      const appLi = create('li'), appDetails = create('details', undefined, 'tree-app'); appDetails.dataset.appellation = app.slug;
      const s = create('summary'); s.append(create('span', app.nom, 'tree-name'), meta(app.alongKm, app.familles, app.count)); appDetails.append(s);
      const appBody = create('div', undefined, 'tree-body'), p = create('p'), a = create('a', `Classement complet ${app.nom}`, 'tree-link') as HTMLAnchorElement; a.href = `/appellations/${app.slug}/`; p.append(a); appBody.append(p);
      for (const colour of app.colours) {
        const head = create('h3', undefined, 'tree-colour'), sw = create('span', undefined, 'swatch'); sw.dataset.tone = colour.tone; sw.setAttribute('aria-hidden', 'true'); head.append(sw, `${app.nom} ${colour.couleur.toLowerCase()}`);
        const rows = create('ol', undefined, 'c-list'); for (const r of colour.rows) rows.append(row(r));
        appBody.append(head, rows);
      }
      appDetails.append(appBody); appLi.append(appDetails); appList.append(appLi);
    }
    body.append(appList);
    if (region.nearby.length) {
      const p = create('p', 'Aussi à proximité, sans vigneron classé retenu : ', 'note');
      region.nearby.forEach((n, i) => { const a = create('a', n.nom) as HTMLAnchorElement; a.href = `/appellations/${n.slug}/`; p.append(...(i ? [', ', a] : [a])); });
      body.append(p);
    }
    details.append(body); li.append(details); list.append(li);
  }
  out.append(list);
}

// Rendu local : couloir, aires, arbre, carte. Aucun appel Google.
let renderSerial = 0;
async function render() {
  if (!trip || !data) return;
  const serial = ++renderSerial, w = width();
  const regionEntries = corridorEntries(regionsGeo, trip.samples, w);
  const crossed = [...regionEntries.keys()];
  const areas = (await Promise.all(crossed.map(loadAires))).flat();
  if (serial !== renderSerial) return;
  const areaEntries = corridorEntries(areas, trip.samples, w);
  const tree = buildTree(data, trip.path, w, { regions: regionEntries, aires: areaEntries });
  currentTree = tree;
  // Seules les appellations avec au moins un vigneron retenu sont dessinées.
  const kept = new Set(tree.flatMap(r => r.appellations.map(a => a.slug)));
  const visibleAreas = areas.filter(f => areaEntries.has(f.properties.slug) && kept.has(f.properties.slug));
  root.dataset.geo = crossed.join(' ');
  if (maps && map) draw(regionsGeo.filter(f => regionEntries.has(f.properties.slug)), visibleAreas, tree);
  renderTree(tree);
  // Liste issue de Routes affichée : jamais à côté d'une carte non Google (conditions Google Maps Platform,
  // 3.2.3(e) et 19.2). La carte statique Laureati est masquée par layout(), avec ou sans carte Google.
  el('arbre-trajet').hidden = false;
  layout();
}

/** Adresse de partage et sauvegarde de session, à jour du couloir. */
function saveTrip() {
  if (!trip) return;
  const query = { ...trip.query, couloir: width() };
  history.replaceState(history.state, '', `${location.pathname}#${tripQuery(query)}`);
  try { sessionStorage.setItem(savedKey, JSON.stringify({ v: 1, trip: query, route: trip.route })); } catch { /* session indisponible : pas de restauration */ }
}
// Lieux du trajet dans le fragment (#) : jamais transmis au serveur. Le lien d'évitement (#contenu) remplace le
// fragment ; il est réécrit aussitôt (trajet affiché ou prérempli), sans déplacer le focus ni le défilement.
// Un lien de trajet collé dans cet onglet ne recharge pas le document : recharger s'il diffère du trajet affiché
// (ou s'il n'y en a pas). Le rechargement n'envoie pas le fragment ; l'ouverture préremplit ou restaure.
// replaceState ne déclenche pas hashchange : pas de boucle.
addEventListener('hashchange', () => {
  const next = parseTripQuery(location.hash.slice(1));
  if (!next) {
    if (trip) saveTrip();
    else if (prefilled) history.replaceState(history.state, '', `${location.pathname}#${tripQuery(prefilled)}`);
    return;
  }
  if (!trip || !sameTrip(next, trip.query) || next.couloir !== width()) location.reload();
  else saveTrip(); // même trajet écrit autrement : adresse remise à la forme canonique
});
el('couloir').addEventListener('input', () => setWidth(width()));
el('couloir').addEventListener('change', () => {
  if (!trip) return;
  render().then(() => {
    saveTrip();
    // Seul l'échec local précédent est effacé : les autres erreurs (plafond de cartes, Google indisponible) restent vraies.
    if (el('etat-trajet').textContent === 'Calcul local impossible.') status('Distance mise à jour. Modifiez-la sous la carte sans nouvelle recherche Google.');
  }).catch(() => status('Calcul local impossible.', true));
});

/** Carte Google du trajet courant. Faux si le plafond de session est atteint ou si Google ne répond pas :
 * bouton pour réessayer (même plafond). La carte statique est masquée par render() dès que la liste s'affiche. */
async function showMap(mapsReady: Promise<any>): Promise<{ ok: boolean; message?: string }> {
  try {
    maps = await mapsReady;
    mapState = 'shown'; layout();
    if (!map) { map = new maps.Map(el('carte-google'), { center: { lat: 46.6, lng: 2.5 }, zoom: 6, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false }); map.addListener('zoom_changed', () => applyBand()); }
    const bounds = new maps.LatLngBounds(); trip!.path.forEach(p => bounds.extend(p)); map.fitBounds(bounds);
    return { ok: true };
  } catch (error) {
    mapState = 'failed'; layout();
    return { ok: false, message: error instanceof MapQuotaError ? error.message : 'Carte Google indisponible. L’arbre ci-dessous reste utilisable.' };
  }
}

/** Affiche un trajet calculé ou restauré : données locales, carte Google (un seul chargement par page), arbre. */
async function display(query: TripQuery, route: SavedRoute, restored: boolean) {
  step('vignerons', 'doing'); status('Recherche des vignerons sur le trajet…');
  const mapsReady = loadMaps(); mapsReady.catch(() => undefined);
  const path = decodePolyline(route.polyline), km = pathLengthKm(path);
  [data, regionsGeo] = await Promise.all([data ?? loadJson<RouteData>('/itineraire/donnees.json'), regionsGeo.length ? regionsGeo : loadJson<{ features: GeoFeature[] }>('/itineraire/geo/regions.json').then(c => c.features)]);
  if (!producersByUrl.size) for (const p of data.producers) producersByUrl.set(p.url, p);
  // Distance et durée totales de Routes ; positions le long du trajet depuis la polyligne seule.
  trip = { query, route, path, samples: resample(path, 1), km: (route.distanceMeters ?? km * 1000) / 1000, seconds: parseFloat(route.staticDuration ?? '0') || 0 };
  // Saisie remplacée par le résumé dès que le trajet s'affiche : aucun libellé Places à côté de la carte.
  formOpen = false; for (const id of ['depart', 'arrivee']) resetSuggestions[id]?.(); layout();
  step('vignerons', 'done'); step('carte', 'doing'); status('Affichage de la carte…');
  const shown = await showMap(mapsReady);
  await render();
  saveTrip();
  step('carte', shown.ok ? 'done' : 'error');
  status(shown.ok ? `${restored ? 'Trajet restauré' : 'Trajet calculé'}. Modifiez la distance sous la carte sans nouvelle recherche Google.` : shown.message!, !shown.ok);
  root.dataset.etat = restored ? 'restaure' : 'calcule';
}

// Carte à la demande, après un plafond atteint ou un échec : même plafond de session.
el('charger-carte').addEventListener('click', async () => {
  if (busy || !trip) return;
  setBusy(true, 'Chargement de la carte…');
  try {
    const shown = await showMap(loadMaps());
    if (shown.ok) { await render(); step('carte', 'done'); status('Carte Google affichée. Modifiez la distance sous la carte sans nouvelle recherche Google.'); el('carte-google').focus(); }
    else status(shown.message!, true);
  } finally { setBusy(false); }
});

el('trajet').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  if (!key) { status('Le calcul est indisponible pour ce build. Les listes restent accessibles.', true); return; }
  const values = ['depart', 'arrivee'].map(id => el<HTMLInputElement>(id).value.trim());
  if (values.some(v => v.length < 2)) { status('Saisissez un départ et une arrivée.', true); return; }
  let allowed = false; try { allowed = takeSearch(sessionStorage); } catch { /* stockage indisponible */ }
  if (!allowed) { status('Limite de 10 recherches par session atteinte. Les listes restent accessibles.', true); return; }
  // Le clic vaut accord : mémorisé sur l'appareil, sans cookie.
  consent = true; try { localStorage.setItem(consentKey, 'oui'); } catch { /* accord limité à la page */ } showConsent();
  setBusy(true); resetSteps(); closePanel();
  let current: Step = 'robot';
  try {
    step('robot', 'doing'); status('Vérification anti-robot en cours…'); await verifyHuman(); step('robot', 'done');
    current = 'trajet'; step('trajet', 'doing'); status('Calcul du trajet en cours…');
    const waypoint = (id: string, value: string) => chosen[id]?.label === value ? { placeId: chosen[id]!.placeId } : { address: value };
    loadMaps().catch(() => undefined);
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': ROUTES_FIELD_MASK }, body: JSON.stringify({ origin: waypoint('depart', values[0]), destination: waypoint('arrivee', values[1]), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', polylineQuality: 'HIGH_QUALITY', computeAlternativeRoutes: false, languageCode: 'fr', regionCode: 'fr', units: 'METRIC' }) });
    if (response.status === 400 || response.status === 404) throw new Error('Adresse introuvable. Précisez la commune ou choisissez une suggestion.');
    if (response.status === 403 || response.status === 429) throw new Error('Google refuse la demande pour le moment (quota ou autorisation). Réessayez plus tard.');
    if (!response.ok) throw new Error('Le calcul Google est indisponible. Réessayez plus tard.');
    const result = (await response.json()).routes?.[0];
    if (!result?.polyline?.encodedPolyline) throw new Error('Aucun trajet en voiture trouvé entre ces deux adresses.');
    step('trajet', 'done');
    const placeOf = (id: string, value: string) => chosen[id]?.label === value ? chosen[id]!.placeId : undefined;
    const query: TripQuery = { depart: values[0], arrivee: values[1], departId: placeOf('depart', values[0]), arriveeId: placeOf('arrivee', values[1]), couloir: width() };
    const route: SavedRoute = { polyline: result.polyline.encodedPolyline, distanceMeters: result.distanceMeters, staticDuration: result.staticDuration };
    current = 'vignerons';
    await display(query, route, false);
    // « Calculer » est masqué avec la saisie : le focus passe au résumé du trajet.
    el('resume-titre').focus({ preventScroll: true });
    // Carte et état du calcul visibles ensemble après le résultat.
    if (!el('carte-cadre').hidden) el('carte-cadre').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  } catch (error) {
    const failed = document.querySelector<HTMLElement>(`#etapes [data-step="${current}"]`)?.dataset.state === 'done' ? 'carte' : current;
    step(failed, 'error');
    status(error instanceof Error && error.message ? error.message : 'Calcul indisponible. Les listes restent accessibles.', true);
  } finally { setBusy(false); }
});

// Adresse partagée : champs préremplis, aucun appel tiers avant « Calculer ». Trajet déjà calculé dans cette
// session (retour depuis une fiche, rechargement) : restauré depuis sessionStorage, sans Routes ni Turnstile.
const shared = parseTripQuery(location.hash.slice(1));
prefilled = shared;
if (shared) {
  fillFields(shared);
  setWidth(shared.couloir);
  let saved; try { saved = readSavedTrip(sessionStorage.getItem(savedKey)); } catch { /* session indisponible */ }
  if (saved && consent && key && sameTrip(saved.trip, shared)) {
    // « Calculer » désactivé pendant la restauration : un calcul ne peut pas être réécrit par elle.
    resetSteps(); step('robot', 'skip'); step('trajet', 'skip'); setBusy(true, 'Restauration…');
    display(shared, saved.route, true).catch(() => { step('carte', 'error'); status('Restauration impossible. Cliquez sur « Calculer ».', true); }).finally(() => setBusy(false));
  } else status('Trajet prérempli depuis le lien. Cliquez sur « Calculer » pour l’afficher.');
}
layout();

// « Modifier le trajet » : saisie rouverte, carte masquée. « Annuler » revient au trajet affiché, sans appel Google.
el('modifier-trajet').addEventListener('click', () => {
  if (busy || !trip) return;
  closePanel(); if (el('carte-zone').classList.contains('is-plein')) fullscreen(false);
  formOpen = true; layout(); el<HTMLInputElement>('depart').focus();
});
el('annuler-modification').addEventListener('click', () => {
  if (busy || !trip) return;
  fillFields(trip.query); formOpen = false; layout(); el('resume-titre').focus();
});

el('copier-lien').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); el('copier-etat').textContent = 'Lien copié.'; }
  // Lien non affiché en clair : il porte les lieux saisis, à côté de la carte.
  catch { el('copier-etat').textContent = 'Copie impossible. Copiez l’adresse de la page.'; }
});
