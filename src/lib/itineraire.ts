// Logique pure de la page itinéraire : couloir, aires traversées, arbre région → appellation → vigneron.
// Aucune dépendance au navigateur ni à Google : testable sous Node.
import { wineTone } from './ui.ts';

export interface Point { lat: number; lng: number }
export interface Position { distanceKm: number; alongKm: number }

/** Données compactes servies par /itineraire/donnees.json, chargées seulement après « Calculer ». */
export interface RouteProducer {
  nom: string; url: string; commune?: string; latitude: number; longitude: number;
  telephone?: string; site?: string; google_place_id?: string | null;
  /** [indice appellation, couleur, rang, total médaillés, score, [Grand Or, Or, Argent, Bronze, Autre]] */
  classements: [number, string, number, number, number, number[]][];
}
export interface RouteData {
  regions: { slug: string; nom: string }[];
  appellations: { slug: string; nom: string; regions: number[] }[];
  producers: RouteProducer[];
}
export type Geometry = { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] };
export interface GeoFeature { type: 'Feature'; properties: { slug: string; nom: string; region?: string; bbox?: number[] }; geometry: Geometry }
export interface TreeRow { nom: string; url: string; commune?: string; rang: number; total: number; score: number; medals: number[]; distanceKm: number; alongKm: number; producer: RouteProducer }
export interface TreeColour { couleur: string; famille: string; tone: string; rows: TreeRow[] }
export interface TreeAppellation { slug: string; nom: string; alongKm: number; familles: string[]; count: number; colours: TreeColour[] }
export interface TreeRegion { slug: string; nom: string; alongKm: number; familles: string[]; count: number; appellations: TreeAppellation[]; nearby: { slug: string; nom: string }[] }

const radians = Math.PI / 180;
const KM = 111.195;
const segment = (a: Point, b: Point) => Math.hypot((b.lat - a.lat) * KM, (b.lng - a.lng) * KM * Math.cos((a.lat + b.lat) / 2 * radians));

/** Point du tracé le plus proche, par projection locale sur chaque segment. Précise pour des couloirs de 5 à 30 km. */
export function locate(point: Point, path: Point[]): Position {
  if (path.length === 1) return { distanceKm: segment(point, path[0]), alongKm: 0 };
  let distanceKm = Infinity, alongKm = 0, travelled = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], scale = KM * Math.cos((a.lat + b.lat) / 2 * radians);
    const x = (b.lng - a.lng) * scale, y = (b.lat - a.lat) * KM;
    const px = (point.lng - a.lng) * scale, py = (point.lat - a.lat) * KM;
    const length = Math.hypot(x, y), t = length ? Math.max(0, Math.min(1, (px * x + py * y) / (length * length))) : 0;
    const distance = Math.hypot(px - t * x, py - t * y);
    if (distance < distanceKm) { distanceKm = distance; alongKm = travelled + t * length; }
    travelled += length;
  }
  return { distanceKm, alongKm };
}

export function pathLengthKm(path: Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += segment(path[i - 1], path[i]);
  return total;
}

/** Tracé rééchantillonné à pas fixe, avec le kilomètre de chaque point : borne le coût des calculs d'aires. */
export function resample(path: Point[], stepKm = 1): (Point & { km: number })[] {
  if (!path.length) return [];
  const out = [{ ...path[0], km: 0 }];
  let travelled = 0, next = stepKm;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = segment(a, b);
    while (next < travelled + length) {
      const t = (next - travelled) / length;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, km: next });
      next += stepKm;
    }
    travelled += length;
  }
  const last = path[path.length - 1];
  if (out[out.length - 1].km < travelled) out.push({ ...last, km: travelled });
  return out;
}

function polygons(geometry: Geometry): number[][][][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}
function inRing(p: Point, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p.lat) !== (yj > p.lat) && p.lng < (xj - xi) * (p.lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function inGeometry(p: Point, geometry: Geometry): boolean {
  return polygons(geometry).some(polygon => inRing(p, polygon[0]) && !polygon.slice(1).some(hole => inRing(p, hole)));
}
export function geometryBounds(geometry: Geometry): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const polygon of polygons(geometry)) for (const [x, y] of polygon[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w, s, e, n];
}

