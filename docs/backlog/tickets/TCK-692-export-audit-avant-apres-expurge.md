---
id: TCK-692
title: "L'export du journal d'audit porte l'avant/après d'une modification, adresse et numéro expurgés"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#1-user
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-19--rétention-des-tables-qui-grossissent
tags: [api, audit, export, rgpd, pistes]
---

## Contexte

Réf : **P19.03** du fichier de pistes, `validé` par le porteur (critère accordé : V3).

Depuis activitylog v5, l'avant/après d'une modification de modèle vit dans la colonne
`attribute_changes`, et `properties` reste `[]`. `ActivityLogExporter::mapRow()` ne cherche
`attributes` et `old` que dans `properties` : la colonne `properties_diff` du CSV d'audit (export
d'agence comme export de la console) sort vide pour toute modification. `CustomerActivityFeed` lit
déjà `attribute_changes`. `PropertyRedactor`, par lequel passe l'export, ne masque ni l'adresse ni
le numéro.

## Décision du porteur

lire attribute_changes ; PropertyRedactor masque aussi email et phone

## Objectif

Le CSV d'audit rend l'ancienne et la nouvelle valeur des champs modifiés, sans l'adresse e-mail ni
le numéro de téléphone.

## Delta à produire

- [x] `ActivityLogExporter::mapRow()` : l'avant/après se lit dans `attribute_changes`, passé par
      `PropertyRedactor` ; `properties` reste lu pour les lignes écrites à la main
      (`withProperties`) et pour l'IP.
- [x] `PropertyRedactor` : une clé dont le dernier segment est `email` ou `phone` a sa valeur
      remplacée par `[REDACTED]`.
- [x] Tests : `ActivityLogExporterTest::test_l_export_d_une_modification_porte_l_avant_et_l_apres_expurges`,
      `PropertyRedactorTest::test_l_adresse_et_le_numero_sont_expurges` (6 clés) et
      `::test_un_drapeau_ou_une_date_de_contact_reste_lisible`.

## Critères d'acceptation

- [x] AC1 — L'export CSV d'une ligne `updated` d'un `User` porte, dans `properties_diff`,
      l'ancien et le nouveau `first_name`.
- [x] AC2 — L'adresse et le numéro, avant comme après, y valent `[REDACTED]`, et aucune de leurs
      valeurs n'apparaît dans le fichier.
- [x] AC3 — `email`, `phone`, `target_email`, `secondary_phone`, `contactEmail`, `Phone` sont
      expurgés ; `email_verified_at`, `phone_verified_at`, `notifications_email_enabled`,
      `secondary_phone_whatsapp` restent lisibles.

## Hypothèses (mode sans humain)

- « masque aussi email et phone » se lit par **dernier segment** de la clé, et non par segment
  quelconque comme `rib` : la règle par segment masquerait `email_verified_at` et
  `notifications_email_enabled`, que `User` journalise et qui ne portent pas le contact. Elle
  attrape les variantes préfixées que le dépôt écrit (`target_email`, `secondary_phone`).
- `PropertyRedactor` sert aussi l'audit d'agence (`AuditLogController`) et celui de la console
  (`CrossTenantAuditController`) : l'adresse et le numéro y sont donc masqués aussi. C'est l'effet
  de la décision telle qu'écrite, qui vise `PropertyRedactor` et non l'export seul.

## Hors périmètre

- La colonne `causer_email` de l'export, qui n'est pas un champ de `properties` : TCK-613 traite
  l'export et les données personnelles.
- Une adresse ou un numéro écrits dans une valeur libre (`description`, un texte) : le masquage
  juge des clés.
- `AuditLogController` et `CrossTenantAuditController` rendent toujours `properties` seul, sans
  `attribute_changes` : leur avant/après n'est pas traité ici (l'angle 56 recense ces lecteurs).

## Notes d'implémentation

- Ablation : le seul `mapRow()` remis à l'état d'origine → 1 rouge (« null is identical to
  'Apres' ») ; le seul `PropertyRedactor` remis → 7 rouges (les 6 clés, et l'e-mail en clair dans
  l'export). Correctifs remis : 34 verts.
