import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { concoursExporte } from './calendrier.ts';
import type { Competition, Dataset, Producer } from './types.ts';

// Un export présent mais incomplet fait échouer le build, sans repli silencieux.
export function loadData(root = resolve('data')): Dataset {
  const hasExport = existsSync(join(root, 'export'));
  // Workers Builds construit la production : l'échantillon fictif n'y est jamais servi.
  if (!hasExport && process.env.WORKERS_CI === '1') {
    throw new Error('data/export absent sur Workers Builds : build refusé (échantillon interdit en production)');
  }
  const directory = join(root, hasExport ? 'export' : 'sample');
  const read = <T>(name: string): T => JSON.parse(readFileSync(join(directory, `${name}.json`), 'utf8')) as T;
  // Le calendrier des palmarès est validé au chargement : un champ invalide arrête le build.
  const competitions = read<Competition[]>('competitions').map(concoursExporte);
  return { producers: read('producers'), appellations: read('appellations'), regions: read('regions'),
    competitions, redirects: read('redirects'), meta: read('meta') };
}
export const dataset = loadData();
export const producerPath = (producer: Producer): string => producer.url;
export const producersById = new Map(dataset.producers.map(p => [p.id, p]));
export const appellationsById = new Map(dataset.appellations.map(a => [a.id, a]));
export const regionsById = new Map(dataset.regions.map(r => [r.id, r]));
export const competitionsById = new Map(dataset.competitions.map(c => [c.id, c]));
