---
id: TCK-3015
title: "Les règles transversales gardées par recensement : planification, routes retirées, bornes, authentification, refus par espace, rejeu idempotent"
status: done
phase: P2
family: technique
estimate: M
wave: 99
created: 2026-11-28
updated: 2026-11-28
depends_on: [TCK-3012]
blocks: []
spec_refs:
  features: []
  models: []
tags: [technique, tests, back, architecture, adr-0140]
---

## Objectif utilisateur

Une route ou une tâche oubliée par une règle transversale fait rougir la CI, sans qu'un test soit écrit à la main pour elle.

## Contrat de données

Relevé : 89 tests « est planifié » dans 63 fichiers relisent `routes/console.php` ; ~8 fichiers de routes retirées (`CreationGeneriqueRetiree`, `MediaGenericUpload`, `OwnAccountImmediateDeletionRemoved`…) à côté de `Routes/RoutesEnDoubleRetireesTest` ; 6 `*FieldLength` (dont `Agency/AgencyFieldLengthTest`) à côté de `Validation/BornesMaxFaceAuSchemaTest` ; 20 tests dans 17 fichiers `Admin/*` « l'admin d'agence reçoit 403 », que `NamespaceAccessGuardTest` balaie déjà ; tests `requires_auth` répétés alors que `Architecture/AucunGuardTokenTest` point 4 tient la liste FERMÉE des routes `api/*` sans authentification ; 6 `Idempotence/*Rejoue*` au même scénario.

## Contraintes strictes (métier)

