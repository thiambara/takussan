---
id: TCK-3017
title: "Fusionner et alléger les grappes du relevé : un fichier par module, retraits prouvés par ablation"
status: todo
phase: P2
family: technique
estimate: L
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

La suite du back garde chaque défaut qu'elle attrape aujourd'hui, avec moins de fichiers qui se recouvrent.

## Contrat de données

Relevé exhaustif : `/private/tmp/claude-501/-Users-aminethiam-Documents-perso-takussan/94f633e1-a1ae-4b22-af2b-442d465dff80/scratchpad/releve-tests/lot1-api.tsv`, `lot2.tsv`, `lot3.tsv`, `lot4.tsv` (colonnes : chemin, nb_tests, verdict, cible, raison). FUSIONNER 87 fichiers (~110 tests économisés), ALLEGER 127 (~250 à retirer), SUPPRIMER 7. Exemples : `ReviewModerationWorkflowTest` → `ReviewModerationQueueTest`, `RoleAccessTest` → `UserRoleControllerTest`, `BookingOverlapAndExpirationTest` → `BookingAvailabilityTest`, `InventoryTest` (10/13 redondants), `Search/ScoutSearchTest` (4/5 testent Scout), `Unit/ModelsTest`, les deux `ExampleTest`, `Testing/ApiTestCaseTest`. Hors de ce ticket : les lignes COUTURE (TCK-3014), les recensements (TCK-3015), la lecture (TCK-3016), le seeder (TCK-3013).

## Contraintes strictes (métier)