/**
 * Entrée d'une aire dans le couloir : premier kilomètre du tracé où l'aire est à moins de `widthKm`.
 * `undefined` si l'aire reste hors couloir. `samples` vient de `resample`.
 */
export function corridorEntry(geometry: Geometry, samples: (Point & { km: number })[], widthKm: number, box = geometryBounds(geometry)): number | undefined {
  const [w, s, e, n] = box;
  const marginLat = widthKm / KM + 0.02, marginLng = widthKm / (KM * Math.cos(((s + n) / 2) * radians)) + 0.02;
  let first = -1, last = -1, entry: number | undefined;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    if (p.lng < w - marginLng || p.lng > e + marginLng || p.lat < s - marginLat || p.lat > n + marginLat) continue;
    if (first < 0) first = i;
    last = i;
    if (entry === undefined && inGeometry(p, geometry)) entry = p.km;
  }
  if (first < 0) return undefined;
  // Sommets de l'aire proches du tracé : couvre les aires frôlées sans être traversées.
  const from = Math.max(0, first - 1), window = samples.slice(from, last + 2), offset = samples[from].km;
  const lats = window.map(p => p.lat), lngs = window.map(p => p.lng);
  const [ws, wn, ww, we] = [Math.min(...lats) - marginLat, Math.max(...lats) + marginLat, Math.min(...lngs) - marginLng, Math.max(...lngs) + marginLng];
  for (const polygon of polygons(geometry)) for (const [lng, lat] of polygon[0]) {
    if (lat < ws || lat > wn || lng < ww || lng > we) continue;
    const position = locate({ lat, lng }, window);
    if (position.distanceKm <= widthKm && (entry === undefined || offset + position.alongKm < entry)) entry = offset + position.alongKm;
  }
  return entry;
}

/** Entrées de toutes les aires d'une collection dans le couloir (slug → km). */
export function corridorEntries(features: GeoFeature[], samples: (Point & { km: number })[], widthKm: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of features) {
    const km = corridorEntry(f.geometry, samples, widthKm);
    if (km !== undefined && !(out.get(f.properties.slug)! <= km)) out.set(f.properties.slug, km);
  }
  return out;
}

/** Grandes familles de couleur, pour les repères de décision. */
export function famille(couleur: string): string {
  const tone = wineTone(couleur);
  if (tone.startsWith('bulles')) return 'Effervescent';
  if (tone === 'rose' || tone === 'gris' || tone === 'clairet') return 'Rosé';
  if (tone === 'rouge') return 'Rouge';
  if (tone === 'liquoreux' || tone === 'moelleux') return 'Doux';
  if (tone === 'jaune') return 'Jaune';
  if (tone === 'cidre' || tone === 'pommeau') return 'Cidre';
  return 'Blanc';
}
export const FAMILLES = ['Rouge', 'Blanc', 'Rosé', 'Effervescent', 'Doux', 'Jaune', 'Cidre'];
export const MEDAL_KEYS = ['grand-or', 'or', 'argent', 'bronze', 'autre'];
const sortFamilles = (values: Iterable<string>) => [...new Set(values)].sort((a, b) => FAMILLES.indexOf(a) - FAMILLES.indexOf(b));

/**
 * Arbre de décision : régions dans l'ordre du trajet, puis leurs appellations, puis leurs vignerons triés par score.
 * `entries` : entrée de chaque aire de région ou d'appellation dans le couloir (slug → km), depuis les fichiers géo.
 */
