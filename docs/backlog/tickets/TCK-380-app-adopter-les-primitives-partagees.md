---
id: TCK-380
title: "Tableau de bord /app — adopter les primitives partagées que les deux consoles ont déjà"
status: done
phase: P2
family: front
estimate: M
wave: 48
created: 2026-08-26
updated: 2026-08-27
depends_on: []
blocks: [TCK-381]
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#29-administration--configuration
tags: [front, dashboard, design-system, primitives]
---

## Objectif utilisateur

L'utilisateur connecté lit un tableau de bord dont tous les écrans se ressemblent : même en-tête,
même table, même pagination, même façon de dire qu'il n'y a rien.

## Contexte

`src/components/console/` porte sept primitives partagées — `PageHeader`, `DataTable`,
`FilterBar`, `Pagination`, `StatCard`, `StatusBadge`, `DataState`. Elles ont été extraites par
TCK-357 pour la console super-admin, puis adoptées par la console agence (TCK-373).

**`/app` n'a jamais reçu cette passe**, et c'est le seul des trois espaces à ne pas l'avoir reçue
— alors que c'est celui où vivent tous les utilisateurs finaux. Relevé du 2026-08-26 :

| Espace | Fichiers important `@/components/console` |
|---|---|
| `src/app/(super-admin)/**` | 25 pages |
| `src/app/(dashboard)/admin/**` | 12 pages |
| **clôture d'import de `/app`** (259 fichiers, imports suivis) | **4** |

Ce que ça donne concrètement :

- **31 pages sur 46** réécrivent le même en-tête à la main —
  `<h1 className="font-display text-2xl font-bold text-foreground">` suivi d'un `<p className="mt-1
  text-sm text-muted-foreground">` — pendant que `PageHeader` fait exactement cela et n'est monté
  que par 4 d'entre elles (`/app`, `/app/properties`, `/app/overview/agency`,
  `/app/leases/onboarding-pending`).
- **Cinq tables écrites en `<table>` nu** dans la clôture : `OwnersList`,
  `ServiceProvidersList`, `PropertyList`, `CustomerList`, `NotificationPreferencesMatrix`.
- **Une pagination dupliquée** : `components/property-dashboard/PropertyPagination.tsx` fait le
  travail de `console/Pagination`, et `CustomerList` en refait une troisième en ligne.

Le grep du périmètre ne suffit pas à le voir, et c'est la leçon que
`scripts/check-app-tokens.mjs` porte déjà dans son en-tête : *un grep qui ne suit pas les imports
mesure le répertoire, pas l'écran.* Les chiffres ci-dessus sont pris sur la **clôture d'import
réelle** des 46 pages de `/app`, pas sur le répertoire.

*Trois façons de dessiner la même table, ce sont trois endroits où corriger un défaut de
contraste, et deux qu'on ne trouvera pas.*

## Contrat de données

Ticket purement frontend. Aucun changement d'API, aucun changement de comportement, aucune
requête ajoutée ou retirée.

## Direction UX / Artistique

- **La primitive existante fait foi.** Là où un écran de `/app` rend aujourd'hui autre chose que
  `console/*`, c'est l'écran qui s'aligne — sauf si l'écart porte un besoin réel, auquel cas
  c'est la primitive qui s'élargit, une fois, pour les trois espaces.
- Les listes de `/app` ne sont pas toutes des tables : plusieurs sont des listes de cartes, et
  c'est souvent le bon choix sur mobile. **Ne pas convertir en table ce qui se lit mieux en
  cartes** — l'objectif est l'unicité des primitives, pas l'uniformité des formes.
- `EmptyState` / `ErrorState` de `@/components/feedback` restent le système d'états vides du
  dépôt (77 fichiers) : ce ticket ne les remplace pas par `DataState`, il ne fait que cesser d'en
  écrire de nouveaux à la main.

## Contraintes strictes (métier)

- **Aucun changement de comportement.** Pas de colonne ajoutée ni retirée, pas de tri modifié,
  pas de taille de page changée, pas de filtre déplacé côté client — la règle « filtre par
  `filter[…]` côté serveur » reste entière.
- L'accessibilité ne régresse pas : toute table convertie garde ou gagne ses en-têtes de colonne,
  et toute pagination remplacée garde son `aria-current`.
- Si `DataTable` ne couvre pas un besoin d'un écran de `/app`, **élargir la primitive**, pas la
  contourner par un `<table>` conservé « à titre exceptionnel ».
- Les sept primitives restent dans `src/components/console/` et gardent leur nom : les renommer
  est un autre ticket, et il toucherait les trois espaces.

## Delta à produire

