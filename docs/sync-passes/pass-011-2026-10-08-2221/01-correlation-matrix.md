# 01 — Matrice de corrélation features ↔ modèles

> Passe 011 — 2026-10-08 22:21. Conventions et limites : `00-summary.md`.
> Les numéros de ligne renvoient à `docs/features.md` (sha1 `feb6a6c9`) ; les « § » à
> `docs/models-spec.md` (sha1 `4971298a`). Les migrations sont citées par leur préfixe daté, dans
> `takussan-api/database/migrations/`.

## Synthèse

- Features analysées : **368 lignes** (59 P0, 158 P1, 112 P2, 39 P3).
- Modèles analysés : **89 unités** (87 sections + `AgencyAdminProfile` et `NotificationPreference`,
  sans section).
- Features : ✅ 278 — ⚠️ 90 — ❌ 0. Modèles : ✅ 50 — ⚠️ 35 — ❌ 4.

---

## A. Features → Modèles

### A.1 Décompte par section

| Section `features.md` | Lignes | ✅ | ⚠️ dérive | ⚠️ P3 justifié | ❌ |
|---|---|---|---|---|---|
| §1.1 Gestion des biens | 28 | 17 | 9 | 2 | 0 |
| §1.2 Recherche & découverte | 30 | 23 | 6 | 1 | 0 |
| §1.3 Réservations & visites | 24 | 22 | 1 | 1 | 0 |
| §1.4 Baux | 21 | 15 | 5 | 1 | 0 |
| §1.5 Transactions & paiements | 26 | 16 | 9 | 1 | 0 |
| §1.6 CRM | 18 | 14 | 3 | 1 | 0 |
| §1.7 Messagerie | 12 | 8 | 2 | 2 | 0 |
| §1.8 Maintenance | 20 | 12 | 6 | 2 | 0 |
| §1.9 États des lieux | 7 | 4 | 1 | 2 | 0 |
| §1.10 Documents | 9 | 6 | 1 | 2 | 0 |
| §1.11 Avis | 10 | 5 | 3 | 2 | 0 |
| §1.12 Agence & équipe | 19 | 12 | 4 | 3 | 0 |
| §2.1 Authentification | 23 | 18 | 4 | 1 | 0 |
| §2.1 Profils & contexte actif | 9 | 9 | 0 | 0 | 0 |
| §2.1 Onboarding | 10 | 9 | 1 | 0 | 0 |
| §2.2 Rôles & permissions | 11 | 7 | 3 | 1 | 0 |
| §2.3 Notifications | 14 | 12 | 2 | 0 | 0 |
| §2.4 Recherche & filtres | 8 | 7 | 0 | 1 | 0 |
| §2.5 Reporting | 21 | 20 | 1 | 0 | 0 |
| §2.6 Audit | 9 | 9 | 0 | 0 | 0 |
| §2.7 Médias | 8 | 7 | 0 | 1 | 0 |
| §2.8 i18n | 8 | 5 | 1 | 2 | 0 |
| §2.9 Administration | 18 | 16 | 2 | 0 | 0 |
| §2.10 Pages légales | 5 | 5 | 0 | 0 | 0 |
| **Total** | **368** | **278** | **64** | **26** | **0** |

Les P3 comptés ✅ ont un modèle décrit : l.97 (`admin_monitored`), 98 (§74-75), 167 (§72), 227-228
(§85), 298 (§77), 540 (§54), 591 (§64), 592 (§65), 612-613 (§59), 666 (§60), 667 (§58).

### A.2 Lignes ⚠️ par dérive — le support existe en base, la spec ne l'écrit pas (ou l'écrit faux)

