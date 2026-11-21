// Aires des régions (data/geo/regions.json), servies telles quelles. Chargées seulement après « Calculer ».
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export function GET() {
  return new Response(readFileSync(resolve('data/geo/regions.json')), { headers: { 'Content-Type': 'application/json' } });
}
