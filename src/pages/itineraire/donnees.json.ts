// Données compactes de la page itinéraire, chargées seulement après « Calculer ».
// Seuls les vignerons géolocalisés peuvent entrer dans un couloir.
import { dataset } from '../../lib/data';
import { medalKind } from '../../lib/ui';
import { MEDAL_KEYS, type RouteData } from '../../lib/itineraire';

export function GET() {
  const regionIndex = new Map(dataset.regions.map((r, i) => [r.id, i]));
  const appIndex = new Map(dataset.appellations.map((a, i) => [a.id, i]));
  const appRegions = new Map<string, number[]>();
  for (const r of dataset.regions) for (const id of r.appellations) appRegions.set(id, [...(appRegions.get(id) ?? []), regionIndex.get(r.id)!]);
  const body: RouteData = {
    regions: dataset.regions.map(r => ({ slug: r.slug, nom: r.nom })),
    appellations: dataset.appellations.map(a => ({ slug: a.slug, nom: a.nom, regions: appRegions.get(a.id) ?? [] })),
    producers: dataset.producers.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).map(p => ({
      nom: p.nom, url: p.url, commune: p.commune, latitude: p.latitude!, longitude: p.longitude!,
      telephone: p.telephone, site: p.site, google_place_id: p.google_place_id ?? undefined,
      classements: p.appellations.filter(a => appIndex.has(a.appellation_id)).map(a => {
        const counts = MEDAL_KEYS.map(() => 0);
        for (const m of p.medailles) if (m.appellation_id === a.appellation_id && m.couleur === a.couleur) counts[MEDAL_KEYS.indexOf(medalKind(m.medaille))]++;
        return [appIndex.get(a.appellation_id)!, a.couleur, a.rang, a.total_vignerons_medailles, a.score, counts] as [number, string, number, number, number, number[]];
      }),
    })),
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}
