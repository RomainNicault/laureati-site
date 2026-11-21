// Lecture mémorisée des collections de textes : une seule lecture par collection et par build,
// donc un seul avertissement « collection vide » au lieu d'un par page générée.
import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';

type TexteCollection = 'textes-appellations' | 'textes-regions' | 'textes-concours';
const cache = new Map<TexteCollection, Promise<unknown[]>>();

export function textes<C extends TexteCollection>(collection: C): Promise<CollectionEntry<C>[]> {
  if (!cache.has(collection)) cache.set(collection, getCollection(collection) as Promise<unknown[]>);
  return cache.get(collection) as Promise<CollectionEntry<C>[]>;
}
