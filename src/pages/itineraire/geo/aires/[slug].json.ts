// Aires des appellations d'une région (data/geo/aires/<région>.json). Chargées seulement pour les régions du couloir.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dataset } from '../../../../lib/data';
export function getStaticPaths() {
  return dataset.regions.filter(r => existsSync(resolve(`data/geo/aires/${r.slug}.json`))).map(r => ({ params: { slug: r.slug } }));
}
export function GET({ params }: { params: { slug: string } }) {
  return new Response(readFileSync(resolve(`data/geo/aires/${params.slug}.json`)), { headers: { 'Content-Type': 'application/json' } });
}
