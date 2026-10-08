# 03 — Recommandations à `models-spec.md`

> Passe 011 — 2026-10-08 22:21. `docs/models-spec.md` sha1 `4971298a`.
> **Chaque constat de schéma est mesuré sur une migration nommée**, jamais déduite d'un nom de modèle
> — c'est la leçon de la re-mesure du 2026-08-16 (`INDEX.md`). Les migrations sont dans
> `takussan-api/database/migrations/`, citées par leur nom de fichier.
> Ordre : d'abord les quatre ❌, puis les items que la vague a délégués à `/sync-specs`, puis le reste
> de la dérive, puis les sections transversales. 41 recommandations.

---

## A. Les quatre ❌

### M1 — Retirer le courtier (TCK-586, ADR-0030)

`2026_10_07_090100_drop_broker_tables` supprime `broker_profiles` et `broker_agency_collaborations` ;
`2026_10_07_090000_delete_broker_client_customer_relationships` supprime les relations
`broker_client`, et `app/Models/Enums/RelationshipType.php` n'a plus que `owner_tenant` et
`agent_client`. Aucun modèle courtier dans `app/Models/`.

Lignes à traiter (numérotation du sha1 ci-dessus — celle de TCK-586 a glissé depuis) :

- §36 (l.1679-1716) et §38 (l.1753-1777) : retirer les sections, ou les réduire à une ligne
  « supprimé le 2026-10-07, ADR-0030 » si l'on veut garder la trace — sans tableau de colonnes.
- Table des matières l.150 et l.152 ; « Packages » l.59 et l.67 ; §1 l.272, l.324 (`brokerProfile()`
  dans `HasProfiles`) et l.334 ; §37 l.1722 (« Comme le courtier ») ; §39 l.1783 (« sur le même modèle
  que `BrokerAgencyCollaboration` ») ; §42 l.1904 (BrokerProfile parmi les sujets KYC) ;
  `CollaborationStatus` l.3526 ; Règle 5 l.3808 ; « Contraintes d'unicité » l.3894, l.3895, l.3897.
- §9 l.702 et `RelationshipType` l.3547 : retirer `broker_client`.
- §14 l.924 : `commission_amount` « Commission agence/courtier » → « Commission d'agence ».
- EF2 l.3935 : « courtier externe ».
- Citer ADR-0030 là où ADR-0027 est cité seul (l.67, l.1682, l.3809).

### M2 — Écrire la section `AgencyAdminProfile`

Modèle `app/Models/Profiles/AgencyAdminProfile.php`, table `agency_admin_profiles`
(`2026_05_10_170000_create_agency_admin_profiles_table`, puis `2026_08_16_120200` et `120400`) :
`user_id` FK users **nullable** (`restrictOnDelete`), `agency_id` FK agencies (`restrictOnDelete`),
`status` string défaut `active` (`AgencyAdminProfileStatus`), `metadata` jsonb, `agency_role_id`
NOT NULL, soft delete, timestamps. Unicité `(user_id, agency_id)` ; index `(agency_id, status)` et
`deleted_at`. La Règle 5 l'inventorie déjà ; il lui manque sa fiche, et l'enum son entrée.

### M3 — Écrire la section `NotificationPreference` et clore EF3

Modèle `app/Models/NotificationPreference.php`, table `notification_preferences`
(`2026_04_23_090000_create_notification_preferences_table`) : `user_id` FK users
(`cascadeOnDelete`), `event_type` string(64), `channel` string(16), `enabled` boolean défaut vrai,
timestamps ; unicité `(user_id, event_type, channel)`. Sert `features.md` §2.3 l.533 (P1, TCK-588).

EF3 (l.3939-3947) décrit ce schéma comme « probable » et « reporté » : le passer en « réalisé »,
avec renvoi à la nouvelle section. À relever en l'écrivant : la migration commente le canal
`inapp|email|sms|push`, quand `NotificationChannel` écrit `app` — un écart de vocabulaire à
trancher, que cette passe ne tranche pas.

### M4 — Rôles personnalisés : la Règle 6 et l'en-tête « Packages » sont périmés

