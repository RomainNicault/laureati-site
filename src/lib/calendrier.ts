// Contrat du champ `competitions[].calendrier` de l'export e1-export-1.
// Le producteur publie les mois de parution, l'URL de la source primaire et la
// date de vérification ; `note` reste privé et hors de l'export.
import { z } from 'astro/zod';
import type { Competition } from './types.ts';

const mois = z.number().int('mois entier de 1 à 12 attendu')
  .min(1, 'mois de 1 à 12 attendu').max(12, 'mois de 1 à 12 attendu');
const jour = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date AAAA-MM-JJ attendue')
  // `Date` reporte le 31 février au 3 mars : l'aller-retour ISO refuse une date qui n'existe pas.
  .refine(value => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, 'date inexistante');

/** Champ optionnel : les quatre clés publiées, rien de plus. */
export const calendrierSchema = z.object({
  mois_debut: mois,
  mois_fin: mois,
  source_url: z.string().regex(/^https:\/\/[^\s"<>]+$/, 'URL https:// attendue'),
  verifie_le: jour,
}).refine(value => value.mois_fin >= value.mois_debut, {
  // Le contrat d'export interdit un passage d'année : une plage inversée est une erreur, pas un repère.
  message: 'mois_fin antérieur à mois_debut : le contrat d’export interdit le passage d’année',
  path: ['mois_fin'],
});

/**
 * Valide le seul champ `calendrier` d'un concours exporté, sans contraindre le reste du contrat.
 * Les clés hors liste blanche sont écartées : le site ne lit que les quatre champs publiés.
 */
export function concoursExporte(competition: Competition, position: number): Competition {
  if (competition.calendrier === undefined) return competition;
  const resultat = calendrierSchema.safeParse(competition.calendrier);
  if (!resultat.success) {
    const detail = resultat.error.issues
      .map(issue => `${issue.path.join('.') || 'calendrier'} : ${issue.message}`).join(' ; ');
    throw new Error(`competitions[${position}] (${competition.id}) : calendrier invalide : ${detail}`);
  }
  return { ...competition, calendrier: resultat.data };
}
