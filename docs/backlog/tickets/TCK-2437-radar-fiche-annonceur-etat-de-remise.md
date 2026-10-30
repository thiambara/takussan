---
id: TCK-2437
title: "Radar : afficher dans la fiche annonceur l'état de remise d'un message WhatsApp (remis, lu, échec)"
status: doing
phase: P3
family: front
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2427]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models:
    - "docs/models-spec.md#110-radaroutreach-"
tags: [front, radar, whatsapp, adr-0081]
---

## Objectif utilisateur

L'opérateur du Radar voit, dans la fiche annonceur, si un message envoyé par l'API WhatsApp a été remis, lu ou n'a pas
été remis, et ne prend jamais un message en échec pour un message parti.

## Contexte

TCK-2427 tient l'état de remise de chaque message envoyé par l'API (`provider_status` : `sent`, `delivered`, `read`,
`failed`) et journalise un échec (`radar_whatsapp_delivery_failed`). La console ne le montre pas : `canalDuMessage()`
(`takussan-web/src/components/admin/super/radar/annonceur/reponses.ts`) ne distingue que `manual`, `cloud` et
`ambiguous`, et le type `RadarOutreachProviderStatus` du front ne connaît que `accepted | ambiguous`. Un message non
remis s'y lit donc « par l'API », comme un message remis. Relevé par la vérification adverse de la PR de spec commune du
lot 2 du Radar (2026-10-30).

## Contrat de données

- `GET /api/admin/radar/advertisers/{id}` existant : `RadarOutreachResource` rend déjà `provider_status` tel qu'en base.
  Aucune lecture neuve n'est attendue ; si le code de l'échec de WhatsApp doit s'afficher, il n'est aujourd'hui que dans
  le journal d'activité : le signaler dans ce ticket avant d'ajouter une lecture côté API.

## Direction UX / Artistique

Sobre, à la façon des autres états de la fiche annonceur : l'état de remise se lit d'un coup d'œil près du canal du
message, l'échec se distingue nettement (ton destructif de la charte), sans alarmer pour un simple « envoyé ».

## Contraintes strictes (métier)

- Un accusé n'est jamais une preuve d'accord : l'affichage ne propose aucun geste sur l'issue ou les annonces.
- Un message non remis reste un message envoyé dont l'opérateur juge la suite : aucun renvoi automatique.
- Libellés par next-intl (`fr`, `en` ; `wo` porte le texte français tel quel tant que le wolof est en pause).

## Delta à produire

- [ ] Type front de `provider_status` aligné sur les valeurs de l'API (`accepted`, `ambiguous`, `sent`, `delivered`,
      `read`, `failed`).
- [ ] Fiche annonceur : état de remise affiché pour tout message envoyé par l'API.
- [ ] Tests Vitest de la fiche, dont un message `failed`.

## Critères d'acceptation

- [ ] AC1 — Un message `failed` ne s'affiche jamais comme remis, ni sans mention d'échec.
- [ ] AC2 — Un message `sent` ou `accepted` (pas encore d'accusé) s'affiche envoyé, jamais remis.
- [ ] AC3 — Un message `delivered` ou `read` s'affiche remis ou lu ; un message `ambiguous` garde son libellé « par
      l'API sans confirmation de Meta ».
- [ ] AC4 — Un message envoyé à la main n'affiche aucun état de remise.

## Hors périmètre

- L'appariement des accusés d'un envoi ambigu (TCK-2436).
- Une alerte ou une notification sur un échec de remise.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
