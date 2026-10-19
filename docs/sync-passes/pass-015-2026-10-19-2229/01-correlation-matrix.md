# Passe 015 — Matrice de corrélation (différentielle)

**Périmètre.** Cette matrice ne contient que les unités re-mesurées :

- les lignes de `features.md` ajoutées ou modifiées depuis la passe 014, et celles que nomment
  ADR-0070 ou TCK-651 ;
- les sections de `models-spec.md` modifiées depuis la passe 014, ou visées par une migration
  ajoutée depuis.

**Toute autre unité garde son statut de la [matrice 013](../pass-013-2026-10-14-1023/01-correlation-matrix.md)**,
corrigé par la [matrice 014](../pass-014-2026-10-14-2220/01-correlation-matrix.md).

Les numéros de ligne sont ceux de `features.md` sha1 `3ddd893f`, soit +3 par rapport aux passes 013
et 014 à partir de la l.92.

## Synthèse

| Axe | ✅ | ⚠️ | ❌ | Δ vs 014 |
|-----|----|----|----|----------|
| Features → Modèles (383 lignes) | 315 | 67 | 1 | +3 / 0 / 0 (l.92, l.94 et l.674 ✅ ; l.93 ⚠️) |
| Modèles → Features (100 sections) | 69 | 31 | 0 | −3 / +4 / 0 (§30 et §100 ✅ ; §6, §7, §15, §34, §69 ⚠️) |

## A. Features → Modèles — lignes re-mesurées

| L. | Prio | § | Statut 014 | Statut 015 | Support mesuré | Reco |
|---|---|---|---|---|---|---|
| 92 | P1 | §1.1 | — (neuve) | ✅ | Bien saisi au nom d'un bailleur de l'agence (TCK-997, `todo`). Le support existe : §3 `user_id`, `restrictOnDelete`, et §34 `OwnerProfile`. La ligne de catalogue décrit une cible, ce qui est son rôle | — |
| 93 | P1 | §1.1 | — (neuve) | ⚠️ justifié | Invitation d'un bailleur depuis le formulaire (TCK-1000, `todo`). Elle demande `properties.pending_owner_profile_id`, que la §3 décrit (➕) mais qui **n'existe pas en base** (relevé dans `information_schema.columns`). C'est légitime tant que le ticket est ouvert ; à re-mesurer quand il fusionne | MD7 |
| 94 | P1 | §1.1 | — (neuve) | ✅ | Changer le titulaire (TCK-999, `todo`). §3 `user_id`, et §14 `Lease` pour les baux en brouillon : le support existe | — |
| 473 | P1 | §2.1 | ✅ | ✅ (note) | Chiffrement et masquage des données de profil (TCK-601) : exact. Depuis ADR-0070, la même règle couvre aussi la pièce du locataire (§7), la pièce et le revenu de la caution (§27) et le revenu du bailleur (§34). La ligne ne le dit pas : elle est vraie mais incomplète | FD1 |
| 475 | P2 | §2.1 | ✅ | ✅ (note) | Export du droit d'accès : l'archive porte désormais `customers.json`, fiches client du titulaire avec la pièce en clair (TCK-956, ADR-0070 § 7). La ligne ne détaille aucun contenu, elle n'est donc pas fausse | FD2 |
| 513 | P1 | §2.1 | ✅ (note FC2) | ✅ | « sur le tableau de bord d'agence (agences `standard`) » : FC2 appliquée | — |
| 531 | P1 | §2.2 | ✅ (note FC3) | ✅ | « écran `/app/agency/roles` » : FC3 appliquée | — |
| 623 | P1 | §2.6 | ✅ | ✅ (note) | Journal des consultations « depuis la console » : exact. Les lectures claires de l'application (`customers/{id}/sensitive`, `guarantors/{id}/sensitive`, surfaces `customer_sensitive` et `guarantor_sensitive` de `PersonalDataAccessLogger`) écrivent dans le même journal, hors console | FD1 |
| 674 | P2 | §2.9 | **⚠️ dérive** | **✅** | « seules des clés lues par l'application, écrites par une seule voie validée et journalisée » : **vrai depuis TCK-651** (ADR-0065). La route brute rend 422 `setting.global_not_writable` en portée `global` sur `store`, `update` et `destroy` (`SettingController.php:49, 98`, `UpdateSettingRequest.php:61`). Les énumérations sont journalisées (`BusinessEnumService.php:241`) | FC1 soldée |

## B. Modèles → Features — sections re-mesurées

