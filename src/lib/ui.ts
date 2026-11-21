// Aides de présentation partagées par les composants du système « Palmarès ».
import type { Appellation, Medal, Producer } from './types.ts';
import { safeWebsite } from './site.ts';

export type MedalKind = 'grand-or' | 'or' | 'argent' | 'bronze' | 'autre';
export const MEDAL_ORDER: MedalKind[] = ['grand-or', 'or', 'argent', 'bronze', 'autre'];
export const MEDAL_LABEL: Record<MedalKind, string> = { 'grand-or': 'Grand Or', or: 'Or', argent: 'Argent', bronze: 'Bronze', autre: 'Autre' };

export function medalKind(label: string): MedalKind {
  const key = label.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
  if (key === 'grand or') return 'grand-or';
  if (key === 'or') return 'or';
  if (key === 'argent') return 'argent';
  if (key === 'bronze') return 'bronze';
  return 'autre';
}

/** Décompte des médailles par niveau, du plus haut au plus bas. */
export function medalTally(medals: Medal[]): { kind: MedalKind; count: number }[] {
  const counts = new Map<MedalKind, number>();
  for (const m of medals) counts.set(medalKind(m.medaille), (counts.get(medalKind(m.medaille)) ?? 0) + 1);
  return MEDAL_ORDER.filter(k => counts.has(k)).map(kind => ({ kind, count: counts.get(kind)! }));
}

/** Tri des médailles : campagne la plus récente d'abord, puis niveau. */
export const sortMedals = (medals: Medal[]): Medal[] => [...medals].sort((a, b) =>
  b.annee - a.annee || MEDAL_ORDER.indexOf(medalKind(a.medaille)) - MEDAL_ORDER.indexOf(medalKind(b.medaille)) || a.concours_id.localeCompare(b.concours_id, 'fr'));

/** Teinte associée à une couleur de vin (variable CSS --tone-*). */
export function wineTone(couleur: string): string {
  const c = couleur.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  if (c.includes('effervescent') && c.includes('rose')) return 'bulles-rose';
  if (c.includes('effervescent')) return 'bulles';
  if (c.startsWith('rose')) return 'rose';
  if (c.startsWith('rouge')) return 'rouge';
  if (c.includes('clairet')) return 'clairet';
  if (c.includes('liquoreux') || c.includes('paille')) return 'liquoreux';
  if (c.includes('moelleux') || c.includes('demi-sec')) return 'moelleux';
  if (c.includes('jaune')) return 'jaune';
  if (c.startsWith('gris')) return 'gris';
  if (c.includes('pommeau')) return 'pommeau';
  if (c.includes('cidre') || c.includes('poire')) return 'cidre';
  return 'blanc';
}

/** Rang en ordinal français : 1er, 2e, 3e. */
export const ordinalSuffix = (n: number): string => (n === 1 ? 'er' : 'e');

export const telHref = (phone: string): string => `tel:${phone.replace(/[^+0-9]/g, '')}`;

export interface RouteLink { label: string; href: string }
export function routeLinks(p: Pick<Producer, 'latitude' | 'longitude' | 'google_place_id'>): RouteLink[] {
  if (p.latitude === undefined || p.longitude === undefined) return [];
  const ll = `${p.latitude},${p.longitude}`;
  return [
    { label: 'Apple Plans', href: `https://maps.apple.com/?daddr=${ll}` },
    { label: 'Google Maps', href: `https://www.google.com/maps/dir/?api=1&destination=${ll}${p.google_place_id ? `&destination_place_id=${encodeURIComponent(p.google_place_id)}` : ''}` },
    { label: 'Waze', href: `https://waze.com/ul?ll=${ll}&navigate=yes` },
  ];
}

/** Liens d'action communs au rendu Astro et aux résultats dynamiques. */
export function producerActions(p: Pick<Producer, 'telephone' | 'site' | 'latitude' | 'longitude' | 'google_place_id'>) {
  return { phone: p.telephone ? telHref(p.telephone) : undefined, website: safeWebsite(p.site), routes: routeLinks(p) };
}

