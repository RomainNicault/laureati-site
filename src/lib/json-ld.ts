// Échapper « < » empêche une donnée de fermer la balise script HTML.
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