- « Packages » l.50 (« Phase 2 (TCK-279, `todo` — rien n'en est livré) ») et l.52-57 (« ni les
  tables ni le code n'existent aujourd'hui ») ; Règle 6 l.3823-3836 (« ⏳ NON IMPLÉMENTÉE », « le
  modèle `AgencyRole` n'existe pas ») : **faux depuis le 2026-08-16.** `2026_08_16_120000` et
  `120100` créent les deux tables, `120300` amorce les rôles système, `120400` rend `agency_role_id`
  NOT NULL sur `agent_profiles`, `agency_admin_profiles`, `owner_profiles` ;
  `2026_08_17_090000` à `090200` font de même sur `service_provider_agency_collaborations` ;
  `2026_08_22_100100` ajoute l'index unique partiel des rôles système. §66 le dit déjà (« depuis
  TCK-315 »).
- Réécrire la Règle 6 au présent, en disant ce qui n'est **pas** livré (s'il en reste) par mesure.
- « 44 cas » (l.3833) : `app/Models/Enums/Capability.php` en compte **46**. Remplacer le nombre par
  la commande qui le donne, et marquer le tableau « Catalogue `Capability` » (l.3584-3604) comme
  extrait — il ne contient pas, par exemple, `reports.view_agency` (TCK-595).

---

## B. Items délégués à `/sync-specs` par la vague

### M5 — §8 `PropertyCollaborator` (TCK-504, ADR-0036, ADR-0053)

Mesuré sur `2026_04_17_160008_create_property_collaborators_table` : la table porte `role`,
`commission_share`, `invited_at`, `accepted_at`, `metadata`, timestamps, unicité
`(property_id, user_id)`. **Six colonnes décrites n'existent pas** : `permissions`, `notes`,
`invited_by`, `invitation_accepted`, `invitation_date`, `accepted_date` ; la relation `inviter()`
non plus. Ajouter, d'après `2026_10_08_120000_add_is_primary_to_property_collaborators` :

- `is_primary` boolean, défaut faux ;
- index unique partiel `property_collaborators_one_primary_per_property` sur `property_id`, restreint
  aux lignes principales — un seul agent principal par bien ;
- contrainte `property_collaborators_primary_is_agent` : une ligne principale a le rôle `agent`.

Dire aussi, comme TCK-504 l'a mesuré, que **rien dans l'application ne renseigne `accepted_at`** :
il n'existe pas de parcours d'acceptation. La colonne n'a pas de sens métier aujourd'hui.

### M6 — §31 `Integration` (TCK-293, ADR-0046)

D'après `2026_10_08_120000_add_webhook_token_to_integrations_table` : `webhook_token_hash` char(64)
nullable, unique (`integrations_webhook_token_hash_unique`) — la recherche se fait par lui ;
`webhook_token` text nullable, cast `encrypted`, relu pour construire l'URL de notification et pour
l'écran. D'après `2026_05_07_000217_add_health_to_integrations_table` : `health_status` string,
`last_health_check_at` timestamp. Rien de cela n'est dans §31.

### M7 — §28 `Payout` (TCK-594, ADR-0039)

- Ajouter : `payee_role` string(30) défaut `landlord` (`PayeeRole` : landlord, tenant,
  service_provider ; backfill `tenant` des remboursements de caution par `200300`) ;
  `approved_by_id`, `approved_at`, `processed_by_id` ; `payout_method_id` (FK payout_methods,
  `nullOnDelete`) ; `service_provider_bill_id` (FK, `nullOnDelete`) — tous de
  `2026_10_07_200200` ; `bank_reconciled_at` et `bank_statement_line_id` (FK
  `payouts_bank_line_fk`, unicité partielle `payouts_bank_line_unique`) de `2026_10_07_150200`.
- Index `payouts_agency_status_idx`, `payouts_sp_bill_idx`.
- **Retirer la contrainte « `lease_id IS NOT NULL OR booking_id IS NOT NULL` »** (l.1455) : aucune
  migration ne la crée (le dépôt ne compte que quatre contraintes CHECK), et TCK-594 l'a mesuré
  avant cette passe. L'origine d'un reversement multi-sources se lit dans les pivots.
- Pivots : unicités `payout_lp_lease_payment_unique` et `payout_bp_booking_payment_unique`
  (`2026_10_07_200400`) — un paiement n'est reversé qu'une fois.
- `PayoutStatus` (l.3566) : ajouter `awaiting_approval`.

### M8 — §25 `Invoice` (TCK-594)

