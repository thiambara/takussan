---
id: TCK-432
title: "La page d'accueil et /properties ne rendent aucun bien côté serveur, et ni l'une ni l'autre n'a de `<h1>`"
status: doing
phase: P1
family: front
estimate: L
wave: 49
created: 2026-08-27
updated: 2026-08-28
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#3-property
tags: [front, seo, a11y, performance, public, visiteur-anonyme]
---

## Objectif utilisateur

Le visiteur — et le moteur qui l'a amené — voit des biens dans la première réponse du serveur,
pas des rectangles gris.

## Contexte

La fiche de bien a été convertie en composant serveur par TCK-335 (étape 6), et le docblock de
`src/app/(public)/properties/[slug]/PropertyDetailContent.tsx` en énonce la leçon : *« Ce qui
manquait, c'était la DONNÉE : elle arrivait par `useEffect` + `apiFetch`, donc après hydratation,
donc jamais dans le HTML initial. »*

**Les deux surfaces d'entrée du site n'ont pas reçu ce traitement.** Mesuré le 2026-08-27 :

| Route | Composant rendu | Origine des biens |
|---|---|---|
| `/` | `HomepageDiscovery` (`'use client'`) | `useHomepageDiscovery` → `useEffect` + `apiFetch` |
| `/properties` | `PropertiesDiscoveryPage` (`'use client'`) | `useSearch` → `useEffect` + `apiFetch` |

`src/app/(public)/page.tsx` fait neuf lignes et rend `<HomepageDiscovery />` ; la page de liste
enveloppe `PropertiesDiscoveryPage` dans un `<Suspense>` dont le repli est le squelette. Un
`useEffect` ne s'exécute jamais pendant le rendu serveur : le HTML de la page d'accueil de la
plateforme ne contient donc **aucun bien, aucun titre de bien, aucun lien `/properties/<slug>`**.

Deux conséquences, et la seconde ne dépend d'aucun moteur :

1. **Aucun chemin entrant vers les fiches n'existe dans le HTML servi**, ce qui rend le défaut
   solidaire de [TCK-431](TCK-431-sitemap-et-robots-absents.md) — sans sitemap *ni* maillage, une
   fiche de bien n'est atteignable que par quelqu'un qui en connaît déjà l'URL.
2. **Le premier rendu utile attend le JS**, sur un marché où la bande passante mobile est la
   contrainte dimensionnante — c'est la raison même pour laquelle `next.config.ts` sert AVIF en
   premier et plafonne les largeurs d'images.

⚠️ **Et aucune des deux pages n'a de `<h1>`.** Mesuré :

```
$ grep -rn "<h1" src/components/home src/components/property src/components/search
  → aucun résultat
```

`docs/design-guidelines.md` § Typographie pose pourtant *« Hiérarchie stricte : `h1` → titre de
page »*. La fiche de bien en a un (`PropertyHeader`), la home et la liste n'en ont pas : ni pour
un lecteur d'écran qui cherche le titre de la page, ni pour un moteur.

## Contrat de données

Endpoints existants, inchangés :

- `GET /api/public/properties/discovery` — les quatre rangées de la home en un appel
  (`near_city`, `per_row`), déjà utilisé par `useHomepageDiscovery`.
- `GET /api/public/properties/search` — la liste filtrée, déjà utilisée par `useSearch`.

⚠️ La rangée « Près de toi » dépend d'une ville devinée côté client par
`UserLocationProvider` (ipapi.co), avec une échéance de 1200 ms. **Le rendu serveur ne peut pas
attendre un fournisseur tiers** : la forme retenue doit rendre un contenu honnête sans ville, puis
laisser la personnalisation arriver — sans que la page reparte en squelette à l'hydratation.

## Direction UX / Artistique

Aucune refonte visuelle. La grille, les quatre rangées, les quatre variantes de carte et
l'absence de hero marketing (`docs/design-guidelines.md`) restent telles quelles.

Ce qui change est **l'ordre d'arrivée** : le contenu d'abord, l'interactivité ensuite. Le
squelette existant reste, mais pour ce qu'il couvre vraiment — une navigation en cours,
un changement de filtre — et non pour le premier affichage.

Le `<h1>` de chaque page doit dire ce que la page montre, pas le nom de la marque, et suivre la
règle `font-display` des directives.

## Contraintes strictes (métier)

- Le filtrage reste **serveur** : aucune liste complète récupérée puis filtrée côté client
  (`CLAUDE.md` § Sparse fieldsets).
- L'interactivité déjà livrée ne régresse pas : synchronisation d'URL de `useSearch`,
  restauration de défilement (TCK-335), bascule liste/carte, étiquette de repli conjonctif
  (TCK-338), retrait de filtre sur 422 (TCK-346), favoris et comparateur.
- Le titre de la rangée locale reste **dérivé de la réponse**, jamais deviné : titrer
  « À découvrir à Ziguinchor » au-dessus de biens dakarois serait faux, et le serveur dit déjà
  quand il a basculé de ville.
