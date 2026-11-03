---
id: TCK-1738
title: "Le journal d'audit porte ses filtres et sa page dans l'URL"
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

Qui revient sur le journal d'audit après avoir ouvert une fiche, recharge la page ou partage son lien retrouve
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
recommandation sur leur forme) : `?from=` et `?to=` (`AAAA-MM-JJ`, absents pour les trente derniers jours), `?event=` (`KNOWN_EVENTS`), `?subject=` (`KNOWN_SUBJECT_TYPES`), `?member=` (entier positif), `?search=` (texte libre, écrit après la temporisation de TCK-376) et `?page=` (absent pour 1). La recherche libre est gardée : la Piste range tous les filtres dans la vue, et une page portée sans sa recherche rouvrirait une autre liste.

## Delta à produire

- [x] La liste lit sa vue par `useSearchParams`, bornée aux valeurs connues, et l'écrit par
      `router.replace` (`useVueDansLUrl`, `src/hooks/useVueDansLUrl.ts`).
- [x] Tests : `AuditTrail.url.tck-1738.test.tsx` ; `AuditTrail.test.tsx` monte `src/test/navigation-url.ts` et repart d'une URL vide.

## Critères d'acceptation

- [x] AC1 — Montée sur une requête qui porte la vue, la liste l'ouvre ; une valeur inconnue rend la valeur par défaut.
- [x] AC2 — Un changement de la vue appelle `router.replace` avec la requête qui la porte, sans la valeur par défaut, et un changement de filtre ramène à la page 1.

## Hors périmètre

- Le retour arrière du navigateur n'est pas joué (aucun test de navigateur) : il suit l'URL.

## Notes d'implémentation

- Ablation : composant d'origine remis → 2 rouges sur 3 (les valeurs mal formées passaient déjà) ; correctif remis → 3/3 verts, et les 23 tests de TCK-376 et TCK-601 restent verts.
