// Pages concours : adresses stables, barèmes et contributions au score.
import type { Appellation, Calendrier, Competition, Dataset, Medal, Producer } from './types.ts';

/** Clé d'URL d'un concours : identifiant export sans préfixe ni accent. */
export function competitionKey(id: string): string {
  return id.replace(/^concours:/i, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const competitionPath = (competition: Competition): string => `/concours/${competitionKey(competition.id)}/`;
export const campaignPath = (competition: Competition, annee: number): string => `${competitionPath(competition)}${annee}/`;

export interface BaremeLevel { label: string; points: number }

const OR_SCALE: BaremeLevel[] = [
  { label: 'Or', points: 3 },
  { label: 'Argent', points: 2 },
  { label: 'Bronze', points: 1 },
];
const GRAND_OR_SCALE: BaremeLevel[] = [
  { label: 'Grand Or', points: 3 },
  { label: 'Or', points: 2 },
  { label: 'Argent', points: 1 },
];

/** Barème par concours, aligné sur la méthodologie et le calcul du score. */
export function bareme(competition: Competition, medals: Medal[]): BaremeLevel[] {
  const key = competitionKey(competition.id);
  if (key === 'ligers' || key === 'sud-ouest') return GRAND_OR_SCALE;
  if (['bordeaux', 'cga', 'cvi', 'macon', 'orange'].includes(key)) return OR_SCALE;
  const grandOr = medals.some(medal => medal.concours_id === competition.id
    && medal.medaille.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '') === 'grand or');
  return grandOr ? GRAND_OR_SCALE : OR_SCALE;
}

/** Barèmes de tous les concours, calculés une fois par page. */
export function baremes(dataset: Dataset): Map<string, BaremeLevel[]> {
  const medals = dataset.producers.flatMap(producer => producer.medailles);
  return new Map(dataset.competitions.map(competition => [competition.id, bareme(competition, medals)]));
}

/** Coefficients publiés : rang de la campagne parmi les trois dernières absorbées. */
const RECENCE = [
  { value: 1, label: '1' },
  { value: 2 / 3, label: '2/3' },
  { value: 1 / 3, label: '1/3' },
];

/** Rang de la campagne, de la plus récente (0) à la plus ancienne ; -1 hors fenêtre. */
function recencyIndex(competition: Competition, annee: number): number {
  const campaigns = [...competition.campagnes_score].sort((a, b) => b - a).slice(0, RECENCE.length);
  return campaigns.indexOf(annee);
}

/** Coefficient de récence : 1, puis 2/3, puis 1/3, quel que soit le nombre de campagnes. */
export function coefficient(competition: Competition, annee: number): number {
  return RECENCE[recencyIndex(competition, annee)]?.value ?? 0;
}

/** Écriture lisible du coefficient, pour refaire le calcul à la main. */
export function coefficientLabel(competition: Competition, annee: number): string {
  return RECENCE[recencyIndex(competition, annee)]?.label ?? '0';
}

export interface Contribution {
  competition: Competition;
  annee: number;
  medaille: string;
  points: number;
  coefficient: number;
  /** Poids du concours, multiplié au même titre que le coefficient. */
  poids: number;
  score: number;
  /** Autres médailles de la même campagne, sans effet sur le score. */
  autres: number;
}

/** Meilleure médaille par concours et campagne, puis contribution au score du groupe. */
export function contributions(producer: Producer, appellationId: string, couleur: string,
  competition: Competition, scale: BaremeLevel[]): Contribution[] {
  const medals = producer.medailles.filter(medal => medal.concours_id === competition.id
    && medal.appellation_id === appellationId && medal.couleur === couleur);
  const byYear = new Map<number, Medal[]>();
  for (const medal of medals) {
    if (!byYear.has(medal.annee)) byYear.set(medal.annee, []);
    byYear.get(medal.annee)!.push(medal);
  }
  const points = (label: string): number => scale.find(level => level.label === label)?.points ?? 0;
  const result: Contribution[] = [];
  for (const [annee, campaignMedals] of byYear) {
    const coef = coefficient(competition, annee);
    if (coef === 0) continue;
    const best = [...campaignMedals].sort((a, b) => points(b.medaille) - points(a.medaille))[0];
    const value = points(best.medaille);
    if (value === 0) continue;
    result.push({
      competition, annee, medaille: best.medaille, points: value, coefficient: coef,
      poids: competition.poids, score: competition.poids * coef * value, autres: campaignMedals.length - 1,
    });
  }
  return result.sort((a, b) => b.annee - a.annee || b.score - a.score);
}

export const contributionScore = (items: Contribution[]): number => items.reduce((sum, item) => sum + item.score, 0);

export interface Exemple {
  producer: Producer;
  appellation: Appellation;
  couleur: string;
  contributions: Contribution[];
  score: number;
  rang: number;
  total: number;
  suivant?: number;
}

/** Exemple réel et recalculable : Beaune rouge si présent, sinon premier groupe
 *  dont les contributions montrent au moins deux coefficients de récence différents. */
export function exempleCalcul(dataset: Dataset): Exemple | null {
  const scales = baremes(dataset);
  const producers = new Map(dataset.producers.map(producer => [producer.id, producer]));
  const ordered = [...dataset.appellations].sort((a, b) => a.slug.localeCompare(b.slug, 'fr'));
  const preferred = ordered.find(appellation => appellation.slug === 'beaune');
  const candidates = preferred ? [preferred, ...ordered.filter(appellation => appellation !== preferred)] : ordered;
  for (const appellation of candidates) {
    const groups = [...appellation.classements].sort((a, b) =>
      Number(b.couleur === 'Rouge') - Number(a.couleur === 'Rouge') || a.couleur.localeCompare(b.couleur, 'fr'));
    for (const group of groups) {
      const entries = [...group.vignerons].sort((a, b) => a.rang - b.rang);
      for (const entry of entries) {
        const producer = producers.get(entry.producer_id);
        if (!producer) continue;
        const items = dataset.competitions.flatMap(competition =>
          contributions(producer, appellation.id, group.couleur, competition, scales.get(competition.id) ?? OR_SCALE));
        const coefficients = new Set(items.map(item => item.coefficient));
        if (coefficients.size >= 2 && contributionScore(items) > 0) {
          const following = entries.find(item => item.rang === entry.rang + 1);
          return {
            producer, appellation, couleur: group.couleur, contributions: items,
            score: contributionScore(items), rang: entry.rang, total: group.total_vignerons_medailles,
            suivant: following?.score,
          };
        }
      }
    }
  }
  return null;
}

export interface RepereCalendrier { competition: Competition; mois: string }

const MOIS_ORDRE = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Libellé neutre d'un concours dont l'export ne porte pas de calendrier. */
export const MOIS_NON_RENSEIGNE = 'mois non renseigné';

/** Libellé des mois de parution : un mois seul, ou « février à mars » ; neutre sans calendrier. */
export function libelleMois(calendrier?: Calendrier): string {
  if (!calendrier) return MOIS_NON_RENSEIGNE;
  const debut = MOIS_ORDRE[calendrier.mois_debut - 1];
  const fin = MOIS_ORDRE[calendrier.mois_fin - 1];
  // Hors 1-12 : déjà refusé par le schéma de chargement, aucun libellé inventé.
  if (!debut || !fin) return MOIS_NON_RENSEIGNE;
  return debut === fin ? debut : `${debut} à ${fin}`;
}

/** Calendrier des palmarès : un repère par concours suivi, mois seulement, dans l'ordre de parution. */
export function calendrierPalmares(dataset: Dataset): RepereCalendrier[] {
  const rang = (competition: Competition) => competition.calendrier?.mois_debut ?? MOIS_ORDRE.length + 1;
  return dataset.competitions
    .map(competition => ({ competition, mois: libelleMois(competition.calendrier) }))
    .sort((a, b) => rang(a.competition) - rang(b.competition) || a.competition.nom.localeCompare(b.competition.nom, 'fr'));
}

/** Amplitude des mois publiés, pour la phrase de la méthodologie ; null sans aucun calendrier. */
export function plageCalendrier(dataset: Dataset): { debut: string; fin: string } | null {
  const debuts = dataset.competitions.flatMap(competition => competition.calendrier ? [competition.calendrier.mois_debut] : []);
  const fins = dataset.competitions.flatMap(competition => competition.calendrier ? [competition.calendrier.mois_fin] : []);
  if (debuts.length === 0) return null;
  return { debut: MOIS_ORDRE[Math.min(...debuts) - 1], fin: MOIS_ORDRE[Math.max(...fins) - 1] };
}