/** Nom d'hôte lisible d'un site web (sans www). */
export const hostOf = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

const SMALL_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'en', 'et', 'aux', 'au', 'lès', 'les']);
/** Commune lisible : une donnée tout en capitales passe en casse de titre (affichage seulement). */
export function displayPlace(place?: string): string | undefined {
  if (!place) return place;
  if (place !== place.toUpperCase()) return place.replace(/ (Du|De|Des|La|Le|Les|Sur|Sous|En|Et|Aux|Au) /g, (m) => m.toLowerCase());
  return place.toLowerCase().replace(/[\p{L}']+/gu, (word, offset: number) => {
    if (offset > 0 && SMALL_WORDS.has(word)) return word;
    if (/^[dl]'/.test(word)) return word.slice(0, 2) + word.charAt(2).toUpperCase() + word.slice(3);
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).replace(/\bCedex\b/g, 'Cedex');
}

const intFormatter = new Intl.NumberFormat('fr-FR');
// Espace insécable classique : l'espace fine (U+202F) est absente de Cormorant.
export const formatInt = (n: number): string => intFormatter.format(n).replace(/\u202f/g, '\u00a0');

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
export const formatDate = (iso: string): string => dateFormatter.format(new Date(iso));

const TYPE_LABEL: Record<string, string> = { vigneron: 'Vigneron', 'cave cooperative': 'Cave coopérative', negoce: 'Négoce' };
/** Type de producteur lisible, marqué « probable » quand il est déduit de la dénomination. */
export function producerType(p: Pick<Producer, 'type_producteur'>): string | undefined {
  const t = p.type_producteur;
  if (!t?.valeur) return undefined;
  const label = TYPE_LABEL[t.valeur] ?? t.valeur.charAt(0).toUpperCase() + t.valeur.slice(1);
  return t.probable ? `${label} (probable)` : label;
}

const PLURAL: Record<string, string> = { rouge: 'rouges', blanc: 'blancs', 'rosé': 'rosés', jaune: 'jaunes', gris: 'gris', clairet: 'clairets', liquoreux: 'liquoreux', moelleux: 'moelleux' };
const joinFr = (items: string[]): string => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
/** Synthèse d'une fiche en une ligne : « 1er en Brouilly et Morgon rouges · 10 fois dans le top 5 ». */
export function producerSummary(p: Pick<Producer, 'appellations'>, appellations: Map<string, Appellation>): string | undefined {
  const positions = p.appellations.filter(x => appellations.has(x.appellation_id));
  if (!positions.length) return undefined;
  const best = Math.min(...positions.map(x => x.rang));
  const byColor = new Map<string, string[]>();
  for (const x of positions.filter(x => x.rang === best).sort((a, b) => b.score - a.score)) {
    const key = x.couleur.toLowerCase();
    if (!byColor.has(key)) byColor.set(key, []);
    byColor.get(key)!.push(appellations.get(x.appellation_id)!.nom);
  }
  const parts: string[] = [];
  let shown = 0, hidden = 0;
  for (const [color, names] of byColor) {
    const kept = names.slice(0, Math.max(0, 3 - shown));
    hidden += names.length - kept.length;
    if (!kept.length) continue;
    shown += kept.length;
    parts.push(`${joinFr(kept)} ${kept.length > 1 ? (PLURAL[color] ?? color) : color}`);
  }
  const more = hidden > 0 ? ` et ${hidden} autre${hidden > 1 ? 's' : ''}` : '';
  const head = `${best}${ordinalSuffix(best)} en ${joinFr(parts)}${more}`;
  const top5 = positions.filter(x => x.top5).length;
  return top5 > 1 ? `${head} · ${top5} fois dans le top 5` : head;
}
