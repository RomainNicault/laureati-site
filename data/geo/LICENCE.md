# Contour de la France

Source : https://github.com/datasets/geo-countries/blob/master/data/countries.geojson
Données Natural Earth : https://www.naturalearthdata.com/about/terms-of-use/
Licence : domaine public (Natural Earth). La collection geo-countries est publiée sous ODC PDDL 1.0.
https://opendatacommons.org/licenses/pddl/1-0/

`france.json` conserve les anneaux métropolitains et la Corse. Coordonnées arrondies à 3 décimales, un point sur quatre conservé. Ce contour est indicatif, sans portée juridique. Il est versionné pour éviter tout appel réseau au build ou à la visite.
Le SVG est généré au build depuis ce contour et les coordonnées de notre export. Aucune image Google n'est conservée.

# Aires des régions et appellations (`regions.json`, `aires/`)

Fichiers provisoires, produits une fois depuis le spike géo du 16/11/2026, en attendant la publication du générateur `laureati-site cartes build`, qui les remplacera.

- INAO, Aires géographiques des AOC/AOP (liste des communes par aire, 09/10/2025) : https://www.data.gouv.fr/datasets/aires-geographiques-des-aoc-aop
- Admin Express COG 2026 simplifié (contours des communes), publié par la DRAAF (direction régionale de l'alimentation, de l'agriculture et de la forêt) Auvergne-Rhône-Alpes à partir des données de l'IGN : https://www.data.gouv.fr/datasets/66fa71e97cb6aae7e2ea088b
- Insee, table de passage des communes 2003-2026 : https://www.insee.fr/fr/information/7671867

Licences : Licence Ouverte 1.0 (Etalab) pour l'INAO ; Licence Ouverte 2.0 (Etalab) pour Admin Express et l'Insee. Aire d'appellation approchée par l'union des communes de l'aire, simplifiée à environ 500 m (1 km pour les régions), coordonnées WGS84 à 4 décimales. Contour indicatif, sans portée juridique. Région = union des aires de ses appellations selon la taxonomie éditoriale du site, pas une région administrative.
