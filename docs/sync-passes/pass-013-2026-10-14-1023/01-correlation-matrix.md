# 01 — Matrice de corrélation features ↔ modèles

> Passe 013 — 2026-10-14 10:23. Conventions et limites : `00-summary.md`.
> Mesurée sur `docs/convergence-specs-lot-3` `b3793a0a` (lots 1 à 3 de convergence appliqués) :
> `docs/features.md` sha1 `3c3c46ff` (725 lignes), `docs/models-spec.md` sha1 `a745a8ce` (5095 lignes,
> 99 sections). Base de dev migrée lue en lecture seule (222 migrations du dépôt + 5 du paquet
> `lemonsqueezy/laravel`), sans les deux migrations de TCK-639 (#378).

## Synthèse

| Axe | Unités | ✅ | ⚠️ | ❌ |
|-----|--------|----|----|----|
| Features → Modèles | 380 lignes (60 P0, 172 P1, 112 P2, 36 P3) | 313 | 66 (41 dérives + 25 P3 justifiés) | 1 |
| Modèles → Features | 99 sections (aucun modèle sans section) | 72 | 27 | 0 |
| **Total** | | **385** | **93** | **1** |

Avec la PR #378 (TCK-639) fusionnée, §96 devient conforme : **73 / 26 / 0** côté modèles.

**Sept lignes P0 en dérive** : l.426, 427, 456, 458, 537, 643, 663 — toutes dans §1.12, §2.1, §2.3,
§2.8, §2.9. Les dix-sept P0 de §1.1 à §1.6 sont toutes ✅.

Les quatre parties de la mesure sont reproduites ci-dessous telles que les ont rendues leurs relevés,
titres décalés d'un niveau ; les recommandations qu'elles contiennent sont consolidées dans `02-…` et
`03-…`.

---

## A. Features → Modèles

## A.1 — §1.1 à §1.6 (l.67-261)


- **Sources :** worktree `takussan-convergence-3`, HEAD `b3793a0a` ; `docs/features.md` sha1 `3c3c46ff`
  (725 lignes), `docs/models-spec.md` sha1 `a745a8ce` (5095 lignes).
- **Base :** dev migrée, port 5433 (conteneur `takussan-postgres-1`), lue en lecture seule par `\d <table>`
  sur chaque table citée : **222 migrations Takussan**, identiques aux 222 fichiers du worktree (`comm` vide),
  plus 5 migrations du paquet `lemonsqueezy/laravel` (tables `lemon_squeezy_*`, hors périmètre). Les
  migrations de TCK-639 n'y sont pas, comme annoncé.
- **Méthode :** pour chaque ligne, les colonnes qu'elle sollicite ont été cherchées dans la section de
  `models-spec.md` qui les porte **et** dans `\d` de la table ; puis, pour les 58 tables touchées, deux
  balayages automatiques : ensemble des colonnes (spec ↔ base) et nullabilité (spec ↔ base). Les
  comportements cités par une ligne (réglage, registre, morphisme) ont été lus dans le code.
- **Règle de classement appliquée** (celle du brief, rendue explicite) : une ligne est ⚠️ quand une
  colonne, une contrainte ou une relation **qu'elle met en jeu** est absente ou fausse dans la spec ; un
  écart de la même section qui ne touche pas la règle énoncée par la ligne (largeur `integer`/`smallint`
  sans conséquence sur la validation, index omis) est une **note**, reportée en MA. Une ligne dont le
  catalogue lui-même contredit le code (spec juste) est comptée **⚠️ dérive (catalogue)** et reportée en FA.
- **Numérotation :** les lignes ont glissé d'une unité depuis la passe 012 entre l.90 et l.233 (ligne
  « agent principal » insérée en l.90 ; les deux P3 « commissions » fusionnées en une P1, l.234).

---

### 1. Décompte par section

| Section | Lignes | ✅ | ⚠️ dérive | ⚠️ P3 justifié | ❌ | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|---|---|---|---|
| §1.1 Gestion des biens (l.67) | 34 | 30 | 2 | 2 | 0 | 8 | 17 | 5 | 4 |
| §1.2 Recherche & découverte (l.108) | 31 | 30 | 0 | 1 | 0 | 5 | 16 | 9 | 1 |
| §1.3 Réservations & visites (l.146) | 24 | 20 | 3 | 1 | 0 | 0 | 9 | 13 | 2 |
| §1.4 Baux (l.177) | 21 | 18 | 3 | 0 | 0 | 0 | 14 | 6 | 1 |
| §1.5 Transactions & paiements (l.205) | 25 | 20 | 4 | 1 | 0 | 1 | 11 | 12 | 1 |
| §1.6 CRM (l.237) | 18 | 14 | 3 | 1 | 0 | 3 | 7 | 7 | 1 |
| **Total** | **153** | **132** | **15** | **6** | **0** | **17** | **74** | **52** | **10** |

**Statut par priorité :**

| | Lignes | ✅ | ⚠️ dérive | ⚠️ P3 justifié |
|---|---|---|---|---|
| P0 | 17 | **17** | 0 | — |
| P1 | 74 | 66 | 8 (86, 89, 154, 158, 184, 190, 203, 247) | — |
| P2 | 52 | 45 | 7 (161, 221, 222, 225, 227, 253, 254) | — |
| P3 | 10 | 4 (103, 104, 174, 202) | 0 | 6 (105, 106, 144, 175, 235, 260) |

**Les 15 dérives se répartissent ainsi :** 11 côté `models-spec.md` (support en base, spec muette ou
fausse : l.86, 158, 161, 184, 190, 203, 225, 227, 247, 253, 254) et 4 côté catalogue (la spec est juste,
la ligne dit autre chose que le code : l.89, 154, 221, 222).

**Aucune ligne P0 ne repose plus sur un modèle mal décrit.** Les six P0 en dérive de la passe 012 dans ce
périmètre (l.74, 76, 92, 118, 211, 245 — anciens 74, 76, 91, 117, 210, 245) sont résolues par les lots
1 et 2, relecture colonne à colonne faite.

#### Évolution depuis la passe 012 (mêmes sections, 153 lignes des deux côtés)

| | ✅ | ⚠️ dérive | ⚠️ P3 justifié | ❌ |
|---|---|---|---|---|
| Passe 012 | 111 | 35 | 7 | 0 |
| Passe 013 | **132** | **15** | **6** | 0 |

- **30 dérives résolues** par les lots 1-3 : l.74, 76, 80, 81, 92, 99, 100, 101, 102, 118, 127, 128, 129,
  131, 134, 189, 191, 194, 197, 200, 211, 213, 215, 216, 218, 224, 226, 245, 252, 258.
- **5 dérives subsistent, dont 4 pour une autre cause que celle de 012** : l.89 (F4 non appliquée, même
  cause) ; l.86 (§8 corrigée, mais §1 `first_name` dit nullable) ; l.161 (§5 corrigée, mais le réglage
  d'agence est faux en §2) ; l.221 (§31 corrigée, l'écart est désormais dans le catalogue) ; l.227 (§28
  corrigée, mais §41 ne connaît pas le `Payout` comme pièce rapprochée).
- **10 dérives nouvelles**, toutes sur des sections que la passe 012 comptait conformes sans relecture
  colonne à colonne ou sur des comportements non mesurés : l.154, 158, 184, 190, 203, 222, 225, 247, 253, 254.
- **P3 :** l.202, réécrite (« Espace locataire : les factures adressées au client »), passe de P3 justifié
  à ✅ — la donnée existe (`invoices.customer_id`, `GET /api/invoices`), seul l'écran manque.
- Ligne ajoutée l.90 (agent principal) : ✅. Lignes fusionnées l.234 (commissions, P3 ✅ ×2 → P1 ✅ ×1).

---

### 2. Lignes non ✅

| Ligne | Prio | Statut | § spec | Fonctionnalité (abrégée) | Mesure |
|---|---|---|---|---|---|
| 86 | P1 | ⚠️ dérive | §1 User | Publier exige un contact joignable : prénom, numéro vérifié ; ce qui manque se complète | §1 écrit `first_name` et `last_name` **nullables** (défaut `null`). Base : `NOT NULL` sans défaut (`2026_04_15_210400_add_fields_to_users_table`). `PublishReadiness` juge un prénom **vide** (`trim(first_name) === ''`), pas nul : la règle « ce qui manque se complète (nom…) » ne se lit pas sur la spec. Le reste est exact (§8 `is_primary`, §1 `phone_verified_at`, `phone_whatsapp`, `terms_accepted_at`, `terms_version`). → MA8 |
| 89 | P1 | ⚠️ dérive (catalogue) | §8 PropertyCollaborator | Collaborateurs « avec part de commission et permissions granulaires » | §8 est juste : `role` (`manager`, `co_owner`, `agent`, `viewer`) + `commission_share`, **aucune colonne `permissions`** (`\d property_collaborators`). F4 des passes 011 et 012, toujours non appliquée. → FA1 |
| 105 | P3 | ⚠️ P3 justifié | — | Import CSV / API externe (MLS, syndication) | Aucun modèle, aucun code. Cohérent. |
| 106 | P3 | ⚠️ P3 justifié | — | Estimation automatique de prix | Aucun modèle, aucun code. Cohérent. |
| 144 | P3 | ⚠️ P3 justifié | — | Recherche vocale / langage naturel | Aucun modèle. Cohérent. |
| 154 | P1 | ⚠️ dérive (catalogue) | §5 Booking | Acompte = 30 % « estimation affichée dans le tunnel » ; « déplacer le calcul backend via `GET /api/bookings/quote` » quand il le faudra | Le calcul est **déjà** au backend : `App\Services\Booking\BookingQuote` (TCK-530) fixe `total_amount` et `deposit_amount` (30 %) à l'écriture, depuis le bien et les dates, jamais depuis le client (`StoreBookingRequest`, `PublicPropertyController::bookingRequest`). Aucune route `quote`. §5 décrit les colonnes, pas leur calcul (note MA11). → FA2 |
| 158 | P1 | ⚠️ dérive | §32 Task | Annuler sa réservation : acompte payé signalé « remboursement à traiter » | Le signal est une **tâche** : `BookingRefundTaskService` crée une `Task` `taskable` = la réservation, `metadata.kind = booking_refund`, `metadata.booking_payment_ids`. §32 n'a **pas de colonne `metadata`** (présente en base, `2026_04_24_224428_add_metadata_to_tasks_table`) et sa liste `taskable` (Customer, Lease, Property, MaintenanceRequest) **omet `Booking`**. Mesure du comportement que les passes 011-012 laissaient « non mesuré ». → MA2 |
| 161 | P2 | ⚠️ dérive | §2 Agency | Expiration au seuil de l'agence `booking_pending_expiry_hours` (1 à 168 h, 0 = désactivé) | §5 Booking est désormais exact (`expires_at`, `expired_at`, `expiry_reason`). Mais le seuil vit dans `agencies.settings` (`BookingExpirationService::getExpiryThresholdHours`, défaut 48 h), clé que §2 ne nomme pas ; et §2 écrit que `settings` est « remplacé **en entier** par `AgencyUpdateRequest` » — faux depuis TCK-593 : `AgencyController::update` **fusionne** clé par clé, une clé à `null` est retirée. → MA4 |
| 175 | P3 | ⚠️ P3 justifié | — | Annulation avec remboursement partiel automatisé | `booking_payments.refund_amount` existe, mais le remboursement est un geste manuel (l.160). Rien d'automatisé. Cohérent. |
| 184 | P1 | ⚠️ dérive | §27 Guarantor | Garants avec documents joints | §27 annonce `InteractsWithMedia`, collection `id_documents` : **le modèle n'a aucun média** (ni trait, ni `registerMediaCollections`, ni `id_documents` dans `app/`). Les pièces passent par `documents()` → morphMany Document. Relations décrites fausses : `added_by()` (code : `addedBy()`), `addresses()` (absente) ; `leasesPivot()` (belongsToMany via `lease_guarantor`, `role`) manquante. `phone` est `string(30)`. → MA5 |
| 190 | P1 | ⚠️ dérive | §2 Agency | Choisir, par agence, d'encaisser les pénalités avec le paiement en ligne — désactivé par défaut | Le réglage est `agencies.settings.late_fee_online_collection` (`Agency::collectsLateFeesOnline()`, absent = `false`, validé par `AgencyUpdateRequest`). §2 ne nomme pas la clé et décrit à tort `settings` comme remplacé en entier. → MA4 |
| 202 | P3 | ✅ (était P3 justifié) | §25 Invoice | Espace locataire : les factures du client | Donnée présente (`invoices.customer_id`, `Customer.invoices()`), API servie ; seul l'écran manque, comme la ligne le dit. |
| 203 | P1 | ⚠️ dérive | §50 TenantOnboardingChecklist | Onboarding résident à la signature du bail | Trois écarts : (1) §50 : « N'est pas créé si l'agence n'a **pas activé** le workflow » — le code fait l'inverse : `TenantOnboardingService::create` crée la checklist **sauf** si `settings.tenant_onboarding_enabled === false` (défaut activé) ; (2) elle n'est pas créée non plus quand le locataire n'a pas de compte (`tenant.user` nul), ce que §50 tait ; (3) `reminders_sent` décrit `NOT NULL` défaut `'[]'` — base : nullable, **sans défaut** (le `'[]'` est l'`$attributes` du modèle), `2026_05_10_200000_create_tenant_onboarding_checklists_table`. L'index est `(completed_at, created_at)`, pas `(completed_at)`. → MA6 |
| 221 | P2 | ⚠️ dérive (catalogue) | §31 Integration, enum PaymentProvider | Passerelle de paiement « Wave, Orange Money, Free Money, Stripe » | La spec est juste : `PaymentProvider` = `wave`, `orange_money`, `lemon_squeezy`. Les pilotes de paiement sont `WaveDriver`, `OrangeMoneyDriver`, `LemonSqueezyDriver` (`PaymentGatewayService`, l.89-91). **Free Money n'a aucun pilote** (il n'existe que comme moyen de versement, `PayoutMethodKind`, et comme `PaymentMethod` saisi à la main) ; **Stripe** n'a qu'un `StripeProvider` de registre d'identifiants, aucun pilote ; Lemon Squeezy, livré, n'est pas nommé. → FA3 |
| 222 | P2 | ⚠️ dérive (catalogue) | §84 LeasePaymentLink | Lien de paiement en ligne « Wave / Orange Money / Free Money » | §84 est exact. Free Money n'est pas payable en ligne (même mesure que l.221). → FA3 |
| 225 | P2 | ⚠️ dérive | §41 BankStatementLine | Rapprochement bancaire semi-automatique | §41 (et §40) limitent le morphisme `matched_payment` à « BookingPayment \| LeasePayment ». Le code rapproche **quatre** types : `BookingPayment`, `LeasePayment`, `Invoice`, `Payout` (`ReconciliationManager`, `BankStatementLineResource::PAYMENT_TYPE_MAP`) ; les trois tables `booking_payments`, `lease_payments`, `invoices`, `payouts` portent `bank_statement_line_id`. → MA7 |
| 227 | P2 | ⚠️ dérive | §41 BankStatementLine | Rapprocher les débits d'un relevé avec les reversements (Payout) | Le côté `payouts` est exact en §28 (`bank_reconciled_at`, `bank_statement_line_id`, `payouts_bank_line_unique`, `2026_10_07_150200`). Mais §41 ne connaît pas le `Payout` comme pièce rapprochée, ni la règle du code : un `Payout` ne se rapproche que d'une ligne `debit` et seulement `completed`. → MA7 |
| 235 | P3 | ⚠️ P3 justifié | — | Comptabilité exportable (FEC, journaux) | Aucun modèle, aucun code (`grep FEC` vide). Cohérent. |
| 247 | P1 | ⚠️ dérive | §9 UserCustomerRelationship | Définir la relation agent ↔ client (type, **période**) | §9 décrit `start_date` datetime NOT NULL défaut `now` et `end_date` datetime ; la base porte **`started_at` / `ended_at`, `date`, nullables, sans défaut**, plus `metadata` jsonb, l'unicité `ucr_unique (user_id, customer_id, relationship_type)` et l'index `(customer_id, status)` — aucun des trois n'est écrit, ni en §9 ni dans « Contraintes d'unicité » (`2026_04_17_160009_create_user_customer_relationships_table`). L'API traduit `started_at` → `start_date` dans sa réponse (`CustomerController`, l.198) : la spec décrit le JSON, pas la table. → MA1 |
| 253 | P2 | ⚠️ dérive | §33 CustomerNote | Pipeline de prospects (stades, conversion) | La conversion et la perte écrivent une note épinglée de nature `conversion` / `loss` : colonne `customer_notes.kind` string(20) nullable (`2026_10_07_591300_add_kind_to_customer_notes_table`, qui a aussi réécrit les corps préfixés « Conversion : » / « Perte : »). **Absente du tableau de §33**, alors que l'inventaire des enums (l.4573) renvoie `CustomerNoteKind` à « CustomerNote.kind (§33) » : la spec se contredit. → MA3 |
| 254 | P2 | ⚠️ dérive | §32 Task | Tâches et rappels ; page « Mes tâches » | Le rappel d'échéance s'idempote par `tasks.metadata.reminder_24h_sent_at` (`SendTaskDueReminders::META_MARKER`) — colonne absente de §32 (même migration que l.158). La liste `taskable` est fausse dans les deux sens : l'API n'accepte que `Property` et `Customer` (`StoreTaskRequest::TASKABLE_TYPES`), le code écrit aussi `Booking` ; aucune tâche n'est jamais rattachée à un `Lease` ni à une `MaintenanceRequest`, que §32 cite. → MA2 |
| 260 | P3 | ⚠️ P3 justifié | — | Campagnes e-mail / SMS ciblées | Aucun modèle de campagne. Cohérent. |

