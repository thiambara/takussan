---
id: TCK-1744
title: "Les demandes de passage de la console prennent leur statut dans l'URL, et le détail y revient"
status: done
phase: P2
family: front
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-168--onglets-filtres-et-pagination-des-listes-tenus-en-état-local-plutôt-que-dans-lurl"
tags: [front, console, url, pistes]
---

## Objectif utilisateur

L'opérateur de la console qui change le statut de la liste des demandes de passage garde une URL qui dit ce qu'il voit, et
le lien de retour du détail le ramène à la liste qu'il a quittée.

## Contexte

Réf : **P168.04** du fichier de pistes, `validé` (critère V7 cité par le classement, accordé). La
piste se livre en deux tickets : TCK-1742 (agences), TCK-1744 (demandes de passage).

Mesuré avant correctif (tests de garde ci-dessous, rouges sur `acec51c14`) : arrivé par
`?status=active`, choisir un autre statut n'appelait aucun `router.replace` (amorce seule,
TCK-360) ; le lien de retour du détail menait à la liste nue.

## Décision du porteur

> validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Recommandation du délégué, appliquée : faire de l'URL la source des filtres des deux pages, comme
`/super-admin/properties`, et rendre au lien de retour du détail la requête de la liste quittée, en
prenant `?status=` et `?is_verified=` d'abord et en laissant recherche, dates, tri et page pour un
second temps. La validation lève l'« amorce seule » de TCK-360 pour ces filtres.

**Choix de l'implémenteur** (la piste ne dit pas comment le détail connaît la liste quittée) : la
liste passe sa requête au détail dans `?liste=` ; le détail ne la recopie qu'après l'avoir réduite
aux clés et valeurs connues (`status` : `pending`, `approved`, `rejected`, `revoked`), pour qu'un `?liste=` écrit à la main ne mène qu'à une vue
de la liste.

## Reste à faire

Recherche, dates, tri et page dans l'URL : la recommandation du délégué les laisse pour un second
temps.

## Delta à produire

- [x] `/super-admin/agency-upgrade-requests` lit `?status=` et l'écrit par `router.replace` (`useVueDansLUrl`, TCK-1732).
- [x] Les deux liens d'une ligne mènent au détail avec `?liste=` ; `BackLink` du détail le rend, borné (`retour-de-liste.ts`, TCK-1742).
- [x] Tests : `agency-upgrade-requests/__tests__/statut-dans-l-url.tck-1744.test.tsx`, `[id]/__tests__/retour-liste.tck-1744.test.tsx` ; `status-seed.test.tsx` et `kyc-non-verifie.tck-1003.test.tsx` reçoivent `useRouter` / `useSearchParams` dans leur bouchon.

## Critères d'acceptation

- [x] AC1 — Un changement de statut s'écrit dans l'URL par `router.replace` ; « tous » le retire.
- [x] AC2 — Le lien de retour du détail rend la requête de la liste quittée, bornée aux filtres connus ; sans elle, il mène à la liste nue.

## Hors périmètre

- Le retour arrière du navigateur n'est pas joué (aucun test de navigateur) : il suit l'URL.

## Notes d'implémentation

- Ablation : liste et détail d'origine remis → 4 rouges sur 5 (le statut inconnu passait déjà) ; correctifs remis → 5/5 verts, et les tests de TCK-360 et TCK-1003 restent verts.
