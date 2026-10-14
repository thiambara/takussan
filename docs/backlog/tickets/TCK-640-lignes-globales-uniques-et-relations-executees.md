---
id: TCK-640
title: "Une clé de plateforme et une intégration globale sont uniques en base, et chaque relation de modèle s'exécute contre le schéma"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-14
updated: 2026-10-14
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#6-bookingpayment
    - docs/models-spec.md#30-setting-
    - docs/models-spec.md#31-integration-
    - docs/models-spec.md#contraintes-dunicité
tags: [back, settings, integrations, payments, postgresql, sync-specs]
---

## Objectif utilisateur

- **Le super-admin et l'administrateur d'agence** : un réglage de plateforme et les identifiants de
  paiement servis sont toujours ceux qu'ils ont écrits en dernier, jamais une ligne prise au hasard
  parmi deux.

## Contrat de données

Deux défauts que la passe 013 de `/sync-specs` avait relevés sans les corriger
(`docs/sync-passes/pass-013-2026-10-14-1023/03-recommendations-models-spec.md`, l.53), et un
troisième, de la même famille, mesuré en les vérifiant. Relevé sur la base de développement migrée,
le 2026-10-14.

**1. Une clé `settings` globale n'est pas unique en base.** `settings_key_scope_scope_id_unique`
porte sur `(key, scope, scope_id)` sans `NULLS NOT DISTINCT` : une clé `global` a `scope_id` nul, et
PostgreSQL tient deux `NULL` pour distincts. Son unicité ne tient qu'aux `updateOrCreate` des
écrivains (`SettingController`, `PlatformSettingService`, `BusinessEnumService`, `SettingsSeeder`),
qui ne résistent pas à deux écritures concurrentes. `ScopedSetting::row()` lit par `first()` sans
ordre : avec deux lignes, la valeur rendue n'est pas déterminée. Aucun doublon en base de dev.

**2. Même défaut sur `integrations`, et un second.** `integrations_provider_agency_id_unique`
(`provider, agency_id`) :

- ne protège pas l'intégration de **plateforme** (`agency_id` nul) : `IntegrationController::store`
  accepte d'un super-admin sans agence une seconde `(wave, NULL)`, et
  `PaymentGatewayService::resolveIntegration()` en prend une par `first()` sans ordre ;
- **compte les lignes supprimées** : `Integration` est en `SoftDeletes`, une intégration supprimée
  interdit d'en recréer une pour le même couple — `23505`, rendu **500**. Une seconde intégration du
  même fournisseur pour une agence rend aussi 500.

**3. `User::bookingPayments()` vise une colonne qui n'existe pas.** `hasMany(BookingPayment::class)`,
clé implicite `booking_payments.user_id` ; la table a `payer_id` (→ `customers`) et `collector_id`
(→ `users`). Aucun appel applicatif ; `tests/Unit/ModelsTest.php` vérifiait son **type**, jamais sa
requête. Exécutée : `42703`.

## Contraintes strictes (métier)

- Aucune migration existante n'est modifiée ; chaque `down()` rend l'index d'origine.
- Les doublons existants se résolvent **avant** la contrainte, par une règle écrite : on ne peut pas
  compter qu'il n'y en a pas en préproduction.
- Une intégration écartée n'est jamais effacée : elle porte des identifiants chiffrés et des journaux
  de webhook (`integration_webhook_logs`) qui la citent.
- Le refus d'un doublon d'intégration court **après** l'autorisation : un 422 ne doit pas apprendre à
  un tiers qu'une agence a configuré tel fournisseur.

## Delta à produire

- [x] Migration `2026_10_14_120000_make_settings_unique_nulls_not_distinct` : doublons supprimés
      (la ligne la plus récemment écrite reste), puis l'unique recréé en `NULLS NOT DISTINCT`, sous
      son nom.
