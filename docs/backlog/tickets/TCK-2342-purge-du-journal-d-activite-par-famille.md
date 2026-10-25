---
id: TCK-2342
title: "La purge du journal d'activité garde chaque famille de journaux sa durée : 12 mois par défaut, 5 ans pour les journaux de preuve, 10 ans pour les pièces comptables"
status: todo
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
  models:
    - "docs/models-spec.md#13-activitylog--remplacé-par-spatielaravel-activitylog"
  adr:
    - "docs/adr/0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md"
  tickets:
    - "docs/backlog/tickets/TCK-537-ecarts-entre-la-politique-de-confidentialite-et-le-code.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-19--rétention-des-tables-qui-grossissent"
tags: [back, front, légal, données-personnelles, conformité, audit, pistes]
---

## Objectif utilisateur

Que la politique de confidentialité dise vrai sur le journal d'activité : il se purge à 12 mois, et
les journaux qui prouvent un geste sur une donnée personnelle, un droit, la sécurité ou l'argent se
gardent la durée que la politique et la loi leur donnent, au lieu d'être effacés avec les autres ou
de ne jamais l'être.

## Contexte

Réf : **P19.04** du fichier de pistes, `validé`.

- `activitylog:clean {log?}` du paquet purge un journal ou tous, sans exclusion
  (`CleanActivitylogCommand.php:13-40`), et rien ne le planifie (`routes/console.php`) : le journal
  n'est jamais purgé, alors que `privacy.ts` § 6 promet 12 mois. C'est l'écart n° 3 de TCK-537.
- TCK-537 (contrainte 5, AC3b) n'exempte que `PersonalDataAccess` et `Privacy`. La console tient
  onze journaux pour sensibles (`CrossTenantAuditController::SENSITIVE_LOG_NAMES`), la suppression de
  compte écrit sous `Account`, et `Auditable` écrit les pièces comptables sous le nom court de leur
  modèle (`LeasePayment`, `Invoice`, `Payout`…), que la politique garde 10 ans.

## Décision du porteur

- P19.04 :

  > validation du porteur (2026-10-25) : durées par famille de journaux, écrites dans TCK-537 et dans `privacy.ts` § 6 : 12 mois par défaut ; 5 ans pour `PersonalDataAccess`, `Privacy`, `Security`, `UserSupport`, `KYC`, `KycDossier`, `Account`, `Membership`, `AgencyRole`, `Integration` et `export` ; 10 ans pour les pièces comptables (`LeasePayment`, `BookingPayment`, `Invoice`, `Payout`, `PlatformPayout`, `CommissionEntry`, `Billing`) ; un test par famille

## Hypothèses

- **Une commande maison**, `audit:prune-activity-log`, plutôt que `activitylog:clean` : celle du
  paquet ne sait pas exclure un journal. Elle supprime par famille (`log_name`), par lots
  (`--batch`, 1 000 par défaut), au-delà de la durée comptée depuis `created_at`. Idempotente : une
  suppression par date, qu'une seconde exécution trouve vide. Planifiée chaque jour à 04:10 (Dakar),
  `withoutOverlapping`.
- **12 mois** se compte en mois (`subMonths(12)`), comme la politique l'écrit, et non 365 jours.
- **Un `log_name` nul ou absent des deux listes** relève du défaut. Une famille neuve est donc
  purgée à 12 mois tant qu'elle n'est pas nommée : c'est la règle de la politique (« 12 mois »), et
  la liste se lit dans la commande.
- **`PrivacyRequest`** n'est pas nommé par la décision : `PrivacyRequest` écrit sous `Privacy`
  (`PrivacyRequest::getActivitylogOptions()`), et aucun code n'écrit sous `PrivacyRequest`.
- **`activitylog:clean`** reste enregistré par le paquet, non planifié. Lancé à la main, il
  purgerait tout à 365 jours : hors périmètre, signalé.
- **La politique** : `privacy.ts` § 6, en `fr` et `en` (`wo` est vide à dessein, README du dossier),
  et `VERSION_DOCUMENTS` avance au 25 octobre 2026, comme le README le demande pour une nouvelle
  purge.

## Delta à produire

- [ ] `App\Console\Commands\PruneActivityLog` (`audit:prune-activity-log`), ses deux listes et ses
      trois durées en constantes.
- [ ] Planification dans `routes/console.php`.
- [ ] `privacy.ts` § 6 (`fr`, `en`) et son test ; `VERSION_DOCUMENTS` au 25 octobre 2026.
- [ ] TCK-537 : contrainte 5, delta et AC3b écrits avec les trois durées ; ligne datée de ce qui est
      fait ; TCK-537 reste `todo` pour ses autres parties.
- [ ] ADR-0044 amendé (2026-10-25), `docs/adr/README.md` ; `docs/models-spec.md` § 13,
      `docs/features.md` § 2.6.

## Critères d'acceptation

- [ ] AC1 (famille par défaut) — une ligne `default`, `Lease`, `Property` ou sans `log_name` de
      12 mois et un jour disparaît ; à 11 mois, elle reste.
- [ ] AC2 (famille de preuve, 5 ans) — pour chacun des onze journaux : une ligne de 400 jours et une
      de 5 ans moins un jour restent ; une de 5 ans et un jour disparaît.
- [ ] AC3 (pièces comptables, 10 ans) — pour chacun des sept journaux : une ligne de 5 ans et un
      jour et une de 10 ans moins un jour restent ; une de 10 ans et un jour disparaît.
- [ ] AC4 — la purge passe par lots (`--batch=2` sur cinq lignes échues les supprime toutes) et une
      seconde exécution ne supprime rien.
- [ ] AC5 — `audit:prune-activity-log` est planifiée chaque jour, sans chevauchement.
- [ ] AC6 — `privacy.ts` § 6 donne les trois durées, en français et en anglais.

## Hors périmètre

- Les trois autres parties de TCK-537 (preuve du consentement, effacement des profils, purges KYC et
  demandes de contact anonymes, auteur des avis) : TCK-537 reste `todo`.
- Le traitement de `activitylog:clean` (désenregistrer la commande du paquet ou surcharger
  `actions.clean_log`).

## Notes d'implémentation