export function buildTree(data: RouteData, path: Point[], widthKm: number, entries: { regions?: Map<string, number>; aires?: Map<string, number> } = {}): TreeRegion[] {
  const regions = new Map<string, TreeRegion>(), apps = new Map<string, TreeAppellation>();
  const regionOrder = (slug: string) => entries.regions?.get(slug) ?? Infinity;
  for (const producer of data.producers) {
    const position = locate({ lat: producer.latitude, lng: producer.longitude }, path);
    if (position.distanceKm > widthKm) continue;
    for (const [index, couleur, rang, total, score, medals] of producer.classements) {
      const fam = famille(couleur);
      const a = data.appellations[index];
      if (!a) continue;
      // Appellation à cheval sur deux régions : rattachée à celle que le trajet atteint en premier.
      const regionIndex = [...a.regions].sort((x, y) => regionOrder(data.regions[x].slug) - regionOrder(data.regions[y].slug))[0];
      const r = data.regions[regionIndex] ?? { slug: '', nom: 'Région non renseignée' };
      let region = regions.get(r.slug);
      if (!region) regions.set(r.slug, region = { slug: r.slug, nom: r.nom, alongKm: entries.regions?.get(r.slug) ?? Infinity, familles: [], count: 0, appellations: [], nearby: [] });
      let app = apps.get(a.slug);
      if (!app) { apps.set(a.slug, app = { slug: a.slug, nom: a.nom, alongKm: Infinity, familles: [], count: 0, colours: [] }); region.appellations.push(app); }
      let colour = app.colours.find(c => c.couleur === couleur);
      if (!colour) app.colours.push(colour = { couleur, famille: fam, tone: wineTone(couleur), rows: [] });
      colour.rows.push({ nom: producer.nom, url: producer.url, commune: producer.commune, rang, total, score, medals, ...position, producer });
      app.alongKm = Math.min(app.alongKm, position.alongKm);
      region.alongKm = Math.min(region.alongKm, position.alongKm);
    }
  }
  for (const region of regions.values()) {
    const producers = new Set<string>();
    for (const app of region.appellations) {
      const own = new Set<string>();
      for (const colour of app.colours) {
        colour.rows.sort((a, b) => b.score - a.score || a.rang - b.rang || a.nom.localeCompare(b.nom, 'fr'));
        for (const row of colour.rows) { own.add(row.url); producers.add(row.url); }
      }
      app.colours.sort((a, b) => FAMILLES.indexOf(a.famille) - FAMILLES.indexOf(b.famille) || a.couleur.localeCompare(b.couleur, 'fr'));
      app.familles = sortFamilles(app.colours.map(c => c.famille));
      app.count = own.size;
    }
    region.appellations.sort((a, b) => a.alongKm - b.alongKm || a.nom.localeCompare(b.nom, 'fr'));
    region.familles = sortFamilles(region.appellations.flatMap(a => a.familles));
    region.count = producers.size;
  }
  // Aires du couloir sans vigneron classé retenu : citées pour la découverte, sans ligne.
  if (entries.aires) for (const [slug] of [...entries.aires].sort((a, b) => a[1] - b[1])) {
    if (apps.has(slug)) continue;
    const a = data.appellations.find(x => x.slug === slug);
    const r = a?.regions.map(i => data.regions[i]).find(x => regions.has(x.slug));
    if (a && r) regions.get(r.slug)!.nearby.push({ slug: a.slug, nom: a.nom });
  }
  return [...regions.values()].sort((a, b) => a.alongKm - b.alongKm || a.nom.localeCompare(b.nom, 'fr'));
}

/**
 * Repère « À 120 km du départ » : kilomètre du tracé, calculé dans le navigateur depuis la polyligne seule.
 * Conditions Google Maps Platform EEE (Routes) : ni description ni étapes du trajet avec une carte.
 * Arrondi à 5 km, sans fausse précision.
 */
export function formatAlong(alongKm: number): string {
  if (!Number.isFinite(alongKm)) return '';
  const km = Math.round(Math.max(0, alongKm) / 5) * 5;
  return km < 5 ? 'À moins de 5 km du départ' : `À ${km} km du départ`;
}

/** « 35 min », « 2 h 10 » : arrondi à 5 minutes, sans fausse précision. */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 300) * 5);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

export function decodePolyline(value: string): Point[] {
  let index = 0, lat = 0, lng = 0; const points: Point[] = [];
  function delta() { let result = 0, shift = 0, bits; do { if (index >= value.length || shift > 30) throw new Error('Tracé invalide'); bits = value.charCodeAt(index++) - 63; result |= (bits & 31) << shift; shift += 5; } while (bits >= 32); return result & 1 ? ~(result >> 1) : result >> 1; }
  while (index < value.length) { lat += delta(); lng += delta(); points.push({ lat: lat / 1e5, lng: lng / 1e5 }); }
  return points;
}

