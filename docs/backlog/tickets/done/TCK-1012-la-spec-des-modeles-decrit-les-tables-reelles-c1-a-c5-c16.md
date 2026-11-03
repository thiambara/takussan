---
id: TCK-1012
title: "La spec des modèles décrit les tables réelles : notifications, compte, adhésions, réglages d'agence, tables du framework et journal d'audit (passe 013, C1 à C5 et C16)"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#13-activitylog--remplacé-par-spatielaravel-activitylog
    - docs/models-spec.md#98-agencyadminprofile-
  sync_passes:
    - docs/sync-passes/pass-013-2026-10-14-1023/03-recommendations-models-spec.md
    - docs/sync-passes/pass-013-2026-10-14-1023/02-recommendations-features.md
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md
tags: [docs, specs, sync-specs, models-spec, features, pistes]
---

## Contexte

La passe 013 de `/sync-specs` (2026-10-14) a relevé cinq actions de priorité haute sur
`docs/models-spec.md` (C1 à C5), où la spec décrit faux des tables qui portent des fonctions P0, et
une action moyenne (C16) sur le journal d'audit. Les passes 014 et 015 les ont reconduites sans
qu'elles soient appliquées. Côté catalogue, FA1 et FA3 annoncent des fonctions qui n'existent pas.

La piste **P56.04** (fermée à l'implémenteur, qui ne touche pas la spec) porte le même défaut que
C16 : la spec décrit le diff du journal dans `properties`, que activitylog v5 n'écrit plus.

Le porteur a validé ce lot le 2026-10-19. FB1 (notifications push) en est **exclu** : il attend sa
demande.

## Objectif utilisateur

Qui lit la spec avant d'écrire une migration, une requête ou un ticket y trouve les colonnes, les
relations et les mécanismes que le code a réellement, et le catalogue n'annonce plus de passerelle
ni de permission qui n'existent pas.

## Delta à produire

Documentaire seulement : aucun code, aucune migration.

- **C1, §12 AppNotification** : tableau réécrit sur la table réelle. Il retire sept colonnes que
  rien n'a créées et ajoute `body`, `data`, `sent_at`, `delivery_attempts` et `digested_at`. Il
  écrit aussi les index, le scope `undigested()`, `isCritical()`, `reference()` (une méthode, pas une
  relation) et `deliveryAttempts()`. La Règle 3 nomme le lecteur réel du morph,
  `NotificationTarget::fromReferenceable()`.
- **C2, §1 User** : nullabilités et longueurs relevées en base, `username` comme slug public, clés
  de `metadata` (verrou du mot de passe, réenrôlement 2FA), traits, et relations sous leur nom réel
  (camelCase), y compris les cinq qui manquaient.
- **C3, §34, §35, §98** : la suspension d'une adhésion est un geste d'agence (TCK-587), pas de la
  plateforme ; `archived` n'est posé par aucun code ; inverses `agencyAdminProfiles()`.
- **C4, §2 Agency** : `settings` est fusionné clé par clé (TCK-593), ses clés renvoient au catalogue
  `AgencySettings` (TCK-970), et le motif d'une suspension vit dans le journal. Sont aussi décrits
  le trait `LemonSqueezyBillable` et le masquage de `subscriptions()`. Dans les paquets
  transversaux : `lemonsqueezy/laravel`, `laravel/scout`, et les signatures réelles de `HasProfiles`.
- **C5, tables du framework** : `password_reset_tokens` (clé par e-mail, deux jeux de
  `config/auth.php`, jamais purgée), `sessions`, `cache`, `jobs`.
- **C16 et P56.04, §13 ActivityLog et EF6** : activitylog v5 et `attribute_changes`, le trait
  `Auditable` et ses listes blanches, `impersonator_id`, ce que rendent les lectures (P56.03, P56.05).
  `activity_logs` et `activity_log_changes`, qui n'ont jamais existé, sont retirées, et EF6 est
  close.
- **FA1, `features.md` §1.1** : un collaborateur a un rôle, pas de permissions granulaires.
- **FA3, `features.md` §1.5** : les pilotes livrés sont Wave, Orange Money et Lemon Squeezy ; Free
  Money et Stripe n'en ont pas.

## Critères d'acceptation

- [x] Chaque colonne, type, nullabilité et index écrits en §1, §12 et §13, ainsi que
      `password_reset_tokens`, est celui de la base de développement migrée au 2026-10-19
      (`information_schema.columns`, `pg_indexes`), et non celui d'une migration lue.
- [x] Aucune méthode, relation ou scope nommé dans les sections touchées n'est absent du code
      (`grep` de chaque nom dans `app/`).
- [x] `docs/models-spec.md` ne cite plus `activity_log_changes` qu'en disant qu'elle n'a jamais
      existé.
- [x] `features.md` ne dit plus « permissions granulaires » d'un collaborateur, et ne cite plus
      Free Money ni Stripe comme passerelles de paiement en ligne.
- [x] `docs/features-by-actor.md` est régénéré, et les gardes du dépôt passent.
- [x] P56.04 passe à `fait · TCK-1012`.

## Hors périmètre

- FB1 (notifications push) : attend la demande du porteur.
- Les autres actions de la passe 013 (C7 à C27), MC3, FA2, FA4 à FA7, FB2 à FB9, FD2.
- Le code : retirer `delivery_attempts` (P58.05), purger `password_reset_tokens` (P57.03), aligner la
  fiche utilisateur de la console (P56.05). Ces pistes sont validées et suivent leur propre ticket.

## Notes d'implémentation

- Relevé en base par `information_schema` et `pg_indexes`, sur la base de développement sans
  migration en attente (`php artisan migrate:status --pending`).
- Les actions de la passe 013 datent du 2026-10-14. Deux ont bougé depuis, et la spec suit le code,
  pas la passe : les clés de `settings` ont un catalogue (TCK-970), et l'onboarding n'enregistre plus
  `primary_city` ni `payment.preferred_provider` (TCK-966).
- Un fait relevé hors de la passe : `SavedSearchMatchesNotification` écrit un nom de classe dans
  `referenceable_type`, et `AppNotification::reference()` n'a aucun appelant. C'est écrit en §12 et
  en Règle 3.
