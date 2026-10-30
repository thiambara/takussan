---
id: TCK-2444
title: "Radar : dire dans la fiche annonceur pourquoi WhatsApp n'a pas remis un message (code de l'échec)"
status: todo
phase: P3
family: full
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2437]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models:
    - "docs/models-spec.md#110-radaroutreach-"
tags: [api, front, radar, whatsapp, adr-0081]
---

## Objectif utilisateur

Devant un message « Non remis », l'opérateur du Radar sait si l'échec tient au numéro (il n'est pas sur WhatsApp) ou à
une limite passagère de Meta, pour juger de la suite sans ouvrir le journal d'activité.

## Contexte

TCK-2437 affiche l'état de remise d'un message envoyé par l'API (envoyé, remis, lu, non remis). Le code de l'échec que
Meta rend (`131026` : non remis, `131049` : limité par Meta…) n'est tenu que dans le journal d'activité
(`radar_whatsapp_delivery_failed`, propriété `provider_error_code`, `RadarWhatsappReceipts`) : `RadarOutreachResource`
ne le rend pas, et aucune colonne de `radar_outreaches` ne le porte. TCK-2437 a choisi de ne pas ajouter cette lecture
(son contrat de données demandait de le signaler d'abord) : ce ticket la propose.

## Contrat de données

- À trancher : une colonne `radar_outreaches.provider_error_code` (entier, nullable) écrite par `RadarWhatsappReceipts`
  avec le statut `failed`, ou une lecture du journal d'activité par la fiche. La colonne est plus simple à lire et ne
  porte, comme le journal, que le code : jamais le texte de l'erreur (il peut citer le numéro).
- `RadarOutreachResource` rend le code (ou un code de libellé dérivé), `null` hors échec.

## Contraintes strictes (métier)

- Seul le code de Meta est rendu : ni `title`, ni `message`, ni `error_data`.
- Un échec reste un message envoyé dont l'opérateur juge la suite : aucun renvoi automatique, aucun geste proposé.
- Libellés par next-intl (`fr`, `en` ; `wo` porte le texte français tel quel tant que le wolof est en pause) ; un code
  inconnu s'affiche par un libellé générique.

## Critères d'acceptation

- [ ] AC1 — Un message `failed` avec un code connu affiche, près de « Non remis », le motif lisible de ce code.
- [ ] AC2 — Un code inconnu ou absent affiche « Non remis » sans motif inventé.
- [ ] AC3 — Aucune réponse de l'API ne rend le texte de l'erreur de Meta.

## Hors périmètre

- Une alerte ou une notification sur un échec de remise.
- Un renvoi, automatique ou proposé.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
