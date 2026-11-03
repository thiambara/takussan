---
id: TCK-1364
title: "Au journal, la clé `ninea` d'une ligne d'agence sort de l'expurgation"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#onboarding-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#le-ninea-dune-agence-est-chiffré-et-masqué-dans-la-demande-puis-recopié-en-clair-dans-agenciesninea-par-une-décision-quadr-0044-nécrit-pas"
tags: [back, audit, rgpd, agence, pistes]
---

## Objectif utilisateur

L'export du journal montre l'ancien et le nouveau NINEA d'une agence, mention légale publique,
au lieu de `[REDACTED]` ; le RIB de la même ligne, et le NINEA de tout autre sujet, restent
expurgés.

## Contexte

Réf : **P84.01** du fichier de pistes, `validé` (critère V3 cité par le classement, accordé ;
l'exception est écrite dans ADR-0044, amendement du 2026-10-22, point 3, qui confie le code à
l'implémenteur des pistes).

Mesuré avant correctif (test de garde ci-dessous, rouge sur `45fd976b2`) : une ligne du journal
de sujet `Agency` dont `attribute_changes` porte `ninea` et `rib` → l'export CSV rend
`[REDACTED]` pour les deux.

## Décision du porteur

> porteur (2026-10-22) : l'exception écrite dans ADR-0044 (amendement du 2026-10-22) : le NINEA d'une agence `standard` est en clair dans `agencies.ninea`, chiffré dans la demande le temps de la revue ; au journal, la clé `ninea` sort de l'expurgation pour le seul sujet `Agency`

## Hypothèses (mode sans humain)

- La règle porte sur la clé **exacte** `ninea`, à toute profondeur de la ligne (sous `attributes`
  et `old`) : une clé qui ne fait que contenir le segment (`owner_ninea`) reste expurgée.
- Toutes les lectures du journal passent le `subject_type` de la ligne : l'export
  (`ActivityLogExporter`), l'audit d'agence (`AuditLogController`), la console
  (`CrossTenantAuditController`, `UserDetailController`). L'export des données d'un utilisateur
  (`DataExportBuilder`) ne rend le diff que des lignes dont le sujet est l'utilisateur : inchangé.
- L'amendement dit « agence `standard` » : une agence `individual` ne peut pas écrire de NINEA
  (`AgencyUpdateRequest`, `prohibited`), le sujet suffit donc à borner l'exception.

## Delta à produire

- [x] `PropertyRedactor::redact($properties, ?string $subjectType)` : `ninea` en clair pour le
  sujet `Agency`.
- [x] Les quatre lecteurs du journal passent `$log->subject_type`.
- [x] Tests : `ActivityLogExporterTest` — NINEA d'agence en clair à côté d'un `rib` expurgé ;
  NINEA d'un sujet `User` expurgé.

## Critères d'acceptation

- [x] AC1 — export d'un changement de NINEA d'agence : ancienne et nouvelle valeur en clair ; `rib`
  de la même ligne `[REDACTED]`.
- [x] AC2 — `ninea` sous un autre sujet : `[REDACTED]`.
- [x] AC3 — `AgencyAuditScopeTest` (expurgation de `ninea` sur un sujet `Property`) reste vert.

## Hors périmètre

- Le chiffrement et le masquage de `agency_upgrade_requests.ninea`, inchangés (amendement, point 2).

## Notes d'implémentation

- Ablation : l'entrée `Agency::class => ['ninea']` retirée → AC1 rouge (`[REDACTED]`) ; remise →
  16 verts.
- Piège : la ligne cherchée dans l'export se choisit aussi par l'événement `updated` ; la création
  du même sujet écrit une ligne `created` au même horodatage, et la prendre faisait rougir le
  cas AC2 au hasard de l'ordre.
