# Laureati — site statique

Code source de `https://laureati.fr`, construit avec Astro 7 et hébergé par Cloudflare Workers static assets, déployé par Workers Builds à chaque commit de `main`.
Les données (`data/export/`, `data/textes/`) ne sont pas dans ce dépôt : elles vivent dans un dépôt privé, générées depuis la base Laureati, et sont récupérées au build par `scripts/fetch-data.mjs` ; corrections par le formulaire des fiches, jamais par une PR sur les données.
Historique : ce dépôt public repart d’un instantané ; l’historique de développement antérieur est conservé dans un dépôt privé.

## Contribuer

- Erreur sur une fiche : formulaire « Suggérer une correction » de la fiche, ou `contact@laureati.fr`. Les données de `data/export/` ne se corrigent pas par une PR.
- Code : PR bienvenues vers `main` ; la CI (build, tests, contrôle visuel) doit passer. Les issues sont désactivées.
- Licence : voir la section ci-dessous. Une contribution au code est publiée sous la même licence MIT.

## Licence

- Code : licence MIT (`LICENSE`), copyright 2026 Romain Nicault. Périmètre détaillé : `NOTICE.md`.
- Hors licence, droits réservés : textes éditoriaux, données (export, médailles, scores, rangs, coordonnées des vignerons), visuels et éléments de marque (`assets/brand/`, `public/brand/`) et charte (`DESIGN.md`). Leur reproduction exige un accord écrit. Les palmarès restent soumis aux droits de leurs producteurs.
- Polices : SIL Open Font License 1.1, textes dans `public/fonts/`.
- Données géographiques : licences de leurs producteurs, détaillées dans `data/geo/LICENCE.md`.

## Développement et vérification

Node.js 22.23.4 ou supérieur est requis (Workers Builds : version fixée par `.node-version`). E1-A est vérifié avec Node.js 26 et npm 12.

```sh
npm ci
npm run check
npm run build
npm test
npm run preview
```

- `npm run dev` lance Astro en développement. L’index Pagefind nécessite un build préalable.
- `npm run build` exécute `astro build && pagefind --site dist`.
- `npm run preview` sert le résultat localement, recherche comprise.
- `npm test` vérifie les données et le HTML construit. Exécuter le build avant les tests.
- `npx wrangler deploy --dry-run` contrôle les fichiers statiques sans les déployer.

Avec npm 12, les scripts d’installation de dépendances peuvent être bloqués par défaut.
Les vérifications E1-A passent sans les autoriser : ne pas approuver de script sans examiner son rôle.

### Contrôle visuel sur pull request

`.github/workflows/controle-visuel.yml` rejoue `npm ci`, `npm run build` et `npm test` sur chaque pull request vers `main`. Les captures Playwright, Lighthouse et les portes programmatiques (`tests/visual/`) ne tournent que si la PR touche l’affichage : une PR limitée à `src/worker.ts`, `migrations/`, `wrangler.jsonc`, `docs/`, `README.md`, `DESIGN.md` ou aux tests du Worker (`worker`, `purge`, `turnstile`, `d1`) les saute.

```sh
npx playwright install --with-deps chromium   # une fois par poste
npm run build
python3 -m http.server 4329 --bind 127.0.0.1 --directory dist &
node tests/visual/capture.mjs http://127.0.0.1:4329 tests/visual/out --lighthouse
node tests/visual/gate.mjs tests/visual/out/gates.json
```

- Portes bloquantes : débordement horizontal, cibles tactiles < 44 px à 360 px, violations axe sérieuses ou critiques, contenu principal absent sans JavaScript, page en erreur HTTP.
- Les pages contrôlées sont listées dans `tests/visual/pages.json`.
- Lighthouse mobile est bloquant sur les pages marquées `"lighthouse": true` : performance ≥ 90, accessibilité ≥ 95.
- La CI construit le site avec `LAUREATI_TEXTES_ROOT=tests/fixtures/textes` : la page `/appellations/morgon/` passe les portes avec un texte éditorial.
- Les PNG et `gates.json` sont publiés dans l’artefact `controle-visuel` du run.

## Structure

