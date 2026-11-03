---
id: TCK-2221
title: "`metadata` d'une invitation n'est plus rendu par `InvitationResource`"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-181--tableaux-sans-borne-rangés-en-jsonb-et-relus-en-entier"
tags: [back, invitation, pistes]
---

## Objectif utilisateur

Les réponses d'invitation (fiche, liste, acceptation par le jeton, routes par rôle) ne rendent plus
`metadata`, qui porte des clés internes que l'API relit et qu'aucun écran ne lit.

## Contexte

Réf : **P181.05** du fichier de pistes, `validé`.

## Décision du porteur

> validé — validation du porteur (2026-10-24) : même ticket que P208.01 : la création générique retirée, `metadata` n'a plus d'entrée client hors des chemins par rôle, qui le passent au service ; `metadata` est retiré d'`InvitationResource`

Avant (mesuré) : `GET /api/invitations/{id}` et `GET /api/invitations` de l'émetteur rendaient
`metadata` entier (`level`, `from_maintenance_request_id`, `deep_link_consumed_at`, `locale`).

## Hypothèses (mode sans humain)

- Les deux premières parties de la décision (création générique retirée, plus d'entrée client de
  `metadata` hors des chemins par rôle) sont celles de P208.01, portées par TCK-2190 (PR #1491, autre
  instance de l'implémenteur, qui a laissé P181.05 à celle-ci). Ce ticket ne porte que la troisième :
  il ne touche ni la route ni `CreateInvitationRequest`, pour ne pas entrer en conflit avec #1491.
- Aucun écran ne lit `metadata` d'une invitation (mesure de l'implémenteur du 2026-10-23 : le type
  `SuperAdminPendingInvitation.metadata` du front est déclaré, jamais lu). Le type n'est pas retiré
  ici : le lot ne touche que l'API.

## Delta à produire

- [x] `InvitationResource` ne rend plus `metadata`.
- [x] Test : `tests/Feature/Invitation/MetadataDInvitationNonRenduTest.php`.

## Critères d'acceptation

- [x] AC1 — La ressource résolue n'a pas de clé `metadata`, le reste de l'enveloppe est intact.
- [x] AC2 — La fiche et la liste de l'émetteur ne rendent pas `metadata`.

## Hors périmètre

- Retrait de la création générique (P208.01, TCK-2190).
- Retrait du champ `metadata` du type `SuperAdminPendingInvitation` côté front.

## Notes d'implémentation

- **Ablation** : la ligne `'metadata' => $this->metadata` présente → 2 rouges sur 2 ; retirée →
  2 verts.