- Les TSV sont une liste de candidats, pas un ordre de travail : la plupart des verdicts « garder » ont été posés sur les noms. Relire les deux côtés de chaque grappe.
- Un test qui ne prouve pas ce qu'il dit se CORRIGE au lieu de partir (`PropertySimilarTest::test_second_call_is_served_from_cache` doit prouver le cache).
- Une fusion déplace les cas dans la classe du module (ADR-0140 § 1) ; un fichier fusionné disparaît.
- **Règle de retrait (ADR-0140 § 3)** : par grappe, relire les deux côtés, puis muter en production la règle que le test retiré garde : un test qui reste doit rougir, sinon le test se déplace au lieu de se supprimer. Une ligne du relevé dont la raison dit « doute » ne se retire pas.
- Les règles sacrées (argent, isolation d'agence et lecture, empreintes et HMAC du Radar, idempotence, autorisation par capacités) ne perdent un test que si un autre rougit à sa place.
- Jamais de suite entière en local : les classes touchées par le créneau ; la CI juge la suite et le cliquet de couverture (`Total:` du job `couverture`).

## Delta à produire

- [ ] Grappes FUSIONNER traitées une par une, ablation par grappe
- [ ] Lignes ALLEGER : retrait des tests nommés dans la raison, ablation par règle
- [ ] Lignes SUPPRIMER : retrait, sans ablation pour un test qui ne peut pas rougir
- [x] Notes : par grappe, les tests retirés et la mutation qui a rougi à leur place

## Critères d'acceptation

- [x] AC1 — Chaque retrait d'un test qui garde une règle est accompagné, dans les notes, d'une ablation qui rougit un test restant.
- [x] AC2 — Aucune ligne « doute » n'est retirée.
- [ ] AC3 — Le job `couverture` de la PR reste au-dessus du cliquet (92 %).

## Hors périmètre

- Le front (`takussan-web`) ; renommer les 1 391 méthodes `ac1_/m4_…` (aucun gain de détection ni de temps).

## Notes d'implémentation

Chaque ablation : la règle mutée en production sous le créneau de test, le test RESTANT lancé, restauration vérifiée
par md5. « Rougit » nomme le test restant qui a rougi.

### Avis — `ReviewModerationWorkflowTest` + `ReviewReportAndDocSearchTest` → `ReviewModerationQueueTest`

- Déplacés (8 + 2) : rejet d'un avis en attente, transition refusée depuis `rejected`, les trois signalements, refus
  du rejet à un non-admin, réponse refusée sur un avis rejeté, carte des transitions ; signalement (forme
  `metadata.reports`), motif requis. `multiple_reports_accumulate` fondu dans `report_is_deduped_per_user` (+
  `assertCount(2, metadata.reports)`).
- Retirés : `pending→approved` (statut `Pending` à l'approbation → rougit `moderate_approve_transitions_to_approved`) ;
  `approved→rejected` et `reported→approved` (carte amputée → rougit `test_enum_transition_map`) ;
  `Queue::non_admin_cannot_list_reviews` (garde `viewModerationQueue` ôtée → rougit
  `ReviewTest::non_admin_without_author_filter_is_forbidden_on_reviews_index`) ; les deux recherches de documents
  (`title` vidé de l'index → rougit `DocumentListRelevanceTest` ×2 ; liste amputée d'un document → rougit
  `sans_recherche_le_plus_recent_d_abord`).
- Gardés, malgré le relevé : `ReviewTest::admin_can_approve_review` et `non_admin_cannot_approve_review` (le relevé
  les retirait au nom du fichier Workflow, qui les retirait au nom de ReviewTest : il en faut un) ;
  `rating_below_1/above_5` (validation, en attente d'arbitrage).

### Réservations — `BookingOverlapAndExpirationTest` → `BookingAvailabilityTest`

- Déplacé : `overlap_check_ignores_other_properties` (filtre par bien ôté → il rougit).
- Retirés : chevauchement confirmé refusé (chevauchement jamais vu → rougit
  `confirming_the_second_of_two_overlapping_requests_is_refused` et 3 autres) ; hors des dates accepté (bornes de
  dates ôtées → rougit `leaving_on_the_arrival_day_is_accepted…`) ; les deux tests du job (échéance inversée → rougit
  `ExpireBookingsTest` ×2 ; « hors `pending` intact » : DEUX gardes, le filtre du job et `canBeExpired`, chacune
  suffit — ôtées ensemble → rougit `a_future_deadline_and_a_closed_booking_are_left_alone`).

### Baux — `LeaseRefundTest` → `LeaseTest`, et les doublons HTTP des services

- Déplacé : `early_termination_creates_penalty_payment` dans `LeaseTest`.
- Retirés (argent : chacun a sa mutation) : remboursement total (état `full` → `partial` → rougit
  `full_refund_returns_201_and_full_state`) ; bail actif (garde `enFinDeBail` ôtée → rougit
  `LeaseDepositRefundEndpointTest::active_lease_returns_422`, gardé comme témoin HTTP, et
  `DepositRefundServiceTest::refund_on_active_lease_is_rejected`) ; double remboursement (`deposit_refunded_amount`
  ignoré → rougit `full_refund_then_second_call…` et 4 autres) ; `amount_exceeding_remaining_returns_422` (borne
  relâchée → rougit `refund_amount_exceeding_remaining_is_rejected`).
- `LeaseTest` : `can_renew_active_lease` (renouvelable jamais → rougit `landlord_can_renew_active_lease`),
  `cannot_renew_inactive_lease` (renouvelable toujours → rougit `renew_rejects_when_parent_status_not_renewable`).
- `LeaseRenewalEndpointTest` : `inherits_monthly_rent` (loyer hérité faussé → rougit
  `renew_creates_chained_child_with_inherited_fields`), `rejects_tenant_or_property_mutation` (garde ôtée → rougit
  `renew_rejects_tenant_mutation` / `_property_mutation`). `active_child_returns_422` gardé (témoin HTTP du 422).
- `LeaseRentEndpointTest` : `short_reason` (borne à 0 → rougit `review_rejects_when_reason_too_short`),
  `review_on_draft_lease` (voir ci-dessous). `excessive_variation_without_force` gardé (témoin HTTP, argent).
- `LeaseEarlyTerminationEndpointTest` : `double_request` (voir ci-dessous), `cancel_after_penalty_paid` (garde ôtée →
  rougit `cancel_rejects_when_penalty_paid`). `notice_too_short` gardé (témoin HTTP).
- **Deux tests de service CORRIGÉS, parce que l'ablation les a trouvés aveugles** :
  `RentReviewServiceTest::review_rejects_when_status_not_active` postait le motif « Test » (4 caractères < 5) : il
  levait l'exception du motif trop court et restait vert sans la garde de statut. Motif valide + message attendu →
  rougit sous la mutation. `EarlyTerminationServiceTest::request_rejects_when_already_terminating` restait vert sans
  sa garde (`preavisPossible` refuse aussi) : il attend désormais le message `already_in_progress` → rougit.

### États des lieux — `InventoryTest` (9/13), `InventorySignatureTest` (3), deux fusions

- `InventoryTest` garde : envoi d'un brouillon, contestation d'un brouillon refusée, type invalide, liste.
  Retirés : création (garde `update` du bail ôtée → rougit `InventoryCreationTest::unauthorized_user_cannot_create…`),
  modification hors brouillon (409 ôté → rougit `InventoryEditTest::cannot_edit_signed_inventory`), envoi hors
  brouillon (garde ôtée → rougit `InventoryGestesTest` ×2), signature d'un tiers (garde `canSignAs` ôtée → rougit
  `InventorySignatureTest::stranger_receives_403` et 10 autres), double signature (statut non basculé → rougit
  `both_signatures_flip_status_to_signed…`), contestation du locataire (policy amputée → rougit
  `InventoryDisputeAuthorizationTest::ac8_le_locataire_conteste`), `can_update_draft` et `can_show` (couverts par
  `InventoryEditTest::can_edit_notes_of_draft_inventory` et toute lecture de fiche).
- `InventorySignatureTest` : `pdf_rejects_unsigned…` (garde `pdfAvailable` → rougit `pdf_requires_fully_signed…`),
  `missing_signature_payload…` (`signature` facultative → rougit `sign_without_body_returns_422…`),
  `signed_inventory_patch_returns_409` (= la mutation du 409 ci-dessus).
- Fusions : `InventoryTenantOwnSignatureUnchangedTest` → `InventorySignatureTest` (ses assertions — voie `drawn`,
  sans code ni IP, numéro non vérifié, aucun avis — versées dans `tenant_can_sign_as_tenant_role` ; le code posté
  ignoré déplacé) ; `InventoryAbilitiesTest` → `InventoryGestesTest` (réécrit sur le décor de la classe).

### Recherche — `ScoutSearchTest` → `PropertyIndexTest`

- Déplacé : `searchable_array_exposes_filterable_and_searchable_fields`. Retirés sans ablation (Scout lui-même) :
  pilote `collection`, plein texte, pagination ; `PropertyIndexTest::property_uses_searchable_trait` (tautologie).
  Retiré avec ablation : `draft_properties_are_not_indexed` (`shouldBeSearchable` sans visibilité ni statut → rougit
  `draft_or_private_properties_are_not_indexed`).

### Invitations — resend/revoke « via la route générique » ×3

- Retirés des trois `Invite*Test` (copies mot pour mot). Révocation sans statut → rougit
  `InvitationLifecycleTest::inviter_can_revoke_pending_invitation`. (Relance : voir ci-dessous.)

### Agences — `AgencyKindTest` (4/7), `AgencyUpgradeRequestTest` (3/10)

- Retirés sans ablation (fabrique, cast Eloquent, relation vide qui ne peut pas rougir) : défaut de la fabrique,
  surcharge de la fabrique, état `individual()`, relecture du cast ; fabrique de la demande, sérialisation de l'enum,
  `pendingUpgradeRequest` nul sans aucune demande. Gardé malgré le relevé : `is_individual_helper` (code de
  l'application, peut rougir).

### Public — `PropertyByIdsTest` → `PropertyCompareTest`

- Les deux routes ont chacune leur code : le contrat (ordre, brouillons écartés, plafond, `ids` requis, méta vide) se
  joue par un fournisseur sur les deux (11 cas au lieu de 13). Plafond `by-ids` relâché → rougit
  `caps_at_the_route_maximum with data set "by-ids"`. Retirés : les deux `no_auth_required` (chaque cas est anonyme).

### Squelettes et harnais (sans ablation)

- `Feature/ExampleTest`, `Unit/ExampleTest`, `Feature/Testing/ApiTestCaseTest` (le harnais, que 38 classes
  emploient), `Unit/ModelsTest` (types de relations : `ModelRelationsExecuteTest` les exécute ; `full_name`, voir
  ci-dessous).
- `full_name` : aucun des trois tests qui affichent des noms (`PropertyCollaboratorTest`, `ConversationThreadContextTest`,
  `PublicProfileTest`) ne rougit quand l'accesseur perd le nom de famille → `tests/Feature/Models/UserTest.php` (neuf).
- Invitations, relance : nouveau jeton ôté dans `resend()` → rougit `InvitationLifecycleTest::resend_regenerates_token…`.

### Étiquettes — `TagWriteAuthorizationTest` → `TagTest`

- Déplacés : le journal des trois écritures, le refus de l'admin d'agence ET de l'agent sur les trois verbes, les biens
  étiquetés préservés. Retiré : la lecture (liste vidée → rougit `TagTest::anyone_can_list_tags`).
- `TagSyncReindexTest` LAISSÉ : le relevé le disait égal à `TagSyncIndexFilterTest::un_bien_public_reste_indexe…`,
  qui vérifie la présence dans l'index d'un bien publié (déjà indexé à sa création), pas qu'il se trouve par le filtre
  Équipements — fausse équivalence.

### Bailleurs — trois regroupements, aucun test retiré

- `OwnerDetailCollectionsCountTest` → `OwnerProfileShowTest`, `OwnerLastPayoutSortTest` → `OwnerProfileListFiguresTest`,
  `OwnerStatementRemainingTest` → `OwnerStatementBalanceTest` (son horloge du 2026-11-11 posée dans chaque test versé).

### Visites — `PropertyVisitCancelSousVerrouTest` → `GestesDeLaVisiteTest`, et les doublons des gestes

- Déplacés (réécrits sur le décor de la classe) : les trois annulations sous verrou ; `PropertyVisitTest::cancel_visit`
  fondu dedans (`cancelled_at` posé → rougit sans lui).
- Retirés : `NoShow::une_visite_terminee_ou_annulee…` (garde `vivante` ôtée → rougit
  `declarer_absente_une_visite_annulee_sous_la_ligne…`), `NoShow::une_visite_a_venir…` (garde de l'heure ôtée → rougit
  `VisitNoShowNotifiesVisitorTest::une_visite_a_venir…`), `Reschedule::une_visite_annulee…` (→ rougit
  `proposer_un_creneau_sur_une_visite_annulee…`), `UpdateInactive::une_visite_absente_ne_se_deplace_pas…` (→ rougit
  `deplacer_une_visite_passee_absente…`), `UpdateDuree::creation_et_modification_partagent_la_meme_borne` (couture :
  lisait `rules()` ; borne du PATCH relâchée → rougit `le_patch_refuse_une_duree…`, borne de la création → rougit
  `VerificationAdverseTest::m5`).
- `ScheduledJobsTest` → `PropertyVisitWorkflowTest` : le rappel de l'AGENT versé dans `reminder_job_dispatches_24h…`
  (il n'y était pas), « visite à cinq jours » déplacé.
- GARDÉ : `PropertyVisitTest::cannot_confirm_cancelled_visit` — la garde d'écriture `not_scheduled_confirm` ôtée,
  aucun test restant ne rougit (garde doublée en amont) : le cas reste.

### Tests qui ne peuvent pas rougir (sans ablation)

- `AgencySettingsBooleensStockesTest::le_catalogue_a_des_cles_booleennes` (constante), `HealthCheckTest::…no_longer_reports_a_cdn_probe`
  (pierre tombale), `ContactLeadInboxTest::plus_aucun_titre_fige_dans_app` (grep du source),
  `AgencyIndividualCustomRolesTest` : inventaire des routes par `Route::getRoutes()` et parité des catalogues (gardée
  par `LangGroupParityTest`), `RegenerateWatermarksEndpointTest::endpoint_validates_agency_exists` (404 de la liaison
  de route), `AgencyCurrencyUpdateTest::existing_agencies_have_xof_default…` (la fabrique pose XOF).
- `CandidatureSurUnBienDejaLoueTest` : la moitié par réflexion (`PIPELINE`, constante privée du semeur) retirée, la
  moitié qui éprouve la clôture gardée, renommée.

### Argent et autorisation — doublons stricts

- `PayoutTest` : `non_agency_user_cannot_create_payout` (autorisation réduite à « connecté » → rougit
  `PayoutStoreAuthorizationTest` ×4), `…for_foreign_landlord` (bénéficiaire toujours admis → rougit
  `a_landlord_of_two_other_agencies_is_refused`).
- `BookingPaymentRefundAuthorizationTest::the_client_still_records_only_a_pending_payment` (statut forcé ôté → rougit
  `BookingPaymentTest::customer_created_payment_is_forced_pending`).
- `LocaleBearerTokenTest` : les deux préséances (préférence du compte avant tout → rougit
  `LocaleMiddlewareTest::header_wins…` et `query_param_overrides…`) ; le chemin Bearer gardé.
- `DocumentShareLinkPasswordTransportTest::le_mot_de_passe_dans_le_corps_ouvre_le_lien` (mot de passe jamais bon →
  rougit `DocumentShareLinkTest::password_protected_link_requires_password`). `…telecharge_et_compte` GARDÉ : il est
  le seul à vérifier le contenu servi.
- `PropertyTagsTest::sync_with_empty_array_clears_tags` (vide ne retire rien → rougit `…keeps_non_amenity_tags`).

### Interventions — trois fichiers versés, les transitions doublées

- `Api/MaintenanceAssignmentTest` → `Maintenance/MaintenanceAssignableProviderTest` (tiers refusé, prestataire qui a
  accepté planifie) ; `owner_can_assign_provider` retiré (règle `assigned_to` interdite → rougit
  `active_provider_is_assigned` et `team_member_is_assignable`).
- `Api/MaintenanceReportTest` → `MaintenanceRequestTest` (les deux tests de photos) ; `unrelated_user_cannot_report…`
  retiré (garde « personnel ou locataire » ôtée → rougit `unrelated_user_cannot_create…` et le jeu de données du bail).
- `MaintenanceStatusTest` : retirés `in_progress_to_completed` (→ rougit `owner_can_resolve…`), `to_cancelled_from_open`
  (→ rougit `owner_can_cancel…`), `from_cancelled` (→ rougit `Unit/…StateMachineTest::terminal_states_have_no_exit`).
  GARDÉ : `cannot_transition_from_completed_backwards` — `open` ajouté aux sorties de `completed`, rien d'autre ne
  rougit.

### `PropertySimilarTest::second_call_is_served_from_cache` — réécrit pour prouver le cache

- Il doublait le service par un mock et constatait deux appels (« le cache est testé plus bas »). Réécrit : vrai service
  derrière la route, un second voisin créé entre les deux appels sous `Property::withoutEvents` (l'observateur ne vide
  pas le cache) ; la seconde réponse reste celle de la première. `remember()` remplacé par le calcul direct → il rougit
  (avec les quatre autres tests du cache).

### Journal, métriques, garants, factures, hiérarchie

- `AuditLogTest` → `ActivityLogEndpointTest` : la route historique `/audit-log` (lue par l'onglet Historique du bail)
  et son filtre `log_name`, l'agence individuelle refusée — déplacés. Retirés : `only_admins…` (autorisation à `true`
  → rougit `non_admin_is_forbidden_on_canonical_route`, même requête de formulaire), `by_entity` (journal vidé →
  rougit `canonical_entity_route…` ×2).
- `Admin/SystemMetricsTest` → `Admin/SystemMetricsTrendTest` (un test déplacé, aucun retiré).
- `LeaseGuarantorListTest` → `LeaseGuarantorTest` (décor réécrit en aide `bailAvecLocataire()`) ;
  `list_guarantors_returns_attached_set` retiré (liste tronquée à un → rougit `un_garant_ajoute_est_rendu…`).
- `InvoiceTargetScopeTest` → `InvoiceTargetStatusAndRecipientTest`, réécrit sur son décor (bail étranger au même
  client : le refus ne peut venir que de l'agence) ; règle à `true` → il rougit.
- `PropertyAncestorsEndpointTest` → `PropertyHierarchyTest` ; `…isolated_property` retiré sans ablation : même entrée
  (`parent_id` nul) que `…root_property`.
- GARDÉS, contre le relevé : `PropertyFurnishedNullTest::la_creation_garde_un_meuble_explicite` (aucun autre test ne
  crée un bien meublé par l'API) et `PropertyListFilterByIdTest::un_id_illisible_rend_400` (garde ôtée sur `id` :
  `FiltreIdentifiantTest` reste vert — son balayage SAUTE les colonnes que garde `ExactIdentifierFilter` ; seuls ce
  test et celui des baux rougissent).

### Messagerie — deux doublons

- `ConversationContextCustomerFactsTest::le_client_lui_meme_ne_recoit_pas_la_fiche` (fiche toujours rendue → rougit
  `ConversationThreadContextTest::le_client_ne_recoit_jamais_de_cle_customer` et deux autres). La fusion des deux
  classes (deux décors, deux aides `fil()` de signatures différentes) n'est PAS faite.
- `GroupConversationCreationTest::direct_conversation_path_still_works` (type par défaut basculé en groupe → rougit
  neuf tests de `ConversationTest`, dont `la_directe_existante…_est_rendue`).

### Réservations, factures, documents, CRM — les lignes ALLEGER

- `BookingTest::owner_can_reject_booking` retiré (statut `rejected` non écrit → rougit `BookingRejectionMessageTest`).
  GARDÉS contre le relevé : `owner_can_confirm_booking` et `owner_can_cancel_booking` (statut `confirmed` non écrit,
  motif d'annulation non écrit : `BookingGestesTest` et `BookingWriteMatchesShowTest` restent verts — ils ne relisent
  pas le statut écrit) et `end_date_before_start_date…` (`after_or_equal` ôté : rien d'autre ne rougit).
- Validation (réponse du porteur : l'ablation tranche) : `BookingPaymentTest::invalid_payment_type…`,
  `DocumentTest::missing_file…` et `invalid_type…` — règle ôtée, aucun autre test ne rougit : GARDÉS, et durcis
  (`assertJsonValidationErrors` sur le champ : ils ne vérifiaient qu'un 422, d'où qu'il vienne) ; chaque règle ôtée
  les rougit désormais.
- `CustomerTest::can_update_customer_pipeline_stage` retiré (`pipeline_stage` interdit → rougit `CustomerPipelineTest` ×2).
- `InvoiceTest` : retirés `cannot_send_non_draft` (garde d'écriture `envoyable` à `true` → rougit
  `InvoiceNumberingTest::m5` et deux autres), `cannot_mark_cancelled_invoice_paid` (`encaissable` → rougit m5),
  `cannot_cancel_paid_invoice` (`annulable` → rougit m5), `agency_user_can_issue` (création fermée → rougit
  `InvoiceStoreAuthorizationTest::an_agent_creates` ; TVA à zéro → rougit `the_tax_is_rounded…` et un autre : le
  calcul 18 % reste gardé), `random_user_cannot_issue` (création ouverte → rougit `InvoiceStoreAuthorizationTest` ×3).
- `PaymentDriverTest` GARDÉ entier : `PaymentAmountScaleTest` ne vérifie que le montant ; l'en-tête `Authorization`,
  le point d'appel et la lecture `transactionId`/`checkoutUrl` ne sont vérifiés que là.

### Espace « Démarrer » et rôle de l'agent

- `Me/AgentRoleCapabilitiesDeniedTest` → `Me/AgentRoleCapabilitiesTest` (deux tests et leurs aides versés, aucun retiré).
- `Me/DemarrageEtapesParPieceTest` → `Me/EspaceDemarrageTest` : la société vérifiée versée (réécrite sur les aides de
  la classe) ; retirés les quatre autres (bailleur, agent, prestataire, admin), chacun égal à un test de la classe.
  Mutations rougies dans `EspaceDemarrageTest` : pièce facultative en étape (bailleur, prestataire), ordre des pièces
  inversé (bailleur, agent, société), `kyc` d'agence perdu (sept tests dont `une_agence_neuve…`), `verified` lu
  `envoyee` (agent, société), pièce manquante comptée faite (cinq tests).
- `Me/EntryIntentProfessionalTest` → `MeUpdateTest` NON fait : `MeUpdateTest` est en cours de modification dans
  l'arbre (non commitée, hors de ce ticket).

### Clients — `CustomerCrmTest`, le doublon du PATCH `pipeline-stage` (second agent)

- Retiré : `update_pipeline_stage` (écriture du stage ôtée dans `updatePipelineStage` → rougit
  `CustomerPipelineTest::update_to_lost_via_pipeline_stage_endpoint_creates_note`).
- GARDÉ : `invalid_pipeline_stage_returns_422` — `Rule::enum` ôté de `UpdatePipelineStageCustomerRequest`, aucun test
  restant ne rougit (le seul autre envoi d'une étape inconnue, `AuthorizationPrecedesValidationTest`, est un 403).
- `CustomerTest::can_update_customer_pipeline_stage` (retiré par le premier agent) : règle `pipeline_stage` ôtée
  d'`UpdateCustomerRequest` → rougit `CustomerPipelineTest::update_to_converted_with_reason_creates_customer_note`.

### Paiements — `PaymentDriverTest` (2/5)

- Retirés : `wave_driver_initiate_calls_api_with_correct_payload` et `orange_money_driver_initiate_calls_api`. Le montant
  et la devise sont à `PaymentAmountScaleTest` ; le reste a sa mutation : jeton Wave faussé → rougit
  `PaymentGatewayInitiateTest::initiate_only_uses_agency_scoped_integration` ; identifiant de session Wave faussé →
  rougit `owner_can_initiate_wave_checkout` (+ `webhook_compare_au_montant_fige…`) ; URL de paiement Wave figée → rougit
  `owner_can_initiate_wave_checkout` ; `pay_token` Orange faussé → rougit `owner_can_initiate_orange_money_checkout`.

### Historique des paiements — `PaymentHistoryExportTest::d1_*` (1/3)

- Retiré : `d1_la_coupe_sur_le_retard_suit_les_jours_de_retard`. Ses règles, mutées dans `PaymentHistory::orderForCut`,
  rougissent `PaymentHistoryCutOrderTest::une_coupe_a_k_lignes…` : date d'une échéance impayée sans `period_start`,
  restitution de caution comptée en retard, statut dû ignoré.
- GARDÉS, l'ablation les trouve seuls : `d1_la_coupe_sur_le_reste_du…` (remboursé ignoré sur une ligne `paid` : le décor
  de `CutOrderTest` reste vert, lui seul rougit) ; `d1_une_coupe_garde_les_premieres_lignes…` (le tri inconnu ramené à
  `date` croissant : lui seul rougit, `CutOrderTest` ne balaie que les dix tris connus).
- Vu au passage : la condition « reste dû > 0 » de `daysLateSql()` ôtée, ni `CutOrderTest` ni les `d1` ne rougissent.

### CRM — six regroupements, trois retraits

- `CustomerLastContactedTest` → `DernierContactEtSonCanalTest` : déplacés le geste sur la demande convertie (journal),
  le geste sur la fiche (journal), la demande non convertie. Retirés : note, visite terminée, compte rendu (chaque appel
  à `touchCustomer` ôté → rougit le `ac3_…` correspondant, qui part d'un canal différent et vérifie aussi le canal),
  `le_dernier_contact_ne_recule_pas` (garde `last_contacted_at <` ôtée → rougit `ac2_un_contact_plus_ancien…`).
- `CustomerSortByReferentTest` et `CustomerSortByStageTest` → `CustomerReferentFilterTest`, réécrits sur son décor (le
  collègue nommé « aminata » en minuscule) ; les deux tests du tri par étape fondus en un. Collation `C` → rougit
  `sort_referent_par_nom…`.
- `CustomerListQueryCountTest` et `SuggestedStageQueryCountTest` → `CustomerIndexQueryBudgetTest` (chacun dans son
  agence ; aucun retrait).
- `FicheDUnCompteSansNomTest` → `CustomerServiceCreateTest` (un test déplacé).
- `FicheDuCandidatRattacheeTest` → `FicheDeCandidatureDansLAgenceDuBienTest` : déplacés l'e-mail vérifié et la fiche
  déjà liée (garde `whereNull('user_id')` ôtée → il rougit). Retirés : le téléphone vérifié (téléphone comparé faux →
  rougit `la_fiche_de_l_agence_du_bien_se_rattache_sur_une_coordonnee_verifiee` ; NB : ôter la clause téléphone ne
  rougissait rien, la clause vide rattachant n'importe quelle fiche) et « sans coordonnée vérifiée » (vérification
  ignorée → rougit `sans_coordonnee_verifiee_aucune_fiche…`).
- `TaskDueListFilterTest` → `TaskDueFilterTest` (une tâche du jour faite ajoutée au décor) ; `les_valeurs_seules…`
  fondu (les singletons y sont, l'union `upcoming,none` versée dans `ac2_…`). Seule la première période lue → rougit
  `ac2_une_liste_rend_l_union…` et `la_liste_se_combine…`.
- `CustomerNoteKindTest::no_french_prefix_is_left_in_the_application_code` (lecture du source) retiré : préfixe
  « Perte : » remis dans `pinStageNote` → rougit `losing_by_the_pipeline_stage_endpoint…` et `converting_by_update…`.
  GARDÉS : les tests de migration (`CustomerNoteKindTest`, `CustomerIdNumberEncryptionTest`) — seule garde de leur
  migration, ils peuvent rougir.

### Agenda, contexte du fil, intention d'entrée — les trois fusions à décor

- `Calendar/CalendarBookingEventTest` + `Calendar/CalendarVisitEventEnrichedTest` → `Calendar/CalendarVisitRankTest`, sur
  un seul décor (agence, agent, bailleur, bien, fiche ; aides `adresse`, `sejourDe`, `visiteDAbdoulaye`, `evenements`
  par `key`). Les deux tests N+1 fondus en un, sur un agenda qui sert les deux types : client du séjour non chargé →
  il rougit ; adresse de la visite non chargée → il rougit.
- `ConversationContextCustomerFactsTest` → `ConversationThreadContextTest` : les sept tests versés, leur décor propre
  (horloge du 15 novembre, demande du 2, projet de la fiche) posé par l'aide `avecLaDemande()` sur celui de la classe.
  Mutations rougies dans la classe : visite d'une autre agence comptée (`la_visite_d_une_autre_agence…`), visite annulée
  comptée (`l_agent_lit_les_faits…`).
- `Me/EntryIntentProfessionalTest` → `Me/MeUpdateTest` : un fournisseur `intentions` (search, publish, skipped,
  professional) porte la mémorisation (relue aussi par `/auth/me`) et « ne crée aucun profil » ; retirés
  `passer_la_question…` (absorbé) et `une_autre_valeur_reste_refusee` (vocabulaire ouvert → rougit
  `une_intention_inconnue…`). `professional` retiré de la règle → rougit les deux cas `professional`.

### Public — neuf regroupements, quatre retraits

- `PropertyContactTest` → `PublicContactEndpointTest` : le 404 d'un brouillon déplacé ; `returns_phone_only` retiré
  (une clé `message` ajoutée à la réponse → rougit `principal_second_puis_sur_place` et cinq autres `assertExactJson`).
- `PropertyDetailTest::returns_full_property_detail` : ses clés (`title`, `slug`, `price`, `bedrooms`, `area`,
  `description`) versées dans la structure de `show_returns_enriched_public_detail`, qui ne les vérifiait PAS — le relevé
  le disait subsumé à tort.
- `PublicBookingWritesKindTest` → `PropertyBookingRequestTest` : la nature, la validité, le prix affiché et `metadata`
  versés dans `sale_property_creates_offer_booking`, `a_long_term_application…` et `daily_rent_stores…` (3 tests de moins,
  aucune assertion perdue).
- `PublicNeighborhoodsTest` → `PropertyNeighborhoodsTest`, les TROIS déplacés : `la_graphie_la_plus_frequente…` n'est pas
  couvert (une règle « la non-capitale d'abord » passe `a_egalite…` et `variantes_de_casse…`, aucune n'a une capitale
  majoritaire).
- `ReviewAuthorNameTest` → `NomDeLAuteurDAvisTest` : les deux auteurs sans nom fondus en un test ; « Awa N. » retiré
  (initiale ôtée de `NomPublic` → rougit `la_fiche_de_bien_nomme_l_auteur…` et trois autres).
- `VisitRequestResponseShapeTest` : son assertion versée dans `PropertyVisitRequestTest::authenticated_visit_request…`
  (`toArray()` au lieu de `resolve()` → il rougit).
- `ReferentielPublicCacheTest` → `CataloguePublicCacheTest` ; `PublicAgencyIsVerifiedTest`, `PublicAgencyLogoTest`,
  `PublicAvatarDeLaFicheTest` → `PublicProfileTest` ; `PublicAgencyTeamAgentsOnlyTest` → `PublicRoleTest` (relevé en
  doute : rien retiré).
- GARDÉ : `PropertyContactLeadTest::un_agent_utilisateur_multioctet…` — `ContactLeadService` coupe l'agent utilisateur à
  DEUX endroits ; `substr` sur celui de la demande de contact, `PropertyContactClickTest` reste vert (il ne rougit que
  sur celui du clic). Les tests de migration du même fichier gardés aussi.
- Non faits : les `no_auth_required` / `endpoint_is_public` (recensement de TCK-3015) ; `PropertyMapTest` (ses quatre
  bornes invalides en fournisseur ne retireraient aucun cas ; `map_caps…` est une COUTURE, TCK-3014) ;
  `HomepageDiscoveryTest` (en doute).

### Radar — trois regroupements, quatre retraits sans ablation, et le relevé démenti

- `RadarModelsTest` : retirés sans ablation les trois tests de fabrique (`extracted`, `verified`/`confirmed`, `reviewed` :
  du code de test) et `la_config_des_relances` (une valeur de configuration lue telle quelle). GARDÉS : les valeurs des
  énumérations (stockées en base et lues par le front), la déclaration des filtres, les objets de la migration (seule
  preuve de l'index partiel).
- `RadarBackfillSimilarityTest` → `RadarTextSignalTest` ; `RadarCrawlDiscoveryApiTest` → `RadarCrawlApiTest` (les deux
  lectures de la console fondues en une, le refus au support versé dans `le_support_lit_les_passages…`) ;
  `RadarWhatsappDeliveryErrorCodeTest` → `RadarWhatsappReceiptTest` (les neuf cas déplacés : aucun n'est rejoué par
  le fichier d'accueil, qui ne pose qu'un code entier valide).
- `RadarListingReviewTest` : les quatre retraits du relevé REFUSÉS — garde du doublon de soi-même ôtée, garde du lien
  entrant ôtée, garde du corps vide ôtée : chaque fois, le test candidat est le SEUL des 70 à rougir.
- `RadarEmbeddingsTest` : rien retiré — la classe de données d'un usage d'IA et la déclaration de non-entraînement sont
  des règles de confidentialité, et les deux replis « vecteur manquant » visent deux annonces différentes.
- Non faits : `RadarAvailabilityCheckSousMandatTest` (la publication sous mandat doit tourner avant le `Queue::fake()`
  que pose le `setUp()` de la classe d'accueil) ; `RadarSourceWatchCrawlTest` (l'accueil sert une page de plus et
  `crawl()` n'y a pas la même signature) ; `RadarClaimTest`, `RadarMandateTest`, `RadarUrlFetcherTest`,
  `ExtractionNormalizerTest` (en doute) ; `ExtractRadarListingTest` (pas relu par ce second passage).

### Notifications — deux regroupements, quatre retraits

- `CompteNonJoignableTest` → `RienPourUnCompteNonJoignableTest` : le cas `NotificationService::send()` + `via()`
  déplacé. Retirés : `le_blocage_lui_est_encore_annonce` (`AccountBlocked` ôté des avis du compte → rougit
  `les_avis_du_compte_atteignent_encore_un_compte_bloque`) et le témoin `un_compte_actif_recoit…` (envoi coupé pour
  TOUT compte dans `send()` → rougit huit tests de `NotificationFiltersTest`, qui émettent par `send()`).
- `NotificationTotalParFamilleTest` → `NotificationFiltersTest` : les deux cas propres déplacés, « sans notification »
  fondu dans `sans_non_lue_par_famille…` (mêmes lieux, mêmes assertions).
- `NotificationDigestMailTest::does_not_include_critical_notifications` (filtre `isCritical` ôté → rougit
  `DigestBuilderServiceTest::excludes_critical_notifications` ; garde du résumé vide ôtée → rougit
  `does_not_send_when_no_unread_notifications`).
- `NotificationTargetAgencyTest::le_fil_rend_l_agence_de_la_cible` (agence de la cible faussée → rougit
  `AgenceDeLaCibleTest::l_agence_stockee_passe_la_meme_porte` et sept autres).

### Recherche — deux allègements prouvés, deux paramétrages, et le relevé à moitié démenti

- `MaintenanceRequestSearchTest::…is_typo_tolerant` et `UserSearchTest::…is_typo_tolerant_for_agency_admin` retirés :
  le modèle forcé sur le repli SQL (`rechercheParLaBase()` → `true`) rougit AUSSI `…ranks_by_relevance_not_by_date`,
  dont les fautes de frappe ne se trouvent que par le moteur. Les tests de pertinence, eux, sont GARDÉS : le
  `defaultSortsWithRelevance()` du contrôleur ôté, chacun est le seul à rougir — ce n'est pas « le mécanisme générique
  déjà éprouvé », c'est le câblage de chaque contrôleur.
- `AgencySearchTest` : même preuve (la faute ne rougit pas seule), mais la ligne du relevé dit « doute » : rien retiré.
- `PropertyGeoSearchTest` : neuf refus (point incomplet, hors bornes, rayon nul, négatif, au-delà du plafond, sans
  point, tri par distance sans point) en un `DataProvider` ; `RechercheParVillesTest` : les deux formes de `cities` en
  un test.
- GARDÉS contre le relevé : `SearchIdCapIndexSettingsTest::le_plafond_des_contacts…` (le plafond de la messagerie à
  1000 ne rougit aucun des 44 tests de `MessagingContacts*`) ; `SavedSearchCriteriaVocabularyTest::la_fabrique_et_le_seeder…`
  (seule garde du vocabulaire du seeder, et les tests de seeders sont hors de ce passage). `MessageSearchTest` : doute.

### Journal, connexion, crédits, tableau de bord — six regroupements

- `CauseurSansEmailDansLExportTest` + `RoleDuCauseurDansLExportTest` → `CauseurSupprimeDansLExportTest` (les colonnes
  `causer_*` des deux exports, même décor) ; les deux cas « compte supprimé » (agence, console) en un, sur les deux
  exports.
- `AuthLoginCaseInsensitiveTest` : `login_matches_all_caps_email` retiré (le repli de casse de `LoginRequest` ôté →
  rougit `login_matches_email_case_insensitively`) ; `existing_user_update_normalizes_email` retiré (même
  `setEmailAttribute` que `user_model_mutator_normalizes_email`).
- `AuthMeRolesTest` → `AuthMeRolesAgenceActiveTest` : le super-admin sans agence déplacé ; le rôle d'agent est jugé
  là, au rôle près (`['agent', 'customer']`). Le 401 était déjà parti (TCK-3015).
- `PhoneVerificationTest` : hors E.164, incomplet, trop long en un `DataProvider` (même décor, mêmes assertions).
- `CreditBalanceEndpointTest` → `CreditsApiTest` : les deux refus en `DataProvider` sur les deux routes.
- `DashboardMeRoutingTest` → `DashboardMeTest` : l'agence `individual` déplacée, « sans fiche client » versé dans
  `an_account_with_no_other_role…` (même décor), « agence standard » retiré (= `agency_admin_resolves_to_agency…`).
- `DashboardOwnerTest::occupancy_rate_is_null…` retiré (taux à `0.0` au lieu de `null` → rougit
  `OwnerOccupancyBaseTest::the_base_is_zero…` et `DashboardMeTest::owner_occupancy_is_null…`).
- GARDÉS : `AccountDeletionStepUpTest::activity_log_records_the_password_mode…` (seul à lire `step_up = password` ; le
  test d'en face ne lit que le causeur) ; `BoostModelsTest::relations` (`Property::boosts()` et
  `Agency::creditLots()` ne sont appelées par aucun code de `app/` : ce test est leur seul lecteur) ;
  `AuthProfileTest`, `SuperAdminInvitationLifecycleTest` (401 hors périmètre, verrou en doute).

### Interventions, messagerie, équipements — cinq regroupements, le relevé démenti deux fois

- `MaintenanceAcceptOnCompletedTest` → `MaintenanceAcceptDeclineTest` : les trois cas déplacés. Le témoin
  `an_unaccepted_in_progress_request_stays_acceptable` est GARDÉ : le 409 élargi à tout statut autre qu'`assigned`
  ne rougit que lui (`assigned_provider_accepts` ne joue que l'état `assigned`).
- `ProviderWeekFilterTest` → `MaintenanceScheduledRangeFilterTest` (même filtre, même lecture à l'heure de Dakar) :
  déplacé tel quel, il est le seul à poser la demande sans créneau et l'autre prestataire de la MÊME agence.
- `FilFermeEcritureTest` → `FilFermeALaSuppressionTest` (passé sur `ApiTestCase`) : la règle y est jugée sur le
  service, l'envoi refusé et `abilities.can_send_message` par HTTP ; les deux cas déplacés.
- `FilSansMessageEnFinDeBoiteTest` → `ListeDeLaBoiteTest`, à côté des autres ordres de la boîte.
- `TagSyncReindexTest` → `TagSyncIndexFilterTest` : `un_bien_public_reste_indexe…` absorbé par
  `rattacher_un_equipement_rend_le_bien_public_trouvable…` (il ne lisait que la présence dans l'index, où le bien
  était déjà depuis sa création) ; `retirer` déplacé.
- GARDÉS contre le relevé : `MaintenanceStatusChangedEventTest::the_only_maintenance_request_observer…`
  (`insertOrIgnore` → `insert` dans l'observateur ne rougit que lui, sur 31 tests de factures et d'événements) ;
  `SalleUniqueTest::aucune_violation_d_unicite…` (seule garde du piège PostgreSQL n° 1 dans le code des salles) ;
  `GestesEtRetardTest` (décor `SceneDEngagement`, que la boîte ne monte pas) ; `MaintenanceAcceptWithSlotTest`
  (doute) ; les trois `*FieldLengthTest` (cible `BornesMaxFaceAuSchemaTest`, garde de recensement hors périmètre).

### Validation, schéma, invitations, visites, assistants de test — fin du second passage

- `AccountAndProfileValidationTest`, `AdminConsoleValidationTest`, `PropertyDomainValidationTest` : les 16 cas
  « triviaux » sont tous GARDÉS. J'ai ablaté 31 règles une par une (`required`, `boolean`, `array`, `string`, `in:`),
  en jouant chaque fois tous les fichiers qui visent la route, sauf celui qu'on juge. Chacun de ces 16 tests porte au
  moins une règle qu'aucun autre ne voit : `required` de l'oubli de mot de passe, `boolean` des préférences, `required`
  de la sourdine, nom et critères à la création d'une recherche, `string`/`boolean` à sa modification, les six règles
  des intégrations, `metric`, `sample_data`, `enabled`, `order`, `reason`, `failed_reason`, `user_id` du référent,
  `property_id`/`notes` du favori. Seules quelques règles se recoupent ailleurs (format de l'adresse, `boolean` de la
  sourdine, `notification_frequency`, `order.*`) : ça ne suffit à retirer aucun test entier.
- `AddOwnersUpdateToCustomAgencyAdminRolesTest` → `AddPaymentsReconcileToCustomAgencyAdminRolesTest` : les deux
  migrations jumelles dans un `DataProvider` (migration, capacité).
- `ProfileSchemaTest` : unicité bailleur/agent en `DataProvider`. `broker_tables_are_gone` est retiré, car le `down()`
  du test suivant commence par `Schema::create` et lèverait si les tables existaient encore.
  `profile_tables_exist…` est GARDÉ : aucune écriture de profil ne lit `employer`, `rib` ni `tax_id`.
- `Http/Requests/BaseFormRequestTest` → `BaseFormRequestNormalizationTest` : `authorize_defaults_to_false` déplacé ;
  `trims…` et `recurses…` retirés. L'ablation dit pourquoi : ôter le `trim`, la mise à `null` ou la récursion de
  `BaseFormRequest::normalize()` ne rougit NI l'ancien fichier NI la cible (8 tests). `TrimStrings` et
  `ConvertEmptyStringsToNull` ont déjà normalisé le corps avant la requête de formulaire. Aucun test ne garde donc
  `normalize()` par HTTP, et ces deux tests ne gardaient rien.
- `ListeParLEmetteurEncoreMembreTest` → `LectureParLEmetteurEncoreMembreTest` : chacun des quatre cas lit ET liste
  (deux tests économisés).
- `VisitRemindersSkipUnfixedTest` → `VisitWindowConfirmationTest`, déplacé tel quel. Le test d'accueil sur le rappel
  ne pose pas d'état « confirmée à tranche », et ne peut donc pas voir la garde.
- `MediaUrlGenerationTest::le_generateur_d_url_est_celui_de_spatie` retiré : c'est une valeur de config relue, et les
  trois tests d'URL rougiraient sous un générateur qui réécrit.
- `TestCaseHelpersTest` : quatre retraits, chacun avec son ablation dans `TestCase::actingAsRole`. Option `agency`
  ignorée → 4 rouges dans `CreditsApiTest` et `MaintenanceRequestSearchTest`. `agency_id` ignoré → 11 rouges dans
  `PropertyModerationTest`, `MemberProfileRestoreTest` et `TeamFormationBoundaryTest`. `customer` doté d'une agence →
  3 rouges. Profil non matérialisé → 2 rouges. GARDÉ : `prefers_agency_model_over_agency_id_on_conflict`, que nulle
  part la suite ne passe.
- GARDÉS : `CommissionEntryApiTest::ac13_*` (les seuls à lire `meta.totals.due` par portée : de l'argent, et la
  portée de la somme est un `clone $base` distinct de la liste) ; `PaymentReceiptPdfTest::the_bypassed_template_is_gone`
  (pierre tombale : elle relève du recensement des retraits) ; `SocleAgentProviderOptionsTest` (l'octet du corps
  envoyé, en doute) ; `RattachementParInvitationTest` et `AccountBlockSingleRouteTest` (cible
  `RoutesEnDoubleRetireesTest`, recensement) ; `SearchRelevanceSortTest` (remplacer l'épingle SQL demande un tri réel
  sur PostgreSQL, c'est un test neuf) ; `LangGroupParityTest` (garde de recensement) ; les lignes `no_auth_required` /
  `endpoint_is_public` (hors périmètre).
