# Page itinéraire (E2)

## Parcours

Promesse, puis saisie compacte du trajet (départ, arrivée, « Calculer » et mention d'accord en une ligne), progression du calcul, carte, réglage du couloir sous la carte, puis bloc « Sur votre trajet ». Revue de Romain du 16/11, essai réel du 19/11 : la carte est le cœur de l'expérience. Exemple public : Paris → Bordeaux.

## Calcul et progression

- « Calculer » passe en état occupé (désactivé, `aria-busy`, « Calcul en cours… ») jusqu'à la fin.
- Quatre étapes visibles : anti-robot, trajet, vignerons, carte. Chacune passe de « à venir » à « en cours », « fait » ou « échec ». Le message d'état (`role="status"`) nomme l'erreur : adresse introuvable, refus Google (quota ou autorisation), service indisponible, anti-robot expiré ou en échec.

## Trajet conservé et partageable

- Après un calcul, l'adresse de la page devient `/itineraire/#depart=…&arrivee=…[&depart_id=…][&arrivee_id=…]&couloir=10` (`history.replaceState`, aucune entrée d'historique en plus). Le trajet est dans le fragment (`#`) : jamais transmis au serveur du site, ni dans l'adresse ni dans le Referer. Un lien de trajet collé dans un onglet déjà sur la page recharge celle-ci s'il diffère du trajet affiché. Le lien d'évitement (`#contenu`) ne fait pas perdre le trajet affiché ou prérempli. Les identifiants de lieu Google n'y figurent que si une suggestion a été choisie.
- Le résultat Routes (polyligne, distances et durées par étape) est gardé dans `sessionStorage` (`laureati-trajet-v1`). Au retour depuis une fiche ou au rechargement, si l'adresse correspond au trajet gardé et que l'accord est mémorisé : départ, arrivée, couloir et résultat sont restaurés sans appel Routes ni Turnstile. Seul le chargement Maps JavaScript est refait (un par page), dans la limite de 20 chargements de carte par session d'onglet (`laureati-cartes`, calcul, restauration et bouton compris). Au-delà : arbre seul, bouton « Charger la carte Google » soumis au même plafond, aucun script Google injecté. « Calculer » est désactivé pendant une restauration.
- Adresse ouverte sur un autre appareil ou une autre session : champs et couloir préremplis, aucune requête tierce. Le calcul attend le clic « Calculer » (accord Google, Turnstile et plafond de session inchangés).
- « Oublier » efface aussi le trajet gardé.

## Accord Google au clic

- À l'affichage : aucune requête tierce. Champs en saisie libre, sans suggestion. Carte SVG produite au build depuis `data/geo/france.json` et l'export, lisible sans JavaScript.
- Carte statique et résultats Routes ne coexistent jamais (conditions Google Maps Platform, 3.2.3(e) et 19.2 : pas de contenu Routes avec une carte non Google). La carte SVG reste affichée tant qu'aucun trajet n'est affiché (avant accord, sans recherche, échec du calcul). Dès que la liste « Sur votre trajet » s'affiche, elle est masquée : remplacée par la carte Google, ou absente si la carte Google n'est pas chargée (plafond de 20 cartes, échec de Google).
- Attribution des suggestions Places : texte « Google Maps » sous les champs, affiché à la saisie après accord.
- La mention sous « Calculer » annonce que le clic vaut acceptation : adresses saisies et adresse IP envoyées à Google Maps, contrôle anti-robot Cloudflare. Lien vers `/confidentialite/#itineraire`.
- Au clic : accord mémorisé dans `localStorage` (`laureati-google-maps-v1`), sans cookie ; compteur de session (10 recherches, 20 cartes) ; Turnstile vérifié par le Worker ; un appel Routes ; chargement de la carte Google.
- Géocodage : Routes reçoit les adresses en texte (`address`) ou l'identifiant de lieu choisi dans les suggestions (`placeId`). Pas d'appel Geocoding ni Place Details.
- Accord mémorisé : suggestions Places (Autocomplete New, jeton de session par champ, 350 ms après la frappe, dès 3 caractères). « Oublier » efface l'accord et recharge la page.

## Appels Google par recherche

| Situation | Appels |
|---|---|
| Première recherche de la page | 1 Routes (Compute Routes Essentials) + 1 chargement Maps JavaScript |
| Recherche suivante dans la page | 1 Routes |
| Distance du couloir | 0 (calcul local) |
| Retour depuis une fiche, rechargement du même trajet | 0 Routes, 0 Turnstile, 1 chargement Maps JavaScript si la page a été rechargée |
| Saisie après accord | Autocomplete, une requête par pause de frappe |

Champs demandés à Routes : distance, durée sans trafic, polyligne, distance et durée de chaque étape. Sans trafic, sans étape intermédiaire, pas de SKU Pro.

## Carte et aires