#### Lignes ✅ portant une note (comptées ✅ ; écart sans conséquence sur la règle de la ligne)

| Ligne | Prio | Note | Reco |
|---|---|---|---|
| 73, 84 | P0, P1 | §3 type `integer` pour `bedrooms`, `bathrooms`, `floor_number`, `total_floors`, `year_built`, `parking_spaces`, `level` ; base `smallint`. Sans effet : la validation borne bien en deçà (`StorePropertyRequest` : 0-100, -5-200, 1800-année+3, 0-500). | MA10 |
| 79 | P0 | La référence est `TK-AAAA-XXXXXX`, six caractères **aléatoires** (`Property::booted()`, `Str::random(6)`), pas un rang (`TK-2025-001`) ; l'exemple est recopié par §3. Unicité tenue par `properties_reference_number_unique`. | FA4, MA10 |
| 83 | P1 | §3 `currency` : « XOF, XAF, EUR, USD » ; les deux requêtes de bien **forcent** `XOF` (`StorePropertyRequest` l.109, `UpdatePropertyRequest` l.103). La spec ne le dit pas. | MA10 |
| 87 | P1 | Colonnes exactes (§92-97, `\d` des six tables). Reste M44 de la passe 012, non appliquée : la fonction `credit_movements_append_only()` laisse passer toute suppression à `pg_trigger_depth() > 1` (pas seulement la cascade) et tout `UPDATE` qui met `property_boost_id` ou `actor_id` à `NULL`, direct compris ; §96 écrit deux exceptions plus étroites. La ligne ne dépend pas de cette garantie (elle porte d'abord sur §1.12 l.427). | MA9 |
| 103 | P3 | `admin_monitored` existe (§3, base) mais n'a **aucun chemin d'écriture** : absent des deux requêtes de bien, de tout écran. Colonne sans geste ; la P3 reste cohérente. | MA10 |
| 104, 174 | P3 | **Livrées** (détection de doublons : §74-75, TCK-597/ADR-0054, file de modération ; abonnement iCalendar personnel : §72, `CalendarSubscription.tsx`). P3 incohérente avec le code, comme l'étaient les lignes « commissions » et « absence datée » que le lot 3 a promues. | FA5 |
| 119 | P1 | Le `slug` de `/agents/<slug>` **est** `users.username` (`PublicAgentController`) ; §1 décrit `username` comme « nom d'utilisateur unique » sans ce rôle public. | MA8 |
| 126, 128 | P1 | §1 : `preferred_language` décrit `string(5)` nullable, base `string(10)` **NOT NULL** défaut `'fr'` ; `status` décrit nullable, base NOT NULL. Sans effet sur ces lignes. | MA8 |
| 141 | P2 | Le canal WhatsApp des alertes sans compte est derrière `SEARCH_ALERTS_WHATSAPP_ENABLED`, **`false`** par défaut (`config/search_alerts.php`, `.env.example`, `.env.docker`) ; §87 le dit, la ligne non. | FA6 |
| 187 | P1 | « dans sa langue » : un locataire **sans compte** est relancé en `fr`, explicitement (`ContactSansCompte`, la fiche client ne porte aucune langue). | FA7 |
| 192 | P1 | Le montant « figé à l'ouverture du paiement » vit dans `lease_payments.metadata.gateway_expected_amount` (`PaymentGatewayService`, l.626) ; §15 ne nomme que `metadata.reopened_from_failed_at`. | MA12 |
| 232 | P2 | « rappelé une fois » : marqueur `payouts.metadata.due_reminded_at` (`RemindDuePayouts`), non nommé en §28. | MA12 |
| 250 | P1 | `is_primary` exact ; « un seul contact principal par client » est **applicatif** (`CustomerController` l.167-178 retire la marque des autres), aucune contrainte. §9 ne le dit pas. | MA1 |
| 251 | P1 | Les notes saisies par un agent ont `kind = null` ; la colonne manquante (l.253) ne touche pas cette ligne. | MA3 |

---

### 3. Lignes ✅ (numéros)

**§1.1 (30)** : 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 87, 88, 90, 91, 92, 93, 94, 95, 96, 97,
98, 99, 100, 101, 102, 103, 104.

**§1.2 (30)** : 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131,
132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143.

**§1.3 (20)** : 152, 153, 155, 156, 157, 159, 160, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172,
173, 174.

**§1.4 (18)** : 183, 185, 186, 187, 188, 189, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202.

**§1.5 (20)** : 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 223, 224, 226, 228, 229, 230, 231, 232,
233, 234.

**§1.6 (14)** : 243, 244, 245, 246, 248, 249, 250, 251, 252, 255, 256, 257, 258, 259.

Sections relues colonne à colonne contre `\d` pour fonder ces ✅ (aucun écart de colonne ni de
nullabilité hors ceux cités) : §2 (hors `settings`), §3, §4, §5, §6, §7, §8, §10 (+ `taggables`), §14 (+
`lease_guarantor`), §15, §16, §17, §21, §22, §23, §25, §26, §28 (+ deux pivots), §30, §31, §40, §45, §63,
§67, §68, §72, §73, §74, §75, §76, §77, §78, §80, §81, §82, §84, §85, §87, §88, §89, §90, §91, §92, §93,
§94, §95, §96 (colonnes), §97, §99 ; enums `PropertyStatus`, `PropertyCondition`, `TitleType`,
`PropertyVisibility`, `CollaboratorRole`, `Currency`, `TagType`, `ReferentialStatus`, `Boost*`,
`Credit*`, `BookingStatus`, `CancellationBy`, `BookingPaymentType`, `PaymentStatus`, `PaymentMethod`,
`VisitType`, `VisitStatus`, `LeaseStatus`, `LeaseType`, `LeasePaymentType`, `PaymentFrequency`,
`PayoutStatus`, `PayeeRole`, `PayoutMethodKind`, `InvoiceStatus`, `InvoiceKind`, `CommissionOrigin`,
`CommissionEntryStatus`, `PlatformPayoutStatus`, `BankStatement*`, `PriceChangeReason`,
`CustomerPipelineStage`, `CustomerStatus`, `IdType`, `DocumentType`, `RelationshipType`,
`RelationshipStatus`, `TaskStatus`, `TaskPriority`, `PaymentProvider` — tous identiques à
`app/Models/Enums/`. Catalogue `Capability` : 47 entrées en spec, 47 `case` en code.

---


## A.2 — §1.7 à §2.10 (l.262-725)


> Mesuré sur le worktree `takussan-convergence-3`, HEAD `b3793a0a`. `docs/features.md` sha1 `3c3c46ff`
> (725 lignes), lignes 262 à 725 ; `docs/models-spec.md` sha1 `a745a8ce` (5095 lignes). Base de dev
> PostgreSQL (port 5433) lue en lecture seule (`default_transaction_read_only = on`) : 227 migrations
> enregistrées = les 222 du worktree + 5 migrations de paquet `lemon_squeezy_*` ; aucune de TCK-639.
>
> **Méthode.** (1) Trois comparaisons automatiques de `models-spec.md` contre `information_schema`
> et `pg_indexes`/`pg_constraint`, sur les 99 sections : noms de colonnes, nullabilité / longueur /
> précision, défauts. (2) Pour chaque ligne : colonnes et clés que la ligne exige, relues dans la
> section de spec ET en base, puis le code qui les écrit quand la donnée n'a pas de colonne nommée.
> (3) Règle de classement appliquée partout :
> - ✅ — la ligne n'exige aucune donnée persistée, ou chaque donnée qu'elle exige a sa colonne dans
>   la spec et en base, avec le bon type, la bonne nullabilité et le bon défaut. Un « acte journalisé »
>   sans donnée nommée est couvert par §13 (`activity_log`, `agency_id`).
> - ⚠️ dérive — la donnée existe en base, mais la spec ne la décrit pas ou la décrit fausse, **y
>   compris** une donnée exigée par la ligne (motif, auteur, niveau, réglage) que le code range hors
>   de toute colonne décrite : clé de `metadata`/`settings`, propriété du journal, cache.
> - ⚠️ P3 justifié — P3 sans modèle, cohérent avec la spec (EF ou silence assumé).
> - ❌ — la donnée qu'exige la ligne n'existe ni dans la spec ni en base.
>
> Une ligne vraie côté modèle mais fausse au regard du code reste ✅ dans le décompte, et reçoit une
> recommandation FB. Elle est signalée dans le tableau.

### 1. Décompte par section

| Section (intertitre) | Lignes | ✅ | ⚠️ dérive | ⚠️ P3 | ❌ | P0 / P1 / P2 / P3 |
|---|---|---|---|---|---|---|
| §1.7 Messagerie (l.262) | 13 | 11 | 0 | 2 | 0 | 0 / 6 / 5 / 2 |
| §1.8 Maintenance (l.282) | 20 | 17 | 1 | 2 | 0 | 0 / 11 / 6 / 3 |
| §1.9 États des lieux (l.342) | 7 | 5 | 0 | 2 | 0 | 0 / 3 / 2 / 2 |
| §1.10 Documents (l.356) | 9 | 5 | 2 | 2 | 0 | 1 / 4 / 2 / 2 |
| §1.11 Avis (l.372) | 10 | 8 | 0 | 2 | 0 | 0 / 0 / 8 / 2 |
| §1.12 Agence & équipe (l.389) | 20 | 13 | 5 | 2 | 0 | 5 / 10 / 3 / 2 |
| §2.1 Authentification (l.448) | 24 | 17 | 6 | 1 | 0 | 6 / 13 / 4 / 1 |
| §2.1 Profils & contexte actif (l.477) | 9 | 8 | 1 | 0 | 0 | 5 / 2 / 2 / 0 |
| §2.1 Onboarding (l.495) | 10 | 7 | 3 | 0 | 0 | 3 / 7 / 0 / 0 |
| §2.2 Rôles & permissions (l.512) | 12 | 11 | 0 | 1 | 0 | 7 / 3 / 1 / 1 |
| §2.3 Notifications (l.533) | 14 | 10 | 2 | 1 | 1 | 3 / 7 / 3 / 1 |
| §2.4 Recherche & filtres (l.565) | 8 | 6 | 1 | 1 | 0 | 3 / 2 / 2 / 1 |
| §2.5 Reporting (l.578) | 21 | 21 | 0 | 0 | 0 | 0 / 8 / 11 / 2 |
| §2.6 Audit (l.611) | 9 | 9 | 0 | 0 | 0 | 2 / 4 / 1 / 2 |
| §2.7 Médias (l.625) | 8 | 7 | 0 | 1 | 0 | 3 / 2 / 2 / 1 |
| §2.8 i18n (l.638) | 8 | 5 | 1 | 2 | 0 | 2 / 3 / 1 / 2 |
| §2.9 Administration (l.656) | 20 | 16 | 4 | 0 | 0 | 3 / 8 / 7 / 2 |
| §2.10 Pages légales (l.681) | 5 | 5 | 0 | 0 | 0 | 0 / 5 / 0 / 0 |
| **Total** | **227** | **181** | **26** | **19** | **1** | **43 / 98 / 60 / 26** |

Dérives par priorité : **7 P0** (426, 427, 456, 458, 537, 643, 663), 16 P1, 3 P2.

**Comparaison avec la passe 012 sur le même périmètre** (226 lignes : la l.269 est ajoutée depuis) :
175 ✅ / 32 dérives / 19 P3 / 0 ❌ → **181 ✅ / 26 dérives / 19 P3 / 1 ❌**. Les lots 1-3 de
convergence ont résolu 22 dérives de la passe 012 (dont §21 `MaintenanceRequest`, §24 `Inventory`,
§11 `Review`, §29, §31, §48, §63, §66, §98, §99, le catalogue `Capability`, les deux index de
téléphone et la CHECK fantôme). Cette passe en ouvre 16 que la passe 012 comptait ✅ : la relecture
colonne à colonne a trouvé §12 `AppNotification` faux (il était dans les 57 sections ✅ de la passe
012), §9 et §1 faux sur des colonnes, et dix données rangées dans `metadata`/`settings`/journal
que la spec ne nomme pas.

### 2. Les trois comportements jamais mesurés

#### 2.1 Verrou de compte après échecs (l.467, P1) — mesuré : ⚠️ dérive

`App\Services\Auth\LoginLock`, un verrou par canal :
- **mot de passe** (et le second facteur saisi derrière lui, ou derrière un rappel OAuth) : sur le
  compte, dans **`users.metadata`** — clés `failed_login_attempts`, `failed_login_first_at`,
  `locked_at`. 10 échecs consécutifs (`MAX_FAILURES`) posent `locked_at` ; le verrou court 15 min
  (`LOCK_MINUTES`) ; une série vit 24 h depuis son premier échec (`SERIES_HOURS`) ; un succès efface
  les trois clés. Levée par le support : `UserSupportService::unlock()` (journal
  `super_admin_account_unlocked`), qui lève aussi le verrou du numéro vérifié.
- **téléphone** : sur le numéro, **en cache** (`login-lock-failures:{phone}`, `login-lock:{phone}`),
  fenêtre fixe de 15 min, avec ou sans compte.
- **e-mail inconnu** : un compteur **leurre** en cache (`login-lock:email:<sha256>`), même seuil, pour
  ne pas énumérer les adresses inscrites.

`models-spec.md` §1 décrit `metadata` comme « Données supplémentaires flexibles » ; `grep locked_at`,
`failed_login`, `LoginLock` dans la spec : **zéro occurrence**. Support réel, spec muette → MB3.

#### 2.2 Motif de suspension d'une agence (l.667, P1) — mesuré : ⚠️ dérive

`Admin\AgencyModerationController::suspend()` exige `reason` (`SuspendAgencyRequest`), pose
`agencies.status = suspended` (vérification conservée) et range le motif **seulement** dans le
journal (`activity_log`, événement `super_admin_agency_suspended`, propriétés `old_status`,
`new_status`, `reason`) et dans les paramètres de la notification `AgencySuspended` aux
administrateurs. `reinstate()` exige aussi un motif (`super_admin_agency_reinstated`). **Aucune
colonne** de `agencies` ne porte le motif ni la date de suspension (35 colonnes relues en base) ; §2
ne dit pas où il vit. La console ne peut afficher « pourquoi » qu'en lisant le journal → MB6.

#### 2.3 Autres « stockés » sans colonne nommée, dans ce périmètre — tous mesurés

| Ligne | Donnée exigée | Où elle vit réellement | Spec |
|---|---|---|---|
| 294 | motif du refus d'une intervention | journal `maintenance.declined` (`reason`, `from`) — `MaintenanceRequestService::decline()` | muette (§21) |
| 426 | suspension d'adhésion | `agency_admin_profiles.status = suspended`, `owner_profiles.status = blocked`, `agent_profiles.status = suspended` ; journal `team_member_suspended` | **fausse** : §98 réserve `suspended` à la modération plateforme |
| 427 | ville de l'espace auto-créé | `agencies.settings.primary_city` | muette (§2 `settings`) |
| 434 | auteur d'une pause de collaboration | `service_provider_agency_collaborations.metadata.paused_by` / `paused_at` | muette (§39) |
| 439, 507 | disponibilités, frais de visite, assurance du prestataire | `service_provider_profiles.metadata.availability`, `visit_fee`, `has_insurance` | muette (§37) |
| 462 | réenrôlement 2FA imposé après réinitialisation | `users.metadata.force_2fa_reconfigure` | muette (§1) |
| 463 | « 2FA obligatoire pour toute l'équipe » | `agencies.settings.require_team_two_factor` | muette (§2) |
| 490, 505, 506 | KYC d'un profil, état `pending_review` | `Document` (documentable = le profil) + miroir `<profil>.metadata.kyc.{status, submitted_at, docs[]}` ; zones de l'agent : `agent_profiles.metadata.intervention_zones` | **fausse** : §42 dit `KycDossier` pour les profils — en code et en base, **seule l'agence** a un dossier (1 ligne, `App\Models\Agency`) ; §22 ne liste aucun profil parmi les cibles |
| 665 | valeurs des enums métier | `settings` clé `enum.{key}.values` (portée globale), catalogue `EditableBusinessEnums` | muette (§30 ne connaît que `EditablePlatformSettings`) |
| 668 | niveau d'opérateur choisi à la cooptation ; motif du retrait | `invitations.metadata.level` (lu à la confirmation 2FA) ; journal `super_admin_operator_revoked` (`reason`) | muette — §51 `notes` n'est pas le motif |

Mesurés et **conformes** (aucune colonne attendue, ou colonne décrite) : codes OTP (cache haché,
TTL 5 min, 5 essais) ; mot de passe d'un lien de partage (`RateLimiter`) ; sondes de santé (cache) ;
relances KYC d'agence (`kyc_dossiers.metadata.expiry_reminders`, **décrit** en §42) ; step-up 2FA
(`personal_access_tokens.two_factor_verified_at`, décrit) ; détection d'un NINEA / RIB pro partagé
(calcul sur valeurs déchiffrées, sans colonne) ; motif d'effacement (`account_deletion_requests.reason`) ;
motif d'impersonation (`impersonation_sessions.reason`) ; octroi/retrait de crédits
(`credit_lots.reason`, `credit_movements.reason`).

### 3. Lignes non ✅ — détail

| L. | Prio | § features | Statut | Support mesuré (spec / base / code) | Reco |
|---|---|---|---|---|---|
| 279 | P3 | §1.7 | ⚠️ P3 | Appels audio/vidéo : aucun modèle, aucun ticket — cohérent | — |
| 280 | P3 | §1.7 | ⚠️ P3 | Traduction automatique : aucun modèle — cohérent | — |
| 294 | P1 | §1.8 | ⚠️ dérive | `accepted_at` exact (§21, `2026_10_07_120000`). Le **motif** du refus, exigé par la ligne, n'a pas de colonne : journal `maintenance.declined` ; le refus remet `assigned_to` et `accepted_at` à `null`, `status = open`, et archive le devis du prestataire. §21 n'en dit rien | MB12 |
| 306 | P3 | §1.8 | ⚠️ P3 | Contrats récurrents : aucun modèle — cohérent | — |
| 307 | P3 | §1.8 | ⚠️ P3 | Annuaire public des prestataires sur consentement : aucune colonne de consentement — cohérent | — |
| 353 | P3 | §1.9 | ⚠️ P3 | Comparaison entrée ↔ sortie : aucun modèle | — |
| 354 | P3 | §1.9 | ⚠️ P3 | IA sur photos : aucun modèle | — |
| 363 | P1 | §1.10 | ⚠️ dérive | §22 `type` liste 8 valeurs ; `DocumentType` en a **11** (`photo`, `rib`, `ninea` manquent) — le tableau des enums (l.4539) les a : la spec se contredit, et « RIB » est nommé par la ligne | MB9 |
| 366 | P1 | §1.10 | ⚠️ dérive | La recherche de la bibliothèque passe par Scout (`SearchDocumentController` → `DocumentSearchService` → `Document::search`). `Document` porte `Searchable` (`toSearchableArray` : `title` = `name`, `description`, `type`, `documentable_*`, `uploaded_by`, `created_at`) ; §22 ne déclare que `InteractsWithMedia` | MB9 |
| 369 | P3 | §1.10 | ⚠️ P3 | Signature électronique des autres documents : aucun modèle, cohérent (bail §82, EDL §24) | — |
| 370 | P3 | §1.10 | ⚠️ P3 | OCR : aucun modèle | — |
| 386 | P3 | §1.11 | ⚠️ P3 | Détection d'avis suspects : aucun modèle | — |
| 387 | P3 | §1.11 | ⚠️ P3 | Badges de réputation : aucun modèle | — |
| 426 | **P0** | §1.12 | ⚠️ dérive | `TeamMemberSuspensionService` : agent → `suspended`, admin d'agence → `suspended`, bailleur → **`blocked`** ; réactivation vers `active` du seul statut que la suspension a posé ; journal `team_member_suspended` / `team_member_reactivated` ; `agencies.primary_admin_id` protège l'administrateur principal. **§98 écrit « `suspended`/`archived` réservés à la modération plateforme » — faux** : c'est l'admin d'agence qui pose `suspended` (TCK-587, capacité `team.suspend`). §34 liste `blocked` sans dire qu'il signifie « adhésion suspendue par l'agence ». **Ligne P0 sur un modèle mal décrit** | MB4 |
| 427 | **P0** | §1.12 | ⚠️ dérive | `kind`, `name`, `currency` (XOF, décrit), `AgencyAdminProfile` (§98, désormais décrit), `OwnerProfile`, drapeau `host_auto_space` (§58, décrit). La **ville déduite de la position** est rangée dans `agencies.settings.primary_city` (`HostIndividualOnboardingService`) ; §2 `settings` n'en nomme aucune clé. Le nom « Espace de {prénom} » lit `users.first_name`, que §1 dit nullable (voir 458) ; le code tombe sur « Mon espace » si le prénom est vide | MB5, MB2 |
| 433 | P1 | §1.12 | ⚠️ dérive | `AgentHandoverService` écrit `tasks.assigned_to_id`, `property_visits.agent_id`, `maintenance_requests.assigned_to`, `property_collaborators.user_id` / `is_primary`, `properties.user_id`, `user_customer_relationships.user_id` / `is_primary`. Le transfert du **référent client** gère la collision d'une relation déjà existante parce que la base porte l'unique **`ucr_unique (user_id, customer_id, relationship_type)`** — que ni §9 ni « Contraintes d'unicité » n'écrivent. §9 est faux par ailleurs : `start_date`/`end_date` (datetime, défaut now) n'existent pas, la base a `started_at`/`ended_at` (`date`, nullables, sans défaut) et `metadata` jsonb, non décrite | MB11 |
| 434 | P1 | §1.12 | ⚠️ dérive | `status` `paused`/`ended` décrits (§39). « Une pause ne se lève que par celui qui l'a posée » repose sur `service_provider_agency_collaborations.metadata.paused_by` / `paused_at` (`ServiceProviderCollaborationService`) ; §39 `metadata` = « Données flexibles » | MB10 |
| 439 | P2 | §1.12 | ⚠️ dérive | Métiers (`specialties`), zones (`service_areas`), tarifs (`hourly_rate_*`) décrits en §37. Les **disponibilités** vivent dans `service_provider_profiles.metadata.availability` (`[{day, from, to}]`), les frais de visite dans `metadata.visit_fee` ; §37 muet | MB8 |
| 440 | P3 | §1.12 | ⚠️ P3 | Multi-branches : EF7 `parent_agency_id` — cohérent | — |
| 442 | P3 | §1.12 | ⚠️ P3 | Marketplace inter-agences : aucun modèle | — |
| 456 | **P0** | §2.1 | ⚠️ dérive | Le broker de Laravel (`config/auth.php` → `password_reset_tokens`) écrit le jeton dans la table **`password_reset_tokens`**, présente en base et absente de `models-spec.md` (aucune occurrence, ni section ni paragraphe « tables du framework »). La table est clé par e-mail : un compte ouvert par téléphone n'a pas ce chemin — la spec ne le dit pas non plus | MB14 |
| 458 | **P0** | §2.1 | ⚠️ dérive | §1 écrit `first_name` / `last_name` **nullables, défaut null** ; en base ils sont **NOT NULL** (`2026_04_15_210400`). Conséquence mesurée : l'inscription par téléphone écrit `''` (`PhoneLoginService` l.164-165) faute de pouvoir écrire `null`. `bio` et la collection `avatar` sont exacts | MB2 |
| 462 | P1 | §2.1 | ⚠️ dérive | `force_2fa_at_first_login` décrit. La réinitialisation par le support (`UserSupportService::resetTwoFactor`) pose `users.metadata.force_2fa_reconfigure = true`, que §1 ne nomme pas | MB3 |
| 463 | P1 | §2.1 | ⚠️ dérive | Le réglage d'agence « 2FA obligatoire pour toute l'équipe » est `agencies.settings.require_team_two_factor` (`AgencyUpdateRequest`) ; §2 muet | MB5 |
| 466 | P1 | §2.1 | ⚠️ dérive | `email` nullable et index partiel du numéro vérifié : exacts. Le compte « créé au premier code validé » reçoit `first_name = last_name = ''` parce que la base refuse `null` — §1 dit l'inverse. Drapeau `auth.phone_login.enabled` : configuration, aucune donnée | MB2 |
| 467 | P1 | §2.1 | ⚠️ dérive | Voir §2.1 de ce rapport : `users.metadata.locked_at`, `failed_login_attempts`, `failed_login_first_at` + cache par numéro et leurre e-mail ; aucune mention dans la spec | MB3 |
| 475 | P3 | §2.1 | ⚠️ P3 | Magic link : aucun modèle | — |
| 490 | P1 | §2.1 Profils | ⚠️ dérive | « Un dossier par profil » : §42 l'affirme (`KycDossier` sur `OwnerProfile`, `AgentProfile`…) mais **seule l'agence** a un dossier (`KycWorkflowService::dossierForAgency`, 1 ligne en base, `subject_type = App\Models\Agency`). Le KYC d'un profil = des `Document` dont `documentable` est le profil + le miroir `metadata.kyc`. §22 ne liste aucun profil parmi ses cibles | MB8, MB9 |
| 505 | P1 | §2.1 Onb. | ⚠️ dérive | `OwnerProfileController` : pièces en `Document` (`documentable_type = OwnerProfile`, types `rib`/`ninea` absents de §22), état `pending_review` dans `owner_profiles.metadata.kyc.status` — ni la cible, ni les types, ni l'état ne sont décrits | MB8, MB9 |
| 506 | P1 | §2.1 Onb. | ⚠️ dérive | `license_number`, `specialty` décrits (§35). Zones : `agent_profiles.metadata.intervention_zones` ; état KYC : `metadata.kyc` ; pièces : `Document` sur `AgentProfile` — non décrits | MB8, MB9 |
| 507 | P1 | §2.1 Onb. | ⚠️ dérive | Métiers, zones, tarifs décrits (§37) ; disponibilités `metadata.availability`, assurance `metadata.has_insurance`, pièces `Document` sur `ServiceProviderProfile` — non décrits. Multi-rattachement : §39 exact | MB8, MB9 |
| 531 | P3 | §2.2 | ⚠️ P3 | Policies dynamiques : aucun modèle | — |
| 537 | **P0** | §2.3 | ⚠️ dérive | **§12 `AppNotification` ne décrit pas sa table.** Sept colonnes décrites n'existent pas : `content`, `is_actioned`, `actioned_at`, `delivered`, `delivered_at`, `metadata`, `deleted_at` (pas de soft delete). Cinq colonnes réelles manquent au tableau : `body` (text, nullable — nommée seulement en prose), `data` (jsonb), `sent_at`, `delivery_attempts` (jsonb), `digested_at`. Scopes `unread()`, `ofType()`, `forUser()`, méthodes `markAsRead()`, `markAsActioned()`, relation `referenceable()` : **aucune n'existe** dans `app/Models/AppNotification.php`, qui a `scopeUndigested()`, `isCritical()`, `reference()`, `deliveryAttempts()`. `type` liste 7 valeurs, l'enum en a 12 (le tableau des enums les a). Index réels non écrits : `(user_id, is_read)`, `(user_id, digested_at)`, `(referenceable_type, referenceable_id)`. Migrations : `2026_04_17_160032`, `2026_04_26_160847`, `2026_04_26_200002`, `2026_10_07_100000`. **La passe 012 comptait §12 conforme.** **Ligne P0 sur un modèle mal décrit** | MB1 |
| 542 | P1 | §2.3 | **❌** | Une notification push web ou mobile exige un abonnement de navigateur (endpoint, clés) ou un jeton d'appareil : **aucune table, aucune colonne, aucun paquet** (`webpush`, `fcm`, `device_token` : zéro occurrence dans `app/` et `config/`). Le canal `push` de `PreferenceResolver` n'est offert que si `broadcasting.default` n'est ni `log` ni `null` — et il vaut `log` partout (D-65) : c'est de la diffusion vers un onglet ouvert, pas du push. Seuls existent l'interrupteur `users.notifications_push_enabled` et la case `push` de §99 | FB1 |
| 549 | P2 | §2.3 | ⚠️ dérive | `email_frequency`, `digest_send_at`, `digest_day_of_week` décrits (§1) ; le marqueur `app_notifications.digested_at` et son index `(user_id, digested_at)` (`2026_04_26_200002`) manquent à §12 | MB1 |
| 550 | P3 | §2.3 | ⚠️ P3 | WhatsApp entrant : socle `whatsapp_contacts` (§54, `last_inbound_at`, `opt_in_status`) décrit ; aucune table de messages entrants — cohérent avec la ligne réécrite | — |
| 574 | P2 | §2.4 | ⚠️ dérive | Messages : `Searchable` décrit (§20). Documents : `Searchable` absent de §22 (voir 366) | MB9 |
| 576 | P3 | §2.4 | ⚠️ P3 | Embeddings : extension `pgvector` disponible, aucune table — cohérent | — |
| 636 | P3 | §2.7 | ⚠️ P3 | Streaming adaptatif : aucun modèle | — |
| 643 | **P0** | §2.8 | ⚠️ dérive | §1 `preferred_language` : `string(5)`, **nullable**, défaut `'fr'` ; en base `varchar(10)` **NOT NULL** défaut `'fr'` | MB2 |
| 648 | P3 | §2.8 | ⚠️ P3 | Taux de change : EF9 `ExchangeRate` — cohérent | — |
| 649 | P3 | §2.8 | ⚠️ P3 | Traduction des contenus : aucun modèle | — |
| 663 | **P0** | §2.9 | ⚠️ dérive | « Activation, blocage » = `users.status` (`UserStatus`) ; §1 l'écrit **nullable**, la base le tient **NOT NULL** défaut `'active'` | MB2 |
| 665 | P1 | §2.9 | ⚠️ dérive | `BusinessEnumService` lit et écrit `settings` clé **`enum.{key}.values`**, portée globale, catalogue `App\Domain\Settings\EditableBusinessEnums` ; §30 ne connaît que le catalogue `EditablePlatformSettings` | MB13 |
| 667 | P1 | §2.9 | ⚠️ dérive | Voir §2.2 de ce rapport : motif dans le seul journal `super_admin_agency_suspended` ; aucune colonne | MB6 |
| 668 | P1 | §2.9 | ⚠️ dérive | Niveaux `PlatformProfileLevel` décrits (§51). Le niveau choisi à la cooptation vit dans `invitations.metadata.level` (`SuperAdminCooptationService`, lu à la confirmation 2FA) ; le motif du retrait dans le journal `super_admin_operator_revoked` — §51 ne le dit pas, et sa colonne `notes` (« justification interne ») n'est **pas** écrite par le retrait. « Jamais le dernier `super_admin` » : contrôle sous verrou, sans contrainte — juste, non décrit | MB7 |

#### Lignes ✅ assorties d'un signal (comptées ✅)

| L. | Prio | Signal | Reco |
|---|---|---|---|
| 273 | P1 | Données exactes (§12 pour l'in-app, à corriger par MB1). **Ligne fausse au regard du code** : rien n'est « en temps réel », le front interroge l'API toutes les 3/10/30 s (D-65) | FB2 |
| 305 | P3 | Livré par TCK-594 (`done`) : §77 `ServiceProviderBill`, `payouts.service_provider_bill_id`. **Priorité incohérente** | FB7 |
| 351 | P2 | §24 exact (`owner_signed_by_user_id`, `owner_signed_on_behalf_of_user_id`, `traceability_hash`). **Ligne fausse au regard du code** : « chacune … pour elle-même seulement » — un membre du personnel de l'agence du bail détenant `leases.sign` signe pour le bailleur au titre du mandat (`LandlordSignatory`) ; seul « un collaborateur du bien ne signe jamais » est vrai | FB3 |
| 362 | P0 | Les cibles nommées (bien, bail, client) sont dans §22. Mais §22 omet les cibles que le code emploie (`OwnerProfile`, `AgentProfile`, `ServiceProviderProfile`, `AgencyUpgradeRequest`), trois types et le trait `Searchable` : **ligne P0 sur un modèle incomplet** | MB9 |
| 428, 662 | P1 | Colonnes §95-97 exactes ; la garantie d'ajout seul de §96 reste plus forte que le trigger (M44 de la passe 012, non appliquée, re-mesurée sur `pg_get_functiondef`) | MB16 |
| 487 | P0 | Aucune donnée. **Ligne et Règle 4 fausses au regard du code** : l'auto-bascule retient les profils **actifs** d'une **seule agence**, plusieurs profils tolérés (`ResolveActiveProfile`) | FB4, MB15 |
| 493 | P2 | `activity_log` exact. **Ligne fausse au regard du code** : le changement de profil actif (`MeProfilesController::updateActive`) n'est pas journalisé | FB5 |
| 497 (prose) | — | « Tous les profils traversent la même machine à états draft → pending → active → suspended \| expired \| archived » : aucun enum de profil n'a `pending` ni `expired` ; `OwnerProfileStatus` a `blocked`, `AgencyAdminProfileStatus` n'a pas `draft` | FB8 |
| 520 | P0 | Spec exacte (Règle 5). **Ligne imprécise** : `tenant` et `customer` sont des rôles **dérivés** (TCK-492), pas « portés par le profil polymorphe correspondant » | FB9 |
| 523 | P0 | Aucune donnée. Règle 4 n'écrit ni le filtre des profils actifs (TCK-587) ni l'en-tête `X-Active-Profile-Hint`, et garde le vestige spatie « `team_id = null` » | MB15 |
| 538 | P0 | `is_read`, `read_at` exacts ; **ligne P0 sur §12 mal décrit** (méthode `markAsRead()` inexistante) | MB1 |
| 601, 602, 622, 623, 678, 679 | P3 | Livrées, modèle décrit (§64, §65, §59, §60, §58). **Priorité incohérente** | FB7 |
| 666 | P1 | Gabarits : §55 exact. **Ligne fausse au regard du code** : l'expéditeur n'est réglable nulle part en base (ni `settings`, ni `EditablePlatformSettings`, ni `notification_templates`) — il vient de la configuration d'environnement | FB6 |

#### Lignes ✅ (181)

268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 288, 289, 290, 291, 292, 293, 295, 296, 297,
298, 299, 300, 301, 302, 303, 304, 305, 348, 349, 350, 351, 352, 362, 364, 365, 367, 368, 378, 379,
380, 381, 382, 383, 384, 385, 423, 424, 425, 428, 429, 430, 431, 432, 435, 436, 437, 438, 441, 452,
453, 454, 455, 457, 459, 460, 461, 464, 465, 468, 469, 470, 471, 472, 473, 474, 485, 486, 487, 488,
489, 491, 492, 493, 501, 502, 503, 504, 508, 509, 510, 520, 521, 522, 523, 524, 525, 526, 527, 528,
529, 530, 538, 539, 540, 541, 543, 544, 545, 546, 547, 548, 569, 570, 571, 572, 573, 575, 582, 583,
584, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 615,
616, 617, 618, 619, 620, 621, 622, 623, 629, 630, 631, 632, 633, 634, 635, 642, 644, 645, 646, 647,
660, 661, 662, 664, 666, 669, 670, 671, 672, 673, 674, 675, 676, 677, 678, 679, 692, 693, 694, 695,
696.

Points de mesure qui fondent les ✅ les moins évidents : l.269 (statuts de profils — `draft`,
`suspended`, `inactive` — décrits en §34/35/37/98) ; l.275 (non livré, EF5 réécrit : « 3 à 20
participants », `CreateGroupConversationRequest`, `AddParticipantsRequest` max 20 — exact) ; l.278
(`MessageType` `audio` désormais en §20 et au tableau des enums) ; l.301 (`works_approval_threshold`
§34, `decimal(14,2)`) ; l.441 (absence = ligne `role_delegations` avec `replaces_user_id`, §66 exact,
y compris `role_delegations_agency_replaces_idx` et la FK `cascade`) ; l.465 (`idle_timeout_minutes`,
`two_factor_verified_at`, `expires_at` décrits au paragraphe Sanctum) ; l.470 (`rib`, `tax_id`,
`id_document_number`, `ninea`, `rib_pro` en `text` chiffré — §34, §49 exacts) ; l.501 (§48 exact :
`phone`, CHECK `invitations_email_or_phone_check`, `invitations_phone_status_idx`) ; l.525/528
(Règle 6 et le catalogue `Capability` : 47 cas listés = 47 dans le code) ; l.543 (§99 exact) ;
l.592 (`leases.agent_id`, `signed_at`, `commission_entries.beneficiary_id`, `earned_at`) ; l.647
(`agencies.currency` `char(3)`, `Currency` = XOF/XAF/EUR/USD) ; l.672 (`webhook_token_hash`,
`webhook_token` chiffré, §31) ; l.677 (§63 : `body`/`headers` chiffrés, `status`, purge par canal).


---

## B. Modèles → Features (et → Migrations)

## B.1 — §1 à §33


- **Worktree :** `/Users/aminethiam/Documents/perso/takussan-convergence-3`, HEAD `b3793a0a`
  (`docs/convergence-specs-lot-3`). `docs/models-spec.md` 5095 lignes, `docs/features.md` 725 lignes.
- **Base mesurée :** PostgreSQL de dev (port 5433), lecture seule, par un script PHP/PDO qui lit le
  `.env` sans rien imprimer de ses secrets. La table `migrations` compte 227 lignes : les 222 fichiers du
  worktree (le compte est identique, fichier par fichier) plus les 5 migrations du paquet Lemon Squeezy
  (`2023_01_16_000001` à `000005`, tables `lemon_squeezy_*`). Les deux migrations de TCK-639 n'y sont
  pas, et elles ne touchent aucune table de ce périmètre.
- **Méthode :** chaque tableau de colonnes a été comparé **automatiquement** à
  `information_schema.columns` : ensemble des colonnes, nullabilité, défaut. Les types ont ensuite été
  relus à la main, ligne par ligne. Index, unicités, CHECK et FK avec leur `onDelete` viennent de
  `pg_indexes` et `pg_constraint`, puis ont été comparés à la prose de chaque section, aux sections
  transversales (« Index recommandés », « Contraintes d'unicité », « Comportements FK ») et aux
  migrations. Les relations, traits, scopes et collections média ont été relevés dans
  `app/Models/*.php`, avec un extracteur des `return $this->belongsTo|hasMany|…` contrôlé à la main
  là où il y avait un écart.
- **Règle appliquée :** une colonne, un type, une nullabilité, un défaut, une contrainte ou une
  relation faux ou absents valent ⚠️. Ne valent qu'une note : un index ou un `onDelete` tu dans la
  section mais écrit juste dans une section transversale, un trait omis sans conséquence de schéma, le
  vocabulaire Laravel `unsigned …` (PostgreSQL n'a pas d'entier non signé, et Laravel n'y pose aucun
  CHECK).

### Compteurs

| | ✅ | ⚠️ | ❌ |
|---|---|---|---|
| §1-§33 (33 sections) | **23** | **10** | **0** |

Modèles de `app/Models/` sans section dans ce périmètre : **aucun**. `Activity` est décrit dans §13.
`Bases/AbstractModel` est abstrait. `Bases/Auditable` est un trait, utilisé par 28 modèles et jamais
expliqué : voir RA6. Hors modèles : les **cinq tables `lemon_squeezy_*`** n'apparaissent nulle part
dans `models-spec.md` (voir RA2).

**Six sections comptées ✅ par la passe 012 ne passent pas la relecture colonne à colonne :** §12,
§13, §22, §27, §32 et §33 (liste B.3 de `pass-012…/01-correlation-matrix.md`). Ce sont les mêmes faux
positifs que §4 et §10 à la passe 011. À l'inverse, les lots de convergence 1 à 3 ont rendu exacts
§4, §5, §6, §7, §8, §10, §11, §14, §15, §17, §18, §20, §21, §24, §25, §28, §29 et §31 : tous étaient
⚠️ à la passe 012.

### Tableau récapitulatif

| § | Modèle | Statut | Écart principal | Features servies (`features.md`) |
|---|---|---|---|---|
| 1 | User | ⚠️ | `status`, `first_name` et `last_name` écrits nullables : NOT NULL en base. `preferred_language` écrit `string(5)` nullable : `varchar(10)` NOT NULL. Relations nommées en snake_case ; `agency()` (hasOneThrough), `tenantLeases()`, `payouts()`, `roleDelegations()` et `deletionRequest()` absentes | l.452, 456, 459 |
| 2 | Agency | ⚠️ | Colonnes exactes. Le trait `LemonSqueezyBillable` n'est pas décrit : il apporte `customer()` et `orders()`, et sa relation `subscriptions()` est **masquée** par celle de l'agence. Les tables `lemon_squeezy_*` ne sont décrites nulle part | l.423, 213, 218 |
| 3 | Property | ⚠️ (mineur) | 7 colonnes écrites `integer` sont des `smallint` (`bedrooms`, `bathrooms`, `floor_number`, `total_floors`, `year_built`, `parking_spaces`, `level`) | l.73, 76, 84, 87 |
| 4 | Address | ✅ | — | l.74 |
| 5 | Booking | ✅ | — | l.152, 161 |
| 6 | BookingPayment | ✅ | — (le défaut de `User::bookingPayments()` est décrit) | l.154, 156, 157, 160 |
| 7 | Customer | ✅ | — | l.243, 253, 258 |
| 8 | PropertyCollaborator | ✅ | — | l.89, 90, 92 |
| 9 | UserCustomerRelationship | ⚠️ | `start_date` / `end_date` (datetime, défaut `now`) n'existent pas : ce sont `started_at` / `ended_at` (date, nullables). `metadata` absente. Unicité `ucr_unique` et FK `cascade` écrites nulle part | l.247, 250 |
| 10 | Tag | ✅ | — | l.82, 660 |
| 11 | Review | ✅ | note : `rating` « unsigned tinyint » = `smallint` | l.378-386 |
| 12 | AppNotification | ⚠️ (lourd) | 7 colonnes décrites n'existent pas (`content`, `is_actioned`, `actioned_at`, `delivered`, `delivered_at`, `metadata`, `deleted_at`) ; 5 manquent (`body`, `data`, `sent_at`, `delivery_attempts`, `digested_at`). Scopes, méthodes et relation `referenceable()` fictifs ; `deliveryAttempts()` absente | l.537, 538, 540, 545, 549 |
| 13 | ActivityLog → `Activity` | ⚠️ | La correspondance `changes` → `properties` est fausse sous activitylog v5 (colonne `attribute_changes`). Les tables `activity_log_changes` et `activity_logs` n'existent pas. Le mécanisme réel (`Bases\Auditable` + `AUDIT_ONLY`) n'est pas nommé. `impersonator_id` n'est écrit qu'en §83 | l.615, 617, 619 |
| 14 | Lease | ✅ | — | l.183, 184, 200 |
| 15 | LeasePayment | ✅ | — | l.186, 189, 192 |
| 16 | Favorite | ✅ | — | l.125, 142, 143 |
| 17 | PropertyVisit | ✅ | — | l.162, 164, 166 |
| 18 | Conversation | ✅ | — | l.268, 277 |
| 19 | ConversationParticipant | ✅ | note : défaut `now` = `CURRENT_TIMESTAMP` | l.272 |
| 20 | Message | ✅ | — | l.270 |
| 21 | MaintenanceRequest | ✅ | — | l.277, 288 |
| 22 | Document | ⚠️ | Relation `shareLinks()` absente (alors que §29 la cite en inverse), collection `versions` absente, trait `Searchable` absent | l.248, 365, 368 |
| 23 | SavedSearch | ✅ | note : unique `(user_id, name)` écrite seulement dans « Contraintes d'unicité » | l.126, 141, 573 |
| 24 | Inventory | ✅ | — | l.348-352 |
| 25 | Invoice | ✅ | — | l.212, 213, 228 |
| 26 | PropertyPriceHistory | ✅ | — | l.88 |
| 27 | Guarantor | ⚠️ | Trait `InteractsWithMedia`, collection `id_documents`, accesseur `full_name` et relation `addresses()` : **aucun n'existe**. `leasesPivot()` (la vraie liste des baux) est absente. `phone` est en `varchar(30)` | l.184 |
| 28 | Payout | ✅ | — | l.214-218, 232 |
| 29 | DocumentShareLink | ✅ | — | l.365 |
| 30 | Setting | ✅ | — | l.161, 430, 662 |
| 31 | Integration | ✅ | — | l.221, 223 |
| 32 | Task | ⚠️ | Colonne `metadata` absente. Relations écrites `assignedTo()` / `createdBy()` : le code déclare `assignee()` / `creator()` | l.170, 254 |
| 33 | CustomerNote | ⚠️ | Colonne `kind` (`CustomerNoteKind`) absente, alors que le catalogue des enums (l.4573) renvoie à « CustomerNote.kind (§33) » | l.251, 253 |

Aucune section n'est orpheline : chacune sert au moins une ligne du catalogue.

---

### Détail des ⚠️

#### §1 User (l.323-449)

**Colonnes** : les sources sont `0001_01_01_000000_create_users_table` et
`2026_04_15_210400_add_fields_to_users_table`.

| Ligne | Spec | Base | Source |
|---|---|---|---|
| l.342 `status` | nullable « oui », défaut `'active'` | **NOT NULL** défaut `'active'` | `210400` : `string('status')->default('active')` |
| l.343 `first_name` | nullable, défaut `null` | **NOT NULL**, sans défaut | `210400` : `string('first_name')` |
| l.344 `last_name` | nullable, défaut `null` | **NOT NULL**, sans défaut | idem |
| l.356 `preferred_language` | `string(5)`, nullable | **`varchar(10)` NOT NULL** défaut `'fr'` | `210400` : `string('preferred_language', 10)->default('fr')` |

Les 38 autres colonnes sont exactes, de même que les quatre index uniques (`users_email_unique`,
`users_username_unique`, `users_email_lower_unique`, `users_username_lower_unique`), les deux index
partiels de téléphone et l'index `deletion_requested_at`.

**Relations** (`app/Models/User.php`, `Concerns/HasProfiles.php`) :

- **Noms faux.** La spec écrit en snake_case : `added_by()`, `owner_profiles()`, `agent_profiles()`,
  `agency_admin_profiles()`, `service_provider_profile()`, `platform_profile()`,
  `customer_relationships()`, `related_customers()`, `saved_searches()`, `app_notifications()`,
  `written_reviews()`, `received_reviews()`. Le code déclare `addedBy()`, `ownerProfiles()`, … ,
  `savedSearches()`, `appNotifications()`, `writtenReviews()`, `receivedReviews()`. Appelée sous le nom
  de la spec, chacune lève `BadMethodCallException`. La ligne Traits (l.392) écrit pourtant juste
  `ownerProfiles()` : la section se contredit.
- **Relations absentes :**
  - `agency()` : `hasOneThrough(Agency, AgentProfile, 'user_id', 'id', 'id', 'agency_id')` (User.php
    l.423). C'est une « agence de l'utilisateur » dérivée du premier profil d'agent ; la spec dit
    seulement que `users.agency_id` n'existe plus.
  - `tenantLeases()` : `hasManyThrough` Lease via Customer (`customers.user_id` → `leases.tenant_id`).
  - `payouts()` : `hasMany` Payout via `landlord_id`. §28 l.1929 la cite comme inverse, §1 l'ignore.
  - `roleDelegations()` : `hasMany` RoleDelegation.
  - `deletionRequest()` : `hasOne` AccountDeletionRequest.
- `bookings()` passe par `created_by_id`, ce que la spec ne dit pas : les réservations *créées* par
  l'utilisateur, pas celles dont il est le client.

**Notes** (pas des ⚠️) :

- Traits non listés : `Searchable`, `LogsActivity`, `SoftDeletes`, `Notifiable`, `HasQueryBuilder`.
- Collections média : la spec décrit `avatar` seule ; le code en déclare quatre — `avatar`, `avatars`,
  `photos`, `documents` (User.php l.405-408).
- FK `users_added_by_id_foreign` en `ON DELETE SET NULL` : non écrite.

#### §2 Agency (l.451-536)

Les 36 colonnes sont exactes : types, nullabilités, défauts. Les deux FK sont en `SET NULL`,
`license_number` et `slug` sont uniques, `kind` est indexé.

**Écart :** la ligne Traits (l.510-511) ne cite que `InteractsWithMedia`. Le modèle déclare
`Auditable, HasFactory, InteractsWithMedia, LemonSqueezyBillable, Searchable, SoftDeletes`
(Agency.php l.33). Le trait `LemonSqueezy\Laravel\Billable` (TCK-079, commentaire l.31-32) ajoute trois
relations sur l'agence :

- `customer()` : `morphOne` vers `lemon_squeezy_customers`. Ce nom entre en collision sémantique avec
  `App\Models\Customer`.
- `orders()` : `morphMany` vers `lemon_squeezy_orders`.
- `subscriptions()` : `morphMany` vers `lemon_squeezy_subscriptions`. Cette relation est **masquée**
  par `Agency::subscriptions()` (hasMany `AgencySubscription`, l.214) : en PHP, la méthode de la classe
  l'emporte sur celle du trait. Les méthodes `subscribed()`, `onTrial()` et `subscription()` du trait
  liraient donc `agency_subscriptions`. Aucun appelant aujourd'hui : le seul usage du trait est
  `->checkout()`, dans `app/Services/Payments/Drivers/LemonSqueezyDriver.php` l.55.

Les cinq tables `lemon_squeezy_customers`, `_subscriptions`, `_orders`, `_license_keys` et
`_license_key_instances` existent en base. `models-spec.md` ne les mentionne nulle part : sa seule
occurrence de « lemon » est la valeur d'enum `lemon_squeezy` (l.4579).

**Notes :** `reviews_count` est écrit « unsigned integer » pour un `integer` ; l'index
`agencies_status_index` n'est pas cité ; `primary_admin_id` est en `SET NULL` sans que la section le
dise.

#### §3 Property (l.538-657) — ⚠️ mineur

**Types :** sept colonnes sont écrites `integer` et sont des `smallint` en base, ce que leurs
migrations déclarent aussi :

- `bedrooms` et `bathrooms` : `unsignedTinyInteger` (l.561-562) ;
- `floor_number`, `total_floors`, `year_built` et `parking_spaces` : `unsignedSmallInteger`
  (l.564-568) — source `2026_04_17_160005_create_properties_table` ;
- `level` : `unsignedSmallInteger` (l.570) — source `2026_04_18_000001`.

L'écart a une conséquence : un `smallint` s'arrête à 32 767, et la validation doit le savoir. `area`
est bien un `integer`.

Tout le reste est exact : les 61 colonnes, les FK (`user_id` RESTRICT, `agency_id`, `parent_id` et
les trois `*_by` en SET NULL), les quatre uniques et tous les index, qu'ils soient écrits dans la
section ou dans « Index recommandés ». Les relations et les six scopes existent.

**Notes :** l'`onDelete` de `parent_id` (SET NULL) n'est pas écrit. Les colonnes `deposit_months`,
`advance_months` et `agency_fee_months` sont dites « unsigned » sans CHECK en base : la borne est
applicative. Traits `Auditable` et `SoftDeletes` non listés.

#### §4 à §8, §10, §11, §14 à §21, §23 à §26, §28 à §31 — ✅

Colonnes, types, nullabilités et défauts sont exacts. Index, unicités et CHECK (`property_collaborators_primary_is_agent`,
`saved_searches_one_owner_chk`), FK et `onDelete` sont exacts, qu'ils soient écrits dans la section ou
dans une section transversale. Les relations décrites existent toutes. Seules subsistent des notes :

- §11 : `rating` est un `smallint` (« unsigned tinyint » dans la spec). L'index morph
  `(reviewable_type, reviewable_id)` n'est pas cité.
- §14 : `agency_id` et `booking_id` sont en SET NULL, non écrit. L'index
  `lease_guarantor_lease_id_index` n'est pas cité.
- §16 et §19 : FK `cascade` écrites seulement dans « Comportements FK ».
- §19 : le défaut `now` de `joined_at` est en base `CURRENT_TIMESTAMP` — même effet.
- §23 : l'unique `(user_id, name)` et le `cascade` de `user_id` ne figurent que dans les sections
  transversales. L'index `saved_searches_alert_subscriber_idx` n'est pas cité.

#### §9 UserCustomerRelationship (l.937-960)

Les sources sont `2026_04_17_160009_create_user_customer_relationships_table` et
`2026_04_18_030809_add_is_primary…`.

| Spec | Base |
|---|---|
| l.950 `start_date` datetime, NOT NULL, défaut `now` | **n'existe pas** — la colonne est `started_at` **date**, nullable, sans défaut |
| l.951 `end_date` datetime, nullable | **n'existe pas** — la colonne est `ended_at` **date**, nullable |
| — | `metadata` jsonb nullable, absente du tableau |
| — | unique **`ucr_unique (user_id, customer_id, relationship_type)`**, absente de §9 **et** de « Contraintes d'unicité » |
| — | index `(customer_id, status)` |
| — | FK `user_id` et `customer_id` toutes deux `ON DELETE CASCADE`, absentes de §9 et de « Comportements FK » |

Le modèle confirme la base : `$fillable` contient `started_at` et `ended_at`, castés en `date`. La
ligne l.247 (« Définir la relation agent ↔ client (type, **période**) ») repose précisément sur les deux
colonnes que la spec nomme faux. Les enums `RelationshipType` et `RelationshipStatus` sont exacts.

#### §12 AppNotification (l.1085-1167) — ⚠️ lourd

Les sources sont `2026_04_17_160032_create_app_notifications_table`,
`2026_04_26_160847_add_delivery_attempts…`, `2026_04_26_200002_add_digested_at…` et
`2026_10_07_100000_add_code_params_target…`.

**Colonnes décrites qui n'existent pas (7) :**

- `content` text NOT NULL (l.1096) : la colonne réelle est **`body`**, et elle est **nullable**.
- `is_actioned` et `actioned_at` (l.1104-1105).
- `delivered` et `delivered_at` (l.1106 et l.1108).
- `metadata` (l.1109).
- `deleted_at` (l.1110) : le modèle n'a pas `SoftDeletes`.

**Colonnes réelles absentes du tableau (5) :**

- `body` text nullable.
- `data` jsonb : porte `is_critical`, lu par `isCritical()`. Sert l.545.
- `sent_at` timestamp.
- `delivery_attempts` jsonb (TCK-102). §69 l.3490 la dit « toujours en base » ; §12 l'ignore.
- `digested_at` timestamp (TCK-103), avec l'index `(user_id, digested_at)`. Sert l.549, « Digest
  quotidien / hebdomadaire ».

La prose de §12 se contredit elle-même : l.1120 parle de « `title` et `body` », le tableau de
`content`.

**Code** (`app/Models/AppNotification.php`) :

- Scopes `unread()`, `ofType()` et `forUser()` (l.1155-1157) : **aucun n'existe**. Le seul scope est
  `scopeUndigested()`.
- Méthodes `markAsRead()` et `markAsActioned()` (l.1160-1161) : **n'existent pas**. Il existe
  `isCritical()`.
- Relation `referenceable()` → morphTo (l.1165) : **n'existe pas**. Le modèle déclare `reference()`.
  Ce n'est pas une relation : c'est une méthode qui traduit des clés courtes (`booking`, `lease`,
  `lease_payment`, `maintenance`, `property_visit`) en classe, puis appelle `::find()`. La liste de la
  spec omet `PropertyVisit`.
- Relation absente : `deliveryAttempts()` → hasMany NotificationDeliveryAttempt, ordonnée par
  `attempt` (TCK-110).
- Index : `(referenceable_type, referenceable_id)` et `(user_id, digested_at)` ne sont pas cités.

La passe 012 avait compté §12 ✅.

#### §13 ActivityLog → `App\Models\Activity` (l.1169-1204)

- l.1189 : la correspondance « `changes` → `properties` (json : `old`, `attributes`) » est fausse
  sous `spatie/laravel-activitylog ^5.0`. La table porte une colonne **`attribute_changes`** jsonb, et
  le code la lit : `Services/Crm/CustomerActivityFeed.php` l.65-67 (« activitylog v5 : les changements
  de champs vivent dans `attribute_changes` »), `GovernanceAlertService.php` l.99, et le docblock de
  `Bases/Auditable`.
- l.1172 : « `activity_log_changes` selon la configuration » — cette table n'existe pas.
- l.1173 : la « migration de données depuis `activity_logs` à réaliser » est obsolète : aucune table
  `activity_logs` en base.
- l.1176 : « Ajouter le trait `LogsActivity` sur chaque modèle » ne décrit pas le mécanisme réel. 28
  modèles passent par le trait **`App\Models\Bases\Auditable`**, qui journalise en liste blanche
  `AUDIT_ONLY` quand le modèle la déclare (TCK-601, ADR-0044 §3), sinon le `fillable` ; seules les
  colonnes modifiées entrent, et un journal vide n'est pas écrit. Ce trait n'est expliqué nulle part
  dans la spec : il n'est que listé dans les traits de §41 et suivantes.
- Le tableau des colonnes ajoutées (l.1196-1198) ne porte que `agency_id`. **`impersonator_id`**
  (`2026_10_08_600200`, FK `activity_log_impersonator_fk` en SET NULL, index
  `activity_log_impersonator_idx`) n'est décrit qu'en §83 l.3953, et c'est
  `AppServiceProvider` l.649 qui le pose.

Ce qui est juste : `agency_id`, sa FK et ses deux index, la relation `agency()`, le hook `creating`.

#### §22 Document (l.1615-1648)

Les colonnes sont exactes.

- **Relation absente :** `shareLinks()` → hasMany DocumentShareLink (Document.php). §29 l.1966 la
  cite comme « Inverse » : les deux sections se contredisent.
- **Collection absente :** `versions` (Document.php l.77). La section ne connaît que `file`. Or
  `versions` est le support de la ligne l.368, « Historique des versions d'un document ».
- **Trait absent :** `Searchable`, avec `toSearchableArray()` l.50.
- Notes :
  - FK `documents_uploaded_by_foreign` **sans `onDelete`** : la suppression d'un utilisateur qui a
    téléversé un document est refusée, et la section ne le dit pas, contrairement à §24 et §21 qui
    l'écrivent.
  - `verified_by` est en SET NULL, non écrit.
  - La liste des cibles de `documentable()` omet `Guarantor`, qui déclare pourtant `documents()`.

La passe 012 avait compté §22 ✅.

#### §27 Guarantor (l.1820-1857)

Les colonnes sont exactes, à une exception : `phone`, écrit `string`, est un `varchar(30)`. Le modèle
(`app/Models/Guarantor.php`, 50 lignes) contredit le reste de la section :

- **Traits** (l.1845-1846) : la section décrit `InteractsWithMedia` et une collection
  `id_documents`. **Ni l'un ni l'autre n'existe** : le modèle n'utilise que `HasFactory` et
  `SoftDeletes`, n'implémente pas `HasMedia`, et `id_documents` est introuvable dans `app/` comme dans
  `routes/`. Les pièces du garant passent par `documents()` (morphMany Document).
- **Accesseur** `full_name` (l.1849) : n'existe pas. Seuls `User` et `Customer` déclarent
  `getFullNameAttribute()`.
- **Relations :**
  - `addresses()` (l.1854) : n'existe pas.
  - `added_by()` est en réalité `addedBy()`.
  - `leases()` existe, mais c'est un `hasMany` par l'**ancienne** colonne `leases.guarantor_id`, que
    §14 l.1251 dit conservée « pour compatibilité ».
  - **`leasesPivot()`** → belongsToMany Lease (pivot `lease_guarantor`, `role`, timestamps) est
    **absente** de la section. C'est pourtant elle qui porte les garants réels d'un bail (§14 l.1251,
    l.1278).

La ligne l.184 (« garants avec documents joints ») est servie par `documents()`, pas par
medialibrary. La passe 012 avait compté §27 ✅.

#### §32 Task (l.2036-2063)

- **Colonne absente :** `metadata` jsonb nullable (`2026_04_24_224428_add_metadata_to_tasks_table`).
  Elle figure dans `$fillable` et est castée `array`.
- **Noms de relations faux :** la section écrit `assignedTo()` et `createdBy()` (l.2060-2061) ; le
  code déclare **`assignee()`** et **`creator()`** (Task.php l.164 et l.169).
- Notes : traits `Auditable` et `SoftDeletes` non listés. Scope `parentAgencyIn()`, méthodes
  `parentAgencyId()` et `parentIsMissing()`, filtre `due` non décrits. Les enums `TaskStatus` et
  `TaskPriority` sont exacts.

La passe 012 avait compté §32 ✅.

#### §33 CustomerNote (l.2065-2088)

- **Colonne absente :** `kind` string(20) nullable
  (`2026_10_07_591300_add_kind_to_customer_notes_table`, TCK-591), castée en `CustomerNoteKind`
  (`conversion`, `loss`), présente dans `$fillable` et journalisée. La migration a retiré des corps
  existants les préfixes « Conversion : » et « Perte : » pour poser `kind`, et son `down()` les
  réécrit. Le catalogue des enums (l.4573) renvoie à « CustomerNote.kind (§33) » : un lien vers une
  colonne que la section cible ne décrit pas. Sert l.253 (pipeline, note épinglée au changement
  d'étape).
- Note : l'index `(customer_id, created_at)` n'est écrit que dans « Index recommandés ».

La passe 012 avait compté §33 ✅.

---


## B.2 — §34 à §66


- **Worktree :** `takussan-convergence-3`, HEAD `b3793a0a` ; `docs/models-spec.md` sha1 `a745a8ce`,
  `docs/features.md` sha1 `3c3c46ff` (vérifiés à l'ouverture).
- **Mesure :** chaque table relevée **sur la base de dev migrée** (PostgreSQL 5433, lecture seule,
  `information_schema.columns` + `pg_indexes` + `pg_constraint` + `pg_trigger`), par un script php qui
  lit le `.env` sans rien imprimer. La base porte les 222 migrations du dépôt (comparaison
  `migrations` ↔ fichiers : aucun fichier manquant en base ; 5 lignes `2023_01_16_*` en base sans
  fichier, hors périmètre, aucune table de cette part). Les seuls fichiers de `takussan-api/` qui
  diffèrent entre HEAD et `origin/dev` sont `CLAUDE.md` et `Concerns/HasAgencyRole.php` (commentaire) :
  la base décrit bien le schéma de HEAD.
- **Modèles :** relations, casts, traits, scopes et `$requestLoadable` relus dans `app/Models/` (et
  `Profiles/`). Valeurs des enums relues dans `app/Models/Enums/`.
- **Règle appliquée :** aucune section comptée ✅ sans relecture colonne à colonne. Écart de prose
  sans conséquence = note ; colonne / nullabilité / défaut / contrainte / relation fausse ou absente = ⚠️.
  Le silence d'une section sur un `onDelete` que la base pose est noté, pas compté (la section
  transverse « Comportements FK » existe pour cela).

### Compteurs

| | ✅ | ⚠️ | ❌ |
|---|---|---|---|
| §34-§66 (33 sections) | **23** | **10** | **0** |

Aucun modèle de `app/Models/` sans section dans ce périmètre : les cinq modèles de `Profiles/` qui y
relèvent (`OwnerProfile`, `AgentProfile`, `ServiceProviderProfile`,
`ServiceProviderAgencyCollaboration`, `PlatformProfile`) ont chacun leur section ;
`Profiles/AgencyAdminProfile` a désormais la sienne (§98, hors périmètre). Relevé exhaustif « modèle
sans `### N. Nom` » sur tout `app/Models/` : seul `Activity` (décrit en §13).

Les treize ⚠️ hérités de la passe 012 dans ce périmètre (§34, 35, 37, 39, 40, 45, 48, 49, 52, 53, 55,
63, 66 — colonnes de TCK-256/258/260, 279, 315, 592, 593, 594, 589, 601, 602, 591 absentes) sont
**résolus** par les lots de convergence 1-3 : chaque colonne citée par la passe 011 est désormais
décrite, avec le bon type, la bonne nullabilité et le bon défaut. Les ⚠️ ci-dessous sont **nouveaux** :
la relecture colonne à colonne les trouve dans des sections que la passe 012 avait comptées ✅ sans
relecture (§41, 42, 44, 46, 47, 50, 51, 61), et dans deux sections réécrites (§40, §53).

### Tableau récapitulatif

| § | Modèle | Statut | Écart principal | Features servies (`features.md`) |
|---|---|---|---|---|
| 34 | OwnerProfile | ✅ | — (17 colonnes, 2 index, unicité, 4 FK et `onDelete` exacts) | l.91, l.301 (plafond de travaux), l.426, l.470 (chiffrement), l.505, l.527 |
| 35 | AgentProfile | ✅ | — | l.424, l.433, l.435, l.441, l.506 |
| 36 | BrokerProfile ➖ | ✅ | Mention juste ; table absente de la base | aucune — section de suppression (attendu ; l.481 dit le départ du courtier) |
| 37 | ServiceProviderProfile | ✅ | — (unicité `user_id` bien dite retirée) | l.289, l.436, l.439, l.507 |
| 38 | BrokerAgencyCollaboration ➖ | ✅ | Mention juste ; table absente de la base | aucune — section de suppression (attendu) |
| 39 | ServiceProviderAgencyCollaboration | ✅ | — (unique partiel `sp_agency_collab_live_unique` exact) | l.289, l.434, l.436 |
| 40 | BankStatement | ⚠️ | Relations écrites `uploaded_by()` / `finalized_by()` : le modèle déclare `uploadedBy()` / `finalizedBy()` ; disque du média écrit `local`, c'est le disque privé de médias ; cibles de rapprochement limitées à `BookingPayment`/`LeasePayment` | l.225, l.226, l.227 |
| 41 | BankStatementLine | ⚠️ | Morph `matched_payment` : quatre cibles (`BookingPayment`, `LeasePayment`, **`Invoice`, `Payout`**), la spec en écrit deux ; relations écrites `matched_payment()` / `confirmed_by()` au lieu de `matchedPayment()` / `confirmedBy()` | l.225, l.227 |
| 42 | KycDossier | ⚠️ | Colonnes exactes ; la spec promet un dossier par **profil** métier : aucun chemin n'en crée, le workflow est réservé à l'agence ; inverse `Agency.kycDossier()` non écrit | l.431, l.437, l.490 (la ligne que la promesse fausse) |
| 43 | Plan | ✅ | — | l.438 |
| 44 | AgencySubscription | ⚠️ | Unique partiel `agency_subscriptions_one_open_per_agency` `(agency_id) WHERE ended_at IS NULL` absent de la spec | l.438 |
| 45 | PlatformPayout | ✅ | — (19 colonnes, unique partiel, 4 FK `onDelete` exacts) | l.218, l.229, l.230, l.231 |
| 46 | Announcement | ⚠️ | `segment` écrit NOT NULL : la colonne est **nullable** | l.548 |
| 47 | AnnouncementDismissal | ⚠️ | `created_at` / `updated_at` existent, non écrits ; relations `announcement()` et `user()` non écrites | l.548 |
| 48 | Invitation | ✅ | — (note : trois `onDelete` non écrits) | l.501, l.504, l.505, l.506, l.507 |
| 49 | AgencyUpgradeRequest | ✅ | — (note : `submitted_at` « auto » n'a pas de défaut en base) | l.432, l.470 |
| 50 | TenantOnboardingChecklist | ⚠️ | `reminders_sent` écrit NOT NULL défaut `'[]'` : nullable sans défaut en base (défaut côté modèle) ; index réel `(completed_at, created_at)` ; le drapeau d'agence est écrit dans le mauvais sens | l.203 |
| 51 | PlatformProfile | ⚠️ | Relation écrite `granted_by()` : le modèle déclare `grantedBy()` (et c'est le nom que `include=` accepte) | l.462, l.502, l.504, l.520, l.668 |
| 52 | AgencyRole | ✅ | — (2 index, 2 unicités dont la partielle, relations exactes) | l.425, l.525, l.528 |
| 53 | AgencyRoleCapability | ⚠️ | Relation `agencyRole()` du modèle non écrite (la section n'a aucune rubrique Relations) | l.521, l.528, l.529 |
| 54 | WhatsappContact | ✅ | — | l.544, l.550, bloc l.552-563 |
| 55 | NotificationTemplate | ✅ | — (14 colonnes, unique, index exacts) | l.540, l.544, l.666 |
| 56 | AccountDeletionRequest | ✅ | — | l.471, l.669 |
| 57 | DataExport | ✅ | — | l.472, l.473 |
| 58 | FeatureFlag | ✅ | — (catalogue `media_watermark` / `host_auto_space` exact) | l.427, l.635, l.679 |
| 59 | AlertRule | ✅ | — (absence de relation exacte) | l.622, l.623 |
| 60 | MaintenanceWindow | ✅ | — | l.678 |
| 61 | ScheduledTaskRun | ⚠️ | `status` est casté en enum `ScheduledTaskRunStatus` (4 valeurs, TCK-383) : la spec écrit un `string` sans valeurs | l.673 |
| 62 | ReportExport | ✅ | — (note : `xlsx` accepté, CSV toujours produit) | l.600 |
| 63 | IntegrationWebhookLog | ✅ | — (27 colonnes, 6 index, 3 FK `onDelete` exacts) | l.224, l.677 |
| 64 | KpiConfig | ✅ | — (14 métriques et exposition API exactes) | l.601 |
| 65 | ThresholdAlert | ✅ | — (6 métriques, 4 opérateurs exacts) | l.602 |
| 66 | RoleDelegation | ✅ | — (17 colonnes, 5 index, 5 FK `onDelete` exacts) | l.441, l.530 |

Aucune section orpheline côté catalogue : les 31 sections vivantes servent au moins une ligne ; §36 et
§38 n'en servent aucune, par construction.

### Détail des ⚠️

#### §40 BankStatement — `bank_statements` (`2026_04_28_000001`, `2026_10_07_150300`)

**Colonnes :** 17/17 exactes (types, nullabilités, défauts — `lines_count` et `skipped_lines_count`
sont `integer`, ce que donne `unsignedInteger` sur PostgreSQL ; `source_format` est `varchar(8)`).
Unicité `bank_statements_agency_hash_unique (agency_id, file_hash)`, index `(agency_id, status)`,
`(agency_id, created_at)`, FK `agency_id` CASCADE, `uploaded_by` RESTRICT, `finalized_by` SET NULL :
exacts.

**Écarts :**
1. **Noms de relation faux** (models-spec.md l.2297-2298) : `uploaded_by()` et `finalized_by()`.
   Le modèle déclare `uploadedBy()` et `finalizedBy()`, et `$requestLoadable = ['uploadedBy',
   'finalizedBy', 'agency']` — un `include=uploaded_by` lu sur la spec est refusé.
2. **Disque du média faux** (l.2292) : « collection `statement` (single file, disk `local`) ». Le
   modèle fait `->singleFile()->useDisk(config('media-library.disk_name'))`, c'est-à-dire
   `MEDIA_PRIVATE_DISK` (défaut `local` seulement en développement ; disque privé R2 depuis TCK-538,
   commit `259950ae`).
3. **Description étroite** (l.2262) : « réconcilié avec les paiements existants (`BookingPayment`,
   `LeasePayment`) ». `ReconciliationManager::ALLOWED_PAYMENT_TYPES` admet aussi `Invoice` et
   `Payout` (TCK-593, `2026_10_07_150200_add_bank_reconciliation_to_payouts_table`) — c'est le
   support même de la ligne `features.md` l.227.

#### §41 BankStatementLine — `bank_statement_lines` (`2026_04_28_000002`)

**Colonnes :** 18/18 exactes (`match_confidence` = `smallint`, forme PostgreSQL de
`unsignedTinyInteger` ; `currency` = `char(3)`). Index `(bank_statement_id, match_status)`,
`bsl_matched_payment_idx`, `(posted_at, amount)`, FK `bank_statement_id` CASCADE, `confirmed_by`
SET NULL : exacts.

**Écarts :**
1. **Cibles du morph incomplètes** (l.2313, l.2328, l.2346) : la spec écrit `BookingPayment` ou
   `LeasePayment`. Le code en écrit quatre : `ReconciliationManager::ALLOWED_PAYMENT_TYPES` =
   `BookingPayment`, `LeasePayment`, `Invoice`, `Payout` ; `ReconciliationMatcher` propose aussi
   `Invoice` et `Payout` (TCK-593). Les quatre tables portent `bank_statement_line_id` avec un unique
   partiel (déjà juste dans « Contraintes d'unicité »). La valeur stockée est le nom de classe
   complet (`get_class($payment)`), aucun morph map.
2. **Noms de relation faux** (l.2346-2347) : `matched_payment()` / `confirmed_by()` ; le modèle
   déclare `matchedPayment()` (`morphTo('matched_payment')`) et `confirmedBy()`.
3. Note : le modèle implémente `HasAuditAgency` (`auditAgencyId()`), non écrit.

#### §42 KycDossier — `kyc_dossiers` (`2026_05_07_000221`, `2026_10_08_601500`)

**Colonnes :** 12/12 exactes. Unicité `(subject_type, subject_id)`, index `status`,
`kyc_dossiers_status_expires_idx`, FK `reviewed_by` SET NULL : exacts. Note : la base porte en plus
un index **non unique** `kyc_dossiers_subject_type_subject_id_index` sur les mêmes colonnes (créé par
`morphs()`), redondant avec l'unique.

**Écart :** la description (l.2358) et `reviewed_by` (l.2368) promettent un dossier attaché « ou à un
profil métier (OwnerProfile, AgentProfile, ServiceProviderProfile) », statué « par l'agency_admin pour
les profils internes ». Mesuré : seul `Agency::kycDossier()` (`morphOne`) existe ; aucun profil ne
déclare la relation ; `KycWorkflowService` n'a que `dossierForAgency()` et ne valide que
`AGENCY_REQUIRED_DOCUMENTS` ; en base de dev, `subject_type` ne prend que `App\Models\Agency`. Le
schéma le *permettrait*, aucun chemin ne le fait. Conséquence : `features.md` l.490 (P1, « KYC
distinct par profil — un dossier par profil ») paraît servie par §42 et ne l'est pas. Note : traits
écrits `LogsActivity` — le modèle utilise `Auditable`, qui l'enveloppe (sans conséquence).

#### §44 AgencySubscription — `agency_subscriptions` (`2026_05_07_000222`)

**Colonnes :** 12/12 exactes ; index `(agency_id, ended_at)` et `status`, FK `agency_id` CASCADE,
`plan_id` RESTRICT : exacts.

**Écart :** la migration pose par `DB::statement` l'index **unique partiel**
`agency_subscriptions_one_open_per_agency ON agency_subscriptions (agency_id) WHERE ended_at IS NULL`.
Ni la rubrique « Index » (l.2445-2447) ni la section transverse « Contraintes d'unicité » ne
l'écrivent. La description dit « au plus une souscription active à un instant T » : la base garantit
plus fort — au plus une souscription **ouverte** (non archivée), quel que soit son `status`. Note : le
scope `current()` (`ended_at IS NULL`) n'est pas écrit, seul `active()` l'est.

#### §46 Announcement — `announcements` (`2026_05_07_000224`)

**Écart :** `segment` est écrit non nul sans défaut (l.2519) ; la colonne est `jsonb NULL`
(`->nullable()`), et `StoreAnnouncementRequest` / `UpdateAnnouncementRequest` valident
`'segment' => ['nullable', 'array']`. La description de la même ligne (« l'absence de segment = tout
le monde ») dit vrai ; c'est la colonne « Nullable » qui contredit. Notes : FK `created_by` en
`ON DELETE SET NULL`, non écrite ; scope `currentlyVisible()` non écrit ; `LogsActivity` = `Auditable`.
Les 10 autres colonnes et l'index `(is_active, starts_at, ends_at)` sont exacts.

#### §47 AnnouncementDismissal — `announcement_dismissals` (`2026_05_07_000224`)

**Écarts :**
1. La table porte `created_at` et `updated_at` (`$table->timestamps()`, l.32 de la migration) en plus
   de `dismissed_at` (`useCurrent()`) : le tableau (l.2545-2548) ne les écrit pas.
2. Aucune rubrique « Relations » : le modèle déclare `announcement()` et `user()` (belongsTo).

`dismissed_at` NOT NULL `DEFAULT CURRENT_TIMESTAMP`, unicité `(announcement_id, user_id)`, deux FK
CASCADE : exacts.

#### §50 TenantOnboardingChecklist — `tenant_onboarding_checklists` (`2026_05_10_200000`)

**Écarts :**
1. **`reminders_sent`** (l.2672) écrit non nul, défaut `'[]'`. En base : `jsonb NULL`, **sans
   défaut** (`->nullable()`, l.42 de la migration) ; le `'[]'` est un défaut **du modèle**
   (`$attributes = ['reminders_sent' => '[]']`). Même situation que `meta_variables` en §55, que la
   spec, elle, écrit juste (« défaut `[]` côté model, pas de DEFAULT JSON en migration »).
2. **Index** (l.2680) écrit `(completed_at)` ; l'index réel est composé
   `tenant_onboarding_checklists_completed_at_created_at_index (completed_at, created_at)`.
3. **Sens du drapeau inversé** (l.2689) : « N'est pas créé si l'agence n'a **pas activé** le workflow
   EDL ». `TenantOnboardingService::create()` lit
   `data_get($agency->settings, 'tenant_onboarding_enabled', true)` et ne s'abstient que sur un
   `false` **explicite** : le workflow est actif par défaut (opt-out), la spec le décrit opt-in.
4. Note : FK `user_id` en `ON DELETE CASCADE`, non écrite ; scope `incomplete()` non écrit.

#### §51 PlatformProfile — `platform_profiles` (`2026_05_17_100000`)

**Écart :** relation écrite `granted_by()` (l.2717) ; le modèle déclare `grantedBy()`, et
`$requestLoadable = ['user', 'grantedBy']`. Note : `level` est `varchar(32)` (la spec dit le type
d'enum, sans longueur — sans conséquence). Les 10 colonnes (dont `granted_at` NOT NULL
`DEFAULT CURRENT_TIMESTAMP`), l'unicité `user_id`, l'index `level`, FK `user_id` CASCADE et
`granted_by_id` SET NULL sont exacts.

#### §53 AgencyRoleCapability — `agency_role_capabilities` (`2026_08_16_120100`)

**Écart :** la section n'a pas de rubrique « Relations » ; le modèle déclare `agencyRole()`
(belongsTo `AgencyRole`) et la méthode `toCapability(): ?Capability`. Les 5 colonnes, l'unique
`arc_role_capability_unique`, l'index `arc_capability_idx` et la FK `arc_agency_role_id_fk` CASCADE
sont exacts. Écart mineur, compté ⚠️ par la règle de la passe (relation absente).

#### §61 ScheduledTaskRun — `scheduled_task_runs` (`2026_05_07_000226`)

**Écart :** `status` est écrit `string`, défaut `'finished'`, « Issue de l'exécution » (l.3076), sans
type ni valeurs. Le modèle le caste en `ScheduledTaskRunStatus` — `finished`, `failed`, `skipped`,
`running` —, enum ajoutée par TCK-383 (`40f61caa`, 2026-08-27), **après** la mesure TCK-310
(2026-08-16) dont la section se réclame. Colonnes, défaut et index `task` exacts en base.

### Notes sur les ✅ (sans effet sur le compte)

- **§36, §38** : mentions justes, mesurées. `2026_10_07_090100_drop_broker_tables` existe, supprime
  `broker_agency_collaborations` **puis** `broker_profiles` (l'ordre écrit en §38) ; son `down()`
  recrée les deux tables vides, à l'identique des migrations d'origine
  `2026_05_02_000003` et `2026_05_02_000005` (comparées instruction par instruction). En base :
  aucune table ni colonne dont le nom contient `broker`, aucune contrainte qui la cite. Aucun modèle
  courtier dans `app/Models/` (les deux occurrences de `broker` dans `app/` sont
  `Password::broker()`). ADR-0030 existe et cite TCK-586.
- **§48 Invitation** : trois comportements FK non écrits, dont deux destructeurs — `agency_id`
  `ON DELETE CASCADE`, `invited_by` `ON DELETE CASCADE` (supprimer l'inviteur supprime ses
  invitations), `invited_user_id` `SET NULL`. Scopes `pending()` / `expired()` non écrits.
- **§49 AgencyUpgradeRequest** : `submitted_at` écrit défaut « auto » ; en base NOT NULL **sans
  défaut**, posé par `AgencyUpgradeRequestService` (`now()`). FK `reviewed_by` SET NULL non écrite.
- **§52 AgencyRole** : `base_profile_type` est casté `AgencyRoleBaseType` (valeurs identiques à celles
  écrites).
- **§62 ReportExport** : la spec écrit `format` = `csv` / `xlsx`, et `ReportExportRequest` accepte
  `in:csv,xlsx` ; mais `GenerateReportExport` écrit **toujours** un CSV sous `.csv`, sans lire
  `format`. La colonne est juste ; le comportement qu'elle laisse croire ne l'est pas (sert l.600).
- **§43, §46** : traits écrits `LogsActivity` ; les modèles utilisent `Auditable`, qui l'enveloppe.


## B.3 — §67 à §99, exhaustivité, sections transversales


- **Arbre jugé :** worktree `takussan-convergence-3`, HEAD `b3793a0a`, `docs/models-spec.md` sha1 `a745a8ce`
  (5095 lignes), `docs/features.md` sha1 `3c3c46ff`.
- **Base lue :** PostgreSQL de dev (port 5433, conteneur `takussan-postgres-1`), en lecture seule : `\d <table>`,
  `pg_indexes`, `pg_constraint`, `pg_trigger`, `pg_proc`. Elle porte **227** lignes dans `migrations` : les
  222 fichiers de `database/migrations/` **plus 5 migrations du paquet `lemonsqueezy/laravel`**
  (`2023_01_16_000001` à `000005`, chargées depuis `vendor/`). Elle ne porte pas `2026_10_14_100000` /
  `100100` (TCK-639).
- **Méthode :** chaque section relue colonne à colonne (type, longueur, nullabilité, défaut), puis index,
  unicités, CHECK, FK (nom et `ON DELETE`), puis relations, scopes et traits contre `app/Models/`.
  Règle de la passe : un index **omis** d'une section qui liste ses index (ou qui n'en liste aucun alors que
  la table en a) empêche le ✅. Ces cas sont marqués « ⚠️ index » pour être comptés à part des écarts de
  colonne, de contrainte ou de relation.

### 1. Tableau récapitulatif §67-§99

| § | Modèle | Statut | Écart principal | Features servies |
|---|---|---|---|---|
| 67 | PropertyContactLead | ✅ | Les 19 colonnes, 7 index, 5 FK exacts (`2026_05_05_000001`, `2026_08_27_120000`, `2026_10_07_150000_alter_property_contact_leads_for_inbox`, `2026_10_07_150200_normaliser_les_telephones_saisis`). Le ⚠️ des passes 011-012 (`channel` et 6 autres colonnes absentes) est **résolu** par les lots 1-3. Note : la section cite `2026_10_07_150000` et `150200` par leur seul horodatage, partagé par 2 et 3 fichiers (RC12) | §1.2 l.118, l.128 ; §1.6 l.252 |
| 68 | PropertyReport | ✅ | Exact, dont `decision`, `resolved_by_id` (FK `property_reports_resolved_by_fk`), `reason_code`, `reporter_fingerprint` et l'index `property_reports_fingerprint_idx`. Les 5 motifs sont ceux de `ReportPublicPropertyRequest`. Le ⚠️ des passes 011-012 est **résolu** | §1.1 l.100 ; §1.2 l.134 |
| 69 | NotificationDeliveryAttempt | ✅ | Exact. Note : l'index `(app_notification_id, attempt)` s'appelle `nda_notification_attempt_idx`, nom que la section ne donne pas. La note sur `app_notifications.delivery_attempts` (jsonb, `$fillable`, cast `array`) est juste | §2.3 l.561 (suivi de livraison) |
| 70 | WizardDraft | ✅ | Exact (`step` smallint défaut 0, `data` jsonb, unique `(user_id, key)`, index `updated_at`) | §2.1 l.508 |
| 71 | WelcomeView | ✅ | Exact. Note : « les deux seuls modèles à couper les timestamps » reste vrai pour `$timestamps = false` ; `CreditMovement` coupe `updated_at` seul (`UPDATED_AT = null`), ce que §96 dit. Un renvoi éviterait la lecture contradictoire (RC13) | §2.1 l.503, l.509 ; §1.4 l.203 |
| 72 | CalendarFeed | ⚠️ index | Index `calendar_feeds_agency_idx (agency_id)` absent : la section écrit « **Index :** `(user_id, agency_id)` » seul. Colonnes, FK et unicité exactes (`2026_10_07_591100_create_calendar_feeds_table`) | §1.3 l.174 |
| 73 | ModerationClaim | ✅ | Exact (`2026_10_08_100300`) | §2.9 l.676 |
| 74 | MediaFingerprint | ⚠️ index | Index `media_fingerprints_agency_idx (agency_id)` absent de la liste. Les noms de FK (`media_fingerprints_media_fk`, `_property_fk`, `_agency_fk`) ne sont pas donnés, alors que les sections voisines les donnent (sans conséquence). Pas de relation `agency()` sur le modèle, et la section n'en annonce pas (`2026_10_08_100500`) | §1.1 l.104 |
| 75 | DuplicateSuspicion | ⚠️ index | Aucune ligne **Index** alors que la table en a deux : `duplicate_suspicions_matched_idx (matched_property_id)` et `duplicate_suspicions_open_idx (resolved_at, created_at)`, ce dernier servant la file « ouverte ». Le reste est exact, y compris l'unique sur expression `LEAST`/`GREATEST` (`2026_10_08_100600`) | §1.1 l.104 ; §2.9 l.676 |
| 76 | PayoutMethod | ✅ | Exact (`2026_10_07_200000`, `2026_10_08_100000_create_payout_method_verifications_table`). Note : le scope `verifiedFor(int $agencyId)` du modèle n'est pas nommé. La section cite `2026_10_08_100000`, horodatage partagé par 3 fichiers (RC12) | §1.5 l.233 |
| 77 | ServiceProviderBill | ✅ | Exact, y compris l'unique partiel `sp_bills_one_open_per_request` et `provider_id` en `RESTRICT` (`2026_10_07_200100`) | §1.8 l.305 |
| 78 | PayoutMethodVerification | ✅ | Exact. Même ambiguïté de référence `2026_10_08_100000` (RC12) | §1.5 l.233 |
| 79 | PrivacyRequest | ✅ | Exact (`2026_10_08_601400`). Traits `Auditable`, `InteractsWithMedia`, cohérents avec la prose | §2.9 l.670 ; §2.1 l.472 |
| 80 | PropertyUnavailability | ✅ | Exact, y compris la CHECK `prop_unavail_range_check` et l'unique partiel `prop_unavail_feed_uid_unique`. Note : `created_by_id` est en `nullOnDelete` (`prop_unavail_created_by_fk`), comportement que la section ne précise pas (`2026_10_08_010100`) | §1.3 l.172-173 |
| 81 | PropertyCalendarFeed | ⚠️ index | Aucune ligne **Index** alors que la table a `prop_cal_feeds_property_idx (property_id)`. `created_by_id` est en `nullOnDelete`, non dit. Colonnes exactes. Plafond de 10 = `PropertyCalendarSyncService::MAX_FEEDS_PER_PROPERTY` (`2026_10_08_010000`) | §1.3 l.173 |
| 82 | LeaseSignature | ⚠️ index | Index `lease_signatures_user_idx (user_id)` absent : seule l'unicité est écrite. `on_behalf_of_user_id` et `recorded_by_id` sont en `nullOnDelete` (`lease_signatures_behalf_fk`, `_recorder_fk`), non dit ; `user_id` l'est (`2026_10_08_020100`) | §1.4 l.201 |
| 83 | ImpersonationSession | ✅ | Exact (`2026_10_08_600100`) : 3 index, unicité du jeton, 3 FK, scope `open()`, `TTL_MINUTES = 15` | §2.9 l.674 |
| 84 | LeasePaymentLink | ✅ | Exact (`token_hash` character(64), unique partiel `lpl_one_active_per_payment_unique`, `leasePayment()` en `withTrashed`) (`2026_10_08_170000`) | §1.5 l.222 |
| 85 | CommissionEntry | ✅ | Exact (`2026_10_08_150100`) : 5 FK, unicité `commission_entries_lease_benef_uq`, 2 index, scope `visibleTo` | §1.5 l.234 ; §2.5 l.596 |
| 86 | PlatformMetricDaily | ✅ | Exact : 3 flux NOT NULL défaut 0, 11 stocks nullables, unique `date` (`2026_10_08_150200`) | §2.5 l.597 |
| 87 | AlertSubscriber | ✅ | Exact (`2026_10_08_599200`). Les deux uniques (`confirmation_token_hash`, `unsubscribe_token_hash`) sont dites dans les colonnes. `consent_source = 'public_search_alert'` correspond à `RecordPublicSearchAlert` | §1.2 l.141 |
| 88 | PropertyContact | ✅ | Exact (`2026_10_12_300200`) ; inverse `Property::contacts()` trié par `position` | §1.1 l.85 |
| 89 | GeoRegion | ✅ | Exact (`2026_10_12_400000`) | §1.1 l.74 ; §1.2 l.116 |
| 90 | GeoCity | ✅ | Exact, y compris les deux expressions ICU et `RESTRICT` ; `Address::geoCity()` existe | §1.1 l.74 ; §1.2 l.116 |
| 91 | GeoNeighborhood | ✅ | Exact, y compris l'unique partiel, `merged_into_id` auto-référent `SET NULL` et les 3 index | §1.1 l.74 ; §2.9 l.661 |
| 92 | BoostProduct | ✅ | Exact : `NULLS NOT DISTINCT`, CHECK `boost_products_price_check` (`2026_10_12_500100`) | §1.1 l.87 ; §2.9 l.662 |
| 93 | PropertyBoost | ✅ | Exact sur la base sans TCK-639 : 22 colonnes, 5 FK, 3 index, CHECK `property_boosts_credits_check` (`500100`, `500500`) | §1.1 l.87 ; §1.2 l.117 ; §2.9 l.662 |
| 94 | PropertyBoostDailyStat | ✅ | Exact | §1.2 l.117 ; §2.9 l.662 |
| 95 | CreditLot | ✅ | Exact sur la base sans TCK-639 : CHECK `credit_lots_amounts_check`, index `credit_lots_agency_expires_idx`, scopes `spendable` / `inConsumptionOrder` (`500200`) | §1.12 l.428 ; §1.1 l.87 |
| 96 | CreditMovement | ⚠️ | **M44 de la passe 012, non appliquée.** La fonction de `2026_10_12_500200` (relue dans `pg_proc`) admet **toute** mise à `NULL` de `property_boost_id` / `actor_id`, **sans condition de profondeur**. Un `UPDATE credit_movements SET actor_id = NULL` direct passe donc, alors que la section ne l'admet « que par `ON DELETE SET NULL` ». Colonnes, CHECK, 3 index et `UPDATED_AT = null` sont exacts | §1.12 l.428 ; §2.9 l.662 |
| 97 | CreditWelcomeGrant | ✅ | Exact sur la base sans TCK-639 : deux uniques, 3 FK `SET NULL` ; la table n'a pas d'autre index (`500200`, `500500`) | §1.12 l.428 |
| 98 | AgencyAdminProfile | ⚠️ | La relation inverse est écrite `User.agency_admin_profiles()`, mais le seul nom qui existe est `agencyAdminProfiles()` (`Concerns/HasProfiles.php:54`). Eloquent ne résout pas un nom en snake_case : le nom écrit ne fonctionne pas. Le même défaut est en §1 l.425-427 (hors périmètre). Colonnes, 3 FK `RESTRICT`, unicité et 2 index exacts | §1.12 l.427 (auto-création d'espace) ; §2.2 l.425 |
| 99 | NotificationPreference | ✅ | Exact (`2026_04_23_090000`) ; `User::notificationPreferences()` existe | §2.3 l.543 |

**Compteurs §67-§99 (33 sections) : 26 ✅ / 7 ⚠️ / 0 ❌.** Les ⚠️ se répartissent ainsi :
- **5 « ⚠️ index »** (§72, §74, §75, §81, §82) : la passe 012 les avait comptées ✅ dans le lot « §69-87 », sans relecture colonne à colonne. Aucune colonne n'y est fausse : il manque seulement l'index d'une FK ou d'une file.
- **2 écarts de contrainte ou de relation** : §96 (trigger) et §98 (nom de la relation inverse).

Passages depuis la passe 012 : §67 et §68 passent ⚠️ → ✅ (corrigées par les lots 1-3) ; §72, 74, 75, 81 et 82 passent ✅ → ⚠️ (re-jugement strict) ; §98 était ❌ (sans fiche), elle devient ⚠️.

#### TCK-639 (PR #378, `origin/feat/tck-639-registre-credits` `229f021a`) — une ligne par section

`git merge-tree` de `b3793a0a` avec la branche : **aucun conflit**. Jugé sur le texte de #378 contre ses deux migrations, que la base ne porte pas encore :

- **§93** — reste ✅ : les trois index ajoutés au texte (`property_boosts_product_idx`, `_purchased_by_idx`, `_cancelled_by_idx`) sont ceux que crée `2026_10_14_100100_index_credit_and_boost_foreign_keys`.
- **§95** — reste ✅ : `credit_lots_granted_by_idx (granted_by_id)` correspond à `100100`.
- **§96** — passe ⚠️ → ✅. `2026_10_14_100000_harden_credit_movements_append_only` subordonne la mise à `NULL` à `pg_trigger_depth() > 1`, et le texte décrit exactement les deux écritures admises, avec la limite assumée (« émis par un trigger » ≠ « émis par une clé étrangère »). L'index `credit_movements_actor_idx` est juste. Reste une seule nuance : un `UPDATE` qui ne change aucune valeur passe à la profondeur 1, ce qui est sans effet, alors que la phrase « tout UPDATE … direct lève » ne l'exclut pas.
- **§97** — reste ✅ : `credit_welcome_grants_user_idx` et `_lot_idx` correspondent à `100100`.

### 2. Exhaustivité

#### 2.1 Modèles

`find takussan-api/app/Models -name '*.php'` : 199 fichiers.

**Écartés : 102 fichiers.**
- `Bases/AbstractModel` (classe abstraite) et `Bases/Auditable` (trait).
- Les 5 traits de `Concerns/` (`HasAgencyRole`, `HasMediaConversions`, `HasPaymentAttributes`, `HasProfiles`, `HasQueryBuilder`).
- L'interface `Contracts/HasAuditAgency`.
- Les 96 enums de `Enums/` et `Bases/Enums/UserStatus` (voir § 3.3).

**Modèles concrets : 97.**
- **96 ont une section `### N.`**, dont 6 dans `Profiles/` (`AgencyAdminProfile`, `AgentProfile`, `OwnerProfile`, `PlatformProfile`, `ServiceProviderAgencyCollaboration`, `ServiceProviderProfile`).
- **`Activity`** est décrit dans §13 (« `App\Models\Activity` (TCK-601, ADR-0044 §3) », colonne `agency_id`), et sa colonne `impersonator_id` dans §83.
- **Modèle sans fiche : aucun.** Les deux ❌ de la passe 012 (`AgencyAdminProfile`, `NotificationPreference`) sont levés : ce sont désormais §98 et §99.

Trois sections n'ont pas de modèle, et c'est légitime : §13 `ActivityLog` (remplacé par le paquet), §36 `BrokerProfile` et §38 `BrokerAgencyCollaboration`. Ces deux dernières sont marquées ➖ « Supprimé le 2026-10-07 » et pointent `2026_10_07_090100_drop_broker_tables`. Les ❌ « courtier décrit vivant » de la passe 012 sont donc levés.

#### 2.2 Tables

La base compte **116 tables** (`information_schema.tables`, schéma `public`). 96 ont une ligne `**Table :**`. Les 20 autres se répartissent ainsi :

| Table | Statut |
|---|---|
| `activity_log` | Décrite par §13 et « Packages transversaux » (paquet spatie ; colonnes `agency_id` et `impersonator_id` à nous) |
| `lease_guarantor` | Pivot décrit dans §14 (l.1279) |
| `payout_lease_payment`, `payout_booking_payment` | Pivots décrits dans §28 (l.1906) et dans « Contraintes d'unicité » |
| `taggables` | Pivot décrit dans §10 et dans « Contraintes d'unicité » |
| `personal_access_tokens` | Décrite dans « Packages transversaux » (Sanctum) ; ses 3 index sont exacts |
| `media` | Table du paquet medialibrary, nommée par « Packages transversaux » ; ses colonnes ne sont pas décrites, ce qui est voulu |
| `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`, `sessions`, `password_reset_tokens`, `migrations` | **Écartées** : tables techniques du framework Laravel (cache, files, sessions, réinitialisation de mot de passe, registre des migrations), sans modèle applicatif |
| **`lemon_squeezy_customers`, `lemon_squeezy_subscriptions`, `lemon_squeezy_orders`, `lemon_squeezy_license_keys`, `lemon_squeezy_license_key_instances`** | **Décrites nulle part — ni table, ni paquet.** Elles sont créées par les migrations du paquet `lemonsqueezy/laravel` (exécutées depuis `vendor/`, hors de `database/migrations/`), et `Agency` porte le trait `LemonSqueezy\Laravel\Billable` (TCK-079). Ce sont des tables fonctionnelles de facturation (morph `billable` → `Agency`), pas des tables techniques. Vides en dev. → RC4 |

Aucune ligne `**Table :**` ne nomme une table absente de la base.

### 3. Sections transversales

#### 3.1 Table des matières

- **Ancres :** j'ai calculé les 178 ancres de titres selon l'algorithme de GitHub (minuscules ; suppression de tout ce qui n'est ni lettre, ni marque, ni chiffre, ni `_`, ni espace, ni `-` ; espaces → `-` ; suffixe `-1`… sur les doublons), puis confronté les liens internes `](#…)` du document. **Tous résolvent, sauf un probable :** `#12-appnotification-` (l.149). Le titre `### 12. AppNotification ✏️` contient le sélecteur de variante U+FE0F, qui est une **marque** (catégorie Mn) et n'est donc pas retiré. L'ancre réelle est `12-appnotification-` suivi de U+FE0F, et le lien n'y mène pas. Les emoji sans sélecteur (✅ 🆕 ➖) sont bien retirés, et leurs liens résolvent. `#enums-1` résout, car « Enums » est un titre en double (l.305 et l.4473).
- **Couverture :** les 99 sections sont listées dans la table, avec leur bon numéro.
- **Affirmation fausse (l.271-275) :** « §72 à §97 sont des modèles posés après TCK-310 […] le plus ancien, §72, par `2026_10_07_591100` ». C'est faux, car §76 (`2026_10_07_200000_create_payout_methods_table`) et §77 (`2026_10_07_200100_create_service_provider_bills_table`) le précèdent.
- **Bloc « Sections transversales » (l.309-317) :** il omet « Résumé des changements », « Packages transversaux » et « Légende ».

#### 3.2 Packages transversaux

- **Médias :** le tableau des collections est exact. Je l'ai comparé à `grep addMediaCollection` : 11 modèles, collections identiques, et les mêmes 11 modèles portent `InteractsWithMedia`.
- **Sanctum :** exact (2 colonnes à nous, 3 index).
- **`spatie/laravel-activitylog` :** la section écrit « via le trait `LogsActivity` sur chaque modèle concerné ». En réalité, les modèles portent `App\Models\Bases\Auditable`, qui enveloppe `LogsActivity` (28 modèles). Seuls `User`, `Invitation` et `LeasePaymentLink` le nomment directement. Note de prose, sans conséquence.
- **`spatie/laravel-permission`, phase 1 :** les helpers « `isCustomerOf($agency)` / `isTenantOf($agency)` » **n'existent pas** (aucune occurrence dans `app/`). Les rôles dérivés sortent de `HasProfiles` (`$types->push('tenant')`, l.260). Par ailleurs, `isAgentAt` et `hasProfileAt` prennent un `int $agencyId`, pas une `Agency`.
- **Paquets absents de la section** alors qu'ils touchent plusieurs modèles ou créent des tables :
  - `lemonsqueezy/laravel` : 5 tables, trait `Billable` sur `Agency`.
  - `laravel/scout` : `Searchable` sur 7 modèles (`Agency`, `Customer`, `Document`, `MaintenanceRequest`, `Message`, `Property`, `User`), cité section par section seulement.
  - `spatie/laravel-query-builder` : `HasQueryBuilder` sur les modèles.
- **Observation hors spec, non éprouvée à l'exécution :** `Agency` déclare `subscriptions(): HasMany` (`AgencySubscription`, l.214). Cette méthode masque celle de même nom du trait `Billable` (`ManagesSubscriptions::subscriptions(): MorphMany`). Les méthodes du trait qui s'appuient sur `subscriptions()` (`subscription()`, `onTrial()`…) liraient donc `agency_subscriptions`. À vérifier par ticket si ces méthodes sont appelées.

#### 3.3 Enums

J'ai comparé par script les 96 enums de `app/Models/Enums/` au tableau, en présence et en valeurs. Résultat :
- **96/96 présents, valeurs exactes**, y compris les ⚠️ de la passe 012 (`LeaseStatus` + `terminating`, `PayoutStatus` + `awaiting_approval`, `MessageType` + `audio`, `RelationshipType` sans `broker_client`), désormais corrigés.
- `Capability` et `PlatformAbility` sont cités par renvoi au fichier, comme prévu.
- Aucun enum du tableau n'est absent du code. La seule exception est `UserType`, barrée et marquée supprimée, ce qui est juste : ni `Enums/UserType.php` ni `Bases/Enums/UserType.php` n'existent.

**Hors tableau : `app/Models/Bases/Enums/UserStatus.php`.** C'est un homonyme **mort** (aucune référence dans `app`, `database`, `routes`, `config`, `tests`) aux valeurs **divergentes** : `active, inactive, suspended, banned`, contre `active, inactive, blocked, deleted` pour `Enums/UserStatus`, la seule utilisée. Le tableau ne le mentionne pas. → RC11.

#### 3.4 Catalogue `Capability`

Les **47/47** valeurs de `Capability.php` sont exactes, sans valeur manquante ni en trop. L'avertissement « Extrait, pas référence » est prudent, mais l'extrait est aujourd'hui exhaustif. Note mineure : la phrase « verbes normalisés (`create`, …, `view`, …) » cite `view`, qui n'existe que sous la forme `view_global`, `view_agency` ou `view_all`. La Règle 6 ne dit plus « 44 cas » : elle renvoie à `grep -c` (M4 de la passe 012 levée).

#### 3.5 Contraintes d'unicité

- **Chaque ligne existe en base**, avec le type et la condition annoncés (53 lignes relues contre `pg_indexes` / `pg_constraint`). Les nullabilités qui fondent « si non null » / « toujours » sont exactes. `taggables_pkey` est bien la PK composite `(tag_id, taggable_id, taggable_type)`. Les CHECK citées existent (`property_collaborators_primary_is_agent`, `invitations_email_or_phone_check`).
- **Deux uniques de la base ne sont décrits nulle part**, ni ici ni dans leur section :
  - `ucr_unique (user_id, customer_id, relationship_type)` sur `user_customer_relationships` : §9 est muette.
  - `agency_subscriptions_one_open_per_agency (agency_id) WHERE ended_at IS NULL` : §44 est muette, et seul le scope `active()` y parle d'`ended_at IS NULL`.
- **Description incomplète des `users` :** la ligne nomme les uniques ICU sur `LOWER(username)` / `LOWER(email)`, mais pas les uniques **à l'octet** `users_email_unique` et `users_username_unique`, toujours présents. Pour `tags`, la même situation est dite (« l'unique d'origine n'a jamais été retiré »).
- **Formulation contradictoire :** `agency_admin_profiles` est marqué « toujours (`user_id` nullable : plusieurs lignes sans titulaire admises) », alors que `owner_profiles` / `agent_profiles`, dans la même situation, sont marqués « si `user_id` non null ».
- Les autres uniques de la base absents du tableau sont décrits dans leur section, ce que permet le statut « extrait ». Exemples : §43 `code`, §50 `lease_id`, §51 `user_id`, §54 `phone`, §56 `user_id`, §58 `key`, §64, §42, §47, §52-53, §67-99.

#### 3.6 Index recommandés

Les **35 lignes existent toutes en base**, colonnes et ordre compris (relu sur `pg_indexes`). `reviews (…, is_approved)` et `properties (featured, published_at)` restent servis par du code vivant (`PropertyResource`, `PublicAgencyController`, `HomepageDiscoveryService`). Rien à signaler.

#### 3.7 Comportements FK

- **Chaque exemple est juste.** J'ai vérifié par script les 4 lignes (≈60 exemples) contre `pg_constraint.confdeltype` : aucun écart. `activity_log.causer_id` n'a bien aucune FK.
- **Écart :** l'en-tête dit « Règle à appliquer systématiquement », mais **4 FK applicatives n'ont aucun `ON DELETE`** (`NO ACTION`) et la section ne le dit pas : `conversations.created_by`, `maintenance_requests.requester_id`, `inventories.conducted_by` (dites « FK sans `onDelete` » dans §18, §21, §24) et `documents.uploaded_by` (§22 l.1625, muette). Répartition en base : 90 `c`, 131 `n`, 26 `r`, 5 `a`, dont 1 dans les tables Lemon Squeezy.

#### 3.8 Règles d'invariance

- **En-tête :** « implémentées via des Observers Laravel ». C'est faux pour les Règles 1, 4, 5 et 6 (schéma, middleware, résolveur).
- **Règle 1 :** « Implémentation : `UserObserver` ou logique dans `LeaseService` ». Aucun des deux ne crée ni n'associe de `Customer` à un `User`. L'invariant tient en fait **par le schéma** : `leases.tenant_id` → `customers` en `RESTRICT`, donc un locataire est toujours un `Customer`.
- **Règle 2 :** `RecalculatePropertyRatingsJob` **n'existe pas**. `average_rating` / `reviews_count` sont recalculés par `ReviewObserver` (l.70-74), de façon événementielle. « `DB::increment('table', 'column')` » n'est pas une API Laravel : le code fait `$favorite->property()->increment('favorites_count')` (`FavoriteObserver`, exact).
- **Règle 3 :** la méthode s'appelle **`reference()`**, pas `referenceable()` (`AppNotification.php:71`). Elle admet **5** types, pas 4 : la table de correspondance a pour clés `booking`, `lease`, `lease_payment`, `maintenance`, **`property_visit`**.
- **Règle 4 :** le middleware, l'en-tête `X-Profile-Id` / `?profile_id`, le cookie `active_profile_id` et les deux routes (`routes/api/me.php:42-43`) sont exacts. Reste un vestige spatie : « `team_id = null` ».
- **Règle 5 :** exacte. Les tables spatie sont supprimées par `2026_05_18_120000_drop_spatie_permission_tables`.
- **Règle 6 :** exacte (`AgencyObserver::created`, `AgencySystemRoleSeeder`, `AgencyKindGuard::allowsCustomRoles`, routes de `routes/api/agency-roles.php:32,37`, écran `admin/roles/page.tsx`).
- **Ordre :** les règles se suivent 1, 2, 3, 5, 6, 4.

#### 3.9 Évolutions futures

- **EF1** est juste : `booking_payments.receipt_number` existe et `lease_payments.receipt_number` n'existe pas.
- **EF2, EF3, EF8** sont justes (réalisés ou écartés, renvois exacts).
- **EF4, EF7, EF9** sont justes.
- **EF5** est juste (`conversation_participants.last_read_at` ; plafond de 3 à 20 participants dans `CreateGroupConversationRequest`).
- **EF6 est sans objet :** aucune migration du dépôt n'a jamais créé de table `activity_logs` (`grep` vide dans `database/` et `app/`). Il n'y a pas de données à migrer. De même, la table `activity_log_changes` « selon la configuration » de §13 n'existe pas.

#### 3.10 Résumé des changements et comptes écrits à la main

- **Plus aucun compte d'inventaire écrit à la main dans le Résumé** (M40 appliquée). « Seize modèles » (§56-71) est exact. « Les deux seuls enums […] le 2026-08-16 » est daté.
- **Affirmations du Résumé confrontées au code :** les relations notées absentes le sont bien (`Agency::address()`/`documents()`, `Property::inventories()`/`conversations()`/`invoices()`, `Booking::documents()`/`invoices()`, `*Payment::invoice()`, `MaintenanceRequest::requesterCustomer()`). Les relations dites présentes existent. Les colonnes listées pour `agencies`, `properties`, `users`, `booking_payments`, `leases`, `conversations` et `property_visits` existent, et celles dites retirées n'existent plus. Les 7 modèles qui déclarent `documents()` sont bien ceux nommés. **Rien de démenti.**
- **Lacune de journal :** le Résumé a un bloc TCK-633 mais rien pour §72-87 (TCK-591 à TCK-602) ni pour §98-99. Ce n'est pas une affirmation fausse.
- **Comptes manuels hors Résumé :**
  - **Légende** l.121-125 : « `->jsonb(` → **69** » et « Les **56** lignes de type `json` » (mesurés le 2026-08-22). Aujourd'hui, `grep -rho '\->jsonb(' database/migrations` donne **79** et le document compte **66** cellules `| jsonb`. Les deux chiffres sont datés mais périmés.
  - La **Légende** dit aussi 🆕 = « Modèle à créer », alors que §14-55 et §73-97, marqués 🆕, existent tous en code.