D'après `2026_10_07_200700` : `kind` string(20) défaut `invoice` (`InvoiceKind` : invoice,
credit_note) ; `credited_invoice_id` FK invoices (`nullOnDelete`) ; `sequence_year`,
`sequence_number`. Unicités `invoices_agency_reference_unique (agency_id, reference_number)`,
`invoices_agency_kind_seq_unique (agency_id, kind, sequence_year, sequence_number)`, et unicité
partielle de `reference_number` pour les factures sans agence. **La « `reference_number` unique » de
§25 et des Contraintes d'unicité est donc fausse** : elle est par agence. D'après
`2026_08_16_090000` : `payment_method`, `transaction_id` (indexé).

### M9 — §2 `Agency`, et l'encart flottant entre §75 et §76

Treize colonnes absentes de §2 : `currency` char (`2026_04_24_000001`), `moderation_required`
boolean (`2026_04_26_000002`), `bank_csv_mapping` jsonb (`2026_04_28_000006`),
`payout_approval_threshold`, `default_tax_rate`, `legal_name`, `ninea` string(30), `rccm`
string(30), `legal_address` text (`2026_10_07_200500`), `pending_payout_threshold`,
`pending_payout_threshold_requested_by_id`, `pending_payout_threshold_requested_at`
(`2026_10_08_100100`), `reviews_count` (`2026_10_08_100400`). Les trois `pending_payout_threshold*`
sont décrites dans l'encart l.3108-3112, **posé entre §75 et §76** : le déplacer dans §2.

### M10 — §45 `PlatformPayout` (TCK-594)

D'après `2026_10_07_200600` : `closed_by_id`, `approved_at`, `paid_by_id` (FK users,
`nullOnDelete`), `payment_reference` string. Ce sont les colonnes de la séparation des gestes de
`features.md` §1.5 l.211.

### M11 — §67 `PropertyContactLead` (TCK-590)

- `2026_08_27_120000_allow_agent_contact_leads` : `property_id` devient **nullable** ; `agency_id`
  FK agencies, index `pcl_agency_created_idx`.
- `2026_10_07_150000_alter_property_contact_leads_for_inbox` : `name`, `email`, `message`
  deviennent **nullables** ; ajout de `channel` string(16) défaut `form` (`ContactLeadChannel`),
  `source` et `medium` string(40), `locale` string(5), `handled_by_id` FK users, `customer_id` FK
  customers ; index `pcl_agency_handled_idx`, `pcl_handled_by_idx`, `pcl_customer_idx`.
- L'invariant applicatif de TCK-590 (un lead `form` a un nom, un message, et un téléphone ou un
  e-mail ; un lead `whatsapp`/`call` n'a aucune identité) remplace les NOT NULL d'aujourd'hui.

### M12 — §29 `DocumentShareLink` (TCK-602, ADR-0051 §7)

D'après `2026_10_08_180000_hash_document_share_links_tokens` : `token_hash` char(64) NOT NULL,
unique `dsl_token_hash_unique` ; `token` devient **text chiffré** et perd son unicité. Mettre à
jour §29, la ligne `document_share_links | token` des Contraintes d'unicité et des Index recommandés.

### M13 — Lever les bannières « Entrée minimale » (§76, §77, §78, §84, §85, §86)

Relues contre leurs migrations (`2026_10_07_200000`, `200100`, `2026_10_08_100000_create_payout_method_verifications…`,
`170000`, `150100`, `150200`), ces six sections sont **exactes**. Leurs bannières disent encore
« description complète par `/sync-specs` après fusion » : les retirer. Trois retouches :

- remettre §77 avant §78 (l.3143-3204 sont dans l'ordre 78, 77) ;
- §86 : écrire les colonnes que `agencies_*`, `users_*`, `properties_*` abrègent — `agencies_total`,
  `agencies_active`, `agencies_verified`, `agencies_suspended`, `users_total`, `users_active`,
  `properties_published`, `properties_pending_review` ;
- §76 : ajouter l'index `payout_methods_user_idx`.

### M14 — §14 `Lease` (TCK-595, TCK-596 et antérieures)

Ajouter : `agent_id` FK users `nullOnDelete`, index `leases_agent_id_signed_at_idx`
(`2026_10_08_150000`, aujourd'hui écrit seulement dans l'en-tête de §85) ; `late_fee_percent`,
`late_fee_grace_days` (`2026_04_25_120000`) ; `deposit_refunded_amount`, `deposit_refunded_at`,
`deposit_refund_reason` (`2026_04_25_130000`) ; `early_termination_requested_at`,
`early_termination_requested_by`, `early_termination_effective_date`,
`early_termination_penalty_amount`, `early_termination_reason`, `notice_period_days`,
`early_termination_invoice_id` (`2026_04_25_150000`) ; `tenant_welcomed_at` (`2026_05_10_190000`).
Déplacer dans §14 les quatre colonnes que l'encart de §82 décrit (`contract_sha256`,
`signature_requested_at`, `early_termination_penalty_months`, `rent_review_max_pct`). Ajouter
`terminating` à `LeaseStatus` (l.3537), valeur du code (`app/Models/Enums/LeaseStatus.php`).

