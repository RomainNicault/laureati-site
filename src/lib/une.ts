// « À la une » de l'accueil : classements tirés au hasard à chaque build
// parmi les appellations les plus connues, sans JavaScript côté client.
import type { Appellation, Ranking } from './types.ts';

/** Appellations réputées, retenues seulement si elles sont classées dans l'export. */
export const APPELLATIONS_CONNUES = [
  'Chablis', 'Sancerre', 'Pouilly-Fumé', 'Chinon', 'Vouvray', 'Saumur-Champigny', 'Muscadet Sèvre et Maine',
  'Morgon', 'Fleurie', 'Moulin-à-Vent', 'Brouilly', 'Juliénas', 'Saint-Amour',
  'Châteauneuf-du-Pape', 'Gigondas', 'Côte-Rôtie', 'Hermitage', 'Crozes-Hermitage', 'Saint-Joseph', 'Vacqueyras', 'Tavel',
  'Saint-Émilion', 'Pomerol', 'Pauillac', 'Margaux', 'Saint-Julien', 'Pessac-Léognan', 'Sauternes',
  'Meursault', 'Pommard', 'Gevrey-Chambertin', 'Pouilly-Fuissé', 'Mâcon-Villages',
  'Champagne', 'Crémant d’Alsace', 'Alsace grand cru', 'Cahors', 'Madiran', 'Jurançon', 'Bandol', 'Côtes de Provence', 'Pic Saint-Loup',
];

const cle = (nom: string) => nom.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\bsaint\b/g, 'st').trim();

/** Classement principal d'une appellation : la couleur la plus disputée. */
const principal = (a: Appellation): Ranking | undefined =>
  [...a.classements].sort((x, y) => y.total_vignerons_medailles - x.total_vignerons_medailles)[0];

export function candidatesUne(appellations: Appellation[]): { appellation: Appellation; group: Ranking }[] {
  const connues = new Set(APPELLATIONS_CONNUES.map(cle));
  return appellations.filter(a => connues.has(cle(a.nom)))
    .map(appellation => ({ appellation, group: principal(appellation) }))
    .filter((x): x is { appellation: Appellation; group: Ranking } => x.group !== undefined && x.group.vignerons.length >= 3);
}

export function featuredGroups(appellations: Appellation[], n: number, random: () => number = Math.random) {
  const pool = candidatesUne(appellations);
  // Repli si l'export ne contient presque aucune appellation connue (données d'exemple).
  const source = pool.length >= n ? pool : appellations.map(appellation => ({ appellation, group: principal(appellation) }))
    .filter((x): x is { appellation: Appellation; group: Ranking } => x.group !== undefined);
  const copie = [...source];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie.slice(0, n);
}
