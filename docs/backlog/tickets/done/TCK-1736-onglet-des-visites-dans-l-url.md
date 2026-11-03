---
id: TCK-1736
title: "La liste des visites porte son onglet dans l'URL"
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
tags: [front, url, listes, pistes]
---

## Objectif utilisateur

Qui revient sur la liste des visites après avoir ouvert une fiche, recharge la page ou partage son lien retrouve
la même vue, au lieu de la vue par défaut.

## Contexte

Réf : **P168.03** du fichier de pistes, `validé` (critère V7 cité par le classement, accordé). La
piste se livre en un ticket par liste, comme le recommande le délégué : TCK-1732
(`CommissionsLedger`), TCK-1734 (`InventoryList`), TCK-1736 (`VisitsList`), TCK-1738
(`AuditTrail`), TCK-1740 (calendrier).

Mesuré avant correctif (test de garde ci-dessous, rouge sur `acec51c14`) : la vue montée sur une
requête qui la porte ouvrait la vue par défaut, et un changement n'appelait aucun `router.replace`
— la vue était tenue en `useState`.

## Décision du porteur

> validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Recommandation du délégué, appliquée : porter la vue dans l'URL liste par liste sur le patron
d'`AdminFinancesTabs` (valeurs bornées, `router.replace`, défaut absent de l'URL), dans l'ordre
`CommissionsLedger`, `InventoryList`, `VisitsList`, `AuditTrail`, puis le calendrier, en un ticket
par liste.

**Paramètres retenus pour cette liste** (choix de l'implémenteur, la piste les nommant sans
recommandation sur leur forme) : `?tab=` (`unassigned` pour le personnel seul, qui seul voit l'onglet ; `confirmed`, `past`, `cancelled` ; absent pour « Demandées », le défaut).

## Delta à produire

- [x] La liste lit sa vue par `useSearchParams`, bornée aux valeurs connues, et l'écrit par
      `router.replace` (`useVueDansLUrl`, `src/hooks/useVueDansLUrl.ts`).
- [x] Tests : `VisitsList.url.tck-1736.test.tsx` ; les trois tests existants de `VisitsList` montent `src/test/navigation-url.ts` et repartent d'une URL vide.

## Critères d'acceptation

- [x] AC1 — Montée sur une requête qui porte la vue, la liste l'ouvre ; une valeur inconnue rend la valeur par défaut.
- [x] AC2 — Un changement de la vue appelle `router.replace` avec la requête qui la porte, sans la valeur par défaut, et un changement de filtre ramène à la page 1.

## Hors périmètre

- Le retour arrière du navigateur n'est pas joué (aucun test de navigateur) : il suit l'URL.

## Notes d'implémentation

- Ablation : composant d'origine remis → 2 rouges sur 3 (l'onglet inconnu passait déjà) ; correctif remis → 3/3 verts.