/** Compteur de session : vrai et incrémenté tant que le plafond n'est pas atteint. Valeur illisible = plafond atteint. */
function takeQuota(store: Pick<Storage, 'getItem' | 'setItem'>, key: string, max: number): boolean {
  const raw = Number(store.getItem(key) ?? 0), count = Number.isFinite(raw) && raw >= 0 ? raw : max;
  if (count >= max) return false;
  store.setItem(key, String(count + 1)); return true;
}
export const RECHERCHES_MAX = 10, CARTES_MAX = 20;
export const takeSearch = (store: Pick<Storage, 'getItem' | 'setItem'>) => takeQuota(store, 'laureati-recherches', RECHERCHES_MAX);
/** Chargements de la carte Google (Maps JavaScript) par session d'onglet : calcul, restauration et bouton compris. */
export const takeMapLoad = (store: Pick<Storage, 'getItem' | 'setItem'>) => takeQuota(store, 'laureati-cartes', CARTES_MAX);

/** Nombre de sommets d'une géométrie : mesure du coût d'affichage. */
export function vertexCount(geometry: Geometry): number {
  return polygons(geometry).reduce((n, polygon) => n + polygon.reduce((m, ring) => m + ring.length, 0), 0);
}

/** Douglas-Peucker sur un anneau fermé, tolérance en degrés. Garde au moins 4 points (anneau fermé valide). */
function simplifyRing(ring: number[][], tolerance: number): number[][] {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length); keep[0] = keep[ring.length - 1] = 1;
  // L'anneau est fermé : on le coupe au point le plus éloigné du premier pour éviter un segment nul.
  let far = 1, best = -1;
  for (let i = 1; i < ring.length - 1; i++) { const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]); if (d > best) { best = d; far = i; } }
  keep[far] = 1;
  const stack: [number, number][] = [[0, far], [far, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!, [ax, ay] = ring[a], [bx, by] = ring[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let index = -1, max = tolerance;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i];
      const d = len ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / len : Math.hypot(px - ax, py - ay);
      if (d > max) { max = d; index = i; }
    }
    if (index > 0) { keep[index] = 1; stack.push([a, index], [index, b]); }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring;
}

/** Géométrie allégée pour l'affichage seulement : le calcul du couloir garde la géométrie d'origine. */
export function simplifyGeometry(geometry: Geometry, tolerance: number): Geometry {
  const one = (polygon: number[][][]) => polygon.map(ring => simplifyRing(ring, tolerance));
  return geometry.type === 'Polygon' ? { type: 'Polygon', coordinates: one(geometry.coordinates) } : { type: 'MultiPolygon', coordinates: geometry.coordinates.map(one) };
}

/** Densité de la carte selon le zoom : régions, puis appellations, puis vignerons. */
export type ZoomBand = 'regions' | 'appellations' | 'vignerons';
export const ZOOM_APPELLATIONS = 8, ZOOM_VIGNERONS = 10;
export function zoomBand(zoom: number): ZoomBand {
  return zoom >= ZOOM_VIGNERONS ? 'vignerons' : zoom >= ZOOM_APPELLATIONS ? 'appellations' : 'regions';
}

/** Trajet partageable : libellés, identifiants de lieu facultatifs, couloir. Rien d'autre dans l'adresse. */
export interface TripQuery { depart: string; arrivee: string; departId?: string; arriveeId?: string; couloir: number }
export const COULOIR_DEFAUT = 10;
const cleanLabel = (v: string | null) => (v ?? '').trim().slice(0, 200);
const cleanId = (v: string | null) => (v && /^[A-Za-z0-9_-]{1,300}$/.test(v) ? v : undefined);
export function cleanCouloir(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 5 && n <= 30 && n % 5 === 0 ? n : COULOIR_DEFAUT;
}
export function tripQuery(t: TripQuery): string {
  const q = new URLSearchParams({ depart: t.depart, arrivee: t.arrivee });
  if (t.departId) q.set('depart_id', t.departId);
  if (t.arriveeId) q.set('arrivee_id', t.arriveeId);
  q.set('couloir', String(cleanCouloir(t.couloir)));
  return q.toString();
}
export function parseTripQuery(search: string): TripQuery | undefined {
  const q = new URLSearchParams(search), depart = cleanLabel(q.get('depart')), arrivee = cleanLabel(q.get('arrivee'));
  if (depart.length < 2 || arrivee.length < 2) return undefined;
  return { depart, arrivee, departId: cleanId(q.get('depart_id')), arriveeId: cleanId(q.get('arrivee_id')), couloir: cleanCouloir(q.get('couloir')) };
}
/** Même trajet (couloir exclu : il se recalcule localement). */
export const sameTrip = (a: TripQuery, b: TripQuery) => a.depart === b.depart && a.arrivee === b.arrivee && (a.departId ?? '') === (b.departId ?? '') && (a.arriveeId ?? '') === (b.arriveeId ?? '');