- [ ] `PageHeader` sur les 31 pages de `/app` qui réécrivent l'en-tête à la main
      *Non cochée : 32 pages mesurées (+ 2 composants, 40 blocs), toutes converties **sauf une** —
      `src/app/(dashboard)/app/settings/agency/upgrade/page.tsx` rend encore son en-tête à la main,
      deux fois, et n'importe pas `PageHeader`. Elle porte un « eyebrow » que `PageHeader` ne sait
      pas rendre : la convertir demande d'élargir la primitive, ce qui n'a pas été fait. Pour la
      cocher : soit `PageHeader` gagne l'emplacement, soit la page est déclarée exception dans le
      code avec son motif.*
- [x] Les cinq tables en `<table>` nu de la clôture passent sur `DataTable` — ou justifient, dans
      le code, pourquoi elles restent en cartes
- [ ] `PropertyPagination` et la pagination en ligne de `CustomerList` remplacées par
      `console/Pagination` ; le composant dupliqué supprimé
      *Non cochée : le composant n'est PAS supprimé, délibérément (cf. « AC2 — pourquoi
      `PropertyPagination.tsx` existe encore »). Ce qui était réellement dupliqué — la paire de
      boutons et l'arithmétique `page ± 1` — a disparu ; il reste un adaptateur d'URL de ~30
      lignes. Et « la pagination en ligne de `CustomerList` » est **sans objet** : la re-mesure
      montre un `<p>` de comptage, pas un contrôle.*
- [x] Élargissement des primitives là où un besoin de `/app` ne rentre pas, avec le test qui va
      avec
- [x] Tests : les primitives élargies ; un test de non-régression sur chaque table convertie
      (mêmes colonnes, même ordre, même tri)

## Critères d'acceptation

- [x] AC1 — dans la **clôture d'import** de `src/app/(dashboard)/app` (imports suivis, pas le
      répertoire), aucun fichier ne rend un `<h1 className="font-display text-2xl …">` : le seul
      producteur de cet en-tête est `PageHeader`
- [ ] AC2 — `src/components/property-dashboard/PropertyPagination.tsx` n'existe plus, et aucun
      fichier de la clôture ne calcule `page + 1` / `page - 1` en dehors de `console/Pagination`
      *Non cochée, et elle ne le sera pas : la PREMIÈRE moitié est **sans objet** — la supprimer
      aurait retiré l'état d'URL et le sélecteur de densité à sept écrans, ce que la contrainte
      stricte « pas de taille de page changée » du même ticket interdit. La SECONDE moitié est
      tenue et vérifiée par exécution (grep `page ± 1` sur la clôture : seules
      `console/Pagination.tsx:83,95` et une ligne de docblock). Une case cochée ici affirmerait une
      suppression qui n'a pas eu lieu.*
- [x] AC3 — chaque table convertie rend **exactement** les mêmes colonnes dans le même ordre
      qu'avant ; un test par table l'éprouve et échouerait sur une colonne perdue
- [x] AC4 — aucune requête réseau ne change : les paramètres `fields[…]`, `filter[…]`,
      `include=`, `sort=` et `per_page` émis par chaque écran touché sont identiques avant/après,
      éprouvé par test
- [x] AC5 — le nombre de fichiers de la clôture important `@/components/console` a augmenté, et
      aucune primitive n'a été dupliquée sous un autre nom
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent
      *Non cochée : `npm run lint` (0 erreur, 36 avertissements préexistants) et `npx tsc --noEmit`
      (0) sont verts, et `npx vitest run` **en entier** a bien tourné — 203 fichiers / 1390 tests,
      0 échec — mais sur le **worktree d'avant fusion**. Depuis, le lot a fusionné 22 unités et
      quatre correcteurs ont écrit dans l'arbre : ce vert ne dit plus rien de l'arbre livré. La
      suite entière sur l'arbre fusionné appartient à la session déléguante.*

## Hors périmètre

- La palette de couleur : TCK-381, qui dépend de ce ticket (il vaut mieux substituer une fois,
  sur une primitive, que quarante-cinq fois sur ses appelants).
- Les consoles `/admin` et `/super-admin`, déjà passées (TCK-357, TCK-373).
- Le remplacement de `feedback/EmptyState` par `console/DataState`, ou l'inverse : deux systèmes
  coexistent, l'arbitrage est un ticket à lui seul.
- Toute modification de contenu, de colonne ou de filtre.

## Notes d'implémentation

### Ce que la re-mesure a contredit (2026-08-27, avant d'écrire une ligne)

