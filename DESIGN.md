---
version: beta
name: Laureati Palmarès
description: Un carnet de palmarès sur téléphone. Bandeau bordeaux et sceau couronne, grands rangs en Cormorant, pièces de médaille, pastilles aux teintes du vin, actions directes à portée de pouce.
colors:
  wine-950: "#26060F"
  wine-900: "#3B0A18"
  primary: "#5B1428"
  primary-hover: "#741C35"
  wine-300: "#C98C9A"
  wine-100: "#F3E3E4"
  wine-50: "#FAF1EF"
  on-primary: "#F8ECD4"
  on-primary-muted: "#E3C9B8"
  paper: "#F7F2E9"
  surface: "#FFFDF8"
  sunken: "#EFE7DA"
  ink: "#21141A"
  ink-soft: "#46363B"
  muted: "#5A4A42"
  line: "#E5D9CC"
  line-strong: "#C9B59C"
  gilt: "#A7833A"
  focus: "#5B1428"
  focus-on-dark: "#F8ECD4"
  medal-grand-or: "#C8961C"
  medal-grand-or-edge: "#5B1428"
  medal-or: "#C9A227"
  medal-or-edge: "#9C7414"
  medal-argent: "#A7A9AC"
  medal-argent-edge: "#7D838A"
  medal-bronze: "#B0703C"
  medal-bronze-edge: "#85491F"
  medal-autre: "#D9CFC2"
  medal-autre-edge: "#8F8172"
  tone-rouge: "#7B1830"
  tone-rose: "#E7A09D"
  tone-blanc: "#E9D592"
  tone-bulles: "#EEE2AE"
  tone-bulles-rose: "#F0BAB3"
  tone-clairet: "#C04557"
  tone-liquoreux: "#D59722"
  tone-moelleux: "#E3B95E"
  tone-jaune: "#D6A019"
  tone-gris: "#DCC6BD"
  tone-pommeau: "#A4561F"
  tone-cidre: "#DDB54A"
typography:
  title-xl:
    fontFamily: Cormorant Garamond
    fontSize: clamp(2rem, 1.25rem + 4vw, 4rem)
    fontWeight: 700
    lineHeight: 1
    letterSpacing: -0.01em
  title-lg:
    fontFamily: Cormorant Garamond
    fontSize: clamp(2rem, 1.4rem + 3vw, 3.5rem)
    fontWeight: 700
    lineHeight: 1.05
  title-md:
    fontFamily: Cormorant Garamond
    fontSize: clamp(1.625rem, 1.3rem + 1.4vw, 2.125rem)
    fontWeight: 700
    lineHeight: 1.05
  title-sm:
    fontFamily: Cormorant Garamond
    fontSize: 1.375rem
    fontWeight: 700
    lineHeight: 1.3
  accent-italic:
    fontFamily: Cormorant Garamond
    fontStyle: italic
    fontWeight: 600
  numeral-rank:
    fontFamily: Cormorant Garamond
    fontSize: 1.75rem
    fontWeight: 700
    lineHeight: 0.9
  brand:
    fontFamily: Cormorant Garamond
    fontSize: 1.5rem
    fontWeight: 700
    letterSpacing: 0.22em
  body-lg:
    fontFamily: Work Sans
    fontSize: 1.125rem
    fontWeight: 400
    lineHeight: 1.55
  body-md:
    fontFamily: Work Sans
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: Work Sans
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: Work Sans
    fontSize: 0.875rem
    fontWeight: 600
    letterSpacing: 0.08em
    textTransform: uppercase
  button:
    fontFamily: Work Sans
    fontSize: 1rem
    fontWeight: 600
    lineHeight: 1.1
rounded:
  sm: 6px
  md: 12px
  lg: 20px
  pill: 999px
spacing:
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "5": 24px
  "6": 32px
  "7": 48px
  "8": 64px
  gutter: clamp(16px, 4vw, 40px)
  container: 1160px
  measure: 40rem
  tap-min: 44px
  tap-comfort: 48px
  bar-height: 64px
