# 03 — Recommandations à `models-spec.md`

> Passe 013 — 2026-10-14 10:23. Conventions et limites : `00-summary.md`.
> Mesurée sur `docs/convergence-specs-lot-3` `b3793a0a` (lots 1 à 3 de convergence appliqués) :
> `docs/features.md` sha1 `3c3c46ff` (725 lignes), `docs/models-spec.md` sha1 `a745a8ce` (5095 lignes,
> 99 sections). Base de dev migrée lue en lecture seule (222 migrations du dépôt + 5 du paquet
> `lemonsqueezy/laravel`), sans les deux migrations de TCK-639 (#378).

Les recommandations M1 à M49 de la passe 012 sont **toutes appliquées** par les lots 1 à 3 de
convergence (#379, #380, #381), sauf **M44** (§96 : les exceptions du trigger), portée par TCK-639
(#378), qui durcit le trigger et rend la section exacte. Les autres écarts ci-dessous sont **nouveaux** :
ils viennent de la relecture colonne à colonne des sections que les passes 011 et 012 comptaient
conformes sans les relire, et de la mesure des données rangées hors colonne (`metadata`, `settings`,
journal, cache).

Cinq relevés indépendants ont produit des recommandations qui se recoupent. Elles sont **consolidées**
ci-dessous en 28 actions, par section ; chaque action cite les recommandations d'origine, dont le texte
intégral suit (préfixes : MA/MB = relevés du catalogue, RA/RB/RC = relevés des modèles).

## Actions consolidées

| # | Section | Recos d'origine | Ce qui est faux | Lignes servies | Priorité |
|---|---------|-----------------|-----------------|----------------|----------|
| C1 | §12 AppNotification | RA1, MB1 | 7 colonnes décrites inexistantes, 5 réelles absentes, scopes et méthodes fictifs, index non écrits | **P0 l.537**, l.549 | **Haute — P0** |
| C2 | §1 User | RA3, MA8, MB2, MB3, RC3 | `status`, `first_name`, `last_name` NOT NULL ; `preferred_language` varchar(10) NOT NULL ; relations en camelCase ; clés de `metadata` du verrou et du réenrôlement 2FA | **P0 l.458, 643, 663**, l.86, 462, 466, 467 | **Haute — P0** |
| C3 | §98, §34, §35 | MB4, RC3 | La suspension d'adhésion est un geste d'agence (`suspended` / `blocked`), pas de la plateforme ; `agencyAdminProfiles()` | **P0 l.426** | **Haute — P0** |
| C4 | §2 Agency | MA4, MB5, MB6, RA2, RC4 | `settings` fusionné clé par clé (TCK-593), ses clés lues (`primary_city`, `require_team_two_factor`, `late_fee_online_collection`, `booking_pending_expiry_hours`, `tenant_onboarding_enabled`) ; motif de suspension dans le seul journal ; `LemonSqueezyBillable` et tables `lemon_squeezy_*` | **P0 l.427**, l.161, 190, 463, 667 | **Haute — P0** |
| C5 | Tables du framework | MB14 | `password_reset_tokens` (clé par e-mail) absente | **P0 l.456** | **Haute — P0** |
| C6 | §96 CreditMovement | MA9, MB16, RC2 | Les exceptions du trigger — **résolu par #378** | l.428, 662 | Haute — fusionner #378 |
| C7 | §9 UserCustomerRelationship | MA1, RA4, MB11 | `started_at`/`ended_at` (date, nullables), `metadata`, unicité `ucr_unique` | l.247, 433 | Moyenne |
| C8 | §42, §34, §35, §37 | RB6, MB8 | Le KYC d'un profil n'est pas un `KycDossier` : `Document` + miroir `metadata.kyc` ; disponibilités, assurance, zones en `metadata` | l.439, 490, 505-507 | Moyenne |
| C9 | §22 Document | RA7, MB9 | Cibles (profils), types `photo`/`rib`/`ninea`, `Searchable`, `shareLinks()`, collection `versions` | P0 l.362, l.363, 366, 574 | Moyenne |
| C10 | §27 Guarantor | MA5, RA5 | Aucun média, relations fausses, `leasesPivot()` absente | l.184 | Moyenne |
| C11 | §32 Task | MA2, RA8 | `metadata` absente ; `taskable` faux dans les deux sens (`Booking` manque) | l.158, 254 | Moyenne |
| C12 | §33 CustomerNote | MA3, RA9 | Colonne `kind` absente (l'inventaire des enums la cite) | l.253 | Moyenne |
| C13 | §40, §41 | MA7, RB1, RB2, RB3 | Quatre types de pièces rapprochées (`Invoice`, `Payout`), noms de relations, disque | l.225, 227 | Moyenne |
| C14 | §50 TenantOnboardingChecklist | MA6, RB5 | Drapeau dans le mauvais sens, `reminders_sent` nullable, index | l.203 | Moyenne |
| C15 | §44 AgencySubscription | RB4 | Unicité partielle `agency_subscriptions_one_open_per_agency` | — | Moyenne |
| C16 | §13 ActivityLog | RA6, RC10 | activitylog v5, trait `Auditable` ; EF6 `activity_logs` inexistante | §2.6 | Moyenne |
| C17 | Règles d'invariance | RC9, MB15 | Règle 3 `reference()` sur 5 types ; Règle 2 job inexistant ; Règle 4 résolution réelle | l.487, 523 | Moyenne |
| C18 | §21, §39, §51, §48, §30 | MB12, MB10, MB7, MB13 | Motif du refus, auteur d'une pause, niveau à la cooptation, second catalogue de réglages | l.294, 434, 665, 668 | Basse |
| C19 | §3, §5 | MA10, RA10, MA11 | Types `smallint`, devise forcée, origine de `deposit_amount` | — | Basse |
| C20 | §72, §74, §75, §81, §82 | RC1 | Un index omis par section | — | Basse |
| C21 | §46, §47, §53, §61 | RB7, RB8, RB9, RB10 | Nullabilité, horodatages, rubrique Relations, enum de statut | — | Basse |
| C22 | Table des matières | RC6 | **Ancres cassées des titres en ✏️** : GitHub garde U+FE0F (`github-slugger` 2.0.0 rend `12-appnotification-️`) — vérifié | — | Basse |
| C23 | Légende | RC5 | 🆕 y veut dire « à créer » ; comptes périmés | — | Basse |
| C24 | Contraintes d'unicité, FK | RC7, RC8 | Deux uniques non décrits ; les FK sans `onDelete` | — | Basse |
| C25 | Enums | RC11 | Homonyme mort `Bases/Enums/UserStatus` | — | Basse |
| C26 | Références de migration | RC12, RC13 | Renvois ambigus ; §71 → §96 | — | Basse |
| C27 | Notes de second ordre | MA12, MB17, RA11, RB11, RB12 | Clés de `metadata`, vocabulaire `unsigned`, `onDelete` destructeurs, `xlsx` jamais produit | — | Basse |

Hors spec, signalé au passage : quatre unicités composées ont une colonne nullable que PostgreSQL ne
compare pas (une clé `settings` globale n'est unique que par `updateOrCreate`) ; `User::bookingPayments()`
porte sur une colonne inexistante. Deux candidats à ticket.

---

## Texte intégral des recommandations d'origine

### Relevé catalogue §1.1-§1.6 (MA)


#### MA1 — §9 `UserCustomerRelationship` : le tableau décrit le JSON de l'API, pas la table
**Constat.** `2026_04_17_160009_create_user_customer_relationships_table` crée `started_at` et
`ended_at` (**`date`, nullables, sans défaut**), `metadata` jsonb, l'unicité `ucr_unique (user_id,
customer_id, relationship_type)` et l'index `(customer_id, status)` ; `2026_04_18_030809` ajoute
`is_primary`. §9 écrit `start_date` datetime NOT NULL défaut `now`, `end_date` datetime, ni `metadata`,
ni unicité, ni index. Les noms `start_date` / `end_date` sont ceux que `CustomerController` émet en JSON.
L'unicité « un seul contact principal par client » est applicative (`CustomerController` l.167-178).
Les deux FK sont `cascadeOnDelete`, non écrites. Sert l.247 (P1) et l.250.
**Proposition.** Réécrire le tableau : `started_at` date oui null ; `ended_at` date oui null ;
`metadata` jsonb oui null ; FK `user_id`, `customer_id` en `cascadeOnDelete`. Ajouter « Contraintes :
unique `ucr_unique (user_id, customer_id, relationship_type)` ; index `(customer_id, status)` » et
« Contact principal : une marque par client, tenue par `CustomerController`, aucune contrainte en
base ». Ajouter la ligne `user_customer_relationships` à « Contraintes d'unicité ».

#### MA2 — §32 `Task` : `metadata` manquante, `taskable` fausse
**Constat.** `2026_04_24_224428_add_metadata_to_tasks_table` ajoute `metadata` jsonb nullable ; le code
y écrit `reminder_24h_sent_at` (idempotence de `SendTaskDueReminders`) et `kind = booking_refund`
+ `booking_payment_ids` (`BookingRefundTaskService`, le « remboursement à traiter » de l.158). Les
`taskable` réels sont `Property` et `Customer` (seuls admis par `StoreTaskRequest`) et `Booking` (tâche
de remboursement) ; aucun code ne rattache une tâche à un `Lease` ni à une `MaintenanceRequest`. Index
non écrits : `(assigned_to_id, due_at)`, `(taskable_type, taskable_id)`. Sert l.158 (P1), l.254, l.170.
**Proposition.** Ajouter la ligne `metadata | jsonb | oui | null | marqueurs d'idempotence
(reminder_24h_sent_at) et nature d'une tâche système (kind = booking_refund, booking_payment_ids)`.
Relations : « `taskable()` → morphTo — Property, Customer (API), Booking (tâche de remboursement d'acompte,
TCK-596) ». Ajouter les deux index.

#### MA3 — §33 `CustomerNote` : la colonne `kind`
**Constat.** `2026_10_07_591300_add_kind_to_customer_notes_table` ajoute `kind` string(20) nullable
(`CustomerNoteKind` : `conversion`, `loss`), et réécrit les notes existantes dont le corps commençait par
« Conversion : » / « Perte : » (préfixe retiré, `kind` posé ; `down()` les rétablit). L'inventaire des
enums (l.4573) renvoie déjà à « CustomerNote.kind (§33) » ; le tableau de §33 ne l'a pas. Index
`(customer_id, created_at)` non écrit. Sert l.253.
**Proposition.** Ajouter `kind | CustomerNoteKind (string(20)) | oui | null | Nature d'une note
épinglée posée par la conversion ou la perte d'un prospect ; le libellé se rend au front (TCK-591)`, et
l'index.

#### MA4 — §2 `Agency` : `settings` est fusionné, et ses clés lues ne sont écrites nulle part
**Constat.** §2 écrit, dans le tableau et dans la prose « Reversements, TVA… », que `settings` est
« remplacé en entier par `AgencyUpdateRequest` ». Depuis TCK-593, `AgencyController::update` **fusionne**
le tableau reçu avec l'existant (`array_replace`) et retire une clé envoyée à `null`. Les clés que le code
lit ne sont listées nulle part : `booking_pending_expiry_hours` (défaut 48, 0 = désactivé, 1-168 —
`BookingExpirationService`), `late_fee_online_collection` (absent = `false` — `Agency::collectsLateFeesOnline`),
`tenant_onboarding_enabled` (absent = **activé** — `TenantOnboardingService`), `require_team_two_factor`
(`TwoFactorRequirement`), `watermark_enabled` / `watermark_position` / `watermark_opacity`
(`AgencyUpdateRequest`), `payment.preferred_provider` (`HostIndividualOnboardingService`). Sert l.161,
l.190, l.192, l.203.
**Proposition.** Remplacer « remplacé en entier » par « fusionné clé par clé par `AgencyController::update`
(une clé à `null` est retirée et revient au défaut du code) — TCK-593 ». Ajouter sous §2 un encart
« Clés de `settings` lues par le code », une ligne par clé : nom, défaut quand absente, lecteur, ticket.
Garder la justification de `payout_approval_threshold` en colonne, en la refondant sur l'écrivain unique
et le contrôle à quatre yeux plutôt que sur le remplacement.

#### MA5 — §27 `Guarantor` : pas de média, relations fausses
**Constat.** Le modèle n'utilise pas `InteractsWithMedia` (ni lui ni `AbstractModel`) ; `id_documents`
n'existe nulle part dans `app/`. Les pièces d'un garant passent par `documents()` → morphMany Document.
Relations du code : `addedBy()`, `leases()` (hasMany, ancienne colonne `leases.guarantor_id`),
`leasesPivot()` (belongsToMany via `lease_guarantor`, avec `role`), `documents()` ; **pas** d'`addresses()`.
`phone` est `string(30)` ; index `(last_name, first_name)` non écrit (`2026_04_17_160007_create_guarantors_table`).
Sert l.184.
**Proposition.** Retirer le bloc « Traits » ; écrire « Les pièces justificatives sont des `Document`
(`documents()`) ». Remplacer la liste des relations par celle du code ; préciser `phone` string(30) ;
ajouter l'index.

#### MA6 — §50 `TenantOnboardingChecklist` : défaut du réglage inversé, `reminders_sent` nullable
**Constat.** (1) « N'est pas créé si l'agence n'a pas activé le workflow » : le code la crée **sauf** si
`settings.tenant_onboarding_enabled` vaut strictement `false` (défaut activé). (2) Elle n'est pas créée
quand le locataire n'a pas de compte (`tenant.user` nul) — non dit. (3) `reminders_sent` : base nullable,
sans défaut ; le `'[]'` est l'`$attributes` du modèle (`2026_05_10_200000`). (4) L'index est
`(completed_at, created_at)`. Sert l.203 (P1).
**Proposition.** Corriger les quatre points ; renvoyer à l'encart « Clés de `settings` » de MA4.

#### MA7 — §41 `BankStatementLine` (et §40) : quatre types de pièces rapprochées, pas deux
**Constat.** `matched_payment` est un morphisme vers `BookingPayment`, `LeasePayment`, `Invoice` **et**
`Payout` (`ReconciliationManager`, `BankStatementLineResource::PAYMENT_TYPE_MAP`). Le code n'apparie un
`Payout` qu'à une ligne `debit`, et seulement `completed` ; un remboursement de caution est traité comme
une sortie. §40 et §41 ne nomment que les deux premiers. Sert l.225, l.227.
**Proposition.** §41 `matched_payment_type` : « `BookingPayment`, `LeasePayment`, `Invoice` (crédits) ou
`Payout` (débits, reversement `completed`) » ; relation `matched_payment()` idem ; §40 description
alignée.

#### MA8 — §1 `User` : quatre nullabilités fausses, et le rôle public de `username`
**Constat.** `2026_04_15_210400_add_fields_to_users_table` : `first_name` et `last_name` **NOT NULL**
sans défaut ; `status` NOT NULL défaut `active` ; `preferred_language` `string(10)` NOT NULL défaut `fr`.
§1 les écrit nullables (et `string(5)` pour la langue). Un compte ouvert par téléphone a donc un prénom
**vide**, jamais nul — c'est ce que juge `PublishReadiness` (l.86). `username` est aussi le slug public de
`/agents/{slug}` (`PublicAgentController`), non dit. `phone` est `string(30)`.
**Proposition.** Corriger les quatre lignes (nullable, type, défaut) ; ajouter à `first_name` « vide,
jamais nul, pour un compte sans prénom saisi — `PublishReadiness` le traite comme manquant » ; ajouter à
`username` « sert de slug à la fiche publique `/agents/{slug}` (TCK-177) ».

#### MA9 — §96 `CreditMovement` : les exceptions du trigger (M44 de la passe 012, non appliquée)
**Constat.** Relu en base : `credit_movements_append_only()` laisse passer **toute** suppression émise à
`pg_trigger_depth() > 1` (pas seulement une cascade de FK) et **tout** `UPDATE` qui ne change que
`property_boost_id` ou `actor_id` vers `NULL`, y compris émis directement. §96 écrit « tout UPDATE ou
DELETE direct lève P0001 » avec deux exceptions plus étroites. Aucun lot ne cite M44.
**Proposition.** Reprendre M44 telle quelle : écrire les deux exceptions telles que la fonction les
code, et dire qu'un `UPDATE … SET actor_id = NULL` direct passe.

#### MA10 — §3 `Property` : types, devise forcée, format de référence, colonne sans geste
**Constat.** `bedrooms`, `bathrooms`, `floor_number`, `total_floors`, `year_built`, `parking_spaces`,
`level` sont `smallint` en base (§3 : `integer`) — sans effet, la validation borne bien en deçà. `currency`
est forcée à `XOF` par `StorePropertyRequest` et `UpdatePropertyRequest` (TCK-633). `reference_number`
suit `TK-AAAA-XXXXXX` aléatoire (`Property::booted()`), pas `TK-2025-001`. `admin_monitored` n'a aucun
chemin d'écriture (absent des requêtes). `parent_id` est `nullOnDelete` (non écrit dans le tableau).
**Proposition.** Corriger les sept types en `smallint` ; à `currency`, ajouter « forcée à XOF par les
requêtes de bien tant que la plateforme ne sert que le Sénégal (TCK-633) » ; à `reference_number`, le
format réel ; à `admin_monitored`, « aucun geste ne l'écrit aujourd'hui ».

#### MA11 — §5 `Booking` : d'où vient `deposit_amount`
**Constat.** `total_amount` et `deposit_amount` sont calculés par `BookingQuote` à la création (TCK-530 —
30 % du total, arrondi au franc, location mensuelle refusée) ; §5 ne le dit pas, et `features.md` l.154
croit le calcul encore côté front (FA2).
**Proposition.** Ajouter à `total_amount` / `deposit_amount` : « calculés par `BookingQuote` depuis le
bien et les dates, jamais reçus du client (TCK-530) ».

#### MA12 — Notes de second ordre (index et clés de `metadata` non écrits)
**Constat.** Index présents en base, absents de leur section : `calendar_feeds_agency_idx` (§72),
`media_fingerprints_agency_idx` (§74), `duplicate_suspicions_matched_idx` et `duplicate_suspicions_open_idx
(resolved_at, created_at)` (§75), `saved_searches_alert_subscriber_idx` (§23), `(property_id, changed_at)`
(§26), `guarantors (last_name, first_name)` (§27). Clés de `metadata` qui portent une règle de
`features.md` : `lease_payments.metadata.gateway_expected_amount` (montant figé du checkout, l.192),
`payouts.metadata.due_reminded_at` (rappel unique, l.232). Hors périmètre de cette part mais relevé en
chemin : `documents.documentable` reçoit aussi `OwnerProfile`, `AgentProfile`, `ServiceProviderProfile`
(pièces des parcours d'onboarding), que §22 ne liste pas.
**Proposition.** Ajouter ces index à leur section ; nommer les deux clés de `metadata` dans §15 et §28 ;
compléter la liste `documentable` de §22.

---


### Relevé catalogue §1.7-§2.10 (MB)


#### MB1 — §12 AppNotification : réécrire le tableau (porte les P0 l.537, 538)
**Constat.** Mesuré en base et sur les quatre migrations : sept colonnes décrites n'existent pas,
cinq colonnes réelles manquent ; scopes, méthodes et relation décrits inexistants ; `type` à 7 valeurs
au lieu de 12 ; index non écrits. Comptée conforme par la passe 012.
**Proposition.** Retirer `content`, `is_actioned`, `actioned_at`, `delivered`, `delivered_at`,
`metadata`, `deleted_at` et la méthode `markAsActioned()`. Ajouter `body` text nullable, `data` jsonb
nullable, `sent_at` timestamp nullable, `delivery_attempts` jsonb nullable (`2026_04_26_160847`),
`digested_at` timestamp nullable (`2026_04_26_200002`). `user_id` : `cascadeOnDelete`. Index :
`(user_id, is_read)`, `(user_id, digested_at)`, `(referenceable_type, referenceable_id)`. Remplacer
« Scopes / Méthodes » par ce que le modèle déclare : `scopeUndigested()`, `isCritical()` ; relation
`reference()` (et non `referenceable()`), `deliveryAttempts()` → hasMany. `type` : renvoyer au tableau
des enums (12 valeurs). Règle 3 : elle nomme `referenceable()` et quatre types ; le modèle déclare
`reference()`, qui résout des **alias courts** stockés dans `referenceable_type` (`booking`, `lease`,
`lease_payment`, `maintenance`, `property_visit`) par `find()` — cinq types, dont `PropertyVisit`.

#### MB2 — §1 User : nullabilités et longueurs fausses (porte les P0 l.458, 643, 663)
**Constat.** En base : `status` NOT NULL défaut `'active'` ; `first_name`, `last_name` NOT NULL
(l'inscription par téléphone écrit `''`) ; `preferred_language` `varchar(10)` NOT NULL défaut `'fr'` ;
`phone` `varchar(30)`, `timezone` `varchar(50)`, `remember_token` `varchar(100)`.
**Proposition.** Colonne « Nullable » vide pour `status`, `first_name`, `last_name`,
`preferred_language` ; `preferred_language` string(10) ; préciser string(30) / (50) / (100) ; ajouter
à `first_name`/`last_name` : « NOT NULL — un compte ouvert par téléphone reçoit une chaîne vide
(`PhoneLoginService`), que l'interface traite comme absente ».

#### MB3 — §1 User : les clés de `metadata` que le code lit (l.462, 467)
**Proposition.** Sous le tableau, un paragraphe « Clés de `metadata` » : `failed_login_attempts`,
`failed_login_first_at`, `locked_at` (verrou du canal mot de passe, `LoginLock` : 10 échecs, 15 min,
série de 24 h ; levé par `UserSupportService::unlock`) ; le verrou du canal téléphone et le leurre
d'e-mail inconnu vivent en cache, sans colonne ; `force_2fa_reconfigure` (posé par
`UserSupportService::resetTwoFactor`, impose le réenrôlement).

#### MB4 — §98, §34, §35 : la suspension d'adhésion est un geste d'agence (porte la P0 l.426)
**Proposition.** §98 `status` : remplacer « `suspended`/`archived` réservés à la modération
plateforme » par « `suspended` : adhésion suspendue par l'agence (`TeamMemberSuspensionService`,
capacité `team.suspend`, TCK-587) ; `archived` : aucun code ne le pose aujourd'hui
(`grep AgencyAdminProfileStatus::Archived app/` : zéro occurrence) ». §34 : « `blocked` = adhésion suspendue par l'agence ; la réactivation ne lève que ce
statut ». §35 : même mention pour `suspended`. Citer le journal `team_member_suspended` /
`team_member_reactivated` et la protection de `agencies.primary_admin_id`.

#### MB5 — §2 Agency : les clés de `settings` lues par le code (l.427 P0, l.463)
**Proposition.** Sous `settings`, la liste des clés lues : `primary_city` (espace auto-créé),
`require_team_two_factor`, `watermark_enabled`, `watermark_opacity`, `watermark_position`,
`late_fee_online_collection`, `booking_pending_expiry_hours`, `payment`, `currency` — avec la mise en
garde déjà écrite (« remplacé en entier par `AgencyUpdateRequest` ») appliquée à `primary_city`.
Observation de code à porter en ticket, pas dans la spec : `PaymentGatewayService` (l.1320-1329) lit
encore `settings.currency` (« TCK-084 will move agency currency to a top-level column ») alors que la
colonne `agencies.currency` existe depuis `2026_04_24_000001` — la devise d'un paiement ne lit pas la
colonne que §2 décrit.

#### MB6 — §2 Agency : où vit le motif d'une suspension (l.667)
**Proposition.** Après `status` : « La suspension et sa levée (`AgencyModerationController`, TCK-600)
exigent un motif, qui n'a **pas de colonne** : il vit dans le journal (`super_admin_agency_suspended` /
`super_admin_agency_reinstated`, propriétés `old_status`, `new_status`, `reason`) et dans la
notification aux administrateurs. Ni la date ni l'auteur de la suspension ne sont sur la ligne ».

#### MB7 — §51 PlatformProfile et §48 Invitation : niveau à la cooptation, motif du retrait (l.668)
**Proposition.** §48 `metadata` : « pour `role = super_admin` : `level` (niveau choisi, lu à la
confirmation de la 2FA), `requires_2fa`, `first_name`, `last_name` ». §51 « Règles métier » :
« retrait = `revoked_at` + jetons supprimés + sessions d'impersonation fermées ; motif exigé, rangé
dans le journal `super_admin_operator_revoked`, jamais dans `notes` ; le dernier `super_admin` actif ne
se retire pas (contrôle sous verrou, sans contrainte de base) ».

#### MB8 — §42, §34, §35, §37 : le KYC des profils n'est pas un `KycDossier` (l.439, 490, 505-507)
**Constat.** `KycDossier` n'a qu'un sujet en code et en base : l'agence.
**Proposition.** §42 description : « attaché à une `Agency` (seul sujet employé) » ; retirer les
profils. §34/35/37 : un paragraphe « KYC du profil » — pièces en `Document` dont `documentable` est le
profil, miroir `metadata.kyc.{status: pending_review, submitted_at, docs[]}` ; §35 :
`metadata.intervention_zones` ; §37 : `metadata.availability` (`[{day, from, to}]`), `visit_fee`,
`has_insurance`.

#### MB9 — §22 Document : cibles, types, trait (l.362 P0, 363, 366, 574)
**Proposition.** `documentable()` : ajouter `OwnerProfile`, `AgentProfile`, `ServiceProviderProfile`,
`AgencyUpgradeRequest`. `type` : renvoyer au tableau des enums (11 valeurs, dont `photo`, `rib`,
`ninea`). Traits : ajouter `Searchable` (Scout) — champs indexés `title` (= `name`), `description`,
`type`, `documentable_type`, `documentable_id`, `uploaded_by`, `created_at`.

#### MB10 — §39 : l'auteur d'une pause (l.434)
**Proposition.** `metadata` : « `paused_by`, `paused_at` — posés par la pause de l'agence ; une pause
qui porte `paused_by` ne se lève que par l'agence, jamais par la fin d'onboarding ».

#### MB11 — §9 UserCustomerRelationship : colonnes et unicité (l.433)
**Proposition.** `start_date` → `started_at` `date` nullable sans défaut ; `end_date` → `ended_at`
`date` nullable ; ajouter `metadata` jsonb nullable ; ajouter « Contraintes » : unique `ucr_unique
(user_id, customer_id, relationship_type)`, index `(customer_id, status)`, FK `user_id` et
`customer_id` `cascadeOnDelete` ; reporter `ucr_unique` dans « Contraintes d'unicité ».

#### MB12 — §21 MaintenanceRequest : refus et contestation (l.294)
**Proposition.** Après `accepted_at` : « Le refus (`decline`) exige un motif, rangé dans le journal
`maintenance.declined` (`reason`, `from`) ; il remet `assigned_to` et `accepted_at` à `null` et
`status` à `open`. La contestation (`contestResolution`) repasse en `in_progress`, remet
`completed_at` à `null` et journalise son commentaire (`maintenance.contested`) ».

#### MB13 — §30 Setting : le second catalogue (l.665)
**Proposition.** Ajouter : « **Enums métier** : clés `enum.{key}.values` (portée `global`), catalogue
en code `App\Domain\Settings\EditableBusinessEnums`, écrites par `BusinessEnumService` ».

#### MB14 — Tables du framework (l.456 P0)
**Proposition.** Un paragraphe à côté de « `laravel/sanctum` » : `password_reset_tokens` (jeton de
réinitialisation, clé par e-mail — un compte sans e-mail n'emprunte pas ce chemin), `sessions`,
`cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs` ; et les tables de paquet
`lemon_squeezy_*` (5 migrations hors du dépôt, présentes en base).

#### MB15 — Règle 4 : la résolution réelle du profil actif (l.487, 523)
**Proposition.** Ordre réel (`ResolveActiveProfile`) : `X-Profile-Id` / `?profile_id` (403 si
étranger) → `X-Active-Profile-Hint` (ignoré s'il est invalide) → cookie `active_profile_id` →
auto-bascule si les profils **actifs** sont dans une seule agence (TCK-587) → aucun profil. Retirer
« `team_id = null` », vestige spatie.

#### MB16 — §96 : M44 de la passe 012, reconduite (l.428, 662)
**Constat.** `pg_get_functiondef('credit_movements_append_only')` à HEAD : toute suppression à
profondeur > 1 passe, et tout `UPDATE` qui met `property_boost_id` ou `actor_id` à `NULL` passe,
direct compris ; §96 écrit toujours « tout UPDATE ou DELETE direct lève `P0001` ».
**Proposition.** Celle de M44.

#### MB17 — Écarts mineurs relevés au passage (notes, sans effet sur les lignes)
§19 : index `(user_id, conversation_id)` non listé. §46 : `segment` nullable en base. §47 :
`created_at`/`updated_at` présents en base. §49 : `submitted_at` sans défaut en base (spec « auto »).
§50 : `reminders_sent` nullable sans défaut (spec `'[]'`). §32 : `tasks.metadata` jsonb
(`2026_04_24_224428`, marqueur `reminder_24h_sent_at`) absent. §33 : `customer_notes.kind` absent du
tableau alors que le tableau des enums le cite (`CustomerNoteKind` → `CustomerNote.kind`). §11 :
`rating` est `smallint` en base, et l'index `reviews_reviewable_type_reviewable_id_index` n'est pas
listé. §13 : la base porte `attribute_changes` (spatie v5), que le tableau de correspondance ignore.
§48 : `onDelete` non dits (`agency_id` et `invited_by` en cascade, `invited_user_id` en `SET NULL`).


### Relevé modèles §1-§33 (RA)


#### RA1 — §12 AppNotification : réécrire le tableau sur la table réelle

**Constat.** Le tableau de §12 décrit 7 colonnes qui n'existent pas et en omet 5 qui existent. Les
scopes, les méthodes et la relation `referenceable()` sont fictifs ; `deliveryAttempts()` manque. Les
lignes l.545 (critiques : `data.is_critical`) et l.549 (digest : `digested_at`) reposent sur des
colonnes absentes de la spec. Le modèle et les quatre migrations qui touchent la table le montrent.

**Proposition.**
- Retirer `content`, `is_actioned`, `actioned_at`, `delivered`, `delivered_at`, `metadata` et
  `deleted_at`.
- Ajouter `body` (text, nullable — le texte de repli, re-rendu à la lecture), `data` (jsonb : charge
  libre, dont `is_critical`), `sent_at` (timestamp), `delivery_attempts` (jsonb, héritée, remplacée par
  §69), `digested_at` (timestamp, TCK-103, indexé avec `user_id`).
- Remplacer les blocs « Scopes » et « Méthodes » par : `scopeUndigested()` et `isCritical()`.
- Remplacer `referenceable()` → morphTo par `reference()`, en disant que ce n'est **pas** une relation
  Eloquent : une méthode qui résout une clé courte (`booking`, `lease`, `lease_payment`,
  `maintenance`, `property_visit`) puis appelle `find()`.
- Ajouter `deliveryAttempts()` → hasMany NotificationDeliveryAttempt (§69), et la liste des index.

#### RA2 — §2 Agency : décrire `LemonSqueezyBillable` et les tables `lemon_squeezy_*`

**Constat.** `Agency` utilise `LemonSqueezy\Laravel\Billable` (TCK-079), qui ajoute `customer()`,
`orders()` et `subscriptions()`. Cette dernière est masquée par `Agency::subscriptions()` →
AgencySubscription. Les cinq tables `lemon_squeezy_*` existent en base ; aucune n'est décrite dans
`models-spec.md`. La ligne Traits de §2 ne cite que `InteractsWithMedia`.

**Proposition.**
- Compléter la ligne Traits : `Auditable`, `InteractsWithMedia`, `LemonSqueezyBillable` (TCK-079 :
  l'agence est le payeur d'un `checkout()` Lemon Squeezy, cf. `LemonSqueezyDriver`), `Searchable`,
  `SoftDeletes`.
- Ajouter un avertissement : « `subscriptions()` de l'agence (AgencySubscription) masque celle du
  trait — `subscribed()`, `onTrial()`, `subscription()` du paquet ne sont pas utilisables sur une
  agence ».
- Ajouter sous « Packages transversaux » une entrée `lemonsqueezy/laravel` qui nomme les cinq tables
  et leur clé polymorphe `billable`.

#### RA3 — §1 User : nullabilités, noms de relations, relations absentes

**Constat.** Les migrations `2026_04_15_210400` et `0001_01_01_000000` posent `status`, `first_name`
et `last_name` en NOT NULL, et `preferred_language` en `varchar(10)` NOT NULL défaut `'fr'`. La spec
les écrit nullables, et `preferred_language` en `string(5)`. Douze relations sont nommées en snake_case
alors que le code les nomme en camelCase. Cinq relations du code sont absentes.

**Proposition.**
- l.342 : `status` → Nullable vide.
- l.343-344 : `first_name` et `last_name` → Nullable vide, Défaut vide.
- l.356 : `preferred_language` → `string(10)`, Nullable vide, défaut `'fr'`.
- Bloc Relations : réécrire chaque nom tel que le code le déclare (`addedBy()`, `ownerProfiles()`,
  `agentProfiles()`, `agencyAdminProfiles()`, `serviceProviderProfile()`, `platformProfile()`,
  `customerRelationships()`, `relatedCustomers()`, `savedSearches()`, `appNotifications()`,
  `writtenReviews()`, `receivedReviews()`). Préciser « `bookings()` via `created_by_id` ».
- Ajouter `agency()` → hasOneThrough Agency via AgentProfile (premier profil d'agent — **pas**
  l'agence active : ne pas l'utiliser pour juger une capacité, principe n°2), `tenantLeases()`,
  `payouts()` (via `landlord_id`), `roleDelegations()` et `deletionRequest()`.
- Note : collections média `avatar`, `avatars`, `photos`, `documents` ; seule `avatar` et `avatars`
  sont publiques (ADR-0029 §3).

#### RA4 — §9 UserCustomerRelationship : période, `metadata`, unicité

**Constat.** `2026_04_17_160009_create_user_customer_relationships_table` crée `started_at` et
`ended_at` (date, nullables), `metadata` (jsonb), l'unique `ucr_unique (user_id, customer_id,
relationship_type)`, l'index `(customer_id, status)` et deux FK en `CASCADE`. La spec décrit
`start_date` et `end_date` (datetime, l'une NOT NULL défaut `now`), sans `metadata`, sans unicité et
sans `onDelete`.

**Proposition.**
- l.950-951 : `start_date` / `end_date` deviennent `started_at` | date | oui | null et `ended_at` |
  date | oui | null.
- Ajouter la ligne `metadata` | jsonb | oui | null.
- Ajouter « **Contraintes :** unique `ucr_unique (user_id, customer_id, relationship_type)` ; index
  `(customer_id, status)` ; `user_id` et `customer_id` en `cascadeOnDelete` ».
- Reporter l'unique dans « Contraintes d'unicité », et les deux FK dans « Comportements FK »,
  rubrique « table enfant de vie ».

#### RA5 — §27 Guarantor : retirer ce qui n'existe pas, ajouter `leasesPivot()`

**Constat.** `app/Models/Guarantor.php` n'a ni `InteractsWithMedia`, ni collection `id_documents`,
ni accesseur `full_name`, ni relation `addresses()`. Il déclare `leasesPivot()` (belongsToMany par
`lease_guarantor`), que la spec ignore. Son `leases()` passe par l'ancienne colonne
`leases.guarantor_id`. `phone` est un `varchar(30)`.

**Proposition.**
- Supprimer les blocs « Traits » et « Accesseurs », et la relation `addresses()`.
- Écrire « les pièces du garant sont des `Document` (`documents()`, morphMany) ».
- Renommer `added_by()` en `addedBy()`.
- Remplacer `leases()` par deux lignes : `leasesPivot()` → belongsToMany Lease (pivot
  `lease_guarantor`, `role`) — **les baux réels du garant** ; `leases()` → hasMany Lease via l'ancienne
  colonne `guarantor_id` (compatibilité, cf. §14).
- l.1830 : `phone` → `string(30)`.

#### RA6 — §13 ActivityLog : décrire activitylog v5 et le trait `Auditable`

**Constat.** Le paquet est en `^5.0`. Les changements vivent dans `attribute_changes` (jsonb), et le
code les y lit. Les tables `activity_log_changes` et `activity_logs` n'existent pas. Le mécanisme réel
est le trait `App\Models\Bases\Auditable`, avec sa liste blanche `AUDIT_ONLY` (28 modèles), que la spec
ne décrit nulle part. `impersonator_id` n'est écrit qu'en §83.

**Proposition.**
- Correspondance l.1189 : `changes` → `attribute_changes` (jsonb : `old`, `attributes`) ;
  `properties` reste le contexte libre (`ip`, `user_agent`…).
- Supprimer la mention « `activity_log_changes` selon la configuration » et la phrase « migration de
  données depuis `activity_logs` à réaliser ».
- Remplacer « Ajouter le trait `LogsActivity` sur chaque modèle » par un paragraphe « **`Auditable`**
  (`App\Models\Bases`) — `LogsActivity` configuré : modifications seules, pas de journal vide,
  `log_name` = nom court de la classe ; un modèle qui porte une donnée personnelle ou un secret
  déclare `AUDIT_ONLY` (TCK-601, ADR-0044 §3) ».
- Ajouter `impersonator_id` au tableau des colonnes ajoutées, avec renvoi à §83.

#### RA7 — §22 Document : `shareLinks()`, collection `versions`, `Searchable`

**Constat.** `Document` déclare `shareLinks()` (que §29 cite comme inverse), la collection
`versions` (support de la ligne l.368) et le trait `Searchable`. §22 n'en dit rien. La FK
`uploaded_by` n'a pas d'`onDelete`.

**Proposition.**
- Ajouter `shareLinks()` → hasMany DocumentShareLink.
- Traits : `InteractsWithMedia` — collections `file` (fichier unique) et `versions` (versions
  antérieures, l.368) ; `Searchable`.
- `uploaded_by` : « FK sans `onDelete` — la suppression physique d'un utilisateur qui a téléversé un
  document est refusée » ; `verified_by` : `nullOnDelete`.
- Ajouter `Guarantor` aux cibles de `documentable()`.

#### RA8 — §32 Task : `metadata` et noms de relations

**Constat.** `2026_04_24_224428_add_metadata_to_tasks_table` ajoute `metadata` jsonb nullable,
présente dans `$fillable` et castée `array`. Le modèle nomme ses relations `assignee()` et `creator()`.

**Proposition.**
- Ajouter la ligne `metadata` | jsonb | oui | null.
- Renommer `assignedTo()` en `assignee()` et `createdBy()` en `creator()`.
- Ajouter « Traits : `Auditable`, `SoftDeletes` ».

#### RA9 — §33 CustomerNote : colonne `kind`

**Constat.** `2026_10_07_591300_add_kind_to_customer_notes_table` ajoute `kind` string(20)
nullable, castée en `CustomerNoteKind` (`conversion`, `loss`). Le catalogue des enums (l.4573) y
renvoie ; §33 ne la décrit pas.

**Proposition.**
- Ajouter la ligne `kind` | `CustomerNoteKind` (string(20)) | oui | null | « Nature d'une note épinglée
  à un changement d'étape du pipeline (`conversion`, `loss`) ; `null` = note libre. Le préfixe affiché
  appartient au front. La migration a repris les notes dont le corps commençait par « Conversion : » /
  « Perte : » (TCK-591) ».

#### RA10 — §3 Property : types `smallint`

**Constat.** `2026_04_17_160005` et `2026_04_18_000001` déclarent `bedrooms` et `bathrooms` en
`unsignedTinyInteger`, et `floor_number`, `total_floors`, `year_built`, `parking_spaces` et `level` en
`unsignedSmallInteger`. Toutes sont des `smallint` en base ; la spec les écrit `integer`.

**Proposition.**
- l.561-570 : ces sept colonnes → `smallint`.
- Ajouter une note : « aucun CHECK de signe ni de borne en base ; bornes applicatives ».
- l.546 : `parent_id` → « (`nullOnDelete`) ».

#### RA11 — Transversal : le vocabulaire « unsigned » des tableaux

**Constat.** Plusieurs sections écrivent `unsigned tinyint`, `unsigned smallint` ou `unsigned
integer` (§2 `reviews_count`, §3, §7 `min_bedrooms`, §11 `rating`, §14, §17 `duration_minutes`,
§21). Sur PostgreSQL, ces colonnes sont des `smallint` ou des `integer` signés, sans CHECK. Les
tableaux ne le disent pas, et la Légende (l.115-131) pose les autres équivalences PostgreSQL (`json` →
`jsonb`), mais pas celle-là.

**Proposition.**
- Ajouter une puce à la Légende : « `unsigned …` (vocabulaire Laravel) : PostgreSQL n'a pas d'entier
  non signé. `unsignedTinyInteger` et `unsignedSmallInteger` donnent un `smallint`,
  `unsignedInteger` un `integer`, **sans CHECK** : le signe et la borne sont applicatifs ».


### Relevé modèles §34-§66 (RB)


#### RB1 — §41 BankStatementLine : écrire les quatre cibles du rapprochement

**Constat.** `ReconciliationManager::ALLOWED_PAYMENT_TYPES` et `ReconciliationMatcher` admettent
`BookingPayment`, `LeasePayment`, `Invoice` et `Payout` (TCK-593) ; models-spec.md l.2313, l.2328 et
l.2346 n'en écrivent que deux. La ligne `features.md` l.227 (rapprocher les débits avec les
reversements) repose sur la cible `Payout` que la spec tait.

**Proposition.** Description l.2313 : « … avec un paiement existant (`BookingPayment`,
`LeasePayment`), une facture (`Invoice`) ou un reversement émis (`Payout`, débit — TCK-593) ».
Ligne `matched_payment_type` : « Nom de classe complet de la cible (`get_class`, pas de morph map) :
`BookingPayment`, `LeasePayment`, `Invoice` ou `Payout` ». Relation l.2346 : « `matchedPayment()` →
morphTo (`matched_payment`) → BookingPayment | LeasePayment | Invoice | Payout ». Même correction dans
la description de §40 (l.2262).

#### RB2 — §40, §41, §51 : les noms de relation sont ceux du modèle

**Constat.** La spec écrit `uploaded_by()`, `finalized_by()` (§40 l.2297-2298), `confirmed_by()`
(§41 l.2347), `granted_by()` (§51 l.2717) ; les modèles déclarent `uploadedBy()`, `finalizedBy()`,
`confirmedBy()`, `grantedBy()`, et ce sont ces noms que `$requestLoadable` accepte en `include=`.

**Proposition.** Remplacer les quatre noms par leur forme camelCase, en gardant la colonne entre
parenthèses : « `uploadedBy()` → belongsTo User (via `uploaded_by`) », etc.

#### RB3 — §40 BankStatement : le disque du relevé

**Constat.** l.2292 écrit « disk `local` » ; le modèle range la collection `statement` sur
`config('media-library.disk_name')` = `MEDIA_PRIVATE_DISK` (TCK-538).

**Proposition.** « collection `statement` (fichier unique, **disque privé de médias**
`media-library.disk_name` — `local` en développement, R2 privé déployé, TCK-538) ».

#### RB4 — §44 AgencySubscription : écrire l'unicité partielle

**Constat.** `2026_05_07_000222` crée `agency_subscriptions_one_open_per_agency (agency_id) WHERE
ended_at IS NULL` ; ni §44 ni « Contraintes d'unicité » ne la nomment.

**Proposition.** Ajouter à « Index » de §44 : « `agency_subscriptions_one_open_per_agency` — unique
partiel `(agency_id) WHERE ended_at IS NULL` : au plus une souscription ouverte par agence, quel que
soit son statut (`DB::statement`, `2026_05_07_000222`) ». Ajouter la ligne correspondante au tableau
« Contraintes d'unicité ». Ajouter le scope `current()` (`ended_at IS NULL`) à côté d'`active()`.

#### RB5 — §50 TenantOnboardingChecklist : nullabilité, index, sens du drapeau

**Constat.** `reminders_sent` est `jsonb NULL` sans défaut en base (défaut `'[]'` du modèle) ;
l'index est `(completed_at, created_at)` ; `TenantOnboardingService` crée la checklist sauf si
`tenant_onboarding_enabled` vaut **explicitement** `false`.

**Proposition.** Ligne `reminders_sent` : Nullable « oui », Défaut « — », description complétée par
« défaut `[]` côté modèle (`$attributes`), pas de DEFAULT en migration ». Index :
« `(completed_at, created_at)` pour KPI de complétion ». Note l.2689 : « Créé par défaut ; n'est pas
créé si l'agence a **désactivé** le workflow (`Agency.settings.tenant_onboarding_enabled = false`
explicite — absent vaut activé) ». Ajouter « `user_id` (`cascadeOnDelete`) ».

#### RB6 — §42 KycDossier : dire la portée réelle (et ce qu'elle laisse à l.490)

**Constat.** Seule l'agence a un dossier : `Agency::kycDossier()`, `KycWorkflowService::
dossierForAgency()`, `AGENCY_REQUIRED_DOCUMENTS` ; aucun profil ne déclare la relation, et la base de
dev ne porte que `subject_type = App\Models\Agency`. La spec (l.2358, l.2368) décrit un dossier par
profil.

**Proposition.** Description : « attaché de manière polymorphe à une entité vérifiable. **Seule
l'agence en a un aujourd'hui** (`Agency::kycDossier()`, `KycWorkflowService::dossierForAgency()`) ;
le morph laisse la place à un dossier par profil, qu'aucun chemin ne crée ». `reviewed_by` :
« super-admin ayant statué ». Ajouter l'inverse « `Agency.kycDossier()` → morphOne ». Signaler à
l'axe Features → Modèles que `features.md` l.490 (P1) n'a pas de support (candidat ⚠️ ou ticket).

#### RB7 — §46 Announcement : `segment` est nullable

**Constat.** `jsonb NULL` en base, `nullable` dans les deux FormRequest ; le tableau l.2519 le dit non
nul.

**Proposition.** Ligne `segment` : Nullable « oui », Défaut « null ». Ajouter « (`nullOnDelete`) » à
`created_by`, et le scope `currentlyVisible()` (actif, commencé, non terminé).

#### RB8 — §47 AnnouncementDismissal : horodatages et relations

**Constat.** La table porte `created_at` / `updated_at` ; le modèle déclare `announcement()` et
`user()`.

**Proposition.** Ajouter au tableau « `created_at` / `updated_at` | datetime | | auto » ; ajouter une
rubrique « Relations : `announcement()` → belongsTo Announcement ; `user()` → belongsTo User ».
Côté §46, l'inverse `dismissals()` est déjà écrit.

#### RB9 — §53 AgencyRoleCapability : rubrique Relations

**Constat.** Le modèle déclare `agencyRole()` et `toCapability()` ; la section n'a pas de rubrique
Relations.

**Proposition.** Ajouter « **Relations :** `agencyRole()` → belongsTo AgencyRole » et, en Notes,
« `toCapability()` rend la valeur en `Capability`, ou `null` pour une valeur sortie du catalogue ».

#### RB10 — §61 ScheduledTaskRun : le statut est une enum

**Constat.** `status` est casté `ScheduledTaskRunStatus` (`finished`, `failed`, `skipped`, `running`)
depuis TCK-383 (2026-08-27) ; la section, mesurée le 2026-08-16, écrit un `string` nu.

**Proposition.** Ligne `status` : Type « ScheduledTaskRunStatus » (string en base), description
« `finished` / `failed` / `skipped` / `running` (TCK-383) ».

#### RB11 — §48 Invitation et §49 AgencyUpgradeRequest : les `onDelete` destructeurs (P3)

**Constat.** `invitations.agency_id` et `invitations.invited_by` sont en `ON DELETE CASCADE`,
`invited_user_id` en `SET NULL` ; `agency_upgrade_requests.reviewed_by` en `SET NULL` ;
`submitted_at` n'a pas de défaut en base. Rien de cela n'est écrit, ni dans les sections ni dans
« Comportements FK ».

**Proposition.** Ajouter l'`onDelete` dans la description des quatre FK ; pour `submitted_at`,
remplacer « auto » par « — (posé à `now()` par `AgencyUpgradeRequestService`) ». Ajouter
`invitations.invited_by` à la ligne « Table enfant de vie » de « Comportements FK », où une
suppression d'utilisateur qui emporte ses invitations est un choix à rendre visible.

#### RB12 — §62 ReportExport : `xlsx` accepté, jamais produit (signalement)

**Constat.** `ReportExportRequest` accepte `format` `in:csv,xlsx` ; `GenerateReportExport` écrit
toujours `reports/{report}-{id}.csv` en CSV, sans lire `format`.

**Proposition.** Dans §62, ligne `format` : « `csv` / `xlsx` — ⚠ `xlsx` est accepté et enregistré,
mais le job produit toujours un CSV (`GenerateReportExport`) ». Le défaut est dans le code, pas dans
la spec : candidat ticket, à relayer à l'axe Features → Modèles pour l.600.


### Relevé modèles §67-§99 et transversal (RC)


#### RC1 — §72, §74, §75, §81, §82 : écrire les index omis
**Constat.** `pg_indexes` à `b3793a0a` : `calendar_feeds_agency_idx (agency_id)` ; `media_fingerprints_agency_idx (agency_id)` ; `duplicate_suspicions_matched_idx (matched_property_id)` et `duplicate_suspicions_open_idx (resolved_at, created_at)` ; `prop_cal_feeds_property_idx (property_id)` ; `lease_signatures_user_idx (user_id)`. Aucun n'est écrit. Les migrations sont respectivement `2026_10_07_591100_create_calendar_feeds_table`, `2026_10_08_100500_create_media_fingerprints_table`, `2026_10_08_100600_create_duplicate_suspicions_table`, `2026_10_08_010000_create_property_calendar_feeds_table` et `2026_10_08_020100_create_lease_signatures_table`.
**Proposition.** §72 : « **Index :** `(user_id, agency_id)` (`calendar_feeds_user_agency_idx`), `agency_id` (`calendar_feeds_agency_idx`) ». §74 : ajouter `media_fingerprints_agency_idx`. §75 : ajouter une ligne « **Index :** `duplicate_suspicions_matched_idx (matched_property_id)`, `duplicate_suspicions_open_idx (resolved_at, created_at)` — la file des soupçons ouverts ». §81 : ajouter « **Index :** `prop_cal_feeds_property_idx (property_id)` ». §82 : ajouter « **Index :** `lease_signatures_user_idx (user_id)` ». Au passage, préciser `nullOnDelete` pour `created_by_id` (§80, §81) et pour `on_behalf_of_user_id` / `recorded_by_id` (§82).

#### RC2 — §96 : fusionner #378, ou appliquer M44
**Constat.** `credit_movements_append_only()` en base (`2026_10_12_500200_create_credit_ledger_tables`) laisse passer un `UPDATE` direct qui met `property_boost_id` ou `actor_id` à `NULL`. La section dit que seule l'action `ON DELETE SET NULL` le peut. #378 durcit le trigger et réécrit le paragraphe. Les deux se fusionnent sans conflit avec `b3793a0a`.
**Proposition.** Fusionner #378 : §96 devient alors conforme. Sinon, appliquer M44 de la passe 012 mot pour mot. Dans les deux cas, ajouter « (un `UPDATE` qui ne change aucune valeur passe, sans effet) » après « tout UPDATE ou DELETE direct lève `P0001` ».

#### RC3 — §98 (et §1) : nom réel de la relation inverse
**Constat.** `Concerns/HasProfiles.php:38-54` déclare `ownerProfiles()`, `agentProfiles()` et `agencyAdminProfiles()`. Or la spec écrit `User.agency_admin_profiles()` (§98 l.4433) et `owner_profiles()`, `agent_profiles()`, `agency_admin_profiles()` (§1 l.425-427). Eloquent ne résout pas un nom en snake_case.
**Proposition.** §98 : « `User::agencyAdminProfiles()` → hasMany AgencyAdminProfile (trait `HasProfiles`) ; `AgencyRole::agencyAdminProfiles()` → hasMany ». §1 : renommer les trois lignes à l'identique.

#### RC4 — Packages transversaux : Lemon Squeezy, Scout, helpers inexistants
**Constat.** La base porte 5 tables `lemon_squeezy_*`, créées par les migrations du paquet hors de `database/migrations/` : c'est pourquoi la base compte 227 migrations pour 222 fichiers. `Agency` utilise `LemonSqueezy\Laravel\Billable`. Aucune des deux choses n'est écrite. `laravel/scout` (`Searchable`, 7 modèles) n'a pas d'entrée. `isCustomerOf()` / `isTenantOf()` n'existent pas. Enfin, `Agency::subscriptions()` masque la méthode homonyme du trait `Billable`.
**Proposition.** Ajouter un paragraphe `lemonsqueezy/laravel` : les 5 tables, leur origine (`vendor`, migrations `2023_01_16_00000{1..5}`), le morph `billable` → `Agency`, le compte « base = fichiers + 5 », et une ligne d'avertissement sur le masquage de `subscriptions()` (ticket de vérification). Ajouter un paragraphe `laravel/scout` (liste des modèles `Searchable`, renvoi à `config/scout.php`). Dans la phase 1 de `spatie/laravel-permission`, remplacer « helpers `isCustomerOf($agency)` / `isTenantOf($agency)` » par « dérivés dans `HasProfiles` (types de profil `customer`, `tenant`) », et écrire `isAgentAt(int $agencyId)` / `hasProfileAt(int $agencyId, …)`. Dans `spatie/laravel-activitylog`, écrire « via `App\Models\Bases\Auditable` (qui porte `LogsActivity`) ».

#### RC5 — Légende : sens de 🆕 et comptes périmés
**Constat.** La Légende définit 🆕 = « Modèle à créer », alors que les 55 sections marquées 🆕 décrivent des modèles en code. Ses comptes « 69 » `->jsonb(` et « 56 » lignes `jsonb` (2026-08-22) valent aujourd'hui 79 et 66.
**Proposition.** 🆕 → « Ajouté depuis la spec initiale (2026-04) » ; ✅ → « Documenté d'après le code ». Remplacer les deux chiffres par la commande seule (« le compte se prend à la source : `grep -rho '\->jsonb(' database/migrations | wc -l` »), puisque la phrase dit déjà « jamais ici ».

#### RC6 — Table des matières : ancre de §12, « le plus ancien », liste transversale
**Constat.** Le titre `### 12. AppNotification ✏️` porte U+FE0F, que l'ancre GitHub conserve, si bien que le lien `#12-appnotification-` (l.149) ne mène pas au titre. Les lignes 271-275 font de §72 (`2026_10_07_591100`) le modèle le plus ancien, alors que §76 (`2026_10_07_200000`) et §77 (`2026_10_07_200100`) le précèdent. Le bloc « Sections transversales » omet trois sections.
**Proposition.** Retirer ✏️ du titre de §12 (le garder dans la TOC), ou remplacer le lien par l'ancre avec U+FE0F. Remplacer « le plus ancien, §72, par `2026_10_07_591100` » par « les plus anciens, §76 et §77, par `2026_10_07_200000` et `200100` ». Ajouter « Packages transversaux », « Légende » et « Résumé des changements » au bloc.

#### RC7 — Contraintes d'unicité : deux uniques non décrits, `users`, formulation
**Constat.** `ucr_unique (user_id, customer_id, relationship_type)` et `agency_subscriptions_one_open_per_agency (agency_id) WHERE ended_at IS NULL` existent en base et ne sont écrits nulle part. `users_email_unique` et `users_username_unique` (à l'octet) ne sont pas nommés. La ligne `agency_admin_profiles` dit « toujours » pour une unicité qui ne protège pas les lignes sans titulaire.
**Proposition.** Ajouter deux lignes : `user_customer_relationships | (user_id, customer_id, relationship_type) (ucr_unique) | unique composé | toujours`, et `agency_subscriptions | agency_id (agency_subscriptions_one_open_per_agency) | unique partiel | ended_at IS NULL — un seul abonnement ouvert par agence`. Les reporter dans §9 et §44. Pour `users`, ajouter « et, à l'octet, `users_email_unique`, `users_username_unique` (jamais retirés) ». Pour `agency_admin_profiles`, écrire « si `user_id` non null », comme pour les deux autres profils.

#### RC8 — Comportements FK : la ligne « sans `onDelete` »
**Constat.** Quatre FK applicatives sont en `NO ACTION` (`confdeltype = 'a'`) : `conversations.created_by`, `maintenance_requests.requester_id`, `inventories.conducted_by` et `documents.uploaded_by`. Le tableau, qui se dit règle « systématique », n'a pas de ligne pour ce cas. §22 l.1625 ne dit rien de `uploaded_by`.
**Proposition.** Ajouter une ligne « FK sans comportement déclaré (`NO ACTION`, la suppression physique du parent est refusée) | — | conversations.created_by, maintenance_requests.requester_id, inventories.conducted_by, documents.uploaded_by — écarts à la règle, à trancher par ticket ». Compléter §22 `uploaded_by` par « FK sans `onDelete` ».

#### RC9 — Règles d'invariance : noms et mécanismes réels
**Constat.** Voir § 3.8 : Règle 3, `reference()` et 5 types ; Règle 2, job inexistant et recalcul par `ReviewObserver` ; Règle 1, invariant tenu par le schéma ; en-tête « via des Observers » ; `team_id = null` ; ordre 1-2-3-5-6-4.
**Proposition.**
- **Règle 3 :** « La méthode `reference()` (pas `referenceable()`) résout le type par une table de correspondance : `booking`, `lease`, `lease_payment`, `maintenance`, `property_visit` ».
- **Règle 2 :** remplacer « Jobs planifiés (`RecalculatePropertyRatingsJob`, etc.) » par « `ReviewObserver`, qui recalcule `reviews_count` / `average_rating` à chaque changement d'avis », et remplacer `DB::increment('table', 'column')` par `$relation->increment('colonne')`.
- **Règle 1 :** « Implémentation : par le schéma — `leases.tenant_id` référence `customers` (`RESTRICT`) ».
- **En-tête :** « implémentées par le schéma, des observers ou des middlewares, selon la règle ».
- **Règle 4 :** retirer « `team_id = null` ».
- **Ordre :** renuméroter dans l'ordre d'apparition, ou déplacer la Règle 4 après la 3.

#### RC10 — EF6 et §13 : table `activity_logs` inexistante
**Constat.** Aucune migration n'a jamais créé `activity_logs` ni `activity_log_changes`.
**Proposition.** Clore EF6 : « **Statut :** sans objet — la table `activity_logs` n'a jamais existé dans ce dépôt ». Dans §13, retirer « (et `activity_log_changes` selon la configuration) » et la phrase sur la migration de données.

#### RC11 — Enums : homonyme mort `Bases/Enums/UserStatus`
**Constat.** `app/Models/Bases/Enums/UserStatus.php` (`active, inactive, suspended, banned`) n'est référencé nulle part ; `Enums/UserStatus` (`active, inactive, blocked, deleted`) est le seul cast.
**Proposition.** Sous le tableau « Enums existants », ajouter : « ⚠ `App\Models\Bases\Enums\UserStatus` est un homonyme mort aux valeurs divergentes ; seul `App\Models\Enums\UserStatus` est utilisé — suppression à faire par ticket ».

#### RC12 — Références de migration ambiguës
**Constat.** Treize horodatages de `database/migrations/` sont partagés par plusieurs fichiers. Dans §67-99, trois références n'identifient pas un fichier unique : `2026_10_07_150000` (2 fichiers, §67), `2026_10_07_150200` (3 fichiers, §67) et `2026_10_08_100000` (3 fichiers, §76, §78).
**Proposition.** Citer le nom complet : `2026_10_07_150000_alter_property_contact_leads_for_inbox`, `2026_10_07_150200_normaliser_les_telephones_saisis`, `2026_10_08_100000_create_payout_method_verifications_table`.

#### RC13 — §71 : renvoi à §96
**Constat.** §71 dit « les deux seuls modèles à couper les timestamps », et §96 dit `CreditMovement` « seul modèle du dépôt » sans `updated_at`. Les deux phrases sont vraies, mais elles se lisent comme contradictoires.
**Proposition.** Ajouter à §71 : « (`$timestamps = false` ; `CreditMovement` ne coupe que `updated_at`, voir [§96](#96-creditmovement-)) ».
