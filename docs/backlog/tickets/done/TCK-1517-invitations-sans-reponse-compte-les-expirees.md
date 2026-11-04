---
id: TCK-1517
title: "« Invitations sans réponse » compte `sent` et `expired`, comme la section de l'équipe"
status: done
phase: P2
family: front
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-167--tuiles-et-lignes-cliquables-des-tableaux-de-bord--ce-que-le-lien-ouvre-face-à-ce-que-le-nombre-compte"
tags: [front, dashboard, invitations, pistes]
---

## Contexte

Réf : **P167.06** du fichier de pistes, `validé (délégué)`.

La file « Invitations sans réponse » de l'aperçu d'agence compte `filter[status]=sent`
(`agency-queues.ts`) et mène à `/app/agency/team`, dont la section des invitations liste
`sent,expired` depuis TCK-368 : dès qu'une invitation expire, la page en montre plus que la file
n'en annonce.

## Décision du porteur (déléguée)

validé (délégué) — la file « Invitations sans réponse » compte `filter[status]=sent,expired`, la même règle que la section des invitations de `/app/agency/team` (TCK-368), tirée d'une constante partagée par `fetchPendingInvitationsCount` et `fetchPendingAgencyInvitations`, sans libellé neuf ; le docblock de `fetchPendingInvitationsCount` est corrigé ; test : les deux lectures envoient le même `filter[status]`

## Objectif utilisateur

Le nombre de la file est celui des invitations que l'admin trouve en cliquant.

## Delta à produire

- [x] `STATUTS_INVITATION_SANS_REPONSE = 'sent,expired'` exportée par `agency-invitations.ts`, lue
  par `fetchPendingAgencyInvitations` et `fetchPendingInvitationsCount`.
- [x] Docblock de `fetchPendingInvitationsCount` corrigé (point 3).
- [x] Test : les deux lectures envoient le même `filter[status]`.

## Critères d'acceptation

- [x] AC1 — `fetchPendingInvitationsCount` et `fetchPendingAgencyInvitations` envoient le même
  `filter[status]`, `sent,expired`.
- [x] AC2 — aucun libellé neuf.

## Hors périmètre

- Nommer la part expirée dans le compte (l'autre issue de la Piste, non retenue par la décision).

## Notes d'implémentation

- Ablation : `agency-queues.ts` remis à `filter: { status: 'sent' }` → le test neuf rouge
  (`expected 'sent' to be 'sent,expired'`) ; remis → vert.
- `agency-queues.test.ts` attendait `filter[status]=sent` : l'attente suit la décision.
