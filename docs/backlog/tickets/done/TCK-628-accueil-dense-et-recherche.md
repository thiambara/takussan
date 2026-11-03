---
id: TCK-628
title: "Accueil dense et liste des biens : 7 cartes par rangée à 1920 au lieu de 4, des raccourcis par ville, type et quartier lus sur des endpoints existants, 40/60/70 biens par page avec un seul défaut des deux côtés, et la bande de catégories réordonnée"
status: done
phase: P1
family: full
estimate: M
wave: null
created: 2026-10-10
updated: 2026-10-10
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [back, front, public, accueil, recherche, carte-de-bien, navbar, ux]
---

## Objectif utilisateur

- **Le visiteur du site public** : voir plus d'annonces d'un coup d'œil sur grand écran, sans un
  titre de page qui prend la place des cartes, et trouver un point d'entrée (une ville, un type de
  bien, un quartier) quand il n'a pas encore d'intention précise.
- **Le visiteur de `/properties`** : choisir 40, 60 ou 70 biens par page, et lire une grille qui
  occupe la largeur de son écran.

## Contexte

Au 2026-10-10, mesuré dans le code de `pre-dev` :

- L'accueil tenait dans `max-w-[1440px] md:px-12` : 1344 px utiles au plus. La carte Standard
  mesurait 290 px avec 24 px d'écart, soit **4 cartes entières plus un bout** à 1440 comme à 1920,
  et 1 plus un bout à 390. Un `<h1>` visible « Annonces immobilières au Sénégal » et `pt-12`
  repoussaient la première rangée sous la barre.
- Le sélecteur de taille de page proposait des valeurs en dur avec **30** pour défaut,
  `parametresDeRecherche` écrivait le même 30 de son côté, et l'API retombait sur **20** quand on
  ne lui envoyait rien. Il y avait donc trois défauts, et aucun test ne les reliait.
- La bande de catégories de la barre ne suivait pas l'ordre voulu (Appartement, Studio, Chambre,
  Terrain, Villa, Maison, Commerce, Bureau, puis « Plus »).

## Décisions

1. **La densité est portée par le conteneur, pas par la fenêtre.** `PropertyRow` est un
   `@container`. La largeur d'une carte se calcule depuis `--colonnes` :
   `(100 % − (colonnes − 1) × gap) / colonnes`.
   - `--colonnes` vaut 2,15 sous 512 px de conteneur, 3,2 dès 512, 4 dès 896, 5 dès 1152, 6 dès
     1440 (`@min-[90rem]`) et 7 dès 1680 (`@min-[105rem]`).
   - La fraction (2,15 ; 3,2) laisse voir un bout de la carte suivante : c'est ce qui dit qu'on
     peut faire défiler.
   - L'accueil et la barre passent à `max-w-[1920px]`, avec la gouttière `px-4 sm:px-6` (gardée
     par `Navbar.menu-modal.test.tsx`).
2. **Des cartes à la Airbnb.**
   - La photo est carrée (`aspect-square rounded-2xl`).
   - L'ordre est titre, lieu, détails (chambres · surface · âge), puis prix.
   - Le prix est en `text-foreground` : il n'est plus en couleur primaire.
   - La pastille de contrat devient une plaque `bg-card` avec un point coloré (`bg-primary` à la
     vente, `bg-accent` à la location), au lieu d'un aplat.
   - Les boutons favori et comparer passent en taille `xs`. Le bouton comparer n'apparaît plus
     qu'au survol sur un appareil qui sait survoler (`REVELE_AU_SURVOL`). Il reste visible au
     toucher, au focus, et quand il est actif.
3. **Les sections ajoutées ne lisent que des endpoints qui existent déjà**
   (`lib/queries/raccourcis-de-l-accueil.ts`) :

   | section | endpoint |
   |---|---|
   | « À vendre » | `GET /public/properties/search?contract_type=sale` |
   | « Par ville » | `GET /public/properties/cities` |
   | « Par type de bien » | `GET /public/property-types` |
   | « Quartiers prisés » | `GET /public/properties/neighborhoods?city=` (ville la plus fournie) |

   - Les trois domaines sont lus avec les MÊMES options que `/properties` et le sitemap
     (`revalidate: 3600`, `partage: true`) : un appel partagé, pas un de plus par visiteur.
   - Seuls les quartiers à `SEUIL_QUARTIER_INDEXABLE` (3) annonces ou plus ont une pastille. En
     dessous, `?city=&location=` se replie sur la page de la ville (TCK-598).
   - Chaque section tombe seule en cas de panne.
