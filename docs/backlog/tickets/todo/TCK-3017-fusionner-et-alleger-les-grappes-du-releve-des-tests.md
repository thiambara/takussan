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