| Le ticket écrivait | Mesuré |
|---|---|
| clôture d'import de `/app` = **259 fichiers** | **403** (départ 51 fichiers de route, imports suivis) |
| **31 pages** réécrivent l'en-tête à la main | **32 pages** + 2 composants (`OwnersList`, `ServiceProvidersList`), et 6 des pages en portent **deux** (branches d'erreur / retours anticipés) — 40 blocs au total |
| **cinq** `<table>` nues dans la clôture | **neuf** : les cinq nommées + `LeaseSchedule`, `InvoicesTable`, `PaymentsHistoryTable`, `PayoutsTable` |
| `CustomerList` « refait une pagination en ligne » | **faux** — c'est un `<p>` de comptage (`t('pagination', …)`), pas un contrôle : aucun bouton, aucun calcul de page |
| `PropertyPagination` est un doublon à supprimer | **7 points d'appel**, et elle porte l'état d'URL **et** le sélecteur de densité — cf. AC2 ci-dessous |

### AC2 — pourquoi `PropertyPagination.tsx` existe encore

Sa suppression aurait retiré l'état d'URL et le sélecteur de densité à sept écrans, ce que la
contrainte stricte « pas de taille de page changée » du même ticket interdit, et ce que le docblock
de `console/Pagination` refuse explicitement depuis TCK-373 (*« Fusionner les trois produirait un
composant à trois modes »*).

Ce qui était **réellement** dupliqué a disparu : la paire de boutons et l'arithmétique `page ± 1`.
`console/Pagination` gagne un emplacement `summary`, `PropertyPagination` devient un adaptateur
d'URL de ~30 lignes. **La seconde moitié de l'AC2 est donc tenue, la première non, délibérément.**

### Les deux élargissements de primitive

- `DataTable` reçoit `stickyHeader` — pour NE PAS perdre le `sticky top-0 … backdrop-blur` que la
  table des biens portait déjà.
- `Pagination` reçoit `summary`, et sa sortie anticipée « une seule page ⇒ rien » ne vaut plus que
  pour la forme nue : avec un résumé, l'appelant y a mis un compte et un sélecteur qu'escamoter
  serait une régression.

Les deux sont éprouvés dans `console/__tests__/primitives-elargies-tck-380.test.tsx`.

### Restes assumés

Quatre `<table>` nues de la clôture ne sont pas converties — `LeaseSchedule`, `InvoicesTable`,
`PaymentsHistoryTable`, `PayoutsTable`. Elles ne figuraient pas dans le relevé du ticket, et les
trois dernières portent chacune leur propre état de chargement : les convertir demande de trancher
`DataState` vs l'existant, ce que le hors-périmètre de ce ticket réserve à un autre.

### Revue adverse (2026-08-27)

**Verdict : ACCEPTÉ AVEC RÉSERVE.** Les six AC tiennent, sauf la première moitié d'AC2 —
non tenue **délibérément** et bien raisonnée (cf. ci-dessus). AC3 a été vérifié par les ablations
de la revue et non par lecture : une colonne retirée d'`OwnersList` → 1 rouge **qui la nomme**
(`['Nom','Statut','Actions']` ≠ `['Nom','Email','Statut','Actions']`), et deux colonnes
**interverties** → 1 rouge, ce que la première ablation ne prouvait pas.

**Deux réserves nommées, aucune corrigée :**

- `settings/agency/upgrade/page.tsx` est la seule page de `/app` (1 sur 46) à rendre encore son
  en-tête à la main. Elle coche AC1 parce qu'elle écrit `text-3xl` là où l'AC nomme la chaîne
  exacte `font-display text-2xl` : **une régression future qui réécrirait un en-tête à la main en
  `text-3xl` cocherait AC1 elle aussi.** C'est l'AC qui est trop étroite, autant que le code.
- AC4 est le seul AC des trois tickets de ce groupe que la revue **n'a ni exécuté ni ablaté** : le
  vérifier vraiment demanderait de comparer les URL émises avant/après sur les sept écrans, donc de
  disposer de l'arbre d'avant. Il reste couvert par le grep du diff complet (zéro ligne de code de
  requête modifiée) et par `PropertyPagination.test.tsx`, qui éprouve les quatre formes d'URL
  émises. *Signalé plutôt que redit comme prouvé.*

**Le hunk ambigu de la fusion sur `StatCard` est résolu juste**, et mesuré : le retrait de l'encre
de conteneur est correct — les quatre nœuds de texte fixent chacun la leur, et les contrastes
tiennent (`text-muted-foreground` sur `bg-success/10` : 4,97:1 clair, 5,80:1 sombre ; sur
`bg-warning/10` : 4,95:1 et 5,82:1 ; `text-foreground` ≥ 12,5:1 partout). L'ablation qui rend
`bg-warning/10` à `bg-card` fait rougir 2 fichiers.