- [x] Migration `2026_10_14_120100_make_integrations_unique_live_nulls_not_distinct` : doublons
      vivants supprimés en douceur (l'active, puis la plus récente reste), puis
      `integrations_provider_agency_live_unique` — `(provider, agency_id) NULLS NOT DISTINCT WHERE
      deleted_at IS NULL`.
- [x] `IntegrationController::store` : un doublon vivant rend 422 (`provider`) au lieu de 500.
- [x] `User::bookingPayments()` supprimée ; `User::conversations()` typée `BelongsToMany` (seule
      relation de modèle sans type de retour).
- [x] Tests : `tests/Feature/Database/GlobalRowUniquenessTest.php` (5),
      `tests/Feature/Api/IntegrationUniquenessTest.php` (3),
      `tests/Feature/Models/ModelRelationsExecuteTest.php` (1) ; `tests/Unit/ModelsTest.php` adapté.
- [x] Spec : `models-spec.md` §1 (relations), §6 (paragraphe final), §30 et §31 (contraintes), tableau
      des index et « Contraintes d'unicité ».

## Critères d'acceptation

- [x] AC1 — Une seconde ligne `settings` globale de même clé est refusée par la base (`23505`) ; une
      même clé reste admise une fois par agence et une fois globalement.
- [x] AC2 — Une seconde intégration vivante `(fournisseur, NULL)` est refusée par la base ; une
      intégration supprimée en douceur ne bloque plus son remplaçant, plateforme comme agence.
- [x] AC3 — Par l'API, une seconde intégration du même fournisseur rend **422** sur `provider`
      (agence comme plateforme), et une intégration supprimée se recrée en 201.
- [x] AC4 — Les migrations résolvent des doublons existants : le paramètre le plus récent reste ;
      l'intégration active reste vivante, l'autre est supprimée en douceur, pas effacée.
- [x] AC5 — Chaque relation typée de chaque modèle de `app/Models` s'exécute sur PostgreSQL ; le
      test échoue si l'on rend `User::bookingPayments()`.
- [x] AC6 — `migrate`, `migrate:rollback --step=2` puis `migrate` repassent, et le rollback rend les
      index d'origine.

## Hors périmètre

- `saved_searches (user_id, name)`, `owner_profiles` / `agent_profiles (user_id, agency_id)` : unicités
  composées à colonne nullable elles aussi, mais **voulues** — un abonné sans compte, un brouillon
  d'invitation sans titulaire, peuvent exister plusieurs fois (relevé : les trois colonnes sont
  nullables, ce que models-spec « Contraintes d'unicité » dit déjà).
- Le sens d'une relation dont la clé existe mais n'est pas la bonne : le test d'exécution ne la voit
  pas (dit dans son docblock).

## Notes d'implémentation

**Décisions.**

- **`bookingPayments()` supprimée, pas réparée.** La pointer sur `collector_id` aurait gardé un nom
  qui ment : un utilisateur est aussi lié à des paiements comme **payeur**, via `customers`. Aucun
  appelant : un futur besoin choisira son nom (`collectedBookingPayments()`…).
- **Une garde plutôt qu'un test du seul défaut.** `ModelRelationsExecuteTest` exécute
  (`exists()`) chacune des relations typées et sans paramètre de tous les modèles concrets
  de `app/Models`, sous-dossiers compris, chacune dans un point de sauvegarde (une erreur SQL abandonne
  la transaction entière). `morphTo` est exclu (il ne se résout qu'avec un type porté par la ligne).
  Plancher : plus de 300 relations reconnues, sans quoi un filtre cassé rendrait le test vert à vide.
- **Relevé avant écriture** : sur 370 relations typées, une seule échoue en SQL — `bookingPayments`.
  Les neuf autres échecs de la sonde étaient des `morphTo` sur un modèle vide, d'où l'exclusion.
- **Intégration : index partiel.** Ajouter `NULLS NOT DISTINCT` à l'unique d'origine aurait étendu à
  la plateforme le défaut des lignes supprimées. Même correctif que `sp_agency_collab_unique`
  (TCK-592).

**Mesures (2026-10-14, `uptime` ≈ 5, 8 cœurs).**

- Ciblés : les 4 classes touchées, **14 passed (115 assertions)** ; voisins (`IntegrationTest`,
  `IntegrationStoreValidationTest`, `IntegrationMetadataEditTest`, `SettingTest`,
  `PlatformSettingTest`, `tests/Feature/Admin/Platform`, `PaymentWebhookEndpointTest`) : **217
  passed**. Pint propre.
- **Ablation 1** — les deux migrations retirées, le contrôle du contrôleur retiré,
  `bookingPayments()` rendue : 8 tests sur 9 **échouent** ; reste vert « une clé par agence et une
  globale », test de non-régression qui doit l'être dans les deux états.
- **Ablation 2** — migrations en place, contrôle du contrôleur seul retiré : les deux tests 422
  **échouent** (« Expected response status code [422] but received 500 ») ; la recréation après
  suppression reste verte — elle tient à l'index partiel, pas au contrôle.
- **AC6** — base dédiée `takussan_tck640` (`--locale=C`) : après `migrate`,
  `settings_key_scope_scope_id_unique` et `integrations_provider_agency_live_unique` en `NULLS NOT
  DISTINCT` ; après `migrate:rollback --step=2`, `settings_key_scope_scope_id_unique` et
  `integrations_provider_agency_id_unique` sans ; `migrate` repasse. Base supprimée ensuite.