### M15 — §15 `LeasePayment`

`late_fee` est renommée `late_fee_amount`, et `late_fee_applied_at` ajoutée
(`2026_04_25_120001`) ; `late_fee_paid_at` (`2026_10_07_150000_add_late_fee_paid_at…`) ;
`platform_fee_pct_at_payment`, `platform_payout_id` (`2026_05_07_000224`, aussi sur
`booking_payments`).

---

## C. Le reste de la dérive mesurée

### M16 — §6 `BookingPayment` : trois colonnes décrites n'existent pas

La migration de création de `booking_payments` porte `payer_id`, `collector_id`,
`reference_number`, `receipt_number`, `paid_at` — et **pas** `user_id`, `payment_date`,
`confirmed_date`, que §6 décrit. Ajouter `platform_fee_pct_at_payment`, `platform_payout_id`.
Revoir la relation `user()` et `User.booking_payments()` (l.340) à la lumière des colonnes réelles.

### M17 — §7 `Customer`

`agency_id` FK agencies `nullOnDelete`, indexé, est dans la migration de création — et absent de §7,
alors que l'agence est la frontière d'isolation (principe n°2 de `CLAUDE.md`) et que la ligne P0
l.239 de `features.md` en dépend. Ajouter aussi `seeking_contract_type`, `budget_min`, `budget_max`,
`seeking_property_types`, `seeking_cities`, `seeking_neighborhoods`, `min_bedrooms` et l'index
`customers_agency_phone_idx` (`2026_10_07_591200`).

### M18 — §3 `Property`

Ajouter : `archived_at` (`2026_04_23_000001`) ; `rent_period` (`2026_04_18_224400`, `RentPeriod`) ;
`is_test` (`2026_05_05_000002`) ; `rejection_reason`, `submitted_at`, `approved_at`, `rejected_at`,
`approved_by_user_id`, `rejected_by_user_id` (`2026_04_26_000001`) ; `platform_hold_at`,
`platform_hold_by_id`, `platform_hold_reason` (`2026_10_08_100100_add_platform_hold…`) ;
`deposit_months`, `advance_months`, `agency_fee_months`, `monthly_charges`, `virtual_tour_url`
string(2048) (`2026_10_08_100000_add_entry_cost…`) ; `ical_export_token_hash`, unique
(`2026_10_08_010200`, aujourd'hui seulement sous §81). Revoir « Packages » (collections `videos`,
`virtual_tours`) au regard de `virtual_tour_url`.

### M19 — §5 `Booking`

`expired_at`, `expiry_reason` (`2026_04_26_133355`). Préciser le rapport avec `expiration_date`,
que §5 décrit déjà.

### M20 — §11 `Review` : six écarts

La migration `2026_04_17_160031` crée `author_id` (pas `user_id`), `rating` entier non signé (pas
decimal(2,1)), `approved_by_id` (pas `approved_by`), `metadata` ; `2026_04_22_000001` ajoute
`status` (`ReviewStatus` : pending, approved, rejected, reported) et `reported_count` ;
`2026_10_08_100000_add_moderation_scope_to_reviews_table` ajoute `agency_id` (FK
`reviews_agency_id_fk`), `context_type`, `context_id`, l'index `reviews_agency_status_idx` et
l'unicité partielle `reviews_author_context_uniq` (un avis par auteur, cible et contexte).
Réécrire la section sur ce schéma.

### M21 — §21 `MaintenanceRequest`

Ajouter `quote_amount`, `quote_currency`, `quote_submitted_at`, `quote_decision_at`,
`quote_decision_by_id`, `quote_rejection_reason` (`2026_04_26_010004`) ; `quote_lines` jsonb,
`quote_valid_until`, `quote_estimated_duration_days` (`2026_10_07_130000`) ; `accepted_at`,
`access_instructions` (`2026_10_07_120000`).

### M22 — §24 `Inventory`

