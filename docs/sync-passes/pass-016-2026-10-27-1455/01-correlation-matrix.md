# Passe 016 — Matrice de corrélation (différentielle)

**Périmètre.** Cette matrice ne contient que les unités re-mesurées :

- les lignes de `features.md` ajoutées ou modifiées depuis la passe 015 ;
- les sections de `models-spec.md` modifiées depuis la passe 015, ou visées par une migration
  ajoutée depuis.

**Toute autre unité garde son statut de la [matrice 013](../pass-013-2026-10-14-1023/01-correlation-matrix.md)**,
corrigé par les matrices [014](../pass-014-2026-10-14-2220/01-correlation-matrix.md) et
[015](../pass-015-2026-10-19-2229/01-correlation-matrix.md).

Les numéros de ligne sont ceux de `features.md` sha1 `6c7fa86e`. Le statut « 015 » d'une ligne
modifiée est celui de son ancien numéro (colonne « ex- »).

## Synthèse

| Axe | ✅ | ⚠️ | ❌ | Δ vs 015 |
|-----|----|----|----|----------|
| Features → Modèles (412 lignes) | 332 | 79 | 1 | +17 / +12 / 0 (l.91, 227, 228 ✅ ; 29 neuves : 14 ✅, 15 ⚠️) |
| Modèles → Features (106 sections) | 73 | 33 | 0 | +4 / +2 / 0 (8 ⚠️ → ✅, 7 ✅ → ⚠️, 6 neuves : 3 ✅, 3 ⚠️) |

## A. Features → Modèles — lignes re-mesurées

### A.1 — Lignes modifiées

| L. | ex- | Prio | § | Statut 015 | Statut 016 | Support mesuré | Reco |
|---|---|---|---|---|---|---|---|
| 91 | 89 | P1 | §1.1 | ⚠️ dérive (FA1) | **✅** | Rôle sans permission propre : exact (§8 `role`, aucune colonne de permission). La part de commission réservée à `leases.create` est dans §8 `commission_share` (TCK-2364) | FA1 soldée |
| 191 | 188 | P1 | §1.4 | ✅ | ✅ | Échéance de caution à l'activation : §15 `payment_type = deposit` | — |
| 193 | 190 | P1 | §1.4 | ✅ | ✅ (note) | « Au plus une fois » et activité d'exploitation : journal d'activité (§13). La langue d'un locataire sans compte est désormais `customers.locale` (§7), ce que FA7 (013) attend toujours côté catalogue | FA7 |
| 200 | 197 | P1 | §1.4 | ✅ | ✅ | Restitution bornée à la caution encaissée : §15 et §28 (`payee_role = tenant`) | — |
| 202 | 199 | P2 | §1.4 | ✅ | ✅ | Bail renouvelé sans garant : §14 | — |
| 209 | 206 | P1 | §1.4 | ⚠️ (C14) | ⚠️ | Les ajouts de TCK-2368 sont décrits en §50 (`first_payment_at`, `reminders_sent`, bail renouvelé, réouverture). C14 (013) reste : le drapeau d'agence est décrit à l'envers, `reminders_sent` écrit NOT NULL | C14 |
| 219 | 216 | P1 | §1.5 | ✅ | ✅ | Avoir reprenant les lignes : §25 | — |
| 223 | 220 | P1 | §1.5 | ✅ | ✅ | Relevé conservé : §101 `OwnerStatementSnapshot`, exact | — |
| 227 | 224 | P2 | §1.5 | ⚠️ dérive (FA3) | **✅** | Wave, Orange Money, Lemon Squeezy ; Free Money et Stripe sans pilote : conforme à §31 | FA3 soldée |
| 228 | 225 | P2 | §1.5 | ⚠️ dérive (FA3) | **✅** | Wave / Orange Money : §84. La fenêtre de quittance lit désormais `lease_payments.marked_paid_at` (TCK-1342), absent de §15 : défaut de la spec, pas de la ligne | ME4 |
| 231 | 228 | P2 | §1.5 | ⚠️ (C13) | ⚠️ | `payments.reconcile` est à l'inventaire des capacités. Reste C13 (§41 : quatre cibles du rapprochement), plus `duplicate_of_line_id` (TCK-1919) et le rapprochement des virements de la plateforme (TCK-1421), absents de §41 et §45 | C13, ME7, ME8 |
| 277 | 272 | P1 | §1.7 | ✅ | ✅ | Fiche supprimée qui ne relie plus : `customers.deleted_at` (§7) | — |
| 282 | 277 | P2 | §1.7 | ✅ | ✅ | 422 sur `maintenance_request_id` d'un groupe créé à la main : §21 `conversation()` le dit | — |
| 314 | 308 | P3 | §1.8 | ✅ (signal FB7) | ✅ (signal FB7) | Annulation de la facture d'une intervention rouverte : §77, exact (`ReopenedRequestBills`, TCK-2270). La priorité P3 d'une fonction livrée reste (FB7) | FB7 |
| 383 | 371 | P2 | §1.10 | ✅ | ✅ | Version active servie, vérification vidée : §22 (TCK-2300) | — |
| 438 | 426 | P0 | §1.12 | ✅ | ✅ | `POST /api/agencies` retirée : sans effet de schéma | — |
| 486 | 473 | P1 | §2.1 | ✅ (note FD1) | ✅ | FD1 appliquée ; §7, §27, §34 décrivent les colonnes chiffrées | FD1 soldée |
| 603 | 587 | P1 | §2.5 | ✅ | ✅ | Ouverture à `reports.view_agency` : inventaire des capacités | — |
| 641 | 623 | P1 | §2.6 | ✅ (note FD1) | ✅ | FD1 appliquée | FD1 soldée |
| 686 | 667 | P0 | §2.9 | ✅ | ✅ | Numéro du gérant cherché parmi les numéros vérifiés : §1 `users_phone_verified_unique` | — |