| Ligne | Prio | Fonctionnalité (abrégée) | Ce qui manque à `models-spec.md` | Mesuré dans |
|---|---|---|---|---|
| 76 | P0 | Statut du bien (… archivé) | `properties.archived_at` absent de §3 | `2026_04_23_000001` |
| 80 | P1 | Visite virtuelle par lien https | `properties.virtual_tour_url` absent ; « Packages » annonce des collections `videos` / `virtual_tours` | `2026_10_08_100000_add_entry_cost…` |
| 81 | P1 | Coût d'entrée d'une location | `deposit_months`, `advance_months`, `agency_fee_months`, `monthly_charges` absents de §3 | idem |
| 84 | P1 | Collaborateurs, part et permissions | §8 décrit `permissions`, `notes`, `invited_by`, `invitation_accepted`, `invitation_date`, `accepted_date` : **aucune n'existe** ; la table porte `invited_at`, `accepted_at`, `metadata` | `2026_04_17_160008` |
| 86 | P0 | Réattribuer un bien (agent responsable) | `property_collaborators.is_primary` absent (ADR-0036, ADR-0053) | `2026_10_08_120000_add_is_primary…` |
| 93 | P2 | Modération avant publication | `agencies.moderation_required` ; `properties.submitted_at`, `approved_at`, `rejected_at`, `approved_by_user_id`, `rejected_by_user_id`, `rejection_reason` | `2026_04_26_000001`, `2026_04_26_000002` |
| 94 | P2 | Décision sur un signalement | `properties.platform_hold_at`, `platform_hold_by_id`, `platform_hold_reason` ; `property_reports.decision`, `resolved_by_id`, `reason_code` | `2026_10_08_100100_add_platform_hold…`, `2026_10_08_100200` |
| 95 | P2 | Archivage en lot | `properties.archived_at` | `2026_04_23_000001` |
| 96 | P2 | Dépublier / réattribuer en lot | `is_primary` (cf. l.86) | `2026_10_08_120000_add_is_primary…` |
| 111 | P0 | Fiche publique, contact par téléphone **ou** e-mail | §67 écrit `name`, `email`, `message` NOT NULL : ils sont nullables | `2026_10_07_150000_alter_property_contact_leads…` |
| 120 | P1 | Partage attribué à sa source | `source`, `medium`, `locale` absents de §67 et §17 | `2026_10_07_150000`, `2026_10_07_150100_add_attribution…` |
| 121 | P1 | Contact WhatsApp et appel | `property_contact_leads.channel` absent | `2026_10_07_150000` |
| 122 | P1 | Coût d'entrée sur la fiche | cf. l.81 | |
| 124 | P1 | Visite virtuelle sur la fiche | cf. l.80 | |
| 127 | P1 | Signaler une annonce, retour sur l'issue | `property_reports.decision`, `reporter_fingerprint` ; §68 dit « pas de décision stockée » | `2026_10_08_100200` |
| 154 | P2 | Expiration des demandes | `bookings.expired_at`, `expiry_reason` absents de §5 | `2026_04_26_133355` |
| 182 | P1 | Pénalités de retard automatiques | `leases.late_fee_percent`, `late_fee_grace_days` ; §15 écrit `late_fee`, renommée `late_fee_amount`, plus `late_fee_applied_at` | `2026_04_25_120000`, `2026_04_25_120001` |
| 184 | P1 | Pénalité réglée à l'agence | `lease_payments.late_fee_paid_at` | `2026_10_07_150000_add_late_fee_paid_at…` |
| 187 | P1 | Remboursement de la caution | `leases.deposit_refunded_amount`, `deposit_refunded_at`, `deposit_refund_reason` | `2026_04_25_130000` |
| 190 | P2 | Résiliation anticipée | sept colonnes `early_termination_*` et `notice_period_days` | `2026_04_25_150000` |
| 193 | P2 | Donner congé | valeur `terminating` absente de `LeaseStatus` ; `notice_period_days` | `app/Models/Enums/LeaseStatus.php` |
| 204 | P0 | Enregistrer un paiement | §6 écrit `user_id`, `payment_date`, `confirmed_date` : la table porte `payer_id`, `collector_id`, `reference_number`, `paid_at`, sans `confirmed_date` ; plus `platform_fee_pct_at_payment`, `platform_payout_id` | migration de création de `booking_payments`, `2026_05_07_000224` |
| 206 | P1 | Facture opposable | `invoices.kind`, `credited_invoice_id`, `sequence_year`, `sequence_number` ; unicité par agence ; `agencies.legal_name`, `ninea`, `rccm`, `legal_address`, `default_tax_rate` | `2026_10_07_200700`, `2026_10_07_200500` |
| 208 | P1 | Reversement calculé, payé une fois | unicité des pivots `payout_lease_payment` / `payout_booking_payment` ; `payee_role` | `2026_10_07_200400`, `2026_10_07_200200` |
| 209 | P1 | Remboursement de caution versé au locataire | `payouts.payee_role` (`PayeeRole` : landlord, tenant, service_provider) | `2026_10_07_200200`, `200300` |
| 211 | P1 | Double validation des sorties d'argent | `payouts.approved_by_id`, `approved_at`, `processed_by_id` ; `PayoutStatus.awaiting_approval` ; `agencies.payout_approval_threshold`, `pending_payout_threshold*` ; `platform_payouts.closed_by_id`, `approved_at`, `paid_by_id`, `payment_reference` | `2026_10_07_200200`, `200500`, `200600`, `2026_10_08_100100_add_pending_payout…` |
| 214 | P2 | Passerelle de paiement | `integrations.webhook_token_hash`, `webhook_token` (TCK-293, ADR-0046) | `2026_10_08_120000_add_webhook_token…` |
| 217 | P2 | Supervision des paiements | 17 colonnes du journal ajoutées à `integration_webhook_logs` (§63) | `2026_10_08_160000` |
| 219 | P2 | Mapping CSV des relevés | `agencies.bank_csv_mapping` ; `bank_statements.csv_mapping`, `skipped_lines_count` | `2026_04_28_000006`, `2026_10_07_150300_add_parse_outcome…` |
| 220 | P2 | Rapprocher les débits avec les reversements | `payouts.bank_statement_line_id`, `bank_reconciled_at`, unicité partielle | `2026_10_07_150200_add_bank_reconciliation…` |
| 239 | P0 | CRM lu par le seul personnel de l'agence | `customers.agency_id` absent de §7 — la frontière d'isolation elle-même | migration de création de `customers` |
| 246 | P1 | Boîte des demandes de contact | `property_contact_leads.agency_id`, `handled_by_id`, `customer_id` ; `property_id` nullable | `2026_08_27_120000`, `2026_10_07_150000` |
| 252 | P2 | Critères de recherche du prospect | `customers.seeking_contract_type`, `budget_min`, `budget_max`, `seeking_property_types`, `seeking_cities`, `seeking_neighborhoods`, `min_bedrooms` | `2026_10_07_591200` |
| 268 | P2 | Accusés de lecture individuels | aucun modèle ; EF5 « refusé pour l'instant » | — |
| 271 | P2 | Notes vocales | valeur `audio` absente de `MessageType` | `app/Models/Enums/MessageType.php` |
| 287 | P1 | Accepter ou refuser une intervention | `maintenance_requests.accepted_at` | `2026_10_07_120000` |
| 291 | P2 | Devis et validation | six colonnes `quote_*` | `2026_04_26_010004` |
| 292 | P2 | Devis structuré | `quote_lines`, `quote_valid_until`, `quote_estimated_duration_days` | `2026_10_07_130000` |
| 294 | P2 | Plafond de travaux du bailleur | `owner_profiles.works_approval_threshold` | `2026_10_07_130100` |
| 295 | P2 | Kit d'accès au logement | `maintenance_requests.access_instructions` | `2026_10_07_120000` |
| 297 | P2 | Noter le prestataire | §11 diverge (voir B) | |
| 344 | P2 | Signature de l'état des lieux par tracé | `tenant_signature_data`, `tenant_signature_hash`, `owner_signature_data`, `owner_signature_hash`, `signed_at`, `traceability_hash`, `owner_signed_by_user_id`, `owner_signed_on_behalf_of_user_id` absents de §24 | `2026_10_07_235910` et antérieures |
| 358 | P1 | Jeton de partage haché | §29 écrit `token` unique en clair : la table porte `token_hash` unique et `token` chiffré | `2026_10_08_180000` |
| 373 | P2 | Modération des avis | `reviews.status` (`ReviewStatus`) absent de §11 | `2026_04_22_000001` |
| 376 | P2 | Signalement sans masquage, moyenne des seuls publiés | idem | |
| 378 | P2 | Modération par l'admin de ses seuls biens | `reviews.agency_id`, `context_type`, `context_id`, unicité partielle | `2026_10_08_100000_add_moderation_scope…` |
| 419 | P0 | Suspendre l'adhésion (dont co-admin) | `AgencyAdminProfile` sans section | `2026_05_10_170000` |
| 420 | P0 | Auto-création d'une agence `individual` | idem | |
| 425 | P1 | Passation du portefeuille | `is_primary` (biens dont il est responsable) | |
| 427 | P1 | Retirer un agent ou un admin | `AgencyAdminProfile` sans section | |
| 450 | P1 | Numéro vérifié unique à un compte | « Contraintes d'unicité » écrit « `phone` unique si non null » : l'index réel est partiel, sur le numéro canonique vérifié et non supprimé | `2026_10_07_150200_make_email_nullable…` |
| 456 | P1 | Sessions bornées | `personal_access_tokens.idle_timeout_minutes`, `two_factor_verified_at` : table non décrite | `2026_10_07_150100_add_session_bounds…` |
| 457 | P1 | Connexion par téléphone, e-mail facultatif | la contrainte « username ou email » des Contraintes d'unicité **n'existe dans aucune migration** et contredirait un compte sans e-mail | idem |
| 461 | P1 | Données bancaires chiffrées | §34 écrit `rib` string « chiffré recommandé », §49 `rib_pro`, `ninea` string : colonnes `text` chiffrées | `2026_10_08_601100`, `601200` |
| 492 | P0 | Invitation par e-mail OU SMS | `invitations.phone`, `email` nullable, contrainte « e-mail ou téléphone » | `2026_10_07_150300_add_phone_to_invitations…` |
| 512 | P0 | Permissions granulaires | catalogue `Capability` incomplet (46 cas dans le code, « 44 » dans la Règle 6) | `app/Models/Enums/Capability.php` |
| 516 | P1 | Attribution de rôles à un profil | `agency_role_id` existe ; Règle 6 dit le contraire | `2026_08_16_120200`, `120400` |
| 518 | P1 | Éditeur de rôles personnalisés | idem | `2026_08_16_120000`, `120100` |
| 533 | P1 | Préférences par événement et par canal | `NotificationPreference` sans section ; EF3 « reporté » | `2026_04_23_090000` |
| 539 | P2 | Digest quotidien / hebdomadaire | `users.email_frequency`, `digest_send_at`, `digest_day_of_week` | `2026_04_26_200001` |
| 582 | P2 | Performance par agent | `leases.agent_id` écrit dans l'en-tête de §85, pas dans §14 | `2026_10_08_150000` |
| 637 | P2 | Devise par agence | `agencies.currency` absent de §2 | `2026_04_24_000001` |
| 660 | P2 | Intégrations tierces | `webhook_token*` ; `health_status`, `last_health_check_at` absents de §31 | `2026_10_08_120000`, `2026_05_07_000217` |
| 665 | P2 | Journal des webhooks entrants | cf. l.217 | `2026_10_08_160000` |