```text
DESIGN.md                 Charte Étiquette, source de référence copiée sans modification
assets/brand/             Ressources de marque existantes, inchangées
src/layouts/              Structure HTML, métadonnées et données structurées
src/lib/types.ts          Contrat e1-export-1, six fichiers JSON
src/lib/data.ts           Chargement des données au build
src/lib/concours.ts       Adresses, barèmes et contributions des concours
src/lib/site.ts           URL et garde INDEXABLE
src/content.config.ts     Collections des textes éditoriaux (data/textes)
src/styles/               Tokens de la charte et styles communs
src/pages/                Accueil, fiches, concours, recherche et pages provisoires
public/fonts/             Polices WOFF2 auto-hébergées et licences OFL
public/robots.txt         Accès des robots et adresse du sitemap
public/llms.txt           Description et accès aux sections pour les agents IA
data/sample/              Trois vignerons et une appellation manifestement fictifs
data/textes/              Textes éditoriaux, récupérés au build (dépôt privé)
migrations/               Schéma D1, ip_hash facultatif depuis 0002
tests/                    Contrats de chargement et de sortie HTML
tests/fixtures/textes/    Trois textes fictifs pour les essais de rendu
tests/visual/             Captures Playwright et portes visuelles (CI)
wrangler.jsonc            Worker correction, D1 et fichiers statiques
```

## Source des données

Le build utilise `data/export/` quand ce répertoire existe. Sinon, il utilise `data/sample/` (développement local sans accès aux données).

`npm run build` lance d’abord `scripts/fetch-data.mjs`. En CI (`CI=true` : Workers Builds, GitHub Actions), il clone le dépôt privé des données par une clé de déploiement en lecture seule (`LAUREATI_DATA_DEPLOY_KEY`, base64 ; variable secrète de Workers Builds et secret GitHub Actions). Sans clé ou en cas d’échec, le build s’arrête ; il n’y a jamais de repli sur `data/sample/`. Hors CI sans clé, rien n’est récupéré. Le script écrit `public/data-version.json` (commit des données, date d’export), lu par la sonde de reconstruction.
Le jeu choisi doit contenir `producers.json`, `appellations.json`, `regions.json`, `competitions.json`, `redirects.json` et `meta.json`.
Un export présent mais incomplet fait échouer le build ; il ne déclenche pas un repli vers les exemples.
Le site ne lit aucune base SQLite et ne contient aucun secret.

Les types minimaux sont regroupés dans `src/lib/types.ts`.
`competitions[].calendrier` est optionnel : `mois_debut`, `mois_fin`, `source_url` et `verifie_le`, validés au chargement par `src/lib/calendrier.ts`.
Une clé hors de ces quatre-là n’est pas lue ; un mois hors 1-12, une plage inversée ou une date inexistante fait échouer le build en nommant le concours.
Les URL vignerons suivent `/vignerons/<id_court>-<slug>/` et reprennent le champ `url` exporté.
Les classements d’appellation sont séparés par couleur. Leurs ancres reprennent `ancre` exporté, y compris `#effervescent-blanc` et `#vin-de-paille`.
Les coordonnées, scores et médailles des exemples sont fictifs. Ne pas les publier comme données réelles.

## Concours et textes éditoriaux

Les pages `/concours/` listent les concours suivis. Chaque concours a une page `/concours/<slug>/` (identifiant export en minuscules sans accent) et une page par campagne absorbée `/concours/<slug>/<annee>/`.
Le palmarès annuel ne montre que les médailles des vignerons du corpus publié ; le palmarès complet reste sur le site officiel du concours.
Le barème et les contributions viennent de `src/lib/concours.ts`, partagés avec la méthodologie.
Les mois de parution des palmarès viennent du champ `calendrier` de l’export : le libellé est dérivé (`février`, `février à mars`) et reste « mois non renseigné » pour un concours sans calendrier.
Aucun mois n’est codé en dur dans le site.