| § | Modèle | Statut 014 | Statut 015 | Mesure (base de dev migrée) | Features |
|---|---|---|---|---|---|
| 3 | Property | ⚠️ (mineur) | ⚠️ | Écarts de C19 (013) inchangés. Trois nouveaux : (a) `pending_owner_profile_id` est marqué ➕ mais absent de la base (TCK-1000 `todo`) ; (b) la prose de `user_id` décrit trois voies de réécriture, dont « l'acceptation de l'invitation » et « changer le titulaire », qui n'existent pas encore (TCK-999 et TCK-1000 `todo` ; aucun `owner_profile_id` dans les requêtes de bien) ; (c) l'index `properties_public_ranked_order_idx (ranked_at DESC NULLS LAST, id DESC) WHERE visibility = 'public' AND NOT is_test` (TCK-863, `2026_10_18_050100`) manque | l.92-94, l.87 |
| 6 | BookingPayment | ✅ | **⚠️ (mineur)** | `booking_payments_transaction_id_idx` (TCK-891, `2026_10_18_080000`) manque à la liste des index (l.805) | l.154, 156, 157, 160 |
| 7 | Customer | ✅ | **⚠️** | (a) `id_number` est en **`text` chiffré** (cast `encrypted`, `2026_10_19_100000`), alors que la spec écrit `string` ; rien n'y dit `Customer::SENSITIVE`, `$hidden`, la sortie de `$queryFields` (400 sur `fields`), `id_number_masked`, `GET /api/customers/{id}/sensitive` ni l'export. (b) **`locale` string(5) nullable** (TCK-921, `2026_10_18_163900`) est absente. (c) L'index `customers_user_id_index` (TCK-862, `2026_10_18_050000`) est absent | l.246, 251, 259 ; l.473 |
| 15 | LeasePayment | ✅ | **⚠️** | (a) **`refund_amount` decimal(14,2) nullable** (TCK-873, `2026_10_18_070000`) est absente ; `HasPaymentAttributes::paidAmount()` la lit. (b) L'index `lease_payments_transaction_id_idx` (TCK-891) est absent | l.189, 192, 195 |
| 27 | Guarantor | ⚠️ | ⚠️ | C10 (013) inchangée. En plus : `id_number` et `monthly_income` sont en **`text` chiffré** (`2026_10_19_110000`), alors que la spec écrit `string` et `decimal(14,2)`. Ni masques (`GuarantorController::format`), ni `guarantors/{id}/sensitive`, ni le rattachement d'agence par `addedBy` (`GuarantorPolicy::agencyOf`) | l.187 ; l.473 |
| 30 | Setting | ⚠️ | **✅** | MC1 et MB13 appliquées (TCK-651) : deux catalogues nommés, et une route brute limitée à la portée `agency`, conforme au code | l.161, 433, 665, 668, 674 |
| 34 | OwnerProfile | ✅ | **⚠️** | `monthly_income` est en **`text` chiffré** (`2026_10_19_120000`), alors que la spec écrit `decimal(14,2)`. « Données sensibles » cite trois colonnes ; `OwnerProfile::SENSITIVE` en a quatre. `monthly_income_masked` (`Masking::presence`) n'est pas dit | l.91, 304, 429, 473, 508, 530 |
| 61 | ScheduledTaskRun | ⚠️ | ⚠️ | Écart de C21 inchangé. En plus : l'index `scheduled_task_runs_task_last_run_idx (task, last_run_at DESC, id DESC)` (TCK-802, `2026_10_17_120000`) manque à « Index : `task` » | l.676 |
| 69 | NotificationDeliveryAttempt | ✅ | **⚠️** | `app_notification_id` est **nullable** depuis TCK-799 (`2026_10_17_160000`) : un SMS sans notification (contact sans compte, code de signature de bail) écrit sa tentative. La spec l'écrit non nullable, et décrit une ligne comme « tentative … d'une notification » | l.190 (relances sans compte) ; l.543, 546 |
| 93 | PropertyBoost | ✅ | ✅ | `tranches()` existe (`method_exists`), la prose sur la prolongation et le remboursement par tranche correspond à TCK-942 | l.87, 665 |
| 100 | PropertyBoostTranche | — (neuve) | ✅ | Conforme à la base : 8 colonnes, FK `property_boost_tranches_boost_fk` `ON DELETE CASCADE`, unique `(property_boost_id, position)`, CHECK `property_boost_tranches_values_check` à l'identique. Le tableau des unicités porte la ligne | l.87 |

**Sections transversales :**

- l'encadré « Rôles personnalisés » nomme `/app/agency/roles` : MC2 appliquée ;
- le tableau des unicités porte `property_boost_tranches`, ce qui est exact ;
- §57 `DataExport` ne détaille pas le contenu de l'archive, donc rien n'y devient faux avec
  `customers.json`.
