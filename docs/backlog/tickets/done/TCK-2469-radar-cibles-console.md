---
id: TCK-2469
title: "Radar : la console des cibles — créer, régler, mettre en pause, et voir ce que chaque cible a trouvé"
status: done
phase: P2
family: front
estimate: M
wave: 81
created: 2026-11-04
updated: 2026-11-04
depends_on: [TCK-2468]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [front, radar, cibles, super-admin, adr-0087]
---

## Objectif utilisateur

L'opérateur règle en une minute ce que le Radar cherche, et voit d'un coup d'œil ce que chaque recherche rapporte.

## Contrat de données

Routes de TCK-2468 (`/api/admin/radar/targets…`, `PATCH /api/admin/radar/crawl/sources/{site}` avec `scope`), et
`RadarListingResource` existant pour la liste des annonces d'une cible. Lieux et types : les mêmes sources de données que
les filtres de la recherche publique (villes, quartiers, `PropertyType`) — à re-mesurer. Sparse fieldsets obligatoires.

## Direction UX / Artistique

- Une page « Cibles » dans la section Radar de la console super-admin, à côté de la collecte et de l'observatoire.
- Liste dense : nom, résumé lisible des critères (« Appartement · location · Almadies, Ngor · 300 000 – 700 000 F ·
  2-3 ch. »), origine (badge discret « opérateur » / « demande »), état, épinglée, annonces trouvées, dernière trouvaille.
- Création et réglage dans un panneau : les critères se choisissent comme dans les filtres de la recherche publique
  (mêmes contrôles, même vocabulaire), avec l'aperçu du résumé en direct.
- Le détail d'une cible montre ses annonces (carte compacte : photo, prix, quartier, site, étape) et mène à la fiche
  annonce existante.
- Le réglage `scope` (« ciblée » / « tout ») apparaît sur la page de collecte, avec une phrase qui dit la conséquence
  (« ciblée : seules les annonces qui peuvent correspondre à une cible sont lues »).
- Le niveau `support` voit tout, sans les boutons d'écriture.
- Charte : `docs/design-guidelines.md`. Textes par next-intl (fr, en ; `wo` = texte français tel quel, wolof en pause).

## Contraintes strictes (métier)

- Les codes d'erreur de l'API (`radar.targets.*`) ont chacun un libellé ; jamais de code brut à l'écran.
- `apiFetch` / `apiRequest` : le préfixe `/api` (piège du `CLAUDE.md` racine).
- Une cible `retired` n'est pas modifiable ; une cible `demand` modifiée devient épinglée (l'écran le dit avant).

## Critères d'acceptation

- [x] AC1 — Créer une cible depuis la console l'ajoute à la liste avec son résumé ; une validation refusée affiche le
      libellé du code.
- [x] AC2 — La page d'une cible liste ses annonces paginées et mène à la fiche annonce.
- [x] AC3 — Le niveau `support` ne voit aucun bouton d'écriture.
- [x] AC4 — Tests Vitest des trois points ci-dessus ; `npm run lint`, `npx tsc --noEmit`, `npm run check:*` verts.

## Hors périmètre

- Les révisions des cibles de la demande (TCK-2470).

## Notes d'implémentation

**Re-mesuré avant de coder (2026-11-04)**, contre le code de TCK-2468 (5651cac68) :

- Les routes et la ressource sont celles du rapport de TCK-2468 ; le front les atteint par le relais
  `/api/super-admin/[...path]` (aucune route BFF neuve), donc `fetch('/api/super-admin/radar/targets…')` et jamais
  `apiRequest`. Sparse fieldsets : `RADAR_TARGET_FIELDS` et `RADAR_TARGET_LISTING_FIELDS` (`lib/queries/radar.ts`).
- **Lieux et types** : les filtres publics lisent `/api/public/geo/cities` et `/api/public/geo/neighborhoods`
  (`lib/queries/referentiel-public.ts`) et les seize `PropertyType`. La console les réemploie (mêmes hooks, même
  `Combobox`), mais PAS les composants `components/search/*` : ils lisent l'espace `search`, que la frontière
  `(super-admin)/super-admin` ne sert pas (`check-i18n-namespaces`), et ils ne portent qu'UNE ville et UN quartier,
  quand une cible en porte plusieurs. Le vocabulaire (Louer/Acheter, Indifférent/Oui/Non, tuiles à pictogramme
  `iconeDuType`) est repris tel quel.
