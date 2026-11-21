# Visuels de marque Laureati

Tirés par ChatGPT Images (`chatgpt-imagegen`, backend Codex) le 2026-10-26 ; retenus par Romain. Charte : `DESIGN.md` (Étiquette).

| Fichier | Tirage | Taille | Sujet du prompt |
|---|---|---|---|
| `logo.png` | `logo-1-couronne` | 1024x1024 | A circular emblem: an elegant laurel wreath enclosing a single bunch of grapes with two vine leaves, centered, symmetrical, like a seal on a classic French wine label. Centered on the canvas with generous margins, the emblem fills about 60% of the width. |
| `hero-accueil.png` | `hero-3-route` | 1536x1024 | A long country road running straight through vineyard rows in perspective toward low hills at golden hour, a single small vintage car on the road, cypress and plane trees along the way, calm and inviting. |
| `ambiance-itineraire.png` | `ambiance-1-itineraire` | 1024x1024 | A crossroads in the middle of vineyards with an old wooden signpost whose arms carry no writing, a winding road disappearing between vine rows toward a hilltop village. |
| `ambiance-concours.png` | `ambiance-2-concours` | 1024x1024 | A tasting table at a wine competition: three tasting glasses, a judging notebook with a pen, and three competition medals with ribbons laid on the tablecloth, seen from a slight overhead angle. No bottles. |

Chaque prompt complet = `SUBJECT: <sujet>` + bloc `LAYOUT` pour les hero + bloc `STYLE` + bloc `CONSTRAINTS` ; texte exact dans `prompts.tsv` et `run.sh`.

À faire en E1 : vectoriser le logo, produire favicon et formats web (AVIF/WebP) au build.

## Carte d'ambiance

`ambiance-carte.png` : gravure de la France, vignes limitées aux régions viticoles. Méthode : `carte/base-vignerons.png` trace le contour de la France (france-geojson, version simplifiée) et un point par vigneron émergé géolocalisé, hors cidricoles (1 160 points au 2026-10-26) ; `chatgpt-imagegen` la redessine avec `--composition-ref` sur cette base et `--style-ref` sur le tirage `hero-2-carte` (prompt dans `carte/run.sh`, variante A). La variante B (édition directe) plaçait des vignes dans les Landes et le Massif central : écartée.