- Après « Calculer » seulement : `/itineraire/donnees.json` (vignerons géolocalisés, format compact), `/itineraire/geo/regions.json`, puis `/itineraire/geo/aires/<région>.json` pour les seules régions dont l'aire touche le couloir. Élargir le couloir charge les régions manquantes, sans appel Google.
- Couloir : distance à vol d'oiseau au tracé rééchantillonné au kilomètre. Une aire est retenue si un point du tracé est à l'intérieur ou si un de ses sommets est à moins de la distance choisie.
- Carte Google, densité selon le zoom (`zoomBand`) : jusqu'au zoom 7, régions du couloir avec leur nom ; zoom 8 et 9, appellations avec leur nom ; dès le zoom 10, vignerons. Les couches sont construites une fois par rendu ; le zoom ne fait que les afficher ou les masquer. Seules les appellations qui ont au moins un vigneron retenu sont dessinées ; les autres restent citées sous la région (« Aussi à proximité »).
- Géométries allégées pour l'affichage seulement (Douglas-Peucker, 0,02° pour les régions, 0,003° pour les appellations) ; le couloir se calcule sur les géométries d'origine. Mesure Paris → Bordeaux, couloir 10 km : avant, 2 régions, 33 aires et 58 points affichés ensemble, 4 832 sommets ; après, 559 sommets au zoom des régions, 21 aires (3 041 sommets) au zoom des appellations, les 58 points au-delà.
- Infobulles : clic sur une région ou une appellation, nom, nombre de vignerons retenus, bouton de zoom et lien vers sa page ; la carte ne quitte pas la page. Survol d'un vigneron : son nom.
- Panneau vigneron : clic sur un point ou bouton « Sur la carte » d'une ligne. Nom, commune, distance au trajet, Appeler et Y aller (`producerActions`), appellations classées avec rang, score et médailles, lien « Fiche complète ». En bas sur mobile, sur le côté dès 768 px. Le focus va au titre ; Échap ou « Fermer » le ferme et rend le focus.
- Plein écran : bouton sur la carte ; la zone carte occupe la fenêtre, le réglage du couloir reste dessous. Échap ferme le panneau, puis le plein écran.
- Données du panneau : `/itineraire/donnees.json`, déjà chargé après le clic. Aucun champ ajouté à l'export.

## Arbre de décision

Régions dans l'ordre du trajet (entrée de l'aire dans le couloir, sinon premier vigneron), puis appellations dans l'ordre de leur premier vigneron, puis vignerons par score décroissant, par couleur. Niveaux repliables (`<details>`). Repères à chaque niveau : temps depuis le départ (durées par étape de Routes, interpolées au point du tracé le plus proche), grandes familles de couleur, nombre de vignerons classés dans le couloir. Ligne vigneron : rang au classement, nom (fiche), commune et distance au trajet, score, médailles, Appeler, Y aller. Aires du couloir sans vigneron classé : citées en lien sous la région.

Filtres retirés le 19/11 (couleur et médaille) : l'arbre et la carte suffisent. Le couloir, 10 km à vol d'oiseau par défaut (5 à 30 km), se règle sous la carte.

## Données géographiques provisoires

`data/geo/regions.json` et `data/geo/aires/<région>.json` suivent le contrat du générateur `laureati-site cartes build` (lot séparé) : FeatureCollection WGS84 ; régions `{slug, nom, bbox}` ; aires `{slug, nom, region}`, simplifiées à environ 500 m, 4 décimales. Ces fichiers ont été produits une fois depuis le spike géo du 16/11 (INAO aires par commune, IGN Admin Express 2026, table INSEE). Ils seront remplacés tels quels par la publication du générateur ; aucun code de la page ne dépend de leur origine. Licences : `data/geo/LICENCE.md`.

## Configuration

Workers Builds fournit `PUBLIC_GOOGLE_MAPS_KEY` et `PUBLIC_TURNSTILE_SITE_KEY` à Astro. Ne pas placer la clé Google dans un fichier suivi. Une clé navigateur est visible dans le HTML construit : ses restrictions de référent et d'API (Routes, Places New, Maps JavaScript) sont la protection prévue.

Le Worker reçoit `TURNSTILE_SECRET_KEY`, en secret, en production et dans les Previews. `POST /api/turnstile` refuse sans secret, sans jeton, si la vérification échoue, si l'action diffère d'`itineraire` ou si l'hôte ne correspond pas. `TURNSTILE_DISABLED=true` ferme le calcul. Le plafond de 10 recherches est un garde client, pas un quota serveur ; les quotas Google et Turnstile le complètent. La séquence Turnstile puis Routes n'est pas une protection absolue : la clé Google est publique. Les identifiants de lieu (`depart_id`, `arrivee_id`) d'une adresse partagée sont repris tels quels : un lien forgé peut afficher un libellé et calculer vers un autre lieu. Risque accepté : le calcul passe par le clic, Turnstile et le plafond, sans gain pour un attaquant.

## Vérification

```sh
npm ci
npx playwright install chromium
npm run check
npm run build
npm test
```

`tests/itineraire-browser.test.mjs` prouve sur un trajet simulé Paris → Bordeaux, Google et Cloudflare interceptés : zéro requête tierce avant le clic (saisie et adresse partagée comprises), bouton occupé et progression par étape, accord mémorisé au clic, Turnstile avant Routes, fichiers géo des seules régions du couloir, arbre dans l'ordre du trajet, appellations sans vigneron absentes de la carte, densité par zoom sans couche recréée, infobulle sans navigation, panneau (contenu, focus, Échap, 44 px, bas sur mobile, côté sur bureau), Échap dans un champ sans effet sur panneau et plein écran, plein écran (reste de la page `inert`, Tab confiné), couloir sans appel Google, retour depuis une fiche et rechargement sans Routes ni Turnstile, plafond de session, carte statique visible sans trajet et masquée dès que la liste s'affiche, plafond de 20 cartes et échec de chargement de la carte Google (liste seule, sans carte statique ; bouton refusé puis accepté), « Calculer » désactivé pendant la restauration, suggestions après accord, oubli. Les essais Google réels se font sur la Preview, avec un référent autorisé.

## Retour arrière

Fermer la PR sans fusionner pour abandonner le lot. Après fusion, revert du commit de fusion. Aucun changement de schéma D1.