- Un seul `<h1>` par page.

## Delta à produire

- [ ] `/` — les biens des rangées présents dans le HTML de la première réponse
- [ ] `/properties` — les résultats de la recherche courante présents dans le HTML de la première
      réponse, filtres d'URL compris
- [ ] Stratégie de personnalisation géographique compatible avec un rendu serveur, sans
      re-squelette à l'hydratation
- [ ] `<h1>` sur les deux pages, localisé, en `font-display`
- [ ] Tests : présence d'un titre de bien et d'un lien `/properties/<slug>` dans le rendu serveur
      des deux pages ; présence d'un `<h1>` unique

## Critères d'acceptation

- [ ] AC1 — le HTML rendu par le serveur pour `/` contient le titre d'au moins un bien et un lien
      vers sa fiche. Le test s'exécute **sans hydratation** ; un test qui monte le composant client
      et attend l'effet cocherait la case sans rien prouver.
- [ ] AC2 — le HTML rendu par le serveur pour `/properties?type=villa` contient des biens
      correspondant au filtre. Un rendu qui ignore le filtre et sert le catalogue entier échoue.
- [ ] AC3 — chacune des deux pages porte exactement un `<h1>`, non vide, issu du dictionnaire
      next-intl. Un test échouerait si l'un des deux passait à zéro ou à deux.
- [ ] AC4 — non-régression mesurée sur `/properties` : la synchronisation d'URL, la restauration
      de défilement et la bascule liste/carte passent toujours leurs tests existants, sans que
      ceux-ci aient été réécrits pour s'accommoder du nouveau rendu.
- [ ] AC5 — la page ne repasse pas par un état de squelette après hydratation quand le serveur a
      déjà rendu les biens ; un test l'éprouve sur le rendu puis l'hydratation.

## Hors périmètre

- Le sitemap et `robots.txt` — [TCK-431](TCK-431-sitemap-et-robots-absents.md).
- Les URL canoniques et les métadonnées par filtre — [TCK-433](TCK-433-canonical-et-metadatabase-absents.md).
- Les données structurées — [TCK-435](TCK-435-donnees-structurees-incompletes.md).
- Toute refonte visuelle de la home ou de la grille de résultats.

## Notes d'implémentation

### La forme retenue

Les deux pages deviennent des composants serveur `async` qui vont chercher la donnée et la
**sèment** en prop. Les composants d'écran restent `'use client'` — c'est la leçon de TCK-335,
réécrite dans le docblock de chaque page : *un composant `'use client'` EST rendu en HTML par le
serveur ; ce qui manquait, c'était la DONNÉE.*

| module neuf | rôle |
|---|---|
| `lib/recherche-publique.ts` | **une** définition de la requête `/public/properties/search`, partagée par la page serveur et `useSearch` ; plus `clefDeRecherche`, l'identité triée d'une requête |
| `lib/rangees-de-l-accueil.ts` | `HOMEPAGE_DISCOVERY_PER_ROW`, en module **neutre** — un module `'use client'` n'expose que des références clients, constantes comprises |
| `lib/queries/public-discovery.ts` | `decouverteDeLAccueil(locale, nearCity?)`, mémoïsée par `cache()` |
| `lib/queries/public-search.ts` | `rechercherBiensPublics(requete, locale)`, mémoïsée ; clef `string`, pas `URLSearchParams` (`cache()` mémoïse par identité) |
| `lib/titre-de-la-liste.ts` | `titreEtDescription`, extraite de `(liste)/page.tsx` : le `<title>` **et** le `<h1>` en dérivent |

### La ville devinée, et pourquoi le serveur ne l'attend pas

Le serveur demande les rangées **sans ville**. Le back-end distingue déjà « on ne sait pas où est le
visiteur » (`requested_city: null`, `fallback: false`) de « le visiteur est à Dakar » : le HTML
initial porte donc une rangée honnête. `useHomepageDiscovery` démarre `loading: false` sur la graine
et **ne relance qu'en présence d'une ville réellement devinée** — sinon l'appel serait identique à
celui que le serveur vient de faire.

L'invariant d'UN appel de TCK-247 devient : **un** appel (serveur), ou **deux** quand la
personnalisation a lieu — et le second rapporte une réponse différente.

### La graine porte sa clef

`useSearch({ graine })` ne réutilise le résultat semé que si l'URL décrit **toujours** la même
requête. Sans clef, un clic sur « Appartement » réafficherait les villas du serveur sous une puce
« Appartement » : un écran qui ment est pire qu'un écran qui charge. La clef échoue en sûreté — si
elle ne coïncide pas, le client refait l'appel, comme avant.

### Ce que ce ticket a invalidé ailleurs