### A.3 Lignes ⚠️ P3 justifiées (26)

Hors périmètre, sans modèle et sans besoin immédiat : l.99, 100, 137, 168, 229, 254, 272, 273, 299,
300, 346, 347, 362, 363, 379, 380, 434, 466, 521, 566, 626, 638, 639. Trois cas à part :

- l.195 « Espace locataire dédié » (P3) — déjà livré en substance par les lignes P1 du dashboard
  locataire (§2.5 l.578-579) : la ligne est à reclasser, pas à soutenir (cf. F8).
- l.432 « Multi-branches » — EF7, reporté, cohérent.
- l.433 « Absence datée d'un agent » — **le support existe** (`role_delegations.replaces_user_id`,
  `2026_10_07_591400`, ADR-0035) mais n'est pas écrit en §66, et EF8 annonce un modèle
  `AgentAvailability` que la décision a écarté.

---

## B. Modèles → Features

### B.1 ❌ (4)

| Unité | Constat | Mesure |
|---|---|---|
| §36 `BrokerProfile` | Section qui décrit une table **supprimée** | `2026_10_07_090100_drop_broker_tables` ; aucun fichier courtier dans `app/Models/` |
| §38 `BrokerAgencyCollaboration` | idem | idem |
| `AgencyAdminProfile` | Modèle du code (`app/Models/Profiles/`) **sans section** ; cité seulement dans des relations et la Règle 5 | `2026_05_10_170000_create_agency_admin_profiles_table` |
| `NotificationPreference` | Modèle du code **sans section** ; cité seulement par EF3 comme « reporté » | `2026_04_23_090000_create_notification_preferences_table` |

