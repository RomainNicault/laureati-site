// Textes éditoriaux du vault, copiés sous data/textes par `laureati-site publish`.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'astro/zod';

export const TEXTE_DIRS = {
  appellations: { type: 'appellation', nom: 'Appellations' },
  regions: { type: 'region', nom: 'Régions' },
  concours: { type: 'concours', nom: 'Concours' },
} as const;
export type TexteDir = keyof typeof TEXTE_DIRS;

const sourceSchema = z.object({
  titre: z.string().min(1),
  url: z.string().regex(/^https:\/\/[^\s"<>]+$/, 'URL https:// attendue'),
});

export const texteSchema = z.object({
  type: z.enum(['appellation', 'region', 'concours']),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug attendu en minuscules sans accent'),
  nom: z.string().min(1),
  statut: z.string().min(1).max(40),
  sources: z.array(sourceSchema),
  // Le YAML d'Obsidian livre une date ; on la normalise en AAAA-MM-JJ.
  maj: z.union([z.string(), z.date()])
    .transform(value => typeof value === 'string' ? value : value.toISOString().slice(0, 10))
    .refine(value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).valueOf()),
      'date AAAA-MM-JJ attendue'),
});

/** Racine des textes : variable d'environnement pour les essais, data/textes sinon. */
export function textesBase(dir: TexteDir): URL {
  const root = process.env.LAUREATI_TEXTES_ROOT;
  return root ? pathToFileURL(resolve(root, dir)) : new URL(`../../data/textes/${dir}/`, import.meta.url);
}

export const texteCollection = (dir: TexteDir) => ({
  type: TEXTE_DIRS[dir].type,
  schema: texteSchema.extend({ type: z.literal(TEXTE_DIRS[dir].type) }),
});