/**
 * Champs demandés à Routes : distance et durée totales, polyligne. Jamais `routes.legs.steps` ni description
 * (conditions Google Maps Platform EEE, Routes : pas d'étapes ni de description avec une carte).
 */
export const ROUTES_FIELD_MASK = 'routes.distanceMeters,routes.staticDuration,routes.polyline.encodedPolyline';

/** Résultat Routes conservé en session : restauration sans nouvel appel Google ni Turnstile. Aucune étape. */
export interface SavedRoute { polyline: string; distanceMeters?: number; staticDuration?: string }
export interface SavedTrip { v: 1; trip: TripQuery; route: SavedRoute }
export function readSavedTrip(raw: string | null): SavedTrip | undefined {
  try {
    const s = JSON.parse(raw ?? 'null');
    if (s?.v !== 1 || typeof s.route?.polyline !== 'string') return undefined;
    const trip = parseTripQuery(tripQuery(s.trip));
    // Étapes d'une ancienne sauvegarde ignorées : seuls polyligne, distance et durée totales sont relus.
    return trip ? { v: 1, trip, route: { polyline: s.route.polyline, distanceMeters: Number(s.route.distanceMeters) || undefined, staticDuration: typeof s.route.staticDuration === 'string' ? s.route.staticDuration : undefined } } : undefined;
  } catch { return undefined; }
}

/** Fiche courte d'un vigneron pour le panneau de la carte : classements triés par score, appellation nommée. */
export interface CardRow { slug: string; appellation: string; couleur: string; tone: string; rang: number; total: number; score: number; medals: number[] }
export function producerCard(producer: RouteProducer, data: RouteData): CardRow[] {
  return producer.classements.flatMap(([index, couleur, rang, total, score, medals]) => {
    const a = data.appellations[index];
    return a ? [{ slug: a.slug, appellation: a.nom, couleur, tone: wineTone(couleur), rang, total, score, medals }] : [];
  }).sort((a, b) => b.score - a.score || a.rang - b.rang || a.appellation.localeCompare(b.appellation, 'fr'));
}

/**
 * Affichage de la page selon l'état, conditions Google Maps Platform EEE (« With any Map » : sur, à côté de ou
 * visuellement associé à une carte quelconque, carte Google comprise).
 * - Saisie : aucune carte dès que des suggestions Places sont possibles (focus avec accord) ou qu'un champ porte
 *   un libellé Places (suggestion choisie, identifiant de lieu d'un lien partagé).
 * - Trajet affiché : la saisie est remplacée par un résumé sans nom de lieu ; carte Google, ou liste seule.
 * - La carte statique Laureati n'apparaît jamais avec un trajet (liste issue de Routes).
 */
export interface PageState { trip: boolean; formOpen: boolean; placesStarted: boolean; placesLabel: boolean; map: 'none' | 'shown' | 'failed' }
export interface PageLayout { saisie: boolean; resume: boolean; statique: boolean; carte: boolean; charger: boolean }
export function pageLayout(s: PageState): PageLayout {
  const saisie = !s.trip || s.formOpen, resultat = s.trip && !s.formOpen;
  return { saisie, resume: resultat, statique: !s.trip && !s.placesStarted && !s.placesLabel, carte: resultat && s.map === 'shown', charger: resultat && s.map === 'failed' };
}
