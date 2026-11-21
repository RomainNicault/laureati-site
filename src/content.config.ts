import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { TEXTE_DIRS, texteCollection, textesBase } from './lib/textes';

// Collection de contenu : un fichier markdown par texte, validé par schéma.
// Un répertoire absent ou vide donne une collection vide, sans erreur de build.
const collections = Object.fromEntries(Object.keys(TEXTE_DIRS).map(dir => {
  const name = `textes-${dir}` as const;
  const cleaned = dir as keyof typeof TEXTE_DIRS;
  return [name, defineCollection({
    loader: glob({ pattern: '**/*.md', base: textesBase(cleaned) }),
    schema: texteCollection(cleaned).schema,
  })];
}));

export { collections };