`lib/canonique.ts` justifiait le repli de `page`/`sort`/`per_page` par « la liste est rendue côté
CLIENT, donc la même coque HTML sur `?page=1` et `?page=42` ». **Mesuré le 2026-08-28 :
`?page=2` rend 30 biens différents, recouvrement 0 avec la page 1.** La prémisse est morte ; la
décision est **maintenue** sur deux raisons qui ne dépendent d'aucun mode de rendu (le sitemap rend
la pagination inutile à la découverte ; la découpe est volatile, et `sort`/`per_page` rendent le
même ensemble réordonné). Le commentaire porte le relevé de sa propre invalidation.

### Un défaut réparé en passant, et un autre laissé ouvert

`titreEtDescription` traduisait `?type=` **pris brut dans l'URL** : `?type=nimportequoi` rendait
`<title>property.types.nimportequoi — Takussan</title>` (défaut de TCK-433, visible seulement dans
l'onglet). Le `<h1>` l'aurait affiché en grand : garde-fou `t.has()`, éprouvé par
`lib/__tests__/titre-de-la-liste.test.ts`.

⚠️ **Reste ouvert, hors périmètre** : `types/search.ts` traduit la même valeur non validée pour la
puce de filtre (`libelle` de `type` et de `rent_period`). Le `MISSING_MESSAGE` y **lève**, et fait
échouer le rendu serveur entier de `/properties?type=<inconnu>` — 0 bien, 0 `<h1>`, squelette seul.
Ni `types/search.ts` ni `SearchToolbar.tsx` ne sont touchés par ce ticket. La revue adverse a
mesuré la BASE sur cette URL précise : **h1=0, 0 bien, HTTP 200 — identique**. Ce n'est donc pas une
régression. À router vers un ticket propre : la bonne réponse (déposer le filtre ? afficher
l'erreur ? libeller la valeur brute ?) est une décision de la surface des puces.

⚠️ **Second point ouvert, découvert par la revue** : `city` traverse la MÊME dérivation que `type`
**sans garde-fou possible** — la liste des villes n'est pas dans le dictionnaire. Mesuré :
`?city=<b>PIRATE</b> Dakar` rend `<h1>Biens immobiliers à &lt;b&gt;PIRATE&lt;/b&gt; Dakar</h1>`.
Échappé par React (aucune injection), mais texte choisi par l'appelant du lien, en `<h1>` et en
`<title>`, sur une URL que `filtresCanoniques` déclare **canonique donc indexable**. La réponse
n'est pas un garde-fou de libellé mais une décision de canonicité — surface de TCK-433. Nommé dans
le docblock de `titreEtDescription` ; à router vers un ticket.

### Passe 2 — ce que la revue adverse a refusé, et ce qui a changé

Trois refus, aucun sur du code faux ; tous sur des affirmations et des gardes.

1. **`canonique.ts` livrait une prémisse fausse DANS le geste où il en remplaçait une.**
   « À filtres égaux, `sort` et `per_page` rendent le MÊME ensemble de biens, réordonné ou
   redécoupé. » Re-mesuré indépendamment le 2026-08-28 sur 251 biens publiés, `per_page` à 30, en
   vérifiant le code HTTP de l'API **avant** de lire le HTML : `?sort=price_asc` rend 30 slugs dont
   **26 absents** des 30 de la page nue, `?sort=price_desc` **27**, `?sort=created_desc` **25**.
   `per_page`, lui, redécoupe bien (12 ⊂ 30 ⊂ 48, préfixes exacts). **`sort` ne réordonne pas un
   ensemble : la page 1 d'un tri est un autre sous-ensemble.** La décision est maintenue, mais sur
   l'argument du RANG — le même que `?page=3` — et le paragraphe porte désormais le relevé qui
   contredit sa propre version antérieure.

2. **La garde des trois langues du `<h1>` ne gardait qu'elle-même.** Un repli sur `''` dégradait
   l'assertion en `toContain('><')`, vrai de tout HTML. Et comme `src/i18n/request.ts` met `fr` en
   repli sous les autres langues, une clé absente du wolof fait rendre le `<h1>` **français** : le
   test **certifiait une page wolof en français**. Deux bornes non recouvrantes le remplacent — la
   clé existe (message nommant le fichier), et la page non française ne sert pas le libellé
   français. ⚠ La borne du ternaire n'était pas `homepage.h1` mais `homepage` : retirer la seule
   clé faisait déjà rougir. *Une ablation arrêtée un cran trop tôt conclut à une garde saine.*

3. **Le câblage de la page n'était gardé par rien** — 45 tests verts avec une clef semée produite
   par la mauvaise fonction, 25 avec `versParametres` à la place de `parametresDepuisNext`. Les
   deux propriétés étaient éprouvées au niveau de la BIBLIOTHÈQUE, pas là où l'appelant choisit.
   `(liste)/__tests__/cablage-de-la-page.test.tsx` les prend au point de choix, par un capteur
   posé sur la prop.

Et la page fabriquait **deux chaînes pour une requête** (`requete.toString()` pour l'appel,
`clefDeRecherche(requete)` pour la graine) alors que le docblock de `rechercherBiensPublics`
affirmait le contraire — c'est ce qui rendait l'écart invisible à la relecture. Une seule chaîne
désormais, et un test l'exige.