Les textes sont des collections Astro (`src/content.config.ts`) lues dans `data/textes/{appellations,regions,concours}/<slug>.md`.
Le frontmatter est validé par schéma : `type`, `slug`, `nom`, `statut`, `sources` et `maj`.
Un texte absent ne change pas la page ; les textes sont copiés du vault par `laureati-site publish`.
Pour essayer le rendu, `LAUREATI_TEXTES_ROOT=tests/fixtures/textes` remplace la racine des textes.
Les sources doivent être en `https://`.
Le corps Markdown passe par une garde remark (`src/lib/markdown-guard.mjs`, branchée dans `astro.config.mjs`) : HTML brut, image ou lien hors `https://`, `/` et `#` fait échouer le build.
`tests/fixtures/textes-piegees/` prouve cet échec.
Les répertoires `data/textes/*/` sont conservés par un `.gitkeep`, ignoré par le chargeur (`**/*.md`).
Les palmarès annuels sont regroupés par région dans des replis `<details>`, sans JavaScript.

## Recherche et référencement

Pagefind indexe seulement le contenu principal des fiches vignerons et appellations.
Son interface par défaut est chargée uniquement sur `/recherche/`.
Le champ d’accueil transmet sa requête avec `?q=`. Les liens des fiches restent accessibles sans JavaScript.
Aucun autre JavaScript client n’est ajouté, hors le chargement à la demande de Turnstile pour le formulaire de correction.

Depuis E4, `INDEXABLE = true` dans `src/lib/site.ts` : les pages publiques n’ont plus de `meta robots`.
Le guide de style et les deux retours de correction gardent `noindex` et restent hors du plan de site.
`public/_headers` ajoute `X-Robots-Tag: noindex` sur tous les hôtes `*.workers.dev` (ancienne production et prévisualisations de PR).
Seul `laureati.fr` est donc indexable. `www.laureati.fr` redirige en 301 vers l’apex (règle de redirection de la zone Cloudflare).
`robots.txt` autorise tous les robots, agents IA inclus. Le blocage des robots IA de Cloudflare est désactivé sur la zone, sans robots.txt géré.
Retour arrière : remettre `INDEXABLE = false`, le `noindex` revient sur toutes les pages.
Les métadonnées canoniques et Open Graph utilisent `https://laureati.fr`.

## Charte et polices

`DESIGN.md` est la source de référence du dépôt. Ses tokens sont transcrits dans `src/styles/tokens.css`.
Cormorant Garamond 700 et Work Sans 400/600 sont servis depuis `/fonts/`.
Les fichiers latins WOFF2 proviennent de Fontsource 5.3.0, verrouillé dans `package-lock.json`.
Les deux familles utilisent la SIL Open Font License 1.1 (`OFL-1.1`).
Les licences et copyrights sont conservés dans `public/fonts/`.
Aucun service de polices distant n’est appelé.

## Gabarits E1-C et limites

Les fiches affichent toutes les positions classées, triées par score brut, et distinguent les top 5.
Le dénominateur `total_vignerons_medailles` compte des vignerons, pas des distinctions.
Les pages appellation montrent les top 5 par couleur. Les pages région listent les appellations et leurs classements, sans carte.
La méthodologie décrit le calcul, le calendrier des palmarès et un exemple recalculable.
La fraîcheur indique la dernière campagne absorbée par concours, jamais la date d’export.

`regions` peut être omis sur une appellation sans région (Cidre, Poiré et Pommeau dans l’export réel).
Une médaille peut référencer une appellation absente du fichier des appellations classées.
Sans libellé public disponible, la fiche conserve cette médaille et indique « Appellation hors classement — libellé non fourni ».
Le complément de contrat pour ces libellés reste un suivi de l’export ; aucun nom n’est inventé.

`data/sample/` contient seulement des données fictives : trois vignerons, une appellation à deux couleurs, une région et un concours.
Ne jamais publier ces exemples comme un palmarès réel.
`data/export/` et `data/textes/` sont versionnés dans le dépôt privé des données par `laureati-site publish`, qui déclenche ensuite le build ; ne jamais les éditer à la main.

Les redirections sont vides en E1. Le bloc `#correction` contient le formulaire E1-E, sans JavaScript.
Les mentions légales et la politique de confidentialité sont publiées depuis E4. L’itinéraire reste hors de ce lot.

## Corrections E1-E