4. **Un seul défaut de taille de page : 40.**
   - Côté front, `PER_PAGE_PROPOSES = [40, 60, 70]` et `PER_PAGE_PAR_DEFAUT` vivent dans
     `lib/recherche-publique.ts`. Le sélecteur et la requête lisent la même constante.
   - Côté API, `PropertySearchService::PER_PAGE_PAR_DEFAUT = 40`.
   - La validation reste à 1..100 : un lien hérité en `per_page=30` reste servi, et le sélecteur
     l'affiche tel quel au lieu de mentir.
5. **`/properties` gagne une sixième colonne dès 1800 px**, et passe à `max-w-[1920px]`.
   - Le palier s'écrit `min-[112.5rem]` et non `min-[1800px]` : Tailwind 4 range un palier en px
     AVANT les paliers en rem, et `2xl:grid-cols-5` l'écrasait. Mesuré : 5 colonnes à 1920 avec
     la forme en px.
6. **La bande de catégories** suit l'ordre demandé, et les huit types défilent dans leur propre
   conteneur si la place manque.
   - « Plus » reste hors du défilement : un `overflow-x-auto` rogne aussi en hauteur, et le menu
     qu'il ouvre y serait coupé.
   - La colonne centrale prend `min-w-0` et les boutons passent à `px-1.5 xl:px-2.5`. Sans ces
     deux changements, « Publier » sortait de l'écran à 1024 px.

## Critères d'acceptation

- [x] **AC1** — L'accueil n'affiche plus « Annonces immobilières au Sénégal », et garde un `<h1>`
      accessible (`sr-only`).
- [x] **AC2** — La première rangée commence plus près de la barre. Mesuré : le titre de la
      première section est à 159 px du haut à 1920, contre `pt-12` (48 px) plus le `<h1>` visible
      avant.
- [x] **AC3** — Cartes Standard entières par rangée : **7 à 1920** (254 px), **5 à 1440**
      (266 px), **3 plus un bout à 768**, **2 plus un bout à 390** (160 px).
- [x] **AC4** — Sections « À vendre », « Par ville », « Par type de bien » et « Quartiers prisés »,
      chacune lue sur un endpoint existant, et chacune absente si sa lecture échoue.
- [x] **AC5** — `/properties` propose 40, 60 et 70 par page, avec 40 par défaut, et l'API répond
      `meta.per_page = 40` sans paramètre.
- [x] **AC6** — `/properties` : 6 colonnes à 1920 (237 px), 4 à 1440, 1 à 390, sans défilement
      horizontal de la page.
- [x] **AC7** — Bande de catégories : Appartement, Studio, Chambre, Terrain, Villa, Maison,
      Commerce, Bureau, puis « Plus ». Les huit tiennent sans défilement à 1024 en fr, en et wo,
      et « Publier » reste dans l'écran.
- [x] **AC8** — Toute nouvelle chaîne visible existe en fr, en et wo.

## Suivi hors code

- **Ex-AC9, non vérifié** : le wolof des nouvelles clés (`homepage.row.sale`, `homepage.explore`)
  doit être relu par une personne qui le parle. Aucune garde ne peut le faire ; il est sorti des
  critères pour ne pas être coché sans l'avoir été.

## Vérification

- **Navigateur** (Chrome DevTools, 2026-10-10) : accueil et `/properties` mesurés à 1920, 1440,
  1024, 768 et 390 contre l'API du worktree, sur le jeu de seeds (247 biens publics, sans photos).
  `scrollWidth == innerWidth` à chaque largeur.
- **API** : `php artisan test tests/Feature/Public/PropertySearchTest.php` → 11 tests,
  36 assertions. Le nouveau test rougit quand le défaut est remis à 20 (ablation).
- **Front** : `tsc --noEmit` propre, ESLint propre, `npm run check:i18n` vert. Tests du périmètre
  verts, dont `raccourcis-de-l-accueil.test.ts`, `SearchToolbar.par-page.test.tsx`,
  `HomepageDiscovery.test.tsx`, `card-image-sizes.test.ts`, les tests `Navbar.*` et les gardes
  de contraste et d'ombre.
- **Non vérifié** : le rendu avec de vraies photos (les seeds n'en ont pas, et `remotePatterns`
  n'autorise pas l'API du worktree). Les `sizes` sont gardés par le test des majorants, pas par
  une mesure de téléchargement.
