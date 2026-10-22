---
id: TCK-1410
title: "Une demande de visite rejouée au même créneau rend la visite déjà ouverte, et le contact anonyme rejoué sous la même clé ne s'écrit qu'une fois"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1396]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-144--écritures-du-navigateur-quune-réponse-perdue-invite-à-rejouer"
  adr:
    - "docs/adr/0072-une-cle-d-idempotence-commune-pour-les-ecritures-rejouees.md"
tags: [api, web, visits, contact-leads, idempotence, pistes]
---

## Contexte

Réf : **P144.08** du fichier de pistes, `validé` par le porteur. Trois demandes de visite au même créneau créaient trois visites et consommaient le quota de trois, si bien qu'une quatrième demande légitime était refusée ; deux `contact-lead` identiques créaient deux demandes. La clé de P144.01 existe désormais (TCK-1396) : `contact-lead` la reçoit, comme le prévoit le lot 3 d'ADR-0072.

## Décision du porteur

> validé — porteur (2026-10-22) : les visites se rapprochent par (visiteur, bien, créneau) dans `VisitSchedulingService::createOrFail`, en rendant la visite active déjà ouverte ; `contact-lead` attend la clé de P144.01

## Objectif

La visite rejouée ne consomme plus le quota ni ne prévient deux fois ; le contact anonyme rejoué ne s'écrit qu'une fois.

## Delta à produire

- [x] `VisitSchedulingService::createOrFail` : sous le verrou du bien, la visite active du même visiteur (compte, sinon fiche client), sur le même bien, au même créneau, est rendue au lieu d'en créer une ; les deux appelants ne préviennent que sur `wasRecentlyCreated`.
- [x] `public.properties.contact-lead` et `public.agents.contact-lead` portent `['throttle:public-contact-lead', 'idempotent']`, ajoutées à `IdempotentRoutesTest`.
- [x] `submitContactLead` et `submitAgentContactLead` reçoivent `cleIdempotence` ; `AnonymousLeadDialog` l'engendre (`useCleIdempotence`) et la passe à `onSubmit`.
- [x] Tests : `tests/Feature/Idempotence/VisiteRejoueeTest.php`, `DemandeDeContactRejoueeTest.php`, `AnonymousLeadDialog.idempotence.tck-1410.test.tsx`, `property.idempotence.tck-1406.test.ts` (cas TCK-1410).

## Critères d'acceptation

- [x] AC1 — Trois demandes au même créneau : une visite, le même `id`, aucune notification de plus ; une demande à un autre créneau passe ensuite.
- [x] AC2 — Une visite annulée au même créneau n'est pas rendue ; deux visiteurs au même créneau ont chacun la leur.
- [x] AC3 — Deux `contact-lead` sous la même clé, du bien comme de l'agent : une demande.
- [x] AC4 — Le dialogue garde la clé après un échec, en prend une neuve après un succès.

## Hors périmètre

- Une demande de visite anonyme (sans compte ni fiche client) : rien ne l'identifie, elle n'est pas rapprochée.
- La visite ne prend pas de clé d'idempotence (ADR-0072 § 8).

## Notes d'implémentation

- Ablation : retour anticipé de `createOrFail` neutralisé → `VisiteRejoueeTest` 1 rouge sur 3 (les deux autres sont les témoins) ; routes `contact-lead` sans `idempotent` → `DemandeDeContactRejoueeTest` 2 rouges ; clé figée dans le dialogue → 1 rouge, action sans en-tête → 1 rouge ; remis → verts.
- La valeur du créneau comparée est celle que `create()` écrirait (même cast), pas la chaîne reçue.
