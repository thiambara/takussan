---
id: TCK-2920
title: "Réglages de bail : la lecture s'ouvre au personnel actif de l'agence, et `can_edit` dit qui peut écrire"
status: todo
phase: P2
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2921]
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#30-setting-"
tags: [back, agence, bail, reglages, acces, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Un agent de l'agence peut consulter les réglages de bail que chaque bail neuf reprend, sans pouvoir les changer.

## Contrat de données

- `GET /api/settings/lease` (TCK-2832) : même forme de réponse (`can_edit`, `settings`).
- La règle d'accès est posée par [ADR-0111](../../../adr/0111-les-reglages-de-bail-se-lisent-par-le-personnel-de-l-agence.md) (écrit avec ce ticket, à faire valider par le porteur avant la fusion).

## Contraintes strictes (métier)

- [ADR-0111](../../../adr/0111-les-reglages-de-bail-se-lisent-par-le-personnel-de-l-agence.md) § 1-4 et [ADR-0031](../../../adr/0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) : lecture au personnel **actif** de l'agence de l'espace actif (admin, agent) et au super-admin ; jamais au bailleur, prestataire, locataire, profil non actif, ni au personnel d'une autre agence.
- L'écriture (`POST /api/settings` portée `agency`, `DELETE /api/settings/{id}`) reste jugée par `AgencyPolicy::configure`, sans changement.
- `GET /api/settings` (liste générale) n'est pas ouvert.

## Delta à produire

- [ ] ADR-0111 : relu et validé par le porteur (statut « Accepté »), ligne ajoutée à `docs/adr/README.md`.
- [ ] `LeaseSettingsController` : la porte de lecture suit ADR-0111 § 1 (une méthode de policy dédiée, p. ex. `AgencyPolicy::viewLeaseSettings`, plutôt qu'un test ad hoc dans le contrôleur).
- [ ] `can_edit` = `AgencyPolicy::configure(appelant, agence)`, plus jamais `true` en dur.
- [ ] Docblock du contrôleur réécrit (il dit aujourd'hui « ni un agent »).
- [ ] Tests : `tests/Feature/Settings/LeaseSettingsReadTest` — les six cas d'ADR-0111 § Application.

## Critères d'acceptation

- [ ] AC1 — Un agent au profil actif de l'agence A reçoit `200` sur `GET /api/settings/lease`, avec les quatre réglages et `can_edit: false`.
- [ ] AC2 — L'admin principal de A reçoit `200` et `can_edit: true` ; un admin d'agence de A **sans** `agency.update` reçoit `200` et `can_edit: false`.
- [ ] AC3 — Un agent `blocked`, un bailleur de A, un prestataire de A et un admin de l'agence B reçoivent `403`.
- [ ] AC4 — Le même agent reçoit toujours `403` sur `POST /api/settings` (portée `agency`, clé `lease.late_fee_percent`) et sur `DELETE /api/settings/{id}` d'un réglage de A : un test l'éprouve, et il rougit si l'on remplace la policy d'écriture par celle de lecture (vérifié par ablation).
- [ ] AC5 — `can_edit` n'est plus une constante : remplacer le calcul par `true` fait rougir AC1 (ablation).

## Hors périmètre

- L'écran (TCK-2921).
- Ouvrir d'autres réglages de l'agence à la lecture.

## Notes d'implémentation

_(à remplir par implementing-specs)_