shadows:
  card: 0 1px 0 rgba(59, 10, 24, 0.06), 0 10px 24px -18px rgba(59, 10, 24, 0.45)
  pop: 0 18px 40px -12px rgba(38, 6, 15, 0.45)
  bar: 0 -10px 30px -12px rgba(38, 6, 15, 0.5)
motion:
  duration: 160ms
  ease: cubic-bezier(0.2, 0.7, 0.2, 1)
components:
  page:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
  masthead:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    borderBottom: 3px solid {colors.wine-900}
    minHeight: 64px
  footer:
    backgroundColor: "{colors.wine-950}"
    textColor: "{colors.on-primary-muted}"
  notice-band:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink-soft}"
  card:
    backgroundColor: "{colors.surface}"
    border: 1px solid {colors.line}
    rounded: "{rounded.lg}"
    shadow: "{shadows.card}"
    padding: 16px
  rank-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    numeral: "{typography.numeral-rank}"
    numeralColor: "{colors.primary}"
    leadBorder: "#D9C49A"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: 48px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    border: 1.5px solid {colors.primary}
    rounded: "{rounded.md}"
    height: 48px
  route-menu:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    shadow: "{shadows.pop}"
    itemHeight: 48px
  action-bar:
    backgroundColor: "{colors.wine-900}"
    shadow: "{shadows.bar}"
    height: "{spacing.bar-height}"
  medal-pill:
    backgroundColor: "{colors.surface}"
    border: 1px solid {colors.line}
    rounded: "{rounded.pill}"
    typography: "{typography.body-sm}"
  coin:
    size: 20px
    rounded: "{rounded.pill}"
  wine-swatch:
    size: 12px
  color-nav:
    backgroundColor: "rgba(247, 242, 233, 0.94)"
    chipHeight: 44px
    rounded: "{rounded.pill}"
  input:
    backgroundColor: "{colors.surface}"
    border: 1.5px solid {colors.line-strong}
    focusBorder: "{colors.primary}"
    rounded: "{rounded.md}"
    height: 48px
  focus-ring:
    outline: 3px solid {colors.focus}
    offset: 3px
---

# Laureati, charte « Palmarès »

## Vue d’ensemble

Laureati se lit comme un carnet de palmarès. On l’ouvre sur la route, téléphone en main.
L’écran répond à trois gestes : choisir une appellation, comparer cinq vignerons, appeler ou y aller.
La marque tient en trois signes : le bandeau bordeaux avec le sceau couronne, les grands rangs en Cormorant, les pièces de médaille.
Le reste est du papier chaud et de l’encre. Pas de photo de bouteille, pas de décor gratuit.

## Couleurs

- Le bordeaux `primary` porte la marque et l’action principale. C’est la seule couleur d’action.
- `wine-900` et `wine-950` servent aux surfaces sombres : barre d’actions et pied de page.
- `paper` est le fond de page. `surface` est le fond des cartes et des champs.
- `ink`, `ink-soft` et `muted` hiérarchisent le texte. Tous dépassent 4,5:1 sur `paper` et `surface`.
- `gilt` est un filet doré. Il souligne un titre ou une fraîcheur. Jamais pour du texte.
- Les pièces `medal-*` codent le niveau de médaille. Le texte nomme toujours le niveau à côté.
- Les teintes `tone-*` codent la couleur du vin. Le texte nomme toujours la couleur à côté.

## Typographie

- Cormorant Garamond 700 pour les titres, les rangs et la marque. Work Sans 600 à 22 px pour les scores, avec chiffres tabulaires. Noms et communes à 16 px. Métadonnées à 14 px minimum, interligne de 1,4 au moins.
- Cormorant Garamond 600 italique pour les accents : suffixe des rangs (1er, 2e), fin du titre d’accueil.
- Work Sans 400, 500 et 600 pour le texte, les étiquettes, les boutons et les champs.
- Cormorant ne descend jamais sous 1,125 rem. En dessous, on passe à Work Sans.
- Les surtitres sont en capitales espacées de 0,08 em, en bordeaux.
- Les paragraphes utilisent `text-wrap: pretty` pour éviter les mots orphelins.
- Polices auto-hébergées en WOFF2 dans `public/fonts/`. Aucun appel à un service tiers.