- ~~**Une cible `retired` reste modifiable par l'API**~~ — **tranché le 2026-11-04 par le porteur (2a)** : l'API la
  refuse aussi, `PATCH` → 422 `radar.targets.retired` (`params.target_id`), sans réactivation possible ; pour la
  reprendre, on en crée une nouvelle. La page d'une cible retirée reste sans geste ; le code a son libellé
  (`ERREURS_CIBLES_RADAR`, `superAdmin.pages.radar.targets.errors.retired`) au cas où une autre page l'émettrait.
- `RadarCrawlRun.cards_skipped` et l'arrêt `radar.crawl.no_target` n'avaient ni colonne ni libellé : ajoutés à la
  collecte (colonne « Hors cible », libellé d'arrêt), sans quoi le premier passage d'une source ciblée sans cible
  s'affichait en code brut.

**Ce qui est livré** :

- `/super-admin/radar/targets` (`components/admin/super/radar/cibles/RadarCibles.tsx`) : liste dense — nom, résumé
  lisible, état, origine, épinglée, trouvées, dernière trouvaille —, filtres serveur `filter[status]`/`filter[origin]`,
  cartes sous `md`. Entrée « Cibles » dans `RadarNav`, entre Annonceurs et Collecte.
- Panneau de création et de réglage (`PanneauCible.tsx`, `ChoixDesLieux.tsx`) : aperçu du résumé en direct, avis
  « l'épinglera » AVANT d'enregistrer une cible de la demande dont les critères changent ; seuls le nom et les
  critères modifiés partent en `PATCH`. Le formulaire ne juge rien : chaque code `radar.targets.*` a son libellé, qui
  nomme le critère (`params.field`) et la borne (`params.max`) ; le doublon mène à la cible existante.
- `/super-admin/radar/targets/{id}` (`RadarCibleFiche.tsx`) : en-tête, chiffres, gestes (régler, pause/reprise,
  épingler pour une cible de la demande, retirer après confirmation), annonces en cartes compactes paginées
  (`CarteAnnonceTrouvee.tsx`) menant à `/super-admin/radar/{id}`. **TCK-2470 pose son encart « Demande » sous
  l'en-tête, avant la section des annonces** (le docblock du composant le dit).
- Collecte : la portée (`scope`) se règle par source, avec la phrase de conséquence ; le support la lit.
- `RadarTargetStatus` : union `src/types/radar.ts`, libellés `superAdmin.pages.radar.targets.status` ; ses
  exemptions de `check-status-labels.mjs` et `check-status-unions.mjs` sont retirées.

**Ajouté à la demande de la session, pour TCK-2466** (7288262e6, API seule) — la fiche de relecture d'une annonce
affiche ce que la lecture « page d'abord » émet :

- le drapeau `source_conflict` entre dans `RADAR_FIELD_FLAGS` (`src/types/radar.ts`) avec son libellé (« La page dit
  autre chose que l'IA : la valeur de la page est retenue ») ; `codes-radar.tck-2387.test.ts`, qui confronte la liste
  aux `FLAG_*` de l'`ExtractionNormalizer`, redevient vert ;
- `RadarExtractedField` porte `source` et `model_value` ; `ChampFiche` dit « Lu sur la page » pour `source: "page"`
  (un champ `high` sans passage cité ne disait rien), et « L'IA proposait : … » quand `model_value` est rendu, mis en
  forme par `FormulaireFiche` dans le vocabulaire du champ (type traduit, montant formaté). Corrigé par l'opérateur,
  le champ ne dit plus ni l'un ni l'autre.

**À reporter dans les specs (la session)** :

- `docs/features.md` §2.12 — la console des cibles (`/super-admin/radar/targets`, page d'une cible), le réglage de
  portée d'une source sur la collecte, la colonne « Hors cible » des passages ; le support lit tout sans geste.
- `docs/features.md` §2.12 (fiche de relecture) — une valeur lue sur la page se signale « Lu sur la page » ; une
  contradiction du modèle (`source_conflict`) montre la valeur qu'il proposait.
