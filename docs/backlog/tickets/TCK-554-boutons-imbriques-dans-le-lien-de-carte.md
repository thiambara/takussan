---
id: TCK-554
title: "Carte de bien : favori et comparateur sont des <button> DANS le lien — HTML invalide, nom accessible illisible, cibles de 32 px à 6 px d'écart"
status: done
phase: P1
family: bug
estimate: S
wave: 68
created: 2026-09-22
updated: 2026-09-23
depends_on: []
blocks: [TCK-555]
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, a11y, mobile, carte-de-bien, favoris, comparateur]
---

## Objectif utilisateur

Un visiteur, au doigt ou au lecteur d'écran, ouvre un bien, l'ajoute aux favoris ou au
comparateur, sans jamais déclencher l'un à la place de l'autre.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constat C2), sur `PropertyCard`, qui sert la liste, l'accueil et
les autres surfaces de découverte.

- La carte entière est un `<a>` (`LienLocalise`) qui **contient** deux `<button>` (favori,
  comparateur) : 2 boutons imbriqués par lien, mesuré. Un contenu interactif dans un `<a>` est
  invalide en HTML.
- Conséquence mesurée dans l'arbre d'accessibilité : le nom du lien est toute la carte, boutons
  compris — « Villa luxueuse à Dieuppeul En location **Ajouter aux favoris Ajouter au comparateur**
  il y a 3 mois 950 000 F CFA … ».
- Les deux boutons font 32 × 32 px, empilés à 6 px d'écart (y = 364 et 402 à 390 px) : un tap
  imprécis déclenche le voisin, ou le lien.

## Contrat de données

Aucun.

## Direction UX / Artistique

- Visuellement, rien ne change pour qui voit : la carte reste cliquable sur toute sa surface.
- Le lien est nommé par le titre du bien ; favori et comparateur sont des contrôles **frères** du
  lien, pas ses enfants.
- Zones tactiles de 44 px au moins, sans agrandir le dessin des boutons.

## Contraintes strictes (métier)

- Toute la surface de la carte reste une cible d'ouverture du bien.
- Un tap sur favori ou comparateur ne navigue jamais.
- Comportement identique sur toutes les surfaces qui utilisent la carte (liste, accueil, biens
  similaires, récemment consultés).

## Delta à produire

- [x] Structure de la carte : lien sans contenu interactif, favori et comparateur hors du lien, la
      surface entière restant cliquable.
- [x] Nom accessible du lien = titre du bien.
- [x] Zones tactiles de 44 px pour favori et comparateur, sans recouvrement entre elles.
- [x] Tests : aucun `button` descendant d'un `a` dans la carte ; nom accessible du lien ; un clic
      sur favori ne navigue pas.

## Critères d'acceptation

- [x] AC1 — sur `/fr/properties`, `document.querySelectorAll('a button, a [role=button]').length`
      vaut 0 dans la grille de résultats.
- [x] AC2 — le nom accessible de chaque lien de carte est le titre du bien, sans « Ajouter aux
      favoris » ni « Ajouter au comparateur ».
- [x] AC3 — à 390 px, les zones tactiles de favori et de comparateur mesurent au moins 44 × 44 px
      et ne se chevauchent pas.
- [x] AC4 — un tap sur une zone de la carte hors des deux contrôles ouvre la fiche du bien.
- [x] AC5 — un tap sur favori laisse l'URL inchangée.

## Hors périmètre

- La disposition de la carte sur mobile (colonnes, superpositions sur la photo) → TCK-555.

## Notes d'implémentation

### Prémisses re-mesurées le 2026-09-23 (avant tout changement)

