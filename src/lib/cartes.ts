// Cartes SVG produites par `laureati-site cartes build` et versionnées dans src/assets/cartes.
// Insertion dans la page : le style interne est retiré (il fuirait dans le document),
// le SVG est masqué aux aides techniques et ses liens sortent de la tabulation ;
// la liste voisine porte les mêmes destinations.
const fichiers = import.meta.glob('../assets/cartes/**/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Liens d'une carte, dans l'ordre du fichier. */
export const liensCarte = (svg: string): string[] => [...svg.matchAll(/<a href="([^"]+)"/g)].map(m => m[1]);

/** Couleur de remplissage de chaque lien d'une carte : la liste voisine sert de légende. */
export function couleursCarte(nom: string): Map<string, string> {
  const brut = carteBrute(nom) ?? '';
  return new Map([...brut.matchAll(/<a href="([^"]+)">(?:(?!<\/a>)[\s\S])*?fill="(#[0-9a-fA-F]{3,8})"/g)].map(m => [m[1], m[2]]));
}

export function carteBrute(nom: string): string | undefined {
  return fichiers[`../assets/cartes/${nom}.svg`];
}

export function carteSvg(nom: string): string | undefined {
  const brut = carteBrute(nom);
  if (!brut) return undefined;
  return brut
    .replace(/<style>[\s\S]*?<\/style>\s*/g, '')
    .replace(/ role="img"/, '')
    .replace(/ aria-label="[^"]*"/, '')
    .replace(/<svg /, '<svg aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet" ')
    .replace(/<a href=/g, '<a tabindex="-1" href=');
}
