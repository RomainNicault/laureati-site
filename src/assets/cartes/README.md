# Cartes

SVG produits par `laureati-site cartes build` (dépôt `scripts`, `vins/site/README.md` § Cartes), versionnés tels quels :

- `france.svg` : une aire par région, liée à `/regions/<slug>/` (accueil) ;
- `regions/<slug>.svg` : une aire par appellation, liée à `/appellations/<slug>/` (page région).

Sources : INAO, IGN Admin Express, INSEE (Licence Ouverte 2.0), Natural Earth (domaine public). Contour indicatif, sans portée juridique.
`src/lib/cartes.ts` retire le style interne, masque le SVG aux aides techniques et sort ses liens de la tabulation : la liste voisine porte les mêmes liens.

Régénération (hôte de la base Laureati, après un nouvel export) :

```sh
OUT=$(mktemp -d)
laureati-site --data-root "$LAUREATI_DATA_ROOT" cartes build --out "$OUT/out" --cache "$OUT/cache"
cp "$OUT/out/france.svg" src/assets/cartes/ && cp "$OUT/out/regions/"*.svg src/assets/cartes/regions/
rm -rf "$OUT"
```

La commande met aussi à jour la table `site_appellation_aire` de la base Laureati. `npm test` vérifie que chaque lien des cartes mène à une page construite.