**Prose re-lue :**

- §1.8, « le demandeur dont le bail a pris fin » : aucun schéma ;
- §2.1, onboarding : conforme aux enums de statut décrits en §34, §35, §37, §98 (FB8 soldée) ;
- §2.3, l'émetteur d'un SMS ou WhatsApp : conforme à §69 `agency_id`, `integration_id` (TCK-2326).

### A.2 — Lignes neuves hors socle IA et Radar

| L. | Prio | § | Statut 016 | Support mesuré | Reco |
|---|---|---|---|---|---|
| 189 | P1 | §1.4 | ✅ | Bail depuis une candidature : §5 `status` (passage à `completed`), §14 `booking_id` (TCK-2352) | — |
| 253 | P1 | §1.6 | ✅ | Invitation du client d'une fiche : §48 (`invitable_type = Customer`, rôle `tenant`), Règle 1 (TCK-2351) | — |
| 254 | P1 | §1.6 | ✅ | Fiche de l'agence du bien : Règle 1 (TCK-2350) | — |
| 283 | P2 | §1.7 | ✅ (signal) | Aucun schéma requis. **La ligne est fausse au regard du code** : « ⚠ Au 2026-10-23, la règle n'est pas appliquée », alors que `GuardsConversationScope::guardLeaseReaders()` l'applique depuis TCK-2191 (`d96e36f4a`) | FE3 |
| 441 | P1 | §1.12 | ✅ | Taux de commission de l'agent : §35 `commission_rate` (TCK-2364) | — |
| 518 | P0 | §2.2 | ✅ | Entrée dans l'équipe par l'invitation seule : §48 (P242.01 à P242.03) | — |
| 563 | P1 | §2.3 | ✅ | Compte bloqué ou supprimé : §1 `status`, aucun schéma de plus | — |
| 621 | P3 | §2.5 | ✅ | Tuiles du tableau de bord d'agence : §64 « Lecture » (TCK-2373) | — |
| 638 | P1 | §2.6 | ✅ | Journal d'audit réservé à `reports.view_agency` : §13, inventaire des capacités | — |
| 642 | P1 | §2.6 | ✅ | Purge par famille : §13 « Conservation » (TCK-2342), listes identiques | — |

### A.3 — §2.11 Socle IA