### B.2 ⚠️ (35) — la section existe, elle diverge

| § | Modèle | Écart principal (détail en `03-…`) | Features servies |
|---|---|---|---|
| 1 | User | e-mail nullable + unicité du téléphone vérifié ; sept colonnes absentes ; contrainte « username ou email » inexistante | §2.1, §2.3 |
| 2 | Agency | treize colonnes absentes (devise, modération, mapping, mentions légales, seuils, `reviews_count`) | §1.1, §1.5, §2.8 |
| 3 | Property | dix-huit colonnes absentes (archivage, modération, gel plateforme, coût d’entrée, visite virtuelle, `rent_period`, `is_test` ; le jeton iCal n’est cité que sous §81) | §1.1, §1.2, §1.3 |
| 5 | Booking | `expired_at`, `expiry_reason` | §1.3 |
| 6 | BookingPayment | trois colonnes décrites inexistantes, six colonnes réelles absentes | §1.3, §1.5 |
| 7 | Customer | `agency_id` et sept critères de recherche absents | §1.6 |
| 8 | PropertyCollaborator | six colonnes décrites inexistantes ; `is_primary` absent | §1.1, §1.12 |
| 9 | UserCustomerRelationship | `broker_client` retiré | §1.6 |
| 11 | Review | auteur, note, statut, portée d'agence, contexte : six écarts | §1.8, §1.11 |
| 14 | Lease | quatorze colonnes absentes (pénalités, caution, résiliation, `agent_id`…) | §1.4, §2.5 |
| 15 | LeasePayment | `late_fee` renommée ; trois colonnes absentes | §1.4, §1.5 |
| 17 | PropertyVisit | contrainte décrite inexistante ; attribution absente | §1.2, §1.3 |
| 18 | Conversation | la colonne `type` liste trois valeurs, l'enum six | §1.7 |
| 20 | Message | `MessageType.audio` | §1.7 |
| 21 | MaintenanceRequest | onze colonnes absentes | §1.8 |
| 24 | Inventory | huit colonnes de signature absentes | §1.9 |
| 25 | Invoice | avoir, numérotation, unicité par agence, colonnes de passerelle | §1.5 |
| 28 | Payout | huit colonnes absentes, contrainte inexistante, statut manquant | §1.5 |
| 29 | DocumentShareLink | `token_hash` | §1.10 |
| 31 | Integration | `webhook_token*`, santé | §1.5, §2.9 |
| 34 | OwnerProfile | `works_approval_threshold`, `agency_role_id`, chiffrement, `user_id` nullable | §1.8, §2.1, §2.2 |
| 35 | AgentProfile | `agency_role_id`, `user_id` nullable | §2.2 |
| 37 | ServiceProviderProfile | `status` ajouté, `user_id` nullable et **plus unique** | §1.8, §1.12 |
| 39 | ServiceProviderAgencyCollaboration | `agency_role_id` ; unicité devenue partielle | §1.12 |
| 40 | BankStatement | `csv_mapping`, `skipped_lines_count` | §1.5 |
| 45 | PlatformPayout | quatre colonnes de séparation des gestes | §1.5 |
| 48 | Invitation | `phone`, e-mail nullable, contrainte | §2.1 |
| 49 | AgencyUpgradeRequest | colonnes chiffrées | §2.1 |
| 52 | AgencyRole | contredit par la Règle 6 et l'en-tête « Packages » | §2.2 |
| 53 | AgencyRoleCapability | idem | §2.2 |
| 55 | NotificationTemplate | seule l'extension WhatsApp est décrite, pas la table | §2.3, §2.9 |
| 63 | IntegrationWebhookLog | dix-sept colonnes de journal | §1.5, §2.9 |
| 66 | RoleDelegation | `replaces_user_id` | §1.12 |
| 67 | PropertyContactLead | sept colonnes, quatre nullabilités | §1.2, §1.6 |
| 68 | PropertyReport | `decision`, `resolved_by_id`, `reason_code`, `reporter_fingerprint` ; « pas de décision stockée » faux | §1.1, §1.2 |