Front du worktree (`next dev -p 3013`), API partagée `:8002`, Chrome headless par CDP,
`setDeviceMetricsOverride({width:390, mobile:true})`, `innerWidth` relevé = **390** (pas
d'élargissement). Charge machine au relevé : `load averages: 21.11 37.09 37.73` (8 cœurs) — sans
effet sur une mesure de DOM, noté pour mémoire.

| Affirmation du ticket | Mesuré |
|---|---|
| 2 `<button>` imbriqués par lien | **confirmé** — `/fr/properties` : 30 liens de carte, `a button, a [role=button]` → **60** |
| Nom du lien = toute la carte, boutons compris | **confirmé** par l'arbre d'accessibilité de Chrome (`Accessibility.getFullAXTree`) : « Parking couvert à Pikine En vente Ajouter aux favoris Ajouter au comparateur il y a 4 semaines 28 000 000 F CFA Parking couvert à Pikine Pikine, Dakar 123 m² Garage » |
| Boutons 32 × 32, empilés à 6 px (y = 364 et 402 à 390 px) | **confirmé** — favori `147,363.8 32×32`, comparateur `147,401.8 32×32` : écart 6 px (format compact `@max-[11rem]` de la carte). Au-dessus de 11rem, le favori fait 40 px (`md`) et l'écart 8 px (`gap-2`) |
| `PropertyCard` « sert la liste, l'accueil et les autres surfaces » | **FAUX en partie.** `PropertyCard` sert : la liste (`PropertiesDiscoveryPage`), les biens similaires (`PropertySimilar`), les favoris publics (`PublicFavoritesPage`) et ceux de l'espace (`FavoritesList`). **L'accueil et « récemment consultés » ne l'utilisent pas** : ils passent par `PropertyRow` et les quatre variantes `PropertyCard{Standard,Listing,Cover,Compact}` — qui portent **le même défaut** (le cœur est un `<button>` dans le lien). Mesuré sur `/fr` à 390 px : **48** boutons dans des liens |

**Décision de périmètre.** La contrainte métier du ticket exige un « comportement identique sur
toutes les surfaces qui utilisent la carte (liste, accueil, biens similaires, récemment consultés) »
— et deux de ces quatre surfaces ne sont servies que par les variantes. Corriger `PropertyCard`
seul aurait laissé l'accueil et « récemment consultés » en défaut tout en cochant AC1 (qui ne
mesure que `/fr/properties`). Les variantes reçoivent donc la même structure. Les cartes du
`/playground` (`src/components/playground/`) n'ont ni favori ni comparateur : non touchées.

### Ce qui a été fait

- **`LienDeCarte`** (`src/components/property/cards/LienDeCarte.tsx`) : un `<a>` VIDE, enfant direct de
  la racine positionnée de la carte, en `absolute inset-0 z-[1]`, nommé par `aria-labelledby` →
  `<h3 id>` du titre. Pas le motif « lien sur le titre + `::after` étiré » : `Standard` et `Compact`
  translatent leur corps au survol (le corps deviendrait le bloc conteneur du pseudo-élément
  pendant le survol) et `Cover` pose son titre dans une surimpression `absolute`.