Ajouter `tenant_signature_data`, `tenant_signature_hash`, `owner_signature_data`,
`owner_signature_hash`, `signed_at`, `traceability_hash`, `owner_signed_by_user_id`,
`owner_signed_on_behalf_of_user_id` (les cinq premières par `2026_04_24_120000_add_signature_data_to_inventories_table`, les trois dernières par `2026_10_07_235910`). `InventoryElementState` à
l'inventaire des enums.

### M23 — §1 `User`

Ajouter `deletion_requested_at` (`2026_04_24_224305`), `email_frequency`, `digest_send_at`,
`digest_day_of_week` (`2026_04_26_200001`, `EmailFrequency`), `force_2fa_at_first_login`
(`2026_05_10_120000`), `preferences` jsonb (`2026_05_10_140000`), `password_set_at`
(`2026_08_15_100000`). Écrire l'unicité réelle du téléphone : index unique partiel
`users_phone_verified_unique` sur le numéro canonique, pour les seuls numéros vérifiés de comptes
non supprimés (`2026_10_07_150200_make_email_nullable…`, ADR-0033).

### M24 — §34 `OwnerProfile`, §35 `AgentProfile`

Les deux : `agency_role_id` NOT NULL (M4), `user_id` nullable (`2026_05_10_150000`,
`2026_05_10_160000`). §34 : `works_approval_threshold` decimal(14,2) (`2026_10_07_130100`,
ADR-0037) ; `rib`, `tax_id`, `id_document_number` deviennent **text chiffré**
(`2026_10_08_601100`) — « chiffré recommandé » est à remplacer par « chiffré ».

### M25 — §37 `ServiceProviderProfile`

`2026_05_10_170000_make_user_id_nullable_and_add_status…` : `user_id` nullable et **son unicité
supprimée** ; `status` string indexé (`ServiceProviderProfileStatus`). La contrainte « `user_id`
unique » de §37 et des Contraintes d'unicité est donc fausse.

### M26 — §39 `ServiceProviderAgencyCollaboration`

`agency_role_id` NOT NULL (`2026_08_17_090000` à `090200`). L'unicité
`(service_provider_profile_id, agency_id)` est devenue **partielle**, sur les lignes non supprimées
(`sp_agency_collab_live_unique`, `2026_10_07_120100`).

### M27 — §40 `BankStatement`

`csv_mapping` jsonb, `skipped_lines_count` (`2026_10_07_150300_add_parse_outcome…`).

### M28 — §48 `Invitation`

`phone` string(30), `email` nullable, contrainte `invitations_email_or_phone_check`, index
`invitations_phone_status_idx` (`2026_10_07_150300_add_phone_to_invitations…`).

### M29 — §49 `AgencyUpgradeRequest`

`ninea` et `rib_pro` deviennent **text chiffré** (`2026_10_08_601200`).

### M30 — §63 `IntegrationWebhookLog` (TCK-602, ADR-0051)

Dix-sept colonnes ajoutées par `2026_10_08_160000_extend_integration_webhook_logs_for_journal` :
`channel` (défaut `payment`), `route_name`, `agency_id`, `body`, `body_sha256`, `body_truncated`,
`headers`, `http_method`, `authenticated_at`, `http_status`, `error_code`, `error_message`,
`external_id`, `matched_count`, `attempts`, `replayed_at`, `replayed_by_id` ; index
`iwl_status_created_idx`, `iwl_channel_provider_created_idx`, `iwl_agency_created_idx`,
`iwl_external_id_idx`. La description « payload brut conservé » est à revoir : le corps est chiffré
et la vue expurgée (`features.md` §2.9 l.665).

### M31 — §66 `RoleDelegation`

`replaces_user_id` FK users, index `role_delegations_agency_replaces_idx`
(`2026_10_07_591400`, ADR-0035).

### M32 — §68 `PropertyReport`

`decision` string(20), `resolved_by_id`, `reason_code` string(40), `reporter_fingerprint`
string(64), index `property_reports_fingerprint_idx` (`2026_10_08_100200`). La phrase « il n'y a
pas de statut ni de décision stockée » devient fausse.

### M33 — §17 `PropertyVisit`

La contrainte d'intégrité décrite (visiteur inscrit, client ou nom) **n'existe dans aucune
migration** : la retirer ou la dire applicative. Ajouter `source`, `medium`, `locale`
(`2026_10_07_150100_add_attribution…`).

### M34 — §18 `Conversation`, §20 `Message`