### B.3 ✅ (50)

§4, §10, §12, §13 (dont `Activity`, décrit dans §13), §16, §19, §22, §23, §26, §27, §30, §32, §33,
§41, §42, §43, §44, §46, §47, §50, §51, §54, §56 à §62, §64, §65, §69 à §87 (dont §76-78 et §84-86,
exactes au regard de leurs migrations malgré leur bannière « entrée minimale »).

> Sur les 50, ceux qui n'ont été touchés par aucune migration depuis leur rédaction sont comptés
> conformes sans relecture colonne à colonne — voir « Limites » dans `00-summary.md`.

### B.4 Enums — hors compteurs

- **24 enums de `app/Models/Enums/` absents du tableau des enums** : AgencyAdminProfileStatus,
  CommissionEntryStatus, CommissionOrigin, ContactLeadChannel, CustomerNoteKind, EmailFrequency,
  ImpersonationEndReason, InventoryElementState, InvoiceKind, ModerationReasonCode, ParticipantRole,
  PayeeRole, PaymentProvider, PayoutMethodKind, PlatformAbility, PrivacyRequestChannel,
  PrivacyRequestStatus, PrivacyRequestType, RentPeriod, ReviewStatus, ScheduledTaskRunStatus,
  ServiceProviderBillStatus, ServiceProviderProfileStatus, WatermarkPosition. Neuf d'entre eux sont
  cités dans le corps d'une section, aucun dans le tableau.
- **4 enums aux valeurs périmées** : `RelationshipType` (`broker_client` n'existe plus),
  `LeaseStatus` (manque `terminating`), `PayoutStatus` (manque `awaiting_approval`), `MessageType`
  (manque `audio`).
- Aucun enum du tableau n'est absent du code.