## Mise en page

- Mobile d’abord. Une colonne jusqu’à 640 px.
- Conteneur de 1 160 px au plus, marges latérales de 16 à 40 px.
- Accueil : promesse et recherche ; carte de France des régions et grille des régions, chaque région liée à sa page ; « À la une » : trois classements en top 3 compact, tirés au build parmi les appellations connues, sans JavaScript.
- Appellation : titre et ligne de promesse ; ancres de couleur avec effectifs si plusieurs couleurs ; top 5 par couleur en lignes compactes ; « Pourquoi ce classement ? » sous les listes ; texte de l’appellation et ses sources. Aucun contrôle collant.
- Fiche vigneron : identité (nom, commune, type de producteur, Vigneron Indépendant), synthèse en une ligne, actions, coordonnées en clair, puis tous les classements en lignes compactes. Médailles détaillées repliées, « Pourquoi ce classement ? », correction.
- Région : titre, ligne de promesse et texte de la région ; carte des appellations et liste complète côte à côte à partir de 1 000 px (carte collante), l’une sous l’autre avant. Les vignerons viennent par les pages appellation.

## Performance

Listes rendues en entier, sans `content-visibility` : les lignes compactes sont légères et un menu ouvert ne doit jamais être rogné. Cartes SVG générées au build, à proportions fixes, sans requête tierce. Aucun script ne conditionne l’accès aux résultats.

## Profondeur

- Une seule ombre douce pour les cartes, `card`.
- Une ombre plus marquée, `pop`, pour le menu « Y aller ».
- Une ombre vers le haut, `bar`, pour la barre d’actions collante.
- Le premier du classement reçoit un fond doré clair en dégradé. Aucun ruban ne répète son rang.

## Formes

- Cartes en rayon `lg` (20 px). Boutons et champs en rayon `md` (12 px).
- Pastilles, onglets de couleur et étiquettes en forme de pilule.
- L’accueil garde une entrée fonctionnelle. Son titre mesure de 32 à 48 px. Aucun panneau ne duplique les suggestions.
- Les pastilles de vin ont une forme de goutte légèrement aplatie. Les effervescents portent deux bulles.

## Composants