| L. | Prio | Statut 016 | Support mesuré | Reco |
|---|---|---|---|---|
| 748 | P1 | ✅ | Chaîne par rôle : §102 `ai_role_assignments` (repli sur `config/ai.php`) ; modèle forcé : §103 `forced_provider` / `forced_model`. Second facteur récent : routes `admin-ai`, `ProtectedActions::STEP_UP`. Journal : `activity('Admin')` des contrôleurs (§13) | — |
| 749 | P1 | ✅ | Évaluation : §106 (verdict, `below_baseline`). La dérogation est journalisée (`override_reason` dans le journal d'activité, `AiRoleController`) | — |
| 750 | P1 | ✅ | Aucune table requise : les clés vivent dans l'environnement, le catalogue des fournisseurs en code (`AiProviderCatalogue`) | — |
| 751 | P1 | **⚠️** | Le plafond **par usage** et le coupe-circuit sont en base (§103). Les plafonds **global journalier** et **par agence** ne sont réglables que par la configuration (`ai.budgets.daily_global_xof`, `ai.budgets.daily_per_agency_xof`, lus par `AiBudget`), et la spec ne les mentionne pas. La ligne, rangée parmi les gestes de console, laisse lire qu'ils s'y règlent | FE1, ME15 |
| 752 | P1 | ✅ | Coût, latence et issues : §104 ; taux d'acceptation : §105 ; dernier score : §106. Le tableau de bord compte des issues, il n'affiche aucun `error_code` | — |

**Règles de gestion :**

- conformes au schéma : aucun nom de modèle en code, IA qui propose, donnée sensible refusée (§104
  `refusal_reason = sensitive_data`), agence comme frontière (§104 `agency_id`) ;
- « l'usage qui le lit n'a aucun outil d'écriture » est **plus faible que le code**. Un usage qui lit
  un contenu externe n'a **aucun** outil, et ne rend qu'une sortie structurée (`ExternalContentPolicy`,
  TCK-2398). Le contenu arrive dans un bloc délimité, à balise imprévisible. → FE2.

### A.4 — §2.12 Radar

| L. | Prio | Statut 016 | Support |
|---|---|---|---|
| 776 → 785 | P1 (10 lignes) | ⚠️ justifié | Aucun modèle, et c'est attendu : ADR-0077 accepté, TCK-2386 → TCK-2391 `todo`. Tables prévues : `radar_advertisers`, `radar_listings`, `radar_outreaches`, `radar_outreach_listing`, `radar_consents` (ADR-0077, plan du 2026-10-26). Sections à écrire dans la PR de chaque modèle |
| 786 → 788 | P2 (3 lignes) | ⚠️ justifié | Idem, TCK-2392 → TCK-2394 `todo` |
| 789 | P3 | ⚠️ justifié | Idem, TCK-2395 `todo` |

### Lignes non re-mesurées citées

| L. | Statut | Note |
|---|---|---|
| 559 (ex-545) | ❌ | Notifications push : FB1, inchangée |
| 695 | ✅ | Healthcheck : « âge de la file, battement des workers » couvre la file `long` (TCK-2401) sans la nommer ; aucune reco |

## B. Modèles → Features — sections re-mesurées

| § | Modèle | Statut 015 | Statut 016 | Mesure (migrations lues dans le code) | Features |
|---|---|---|---|---|---|
| 1 | User | ⚠️ | **✅** | C2 appliquée : nullabilités, longueurs, clés de `metadata`, relations sous leur nom réel ; `customer()` dite retirée (TCK-2372) | l.86, 486, 563, 686 |
| 2 | Agency | ⚠️ | **✅** | C4 appliquée : `settings` fusionné et son catalogue, motif de suspension au journal, `LemonSqueezyBillable` | l.438, 441 |
| 3 | Property | ⚠️ (mineur) | ⚠️ (mineur) | MD7 soldée : `pending_owner_profile_id` existe (`2026_10_25_120000`, FK `nullOnDelete` conforme), TCK-997, 999 et 1000 dits faits. Restent C19 (types `smallint`) et l'index `properties_pending_owner_profile_idx`, omis. La prose de `user_id` répète « trois voies » deux fois | l.92-94 |
| 5 | Booking | ✅ | ✅ | `status` passe à `completed` à la création du bail ; `lease()` dite retirée | l.189 |
| 6 | BookingPayment | ⚠️ (mineur) | **✅** | MD4 appliquée (index `transaction_id`) | l.154-160 |
| 7 | Customer | ⚠️ | **✅** | MD1 appliquée : `id_number` chiffré, `locale`, index `user_id`, « Données sensibles » | l.246-259, 486 |
| 8 | PropertyCollaborator | ✅ | ✅ | `commission_share` réservée à `leases.create` (TCK-2364) | l.91 |
| 11 | Review | ✅ | **⚠️** | L'index `reviews_author_context_uniq` a été **remplacé** par `reviews_author_subject_context_uniq (author_id, reviewable_type, reviewable_id, context_type, context_id) WHERE context_id IS NOT NULL` (TCK-2062, `2026_10_24_040000`, ADR-0043 amendé le 2026-10-23). La section décrit l'ancien et justifie pourquoi `reviewable_id` n'y est pas : la justification est devenue fausse | l.398 et suivantes (§1.11) |
| 12 | AppNotification | ⚠️ (lourd) | **✅** | C1 appliquée : table réelle, index, méthodes réelles | l.560 et suivantes |
| 13 | ActivityLog | ⚠️ | **✅** | C16 appliquée ; `impersonator_id` et « Conservation » (TCK-2342) exacts | l.638, 641, 642 |
| 14 | Lease | ✅ | ✅ | `booking_id` : réservation du même bien, du même client (TCK-2352) | l.189 |
| 15 | LeasePayment | ⚠️ | ⚠️ | MD4 appliquée (`refund_amount`, index). **Six colonnes absentes** : `marked_paid_at` (TCK-1342, `2026_10_22_150000`) ; `late_fee_payout_id` (FK `lease_payments_late_fee_payout_fk` vers `payouts`, `nullOnDelete`, index `lease_payments_late_fee_payout_idx`), `late_fee_payout_amount`, `late_fee_payout_commission_rate`, `late_fee_payout_commission_amount` (P206.01, `2026_10_24_160000`) ; `late_fee_refund_amount` (P206.04, `2026_10_24_160100`). L'encadré « Schéma mesuré » s'arrête au 2026-10-14 | l.191, 193, 200, 221, 228 |
| 21 | MaintenanceRequest | ✅ | ✅ | `conversation()` : le plus ancien groupe, créé par l'assignation seule (TCK-2372) | l.282, 314 |
| 22 | Document | ⚠️ | ⚠️ | C9 partielle : la collection `versions` et la version active sont décrites (TCK-2300). `shareLinks()`, `Searchable` et les cibles de profil manquent toujours | l.383 |
| 27 | Guarantor | ⚠️ | ⚠️ | MD2 appliquée. **`agency_id`** (FK `agencies`, `nullOnDelete`, index, avec reprise par les baux puis par les profils de l'auteur — TCK-1993, `2026_10_23_230000`) est absente. « Données sensibles » dit l'agence lue « par `addedBy` » : `GuarantorPolicy::agencyOf` lit d'abord la colonne. La relation `agency()` manque. C10 reste (`addedBy()`, `leasesPivot()`, médias) | l.190, 202, 486 |
| 28 | Payout | ✅ | **⚠️** | Absents : `refunded_payment_type` / `refunded_payment_id` (le `Payout` « constaté », index `payouts_refunded_payment_idx`, relation `refundedPayment()`, TCK-2052) ; `clawback_amount` (TCK-2151) ; sur les deux pivots, `amount`, `commission_rate`, `commission_amount` (copie figée de la ligne, TCK-2017). Les tables `payout_clawbacks` et `payout_clawback_imputations` (TCK-2151, `2026_10_24_050000`), sans modèle, n'ont aucune section | l.200, 221, 222 |
| 34 | OwnerProfile | ⚠️ | **✅** | MD3 et C3 appliquées | l.486 |
| 35 | AgentProfile | ✅ | ✅ | `status` suspendu par l'agence ; `commission_rate` et sa route (TCK-2364) | l.441 |
| 37 | ServiceProviderProfile | ✅ | ✅ | Unique partiel `service_provider_profiles_user_live_unique` conforme à `2026_10_25_223720` ; cas réservés dits | l.513 (prose) |
| 41 | BankStatementLine | ⚠️ | ⚠️ | C13 reste. En plus : `duplicate_of_line_id` (FK auto-référente `bsl_duplicate_of_line_fk`, `nullOnDelete`, index `bsl_duplicate_of_line_idx` — TCK-1919, `2026_10_23_223500`) est absente | l.231, 232 |
| 45 | PlatformPayout | ✅ | **⚠️** | `metadata.refunded_since_paid` décrit (TCK-2320). Absents : `bank_reconciled_at`, `bank_statement_line_id` (FK `platform_payouts_bank_line_fk`, `nullOnDelete`) et l'unique partiel `platform_payouts_bank_line_unique` (TCK-1421, `2026_10_22_174000`) | l.231, 233 |
| 48 | Invitation | ✅ | **⚠️ (mineur)** | `invitable_type = Customer` et rôle `tenant` décrits, comme P242. Absente : `reminder_attempts` (unsigned smallint, défaut 0 — TCK-2155, `2026_10_24_150000`) | l.253, 517, 518 |
| 50 | TenantOnboardingChecklist | ⚠️ | ⚠️ | TCK-2368 décrit ; C14 inchangée | l.209 |
| 61 | ScheduledTaskRun | ⚠️ | ⚠️ | MD5 appliquée ; C21 (enum de `status`) reste | l.695 |
| 64 | KpiConfig | ✅ | ✅ | « Lecture » (TCK-2373) conforme | l.621 |
| 69 | NotificationDeliveryAttempt | ⚠️ | ⚠️ (mineur) | MD6 appliquée ; `agency_id` et `integration_id` décrits (TCK-2326). L'index `(agency_id, created_at)` de `2026_10_25_120500` manque à « Index » | prose §2.3 |
| 76 | PayoutMethod | ✅ | ✅ | Unique partiel `payout_methods_user_default_unique` conforme | l.221 |
| 77 | ServiceProviderBill | ✅ | ✅ | Annulation à la réouverture (TCK-2270) conforme | l.314 |
| 86 | PlatformMetricDaily | ✅ | **⚠️ (mineur)** | « ⚠ Au 2026-10-23, `PlatformMetricsSnapshotter` compte encore `status = published` » est **périmé** : le compteur lit `Property::public()` depuis TCK-2087 | l.619 (reporting plateforme) |
| 90 | GeoCity | ✅ | **⚠️** | `former_names` jsonb nullable (TCK-1169, `2026_10_21_224500`), lue par `VilleDuFiltre`, absente | l.683 |
| 91 | GeoNeighborhood | ✅ | **⚠️** | `former_names` jsonb nullable (TCK-1080, `2026_10_20_220000`), écrite par `GeoNeighborhoodModeration::renommer()`, absente | l.683 |
| 98 | AgencyAdminProfile | ⚠️ | **✅** | C3 appliquée, inverse renommé | l.441, 518 |
| 101 | OwnerStatementSnapshot | — (neuve) | ✅ | Conforme à `2026_10_25_100000` : 6 colonnes, unique et index nommés, FK `cascadeOnDelete` | l.223 |
| 102 | AiRoleAssignment | — (neuve) | ✅ | Conforme à `2026_10_27_100000` ; valeurs d'`AiModelRole` exactes | l.748 |
| 103 | AiUsageSetting | — (neuve) | ✅ (note) | Conforme à `2026_10_27_100010`. Ne dit pas que les plafonds global et par agence vivent en configuration | l.748, 751 |
| 104 | AiCall | — (neuve) | **⚠️** | (a) **`stop_reason`** string(20) nullable (TCK-2399, `2026_10_27_100050`) absente. (b) `error_code` décrit « nom de l'exception » : c'est un code `ai.*` (`AiErrorCode::fromThrowable`, ou le code propre d'`AiUnavailable` / `AiRefused`, ou `ai.role_unassigned`). (c) Rien ne dit qu'une réponse `length` ou `content_filter` s'écrit `failed_over`, avec ses jetons et son coût, et n'entre pas au cache. Le reste est conforme (21 colonnes, 3 index, enums) | l.751, 752 |
| 105 | AiSuggestion | — (neuve) | **⚠️ (mineur)** | Conforme à `2026_10_27_100030`. Mais `input_snapshot` est dit « effacé avec son objet (purge du Radar, TCK-2391) » : TCK-2391 est `todo`, et aucun code n'efface la colonne aujourd'hui | l.752 |
| 106 | AiEvaluationRun | — (neuve) | **⚠️** | Colonnes conformes à `2026_10_27_100040`. `error_code` est décrit « ou le nom d'une exception », et le cycle de vie dit « sinon le nom de la classe de l'exception » : `RunAiEvaluation` écrit `AiErrorCode::fromThrowable()` (TCK-2399) | l.749 |

**Sections transversales :**

- **Paquets** : `laravel/ai` (le SDK du socle IA, v1.3) n'est pas cité. Il publie une migration
  `agent_conversations` que le dépôt n'a pas publiée : aucune table de plus. → ME15 (basse).
- **Tables du framework** : `jobs` est partagée par la connexion `database-long` (ADR-0078). Aucune
  colonne ne change, aucune reco.
- **Règle 1** : sa ligne « Conséquence » lit le client d'un demandeur par `User::customer()`
  (hasOne), relation que la §1 dit retirée par TCK-2372. Sa ligne « Implémentation » nomme
  « `UserObserver` ou `LeaseService` », alors que ses deux puces neuves décrivent
  `CustomerService::findOrCreateFromUser` et `linkUser`. → ME13.
- **Contraintes d'unicité** : les lignes `service_provider_profiles` et `payout_methods` sont exactes.
  Il manque `platform_payouts_bank_line_unique` (ME7) et `payout_clawback_imputations_pair_unique`
  (ME5). La ligne `reviews` décrit l'ancien index `reviews_author_context_uniq` : ME9.
- **Capacités** : `payments.reconcile` est exacte (TCK-2260). La migration `2026_10_24_170000` ne
  touche que des données.
- **Migrations de données seules** (`2026_10_19_163500`, `2026_10_22_150100`, `2026_10_24_170000`) :
  aucun schéma. §55 décrit `meta_variables` comme une liste ordonnée, ce que la réécriture des gabarits
  respecte.