`src/worker.ts` reçoit seulement les POST urlencoded sur `/api/correction`.
Les autres chemins passent à `ASSETS`. Les retours sont statiques et toujours `noindex`.
Le motif d’échec est une chaîne fixe lisible dans la query, sans valeur soumise.
Les champs cachés sont des références non fiables, validées syntaxiquement, pas une preuve d’identité.

Le quota utilise une insertion SQL conditionnelle atomique : dix corrections par IP et jour UTC.
L’empreinte SHA-256 utilise un sel public constant. C’est une pseudonymisation, pas une anonymisation.
L’IP brute n’est ni stockée ni journalisée par le Worker. Sans en-tête Cloudflare, les requêtes partagent le quota `unknown`.
Les soumissions intersites des navigateurs sont refusées. L’absence d’Origin reste permise pour les clients HTML simples.

### Anti-robot Turnstile

Le formulaire de correction est protégé par le widget Cloudflare Turnstile `laureati-site`, en mode géré.
Le script `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` n’est chargé qu’après l’ouverture du bloc ou une première interaction avec le formulaire. Avant cette interaction, aucun service tiers n’est contacté.
Le jeton `cf-turnstile-response` accompagne le POST ; le Worker appelle `siteverify` avant toute écriture D1.

- `TURNSTILE_SECRET_KEY`, en secret, est requis sur le Worker de production et sur la base des Previews. Absent, le formulaire est refusé (fail closed) et l’événement est journalisé, sans jeton ni adresse IP.
- `PUBLIC_TURNSTILE_SITE_KEY` remplace au build la clé publique par défaut, par exemple pour une prévisualisation avec les clés de test Cloudflare.
- `TURNSTILE_TEST_KEYS=true` n’accepte que les réponses marquées `result_with_testing_key` par Cloudflare. À réserver aux prévisualisations avec les clés de test : une clé réelle ne produit jamais cette métadonnée.
- `TURNSTILE_DISABLED=true` ferme le formulaire côté serveur.

Le Worker compare aussi l’action (`correction`) et l’hôte du jeton à l’hôte de la requête.
Jeton absent, invalide, expiré, action ou hôte inattendu : redirection vers `/correction-erreur/` avec un motif, sans écriture D1.
Le widget n’ajoute aucun cookie côté site. Sans JavaScript, le formulaire reste affiché mais l’envoi est refusé ; la page d’erreur renvoie vers le courriel de contact.

Vérification : `npm test` couvre succès, refus, réseau en panne, Siteverify en 5xx, réponse illisible, délai dépassé, secret absent, hôte et action inattendus, jeton absent et clés de test, refusées sur les hôtes de production.
Domaines autorisés du widget `laureati-site` : `laureati.fr`, `www.laureati.fr`, `laureati-site.romain-c96.workers.dev`, `feat-e2-itineraire-laureati-site.romain-c96.workers.dev` et `feat-turnstile-correction-laureati-site.romain-c96.workers.dev`. Un hôte absent de cette liste ne reçoit aucun jeton : seul le refus y est vérifiable.
`TURNSTILE_TEST_KEYS` est ignoré sur `laureati.fr` et `www.laureati.fr` : un jeton de test y est toujours refusé.

Les prévisualisations n’ont pas la liaison `DB` : leur configuration de base (`previews_base_config`) ne porte que `TURNSTILE_SECRET_KEY`. Sur une prévisualisation, un envoi qui passe Turnstile échoue donc à l’écriture avec le motif « Envoi impossible pour le moment », sans rien écrire en D1 ; ce motif prouve que le contrôle anti-robot a réussi (essai humain du 16/11). L’essai d’écriture se fait en production, avec une valeur proposée commençant par `ESSAI-`, puis la ligne est supprimée et la suppression prouvée par un comptage avant et après.
Après l’essai, le domaine de la prévisualisation est retiré des domaines du widget ; seuls `laureati.fr`, `www.laureati.fr` et `laureati-site.romain-c96.workers.dev` restent autorisés en régime courant.

Vérification locale, sans connexion Cloudflare :

```sh
npm ci && npm run check && npm run build && npm test
npx wrangler deploy --dry-run
npx wrangler d1 migrations apply laureati-corrections --local
npx wrangler dev --local
```