- Un recensement remplace les copies seulement s'il rougit sur l'oubli (ablation : retirer une tâche, une route, une borne, un middleware).
- Le rejeu idempotent passe en fournisseur de données sans retirer de cas (règle sacrée).
- Lire `AucunGuardTokenTest` en entier : son point 4 EST le recensement d'authentification ; ses points 1 à 3 gardaient l'avis framework < 13.27.0 (lock en 13.42) — les retirer si aucun motif ne reste, en le disant.
- **Règle de retrait (ADR-0140 § 3)** : par grappe, relire les deux côtés, puis muter en production la règle que le test retiré garde : un test qui reste doit rougir, sinon le test se déplace au lieu de se supprimer. Une ligne du relevé dont la raison dit « doute » ne se retire pas.
- Les règles sacrées (argent, isolation d'agence et lecture, empreintes et HMAC du Radar, idempotence, autorisation par capacités) ne perdent un test que si un autre rougit à sa place.
- Jamais de suite entière en local : les classes touchées par le créneau ; la CI juge la suite et le cliquet de couverture (`Total:` du job `couverture`).

## Delta à produire

- [x] Table de la planification (une ligne par tâche : commande, fréquence, sans chevauchement)
- [x] Routes retirées : une table dans `RoutesEnDoubleRetireesTest`
- [x] Bornes : les `*FieldLength` entrent dans la table de `BornesMaxFaceAuSchemaTest` (un témoin HTTP par fichier au plus)
- [x] Refus par espace : `NamespaceAccessGuardTest` couvre aussi agent, bailleur, locataire si ce n'est pas déjà le cas ; les 403 recopiés partent
- [x] Authentification : les `requires_auth` recopiés partent si `AucunGuardTokenTest` § 4 les couvre
- [x] Idempotence : fournisseur de données

## Critères d'acceptation

- [x] AC1 — Chaque recensement rougit sur un oubli fabriqué (ablation par recensement).
- [x] AC2 — Les copies retirées sont listées dans les notes, avec le recensement qui les tient.

## Notes d'implémentation

Re-mesures (2026-11-28) : la prémisse « 89 tests est planifié dans 63 fichiers » ne se retrouve pas — **28 méthodes
« est planifié » dans 27 fichiers** (plus les tests qui LISENT le planificateur pour éprouver un comportement, gardés).
`composer.lock` installe `laravel/framework` **v13.42.0** (contrainte `^13.0`). Les 403 « admin d'agence » sont sous
`tests/Feature/Api/Admin/*` (et deux dans `Admin/AgencyUpgradeRequestReviewTest`), pas sous `Admin/*`.

Chaque recensement est rougi par ablation (md5 du mutant vérifié, fichier rendu à son md5) :

| Recensement | Ablation | Résultat |
|---|---|---|
| `Console/PlanificationTest` (neuf, table FERMÉE du `Schedule` résolu : commande ARGUMENTS COMPRIS, cron, fuseau, verrou ; + verrou ≤ période, comptage radar avant la purge, files du battement) | `routes/console.php` : `boosts:tick` retirée, `search:purge-journal` toutes les 2 h, `->timezone` ôté de `payouts:remind-due`, `withoutOverlapping` ôté de `maintenance:auto-close`, `radar:count-natures` à 04:17, verrou 120 sur une tâche horaire, une tâche neuve hors table | 3 tests rouges sur 4, les cinq écarts et la tâche neuve nommés |
| `Routes/RoutesEnDoubleRetireesTest` (table `RETIREES` jugée par le **routeur** sur une requête concrète, + `RESTENT`, + un témoin 405 dans l'enveloppe) | `routes/api/media.php` : `DELETE agencies/{agency}` remise, `POST media/{quelconque}` ajoutée | rouge, les deux nommées (la voisine paramétrée qui avale `media/upload` comprise) |
| `Validation/BornesMaxFaceAuSchemaTest` (inchangé : il listait déjà toutes les voies des six `*FieldLength`) | `max:7` ôté de `UpdateTagRequest.color`, `max:255` de `UpdateCustomerRequest.occupation` (deux voies dont le témoin HTTP est retiré) | 2 rouges |
| `Api/Admin/NamespaceAccessGuardTest` (étendu : admin d'agence, agent, bailleur, locataire, par fournisseur) | `routes/api/admin.php:58` sans `super-admin`, + une route `admin/*` neuve sous `auth:sanctum` seul | 4 rouges sur 4 |
| `Architecture/AucunGuardTokenTest` § 4 (et § 3) | `routes/api/dashboard.php:11` : `auth:sanctum` → `[]`, puis → `auth` | § 4 rouge (5 routes nommées), puis § 3 rouge |
| `Idempotence/RejeuSousLaMemeCleTest` (neuf, fournisseur de 9 scènes) | `routes/api/invoices.php:10` sans `idempotent` | la scène « facture » rouge |

**`AucunGuardTokenTest` points 1 et 2 retirés** : ils figeaient les guards (`web`, `sanctum`) et l'absence de
`TokenGuard`/`RequestGuard`/`viaRequest`/`Auth::extend` dans le code, pour le seul avis GHSA-f9x3-7vq9-cph6
(`laravel/framework` < 13.27.0, TCK-2787). La v13.42.0 installée le corrige ; aucun autre motif n'était écrit.
**Le point 3 reste** : il est la définition d'« authentifiée » dont le point 4 a besoin (`auth` sans paramètre = guard
`web` par session, un client à jeton y reçoit 401). Le nom du fichier reste (cité par quatre tickets clos) ; son
docblock dit désormais ce qu'il garde. ⚠ La contrainte `^13.0` de `composer.json` admettrait encore une 13.2x : la
relever à `^13.27` fermerait ce reste (hors périmètre : `composer.json` est un déclencheur dur).

**Copies retirées, et le recensement qui les tient (AC2)**

- *Planification* → `Console/PlanificationTest` : `Admin/Platform/EvaluateOperationalAlertsTest::test_la_commande_est_planifiee_toutes_les_cinq_minutes`,
  `Admin/Platform/HealthcheckProbesTest::test_le_battement_et_la_sonde_sont_planifies_…` (les asserts sur `QUEUES` y sont
  repris : `FILES_DU_BATTEMENT`), `Api/OwnerStatementTest` (moitié planification ; l'envoi unique reste, renommé
  `test_the_monthly_command_notifies_each_landlord_once`), `Auth/PasswordResetTokensPruneTest::test_le_planificateur_purge_…`
  (le test qui REJOUE la commande planifiée reste), `Auth/Session/IdleTokenPruneTest::test_le_planificateur_purge_…`,
  `Auth/Session/TokenPruneScheduleTest` (fichier), `Billing/RenewAgencySubscriptionPeriodsTest::test_la_tache_est_planifiee_…`,
  `Boost/BoostsTickScheduleTest` (fichier), `Console/PrivacyRetentionPurgesTest::test_les_trois_purges_…`,
  `Console/Prune{ActivityLog,NotificationDeliveryAttempts,ReadNotifications,WebhookLogs}CommandTest` (une chacun),
  `Console/RemindDuePayoutsCommandTest::test_ac20_the_command_is_scheduled_daily`, `Console/QueueRetentionScheduleTest`
  (fichier ; son test du journal de `User` déplacé dans `Audit/JournalDeUserTest`), `Console/ScheduleOverlapLockTest`
  (fichier, repris tel quel), `Directory/DirectoryResponseTimesTest`, `Documents/RappelExpirationDocumentTest`,
  `Jobs/{CompleteEndedBookings,ExpireEndedLeases,SendOverdueReminders}JobTest`, `Maintenance/MaintenanceAutoCloseCommandTest`,
  `Messaging/Engagements/SignalDesEngagementsTest`, `Owners/ResumeDuLundiTest`, `Radar/Observatory/RadarNatureCountsTest`
  (l'ordre comptage → purge devient `test_le_comptage_radar_precede_la_purge`), `Radar/Observatory/RadarSourceWatchTest`,
  `Radar/RadarPurgeTest`, `Reporting/ExportsDeRapportEchusTest`, `Search/{SearchAliasCurator,SearchJournal,SuggestionIndexBuilder}Test`,
  `Unit/RefreshNewBuildSearchLabelTest` — une méthode « est planifié » chacun. Gardés : `AdminAiEvaluationSuiteTest`
  (filtre `when`), `SchedulerRunStatusTest` (journal des exécutions).
- *Routes retirées* → `Routes/RoutesEnDoubleRetireesTest` : `Routes/{CreationDAgenceRetiree,SuppressionDAgenceRetiree,DashboardStatsRouteRemoved,UnifiedPaymentRouteRemoved}Test`,
  `Invitation/CreationGeneriqueRetireeTest`, `Admin/Platform/OwnAccountImmediateDeletionRemovedTest`, `Media/MediaGenericUploadTest`
  (fichiers), `Admin/Platform/AccountBlockSingleRouteTest::test_les_routes_hors_console_n_existent_plus`,
  `Api/PayoutMethodBankStatementTest::test_la_route_de_signature_cdn_est_retiree`. Les trois routes d'enum retirées
  (TCK-1055/1056/1057) entrent dans la table, mais `Api/Admin/BusinessEnumTest::test_console_refuses_*` restent : ils
  jugent aussi la liste publique lue dans l'enum PHP.
- *Bornes* → `Validation/BornesMaxFaceAuSchemaTest` : un témoin HTTP par fichier gardé ; retirés `EmailFieldLengthTest::{test_fiche_client,test_garant,test_agence,test_demande_de_visite_publique}`,
  `AvisEtEncaissementFieldLengthTest::{test_titre_d_un_avis_de_bien,test_reference_d_un_encaissement_d_echeance,test_reference_d_un_paiement_de_reservation}`,
  `CustomerFieldLengthTest::test_modifier_…`, `GuarantorFieldLengthTest::{test_modifier_…,test_ajouter_un_garant_neuf_a_un_bail_…}`,
  `TagFieldLengthTest::test_modifier_…`, `AgencyFieldLengthTest::test_ouvrir_une_agence_a_la_console_…`.
- *Refus par espace* → `Api/Admin/NamespaceAccessGuardTest` : dans `Api/Admin/`, `AgencyModerationTest::test_index_is_forbidden_to_non_super_admin`,
  `UserDetailTest`, `AgencyOnboardingTest`, `PaymentSupervisionTest` (agent compris), `ModerationQueueTest`, `AgencyDetailTest`,
  `HealthcheckJobsTest`, `PlatformSettingTest`, `NotificationTemplateTest`, `UserSupportTest`, `PlatformPayoutTest`,
  `BillingPlansTest`, `ModerationBatchTest`, `IntegrationAdminTest`, `AgencySubscriptionOverridesTest`, `BusinessEnumTest`,
  `FeatureFlagTest`, `PlatformReportingTest` (une méthode chacun) ; la moitié « admin d'agence → 403 » de
  `MaintenanceModeTest`, `AlertRuleTest`, `AnnouncementTest` (méthodes renommées) ; `Admin/AgencyUpgradeRequestReviewTest::test_non_super_admin_gets_403_*` (×2).
  Gardés : les refus d'un OPÉRATEUR sans capacité (refus par capacité, pas par espace).
- *Authentification* → `Architecture/AucunGuardTokenTest` § 3-4, 56 méthodes « sans session → 401 » sur des routes `api/*`
  hors de `SANS_AUTHENTIFICATION` : `Payments/TenantRentSummaryTest::test_un_invite_recoit_401`, `Auth/SuperAdminCooptationTest::test_unauthenticated_2fa_enroll_is_rejected`, `Auth/SuperAdminInvitationLifecycleTest::test_an_unauthenticated_caller_is_refused`, `Auth/AuthProfileTest::test_unauthenticated_request_returns_401`, `Auth/AuthProfileTest::test_profile_update_requires_authentication`, `Auth/AuthMeRolesTest::test_me_requires_authentication_even_with_team_middleware`, `Auth/AuthLoginTest::test_logout_requires_authentication`, `Boost/CreditBalanceEndpointTest::test_un_anonyme_est_refuse`, `Favorites/PrixDepuisLAjoutTest::test_ouvrir_sans_session_rend_401`, `Agency/AgencyResponseTimeTest::test_sans_session_401`, `Crm/CustomerTimelineTest::test_sans_authentification_401`, `Geo/GeoLinkResolverTest::test_sans_compte_le_point_d_acces_est_ferme`, `Search/DocumentSearchTest::test_unauthenticated_returns_401`, `Search/MessageSearchTest::test_unauthenticated_returns_401`, `Dashboard/ExportControllerTest::test_unauthenticated_is_rejected`, `Dashboard/DashboardMeTest::test_returns_401_when_unauthenticated`, `Dashboard/DashboardAgentTest::test_unauthenticated_is_rejected`, `Dashboard/DashboardOwnerTest::test_unauthenticated_is_rejected`, `Dashboard/DashboardAgencyTest::test_unauthenticated_request_is_rejected`, `Dashboard/DashboardTenantTest::test_unauthenticated_is_rejected`, `Public/PropertyContactMessageTest::test_unauthenticated_returns_401`, `Public/PropertyBookingRequestTest::test_unauthenticated_returns_401`, `Public/PropertyConversationResolveTest::test_unauthenticated_returns_401`, `Api/PropertyBulkArchiveTest::test_requires_auth`, `Api/NotificationPreferenceTest::test_unauthenticated_cannot_access_preferences`, `Api/PropertyCrudTest::test_requires_auth`, `Api/ConversationContextTest::test_un_visiteur_anonyme_est_refuse`, `Api/UserRoleControllerTest::test_unauthenticated_request_is_rejected`, `Api/MessagingContactsTest::test_un_visiteur_anonyme_est_refuse`, `Api/ActivityLogExporterTest::test_unauthenticated_is_rejected`, `Api/MeExportsTest::test_a_guest_is_refused`, `Api/PropertyDuplicationTest::test_requires_auth`, `Api/AgencyStatsTest::test_unauthenticated_request_is_rejected`, `Api/TaskTest::test_create_requires_auth`, `Api/PaymentGatewayVerifyTest::test_an_unauthenticated_caller_is_rejected`, `Api/Agency/AgencyRoleControllerTest::test_guests_are_rejected`, `Api/Permissions/RoleDelegationTest::test_unauthenticated_returns_401`, `Api/Me/MeCapabilitiesTest::test_it_requires_authentication`, `Api/Me/SelectActiveProfileTest::test_patch_active_profile_requires_authentication`, `Api/Admin/PlatformReportingTest::test_anonymous_export_is_unauthenticated`, `Api/Me/MeUpdateTest::test_anonymous_request_is_rejected`, `Api/Me/MePiecesTest::test_sans_session_401`, `Api/Me/ProfilesEndpointTest::test_get_me_profiles_requires_authentication`, `Owners/InterlocuteurDuBailleurTest::test_un_invite_non_connecte_recoit_401`, `Api/Me/LocateAcrossProfilesTest::test_sans_authentification_401`, `Documents/DocumentListReadParityTest::test_both_routes_refuse_an_anonymous_caller`, `Radar/Observatory/RadarObservatoryTest::test_la_route_est_gardee`, `Radar/Observatory/RadarAdvertiserRankingTest::test_la_route_est_gardee`, `Invitation/InviteNumberStepSummaryTest::test_sans_session_401`, `Notifications/NotificationPreferenceTest::test_endpoint_requires_auth`, `Onboarding/HostAutoOnboardTest::test_anonyme_401`, `Onboarding/HostIndividualOnboardingTest::test_endpoint_requires_authentication`, `Media/MediaUploadTest::test_guest_cannot_upload`, `Media/MediaDeleteTest::test_guest_cannot_delete`. Gardés : `ApiErrorFormatTest` (forme du 401), `KycDocumentAccessTest`
  (signature valide sans session), `Middleware/EnsureSuperAdminTest`, les webhooks, l'invitation `requires_login`, les jetons
  expirés. Retirés aussi après le dégel (TCK-3011 commité) : `Api/BookingCountsTest::test_a_guest_is_refused`, `Api/PropertyVisitCountsTest::test_sans_compte_401` (56 en tout).
- *Idempotence* → `Idempotence/RejeuSousLaMemeCleTest` : `Acompte`, `DemandeDeContact` (×2), `Facture`, `Intervention`,
  `MessageDeLaFiche`, `Reservation` (×2) et le message texte de `MessageRejoueTest`. **Aucun cas retiré** : 11 tests
  avant comme après (sur les 7 fichiers), 46 → 75 assertions (l'en-tête `Idempotent-Replayed` et « aucun second avis »
  sont désormais jugés sur chaque scène). `MessageRejoueTest` garde la note vocale (multipart) et l'envoi sans clé ;
  `VisiteRejoueeTest` (sans clé, dédoublonnage par créneau) n'est pas le même scénario et reste.

## Hors périmètre

- Le front (`takussan-web`) ; renommer les 1 391 méthodes `ac1_/m4_…` (aucun gain de détection ni de temps).
