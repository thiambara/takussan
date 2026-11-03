---
id: TCK-1706
title: "Le rappel d'un reversement échu va à son émetteur s'il est encore actif, sinon aux détenteurs actifs de `payouts.create`"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#28-payout-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-126--destinataires-déquipe-choisis-sans-juger-le-profil-actif"
tags: [back, payouts, notifications, pistes]
---

## Contexte

Réf : **P126.03** du fichier de pistes, `validé` (critère V7 accordé). `payouts:remind-due`
envoie `PayoutDue` au seul `User::find($payout->issued_by_id)`, sans juger son profil dans
l'agence du reversement : un agent suspendu ou parti reçoit seul le rappel, et le marqueur
`due_reminded_at` empêche qu'il revienne.

## Décision du porteur

validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

**Choix retenu** (la piste écrit « tenant `payouts.*` » et laisse le repli à écrire) : la
capacité jugée est **`payouts.create`**, celle qui administre un reversement échu
(`PayoutPolicy::update` : marquer traité, en échec, annuler). Le repli va aux **détenteurs actifs
de `payouts.create`** de l'agence du reversement (`PayoutApprovers::holders`, même lecture du
personnel qu'ADR-0031), **hors bénéficiaire**, que la policy refuse sur son propre reversement.
`payouts.approve` n'est pas retenue : elle ne sert qu'aux reversements `awaiting_approval`, que la
commande ne rappelle pas.

## Delta à produire

- [x] `RemindDuePayouts::recipientsFor()` : l'émetteur s'il figure parmi
  `holders($agency, payouts.create)`, sinon ces détenteurs hors bénéficiaire. La cible de l'avis
  suit chaque destinataire (TCK-1467, inchangé).
- [x] Test : émetteur agent suspendu → rappel à l'admin et à l'agent actifs, une fois chacun, rien
  au suspendu.
- [x] Tests existants ajustés : les émetteurs du cas AC20 sont des agents actifs de l'agence ;
  l'admin d'une autre agence ne reçoit plus le rappel, qui va aux détenteurs de l'agence.

## Critères d'acceptation

- [x] AC1 — reversement `scheduled` échu émis par un agent `suspended` : `PayoutDue` à chaque
  détenteur actif de `payouts.create` de l'agence (admin, agent), pas à l'émetteur.
- [x] AC2 — émetteur actif tenant `payouts.create` : lui seul est rappelé, une fois (AC20 de
  TCK-594 tenu).
- [x] AC3 — émetteur admin d'une autre agence : pas de rappel pour lui, les détenteurs de l'agence
  du reversement le reçoivent, chacun avec sa propre cible.

## Hors périmètre

- `docs/features.md` § 1.5 dit « rappelé une fois à son émetteur » sans dire le cas d'un émetteur
  qui n'est plus actif : le repli décidé ici est à reporter par `/sync-specs` (la spec ne se
  modifie pas dans ce ticket).
- Une agence sans aucun détenteur actif : aucun rappel ne part, le marqueur est posé comme avant.

## Notes d'implémentation

- Ablation : commande remise à `43c553036` → 2 rouges (`un_emetteur_suspendu…`,
  `la_cible_du_rappel…`) ; correctif remis → 4/4 verts.
- Le test AC20 d'origine créait des émetteurs sans aucun profil et les tenait rappelés : c'était
  le comportement que la piste corrige, il a été ramené à des agents actifs.