- **En-tête** : bandeau bordeaux, sceau couronne cerclé d’or, mot-marque LAUREATI. Rechercher et Méthode à droite, cibles de 44 px.
- **Périmètre** : une phrase de 14 px près de la date des pages intérieures. Pas de bandeau répété avant le titre. À l’accueil, la limite accompagne la méthode.
- **Fil d’Ariane** : chemin complet dès 640 px. Sur mobile, un seul lien retour vers le parent.
- **Ligne de classement** (`RankRow`) : composant partagé entre accueil, appellation et région. Rang, nom lié à la fiche, commune, score en avant avec « points concours », décompte des médailles, icônes Appeler et Y aller de 44 px. Le détail (type, label, site, médailles par concours) se replie. Le premier reçoit un fond doré clair.
- **Ligne de promesse** : une phrase en tête de page, suivie de la fraîcheur des données.
- **Pourquoi ce classement ?** : un seul repli sous les listes : calcul, égalités, fraîcheur par concours, corpus non exhaustif, lien vers la méthode.
- **Carte SVG** : France des régions ou région et ses appellations, générée par `laureati-site cartes build` et versionnée dans `src/assets/cartes/`. Masquée aux aides techniques, liens hors tabulation ; la liste voisine porte les mêmes liens et sert de légende par une pastille de la couleur de chaque zone. Mention « Contour indicatif, sans portée juridique » et sources.
- **Actions** : Appeler en plein bordeaux, Y aller en contour, Site en lien souligné sans icône, cibles de 48 px sur la fiche. Dans la ligne de classement, Appeler et Y aller deviennent des icônes de 44 px ; Site passe dans le repli. Une action sans donnée n’apparaît pas, sans commande inactive.
- **Y aller** : un `details` natif. Il ouvre un menu de trois liens : Apple Plans, Google Maps, Waze. Aucun système n’est présumé. Sans JavaScript, tout fonctionne.
- **Barre d’actions collante** : fiche vigneron, mobile seulement. Fond `wine-900`, Appeler en crème. Elle apparaît quand les actions de l’en-tête sortent de l’écran (animation liée au défilement, CSS seul). Sans cette prise en charge, elle reste visible en permanence.
- **Pastille de médaille** : pièce cerclée plus le niveau écrit. Le Grand Or ajoute un liseré bordeaux. La classe `medal` est réservée à une médaille réelle.
- **Décompte** : pièces et nombres (3 Or, 1 Argent) pour comparer cinq vignerons d’un coup d’œil.
- **Statistiques** : bande compacte sans cases, chiffres et libellés de 14 px, sur les pages concours et le guide de style. Accueil et région portent leurs chiffres dans la ligne de promesse.
- **Recherche** : exemple court. Sur petit écran, champ et bouton sur deux lignes de 48 px.
- **Score** : Work Sans 600 à 22 px, chiffres tabulaires. Unité « points concours » de 14 px, alignée à droite. Aucun maximum inventé et aucune jauge. Format existant conservé, sans nouvel arrondi. Calcul expliqué dans le seul bloc « Pourquoi ce classement ? ».
- **Rang** : Cormorant 700 à 28 px dans les classements, 32 px sur la fiche. Suffixe en italique. Effectif explicite sur la fiche.
- **Liens de couleur** : pastille de 12 px, nom, effectif et flèche. Cibles de 44 px, jamais collantes. Ancres vers des listes simultanément visibles, sans sélection fictive.
- **Fraîcheur** : « Mis à jour le … » dans la ligne de promesse, près du titre. « Pourquoi ce classement ? » donne la dernière campagne prise en compte, toutes couleurs confondues, et la dernière campagne de chaque concours vers son palmarès officiel.
- **Position (fiche)** (`PositionRow`) : ligne compacte, liseré à la teinte du vin. Rang et effectif, appellation et couleur liées à la comparaison, Top 5, score, médailles du groupe.
- **Médailles détaillées** : un repli par appellation × couleur. Pièces de 20 px avec métal et décompte. « Concours 2026 » en gras, nom du concours, cuvée. Années décroissantes. Le millésime absent est signalé, jamais déduit de la cuvée.
- **Formulaire** : libellé au-dessus, aide en dessous, champs de 48 px, focus bordeaux avec halo `wine-100`. La correction se replie dans un cadre pointillé.
- **Pied de page** : fond `wine-950`, sceau, liens, date d’export et mention sanitaire.
- **Guide de style** : `/styleguide/` montre tous les jetons et composants avec les données réelles. Page `noindex`.

## Accessibilité

- Toute cible tactile hors texte courant mesure au moins 44 px de haut.
- Focus visible partout : anneau bordeaux de 3 px, crème sur fond sombre.
- Les icônes sont `aria-hidden`. Le texte porte le sens.
- Chaque action répète le nom du vigneron pour les lecteurs d’écran.
- Le contenu reste complet sans JavaScript. Pagefind et le filtre d’appellations sont des aides facultatives. Sans script, les liens d’appellations restent utilisables.
- Les animations respectent `prefers-reduced-motion`.

## À faire et à éviter

- Faire : écrire « vigneron », jamais « domaine » comme catégorie.
- Faire : traiter appellation × couleur comme une unité. Un classement, une couleur.
- Faire : dire la limite d’une donnée là où elle s’affiche.
- Faire : nommer en texte ce que codent une pièce ou une teinte.
- Éviter : les photos de bouteilles.
- Éviter : le texte doré sur fond clair.
- Éviter : plus d’un bouton plein par groupe d’actions.