§18 : la colonne `type` liste « direct, group, support », l'enum (l.3554) et le code six valeurs —
aligner la colonne sur l'enum. §20 : `MessageType` du code a `audio` (notes vocales, TCK-592,
ADR-0038) ; l'ajouter à l.3558.

### M35 — §55 `NotificationTemplate` : décrire la table, pas seulement son extension

D'après `2026_05_07_000215` : `event`, `channel`, `locale` string(5), `subject` nullable, `body`
text, `is_active` défaut vrai, `updated_by_id` FK users `nullOnDelete` ; unicité
`(event, channel, locale)`, index `(event, channel, is_active)`.

---

## D. Sections transversales

### M36 — Enums

Ajouter au tableau les 24 enums listés en `01-correlation-matrix.md` §B.4 ; corriger
`RelationshipType` (M1), `LeaseStatus` (M14), `PayoutStatus` (M7), `MessageType` (M34). Les
valeurs se relisent dans `app/Models/Enums/`, pas dans cette passe.

### M37 — Évolutions futures : EF2, EF3, EF8 ne sont plus futures

- EF2 `Commission` « reporté » : réalisé autrement, par `CommissionEntry` (§85, ADR-0049).
- EF3 `NotificationPreference` : réalisé (M3).
- EF8 `AgentAvailability` : écarté par ADR-0035 — l'absence est une `RoleDelegation` avec
  `replaces_user_id` (M31).

### M38 — « Contraintes d'unicité » : neuf lignes fausses ou manquantes

Fausses : `users.phone` (M23) ; « `username` ou `email` » — **aucune migration** ne la crée, et elle
contredirait un compte au seul téléphone ; `invoices.reference_number` (M8) ;
`document_share_links.token` (M12) ; `service_provider_profiles.user_id` (M25) ;
`service_provider_agency_collaborations` (M26) ; les trois lignes courtier (M1).
Manquantes, entre autres : `property_collaborators_one_primary_per_property`,
`payout_lp_lease_payment_unique`, `payout_bp_booking_payment_unique`,
`integrations_webhook_token_hash_unique`, `reviews_author_context_uniq`.

Suggestion de méthode, reprise de TCK-310 pour les index : renvoyer chaque unicité à sa section
plutôt que de la recopier ici — un second endroit à tenir est un second endroit qui ment.

### M39 — « Index recommandés »

La ligne `document_share_links | token` vise une colonne qui n'est plus unique (M12). Ajouter, comme
pour TCK-310, la mention que les sections 72 à 87 portent leurs index mesurés et ne sont pas reprises.

### M40 — « Résumé des changements » : comptes périmés

« Modèles existants enrichis (8) » en liste onze, « Nouveaux modèles (22) », « Nouveaux enums
(46) », « Modèles documentés a posteriori (16) » : aucun ne couvre les sections 56 à 87 ni les
migrations de 2026-10. Retirer les nombres, ou retirer la section au profit de l'historique git.

### M41 — `personal_access_tokens` : colonnes métier sans section

`idle_timeout_minutes` et `two_factor_verified_at` (`2026_10_07_150100_add_session_bounds…`)
portent les sessions bornées de `features.md` §2.1 l.456. La table est celle de Sanctum, mais ces
deux colonnes sont à nous : les écrire, en §1 ou dans « Packages », avec la colonne `name =
impersonation` que §83 cite déjà.

---

## Résumé des actions

| # | Action | Résout |
|---|--------|--------|
| M1 | Retirer le courtier | ❌ §36, ❌ §38, ⚠️ §9 |
| M2 | Section `AgencyAdminProfile` | ❌, l.419, 420, 427 |
| M3 | Section `NotificationPreference`, EF3 | ❌, l.533 |
| M4 | Règle 6, Packages, `Capability` | ⚠️ §52, §53 ; l.512, 516, 518 |
| M5-M15 | Items délégués par la vague | ⚠️ §2, §8, §14, §15, §25, §28, §29, §31, §45, §67 ; bannières de §76-78, §84-86 |
| M16-M35 | Dérive mesurée | ⚠️ §1, §3, §5, §6, §7, §11, §17, §18, §20, §21, §24, §34, §35, §37, §39, §40, §48, §49, §55, §63, §66, §68 |
| M36-M41 | Transversal | enums, unicités, index, résumé, EF, Sanctum |

Après M1 à M4 : **0 ❌**. Après M1 à M35 : les ⚠️ restants côté modèles sont ceux des sections non
relues colonne à colonne (voir « Limites »), à confirmer par la passe 012.