La migration distante appartient au parent. Depuis la révision acceptée du dépôt :

```sh
npx wrangler d1 migrations apply laureati-corrections --remote
```

Aucune migration distante n’a été exécutée par E1-E.
Le code n’ajoute aucun journal de requêtes. Les journaux Workers de Cloudflare (appels aux fonctions seulement : adresse, en-têtes dont l’IP, localisation approximative, opérateur réseau, statut) sont conservés 3 jours (offre gratuite), comme l’indique la page confidentialité.
Le site est public et indexable sur `laureati.fr` depuis le 16/11/2026.

## Purge planifiée des corrections

`wrangler.jsonc` déclare un Cron Trigger quotidien, `17 3 * * *` (03:17 UTC), et `src/worker.ts` expose `scheduled`.
La tâche ne dépend d’aucune requête : `fetch` et les fichiers statiques ne changent pas.

Deux écritures idempotentes à chaque exécution, bornes strictes :

- `DELETE` des corrections dont `recu_le` est strictement antérieur à l’instant déclenché moins douze mois calendaires.
- `UPDATE ip_hash = NULL` au-delà de quarante-huit heures, d’où la colonne facultative en base.

Une ligne datée exactement de l’échéance est conservée. Les dates sont écrites par `toISOString()` : la comparaison textuelle est chronologique, sans conversion.
Le volume reste faible (dix envois par IP et par jour), donc la purge quotidienne balaie la table sans index supplémentaire.
Le 29 février retombe au 28 février de l’année cible, jamais au 1er mars, donc la conservation ne dépasse jamais douze mois.
Le quota de dix envois par jour ne lit que les lignes du jour : ni la suppression ni l’effacement des empreintes ne le modifient.
Une seconde exécution au même instant ne supprime et n’efface plus rien.

### Migration `ip_hash` facultatif

`migrations/0002_ip_hash_nullable.sql` recrée la table avec copie des lignes et reconstruction des deux index, SQLite ne retirant pas une contrainte `NOT NULL`.

La migration distante s’applique **avant la fusion** : l’ancien code insère toujours une empreinte non nulle et reste compatible. Sans elle, `UPDATE ip_hash = NULL` viole `NOT NULL` et l’effacement échoue à chaque passage. Vérifier ensuite que `ip_hash` n’est plus `NOT NULL` et que les deux index existent :

```sh
npx wrangler d1 migrations apply laureati-corrections --remote
npx wrangler d1 execute laureati-corrections --remote --command "select sql from sqlite_master where tbl_name='correction'"
```

Chaque passage journalise ses seuls compteurs (`observability` activé) ; un échec écrit `purge échouée` et fait échouer l’événement Cron.

### Vérification locale de la tâche

Base locale remplie de lignes d’essai aux bornes (treize mois, douze mois plus un jour, douze mois moins un jour, quarante-neuf heures, quarante-sept heures, une heure) :

```sh
npx wrangler d1 migrations apply laureati-corrections --local
npx wrangler dev --test-scheduled
curl "http://127.0.0.1:8787/cdn-cgi/handler/scheduled?cron=17+3+*+*+*"
```

Avec le routeur d’assets de ce dépôt (`run_worker_first` limité à `/api/*`), `/__scheduled` peut être servi par `ASSETS` : utiliser `/cdn-cgi/handler/scheduled`.
Relancer la commande prouve l’idempotence.

### Retour arrière

- Code : redéployer la révision précédente ; le Cron Trigger disparaît avec la configuration qui le déclare. Pour l’arrêter sans redéployer, supprimer l’entrée cron dans le tableau de bord Cloudflare, Worker `laureati-site`, Settings, Trigger Events.
- Migration : revenir à `NOT NULL` exigerait de réécrire une valeur de remplissage sur chaque ligne déjà effacée, donc la rendre facultative est définitif en pratique.
- Données : le code ne restaure rien. D1 Time Travel (30 jours) permet de revenir à un instant antérieur : `npx wrangler d1 time-travel info laureati-corrections`, puis `npx wrangler d1 time-travel restore laureati-corrections --timestamp=<RFC3339>`.