- Favori et comparateur : frères du lien, portés au-dessus par `AU_DESSUS_DU_LIEN` (`relative z-10`).
- **`ZONE_TACTILE_44`** (`src/lib/zone-tactile.ts`) : un `::before` de 44 × 44 centré sur le bouton,
  posé dans `FavoriteButton` et `CompareToggleButton` (seuls usages : les cinq cartes, vérifié par
  grep). Le dessin ne change pas (32 px, ou 40 px pour le favori d'une carte large).
- Écart vertical favori ↔ comparateur de `PropertyCard` : `gap-2` → `gap-2.5`, et `gap-1.5` →
  `gap-3.5` en format compact. C'est le seul changement VISIBLE : à 6 px, les zones de 44 px se
  recouvraient ; à écart exact, elles se touchaient et l'arrondi au pixel donnait la ligne commune
  au comparateur.
- Les cinq cartes reçoivent la même structure : `PropertyCard` et les quatre variantes de
  `PropertyRow`. `PropertyCardListing` portait DEUX liens vers la même fiche (photo, titre) : un seul
  désormais ; son titre passe de `hover:` à `group-hover:text-primary` (le lien le recouvre).
- Surface supplémentaire trouvée par grep, absente du ticket : **le portefeuille du profil public
  d'agent** (`PortfolioTabs` → `PropertyCardStandard`). Couverte par la même correction, mesurée.

### Tests — ablation

`src/components/property/__tests__/PropertyCard.structure.test.tsx`, 21 tests sur les cinq cartes
(aucun bouton dans un lien, un seul lien nommé EXACTEMENT par le titre, lien vide étiré, contrôles
au-dessus et à `before:size-11`, clic favori/comparateur n'atteint pas le lien et bascule le favori).

- Avec le correctif : **21/21 verts**.
- Composants remis à `HEAD` (le test gardé) : **20 rouges / 1 vert**. Le vert restant est « clic sur
  favori » de `PropertyCardListing` : à `HEAD` le lien au nom exact est celui du TITRE, qui ne
  contient pas le cœur — les trois autres tests de la variante rougissent.
- Tests voisins (cartes, favoris, comparateur, accueil, récemment consultés, rendus serveur des
  profils, contraste, carte des champs) : 20 fichiers, 142 tests verts.

### Critères d'acceptation — mesurés au navigateur le 2026-09-23

Front du worktree (`next dev -p 3013`), API partagée `:8002`, Chrome headless par CDP,
`mobile: true`, `innerWidth` relevé égal à la largeur demandée à chaque relevé (390, 360, 1280).

- **AC1** — `/fr/properties` à 390 : `a button, a [role=button]` → **0** (60 avant), 30 liens de
  carte, 30 vides. Même zéro sur `/fr` (49 cartes, les quatre variantes), la fiche d'un bien
  (6 biens similaires + 2 récemment consultés), `/fr/favorites` (1) et
  `/fr/agents/thies-properties-owner-2` (12).
- **AC2** — nom calculé par CHROME (`Accessibility.getFullAXTree`), pas par le DOM : les 30 titres de
  la grille figurent tels quels parmi les noms de liens ; aucun nom de lien de carte ne contient
  « favoris » ni « comparateur » (les deux seuls noms qui les contiennent sont « Mes favoris » et
  « Comparateur » de la barre de navigation). Par le DOM, 0 nom ≠ titre sur toutes les surfaces
  ci-dessus.
- **AC3** — à 390 (format compact, carte de 171 px) : favori dessin 32 × 32, zone `::before`
  **44 × 44** (x 141-185, y 357,8-401,8) ; comparateur 32 × 32, zone **44 × 44** (y 403,8-447,8) :
  **2 px entre les deux zones, aucun chevauchement**. Balayage de chaque zone au pixel
  (`elementFromPoint`, 44 × 44 = 1936 points) : comparateur **1936/1936**, favori **1930/1936**. Les
  6 points manquants sont le coin haut-droit de la zone, rogné par l'arrondi de 14 px de la photo
  (`overflow-hidden`) : ils tombent HORS du dessin de la carte, et sur le lien de la carte, jamais
  sur l'autre contrôle. Même relevé à 360. Au format large (1280) et sur les variantes
  `Standard`, `Listing`, `Cover` : 1936/1936 ; `Compact` : 1932/1936, même cause. Écart assumé :
  TCK-555 refait la disposition mobile (une colonne), qui fait disparaître ce format compact.
- **AC4** — taps réels (`Input.dispatchTouchEvent`) à 390 et 360 sur la photo, le titre et la
  pastille « En vente » : URL `/fr/properties` → `/fr/properties/parking-couvert-a-pikine-UjterU`.
  Grille 9 × 9 de chaque carte hors contrôles : **100 %** des points frappent le lien de la carte,
  sur toutes les surfaces (2250/2250 sur la liste, 3848/3848 sur l'accueil, 634/634 sur la fiche,
  960/960 sur le profil d'agent).
- **AC5** — tap sur le favori (centre, et 4 px sous le dessin, dans la zone) : URL inchangée,
  `aria-pressed` false → true, `localStorage` `[407]`. Tap sur le comparateur : URL inchangée,
  `aria-pressed` false → true.

### Vérifications statiques

`npx eslint` (fichiers touchés) 0 erreur · `npx tsc --noEmit` rc 0 · `check:i18n`,
`check:i18n-namespaces`, `check:classes-emises` verts · gardes `scripts/check-*.mjs` de la racine
(voir le rapport de la session). Aucune clé i18n ajoutée : les noms viennent du titre et des
libellés existants des boutons.
