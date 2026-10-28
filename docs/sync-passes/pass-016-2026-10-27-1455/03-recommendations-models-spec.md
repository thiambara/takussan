# Passe 016 — Recommandations pour `docs/models-spec.md`

**Quinze recommandations nouvelles : ME1 à ME15.** Toutes décrivent du code **déjà fusionné sur
`dev`**. Ce sont des corrections factuelles, pas des décisions : chacune se vérifie dans une
migration ou une classe nommée.

Soldées depuis la 015 : MD1 → MD7 (015) et C1 → C5, C16 (013). Restent ouvertes, et ne sont pas
répétées ([013](../pass-013-2026-10-14-1023/03-recommendations-models-spec.md),
[014](../pass-014-2026-10-14-2220/03-recommendations-models-spec.md)) :

- C7, C8, C9 (partielle : `shareLinks()`, `Searchable`, cibles de profil), C10, C11 → C15 ;
- C17 (partielle : Règles 2 et 4), C18 → C27 ;
- MC3.

| ID | Section | Objet | Ticket(s) | Priorité |
|----|---------|-------|-----------|----------|
| ME1 | §104 AiCall | `stop_reason` ; `error_code` en code `ai.*` ; une réponse tronquée ou filtrée est `failed_over` | TCK-2399 | **Haute** — table du lot qui vient de fusionner |
| ME2 | §106 AiEvaluationRun | `error_code` en code `ai.*` | TCK-2399 | **Haute** |
| ME3 | §105 AiSuggestion | `input_snapshot` : l'effacement est à venir | TCK-2391 (`todo`) | Basse |
| ME4 | §15 LeasePayment | Six colonnes : `marked_paid_at`, `late_fee_payout_*` (4), `late_fee_refund_amount` | TCK-1342, P206.01, P206.04 | **Moyenne** |
| ME5 | §28 Payout + nouvelle §107 | Constaté, reprise, copie des lignes ; deux tables sans section | TCK-2017, TCK-2052, TCK-2151 | **Moyenne** |
| ME6 | §27 Guarantor | `agency_id` et la règle de l'agence | TCK-1993 | **Moyenne** — la spec décrit une règle d'accès périmée |
| ME7 | §45 PlatformPayout | Rapprochement bancaire | TCK-1421 | Moyenne |
| ME8 | §41 BankStatementLine | `duplicate_of_line_id` | TCK-1919 | Basse |
| ME9 | §11 Review, unicités | L'unicité porte le sujet noté | TCK-2062 | **Moyenne** — la spec justifie l'ancien index |
| ME10 | §90 GeoCity, §91 GeoNeighborhood | `former_names` | TCK-1169, TCK-1080 | Basse |
| ME11 | §48 Invitation | `reminder_attempts` | TCK-2155 | Basse |
| ME12 | §86 PlatformMetricDaily | Retirer « compte encore `status = published` » | TCK-2087 | Basse |
| ME13 | Règle 1 | `User::customer()` retirée ; l'implémentation réelle | TCK-2372, TCK-2350, TCK-2351 | Basse |
| ME14 | §3 Property, §69 NotificationDeliveryAttempt | Deux index omis ; une redite | TCK-1000, TCK-2326 | Basse |
| ME15 | Paquets, §103 | `laravel/ai` ; plafonds global et par agence en configuration | TCK-2383 | Basse |

---

#### ME1 — §104 `AiCall`

**Constat :**

- **`stop_reason`** string(20) nullable (`2026_10_27_100050`, placée après `outcome`, TCK-2399) est
  absente. C'est la raison de fin de la réponse, valeur de `FinishReason` du SDK : `stop`,
  `length`, `content_filter`, `tool_calls`, `error`, `cancelled`, `unknown`, `continue`. Elle est
  nulle pour un refus, un cache ou une exception.
- **`error_code`** est décrit « Nom de l'exception, jamais son message ». Depuis TCK-2399, c'est un
  **code `ai.*`**, que le front traduit. Le nom de la classe reste au journal Laravel. Les sources :
  - `AiErrorCode::fromThrowable()` : `ai.provider_timeout`, `ai.provider_rate_limited`,
    `ai.provider_credits`, `ai.provider_unavailable`, `ai.provider_auth`, `ai.request_rejected`,
    `ai.response_invalid`, `ai.unexpected` ;
  - le code propre d'`AiUnavailable` (`ai.providers_unavailable`, `ai.role_unassigned`) ou d'`AiRefused`
    (`ai.refused.<motif>`) ;
  - la passerelle elle-même : `ai.response_truncated`, `ai.response_filtered` (ci-dessous) et
    `ai.role_unassigned` (ligne `error` sans maillon, quand le rôle n'a aucune chaîne).
- **La sémantique de `failed_over` s'est élargie.** Une réponse `length` ou `content_filter` est
  inexploitable : la ligne s'écrit `failed_over` avec `error_code = ai.response_truncated` ou
  `ai.response_filtered`. Ses jetons et son coût sont journalisés, donc comptés au budget. Elle
  n'entre pas au cache, et la passerelle passe au maillon suivant. `failed_over` vaut pour toute
  erreur basculable, **même au dernier maillon**. `error` est réservé à l'erreur qui interrompt la
  chaîne.

**Proposition :**

- Ajouter la ligne `stop_reason` après `outcome` : « string(20) | oui | null | Raison de fin de la
  réponse (`FinishReason` du SDK : `stop`, `length`, `content_filter`, `tool_calls`, `error`,
  `cancelled`, `unknown`, `continue`) ; nulle pour un refus, un cache ou une exception (TCK-2399) ».
- Ligne `error_code` : « Code `ai.*` de l'erreur (`AiErrorCode`, TCK-2399), jamais un nom de classe
  ni un message ; inclut `ai.response_truncated`, `ai.response_filtered` et `ai.role_unassigned` ».
- Ligne `outcome` : ajouter « `failed_over` : maillon en échec basculable, dernier compris, ou réponse
  tronquée ou filtrée (payée, hors cache) ; `error` : erreur qui interrompt la chaîne ».
- Description du modèle : dire que `stop_reason` reste une chaîne, sans cast (relevé sur
  `AiCall::$casts`).

#### ME2 — §106 `AiEvaluationRun`

**Constat.** Deux passages disent encore « nom de la classe » :

- la ligne `error_code` : « …, ou le nom d'une exception » ;
- le « Cycle de vie » : « sinon le nom de la classe de l'exception ».

`RunAiEvaluation` écrit `AiErrorCode::fromThrowable($e)` dans les deux branches d'échec (TCK-2399).

**Proposition :**

- ligne `error_code` : « Sur `failed` : `ai.eval.job_lost`, `ai.eval.job_failed`, ou le code `ai.*`
  de l'erreur (`AiErrorCode`, comme `ai_calls.error_code`) » ;
- cycle de vie : remplacer « sinon le nom de la classe de l'exception » par « sinon le code `ai.*` de
  l'exception (`AiErrorCode`) ».

#### ME3 — §105 `AiSuggestion` : un effacement à venir

**Constat.** `input_snapshot` est décrit « effacé avec son objet (purge du Radar, TCK-2391) ».
TCK-2391 est `todo`, et aucun code n'efface la colonne. Les seuls lecteurs sont `SuggestionRecorder`
(écriture) et `EvalCaseExporter`, qui anonymise à l'export. C'est le défaut de C23 et de MD7 : la
spec dit au présent ce qui est décidé.

**Proposition.** « Contenu soumis à l'IA ; anonymisé à l'export des cas d'évaluation
(`EvalCaseExporter`). **À venir** (TCK-2391) : effacé avec son objet par la purge du Radar ».

#### ME4 — §15 `LeasePayment` : six colonnes

**Constat**, sur trois migrations :

- `marked_paid_at` timestamp nullable (`2026_10_22_150000`, TCK-1342) : le moment où l'agence a
  enregistré le paiement (`markPaid`). Il est distinct de `paid_at`, date effective saisie, qui peut
  être ancienne. La fenêtre de quittance du lien `/pay/{jeton}` court depuis le plus tardif des deux
  (`LeasePaymentLinkService::effectiveExpiry`).
- Pénalité réglée, reversée (`2026_10_24_160000`, P206.01, ADR-0039 amendement du 2026-10-24, point 6) :
  - `late_fee_payout_id`, FK `payouts` (`lease_payments_late_fee_payout_fk`, `nullOnDelete`), index
    `lease_payments_late_fee_payout_idx` : le reversement qui a pris la pénalité ;
  - `late_fee_payout_amount` decimal(14,2), `late_fee_payout_commission_rate` decimal(5,2),
    `late_fee_payout_commission_amount` decimal(14,2), tous nullables : la copie figée de ce qu'il
    en a pris, comme les pivots (ME5) ;
  - un reversement `cancelled` ou `failed` remet les quatre colonnes à nul (`PayoutService`).
- `late_fee_refund_amount` decimal(14,2) nullable (`2026_10_24_160100`, P206.04, point 7) : la part
  de pénalité rendue par un remboursement, qui s'impute d'abord à elle. `refund_amount` reste
  plafonné au loyer.

**Proposition :**

- ajouter les six lignes au tableau, avec leurs migrations ;
- compléter « Index » par `lease_payments_late_fee_payout_idx` ;
- ajouter les trois migrations à l'encadré « Schéma mesuré » ;
- dans « Relations », dire que le modèle ne déclare pas de relation vers le reversement de la
  pénalité (aucune n'existe, relevé du 2026-10-27).

#### ME5 — §28 `Payout`, et une §107 pour la reprise au bailleur

**Constat :**

- `refunded_payment_type` / `refunded_payment_id` (`nullableMorphs`, index
  `payouts_refunded_payment_idx`, `2026_10_24_030000`, TCK-2052) sont absentes. Elles marquent et
  désignent le `Payout` « constaté » d'un remboursement d'acompte ou de loyer déjà sorti : un constaté
  est **exactement** un `Payout` où elles sont non nulles. Relation `refundedPayment()` (morphTo).
- `clawback_amount` decimal(14,2) nullable (`2026_10_24_050000`, TCK-2151) est absente : la reprise
  imputée à ce reversement, à côté de `fees_amount`.
- Sur `payout_lease_payment` et `payout_booking_payment`, `amount` decimal(14,2), `commission_rate`
  decimal(5,2) et `commission_amount` decimal(14,2), nullables (`2026_10_24_010000`, TCK-2017), sont
  absentes. Ce sont la copie, ligne par ligne, de ce que le reversement a pris, posée par
  `PayoutService::createLocked`. Une ligne d'avant n'en a pas, et le relevé la lit alors au taux du
  jour.
- **Deux tables n'ont aucune section** (`2026_10_24_050000`, TCK-2151, ADR-0039 amendement du
  2026-10-24). §101 les cite seulement (« comme `payout_clawbacks` »). Sans modèle Eloquent, elles se
  lisent par `App\Services\Payout\PayoutClawbacks`.
  - `payout_clawbacks` : `agency_id` et `landlord_id` (FK, `cascadeOnDelete`) ; `refunded_payment_*`
    (morph, index `payout_clawbacks_refunded_payment_idx`) ; `part` string(20), défaut `payment` ;
    `source_payout_id` (FK `payouts`, `cascadeOnDelete`) ; `refund_amount`, `commission_rate`,
    `commission_amount`, `amount` ; `currency` ; `refunded_at` ; `settled_amount`, `settled_at`,
    `settled_by_id` (`nullOnDelete`), `settlement_note`. Index
    `payout_clawbacks_agency_landlord_idx (agency_id, landlord_id)` et
    `payout_clawbacks_source_payout_idx`.
  - `payout_clawback_imputations` : `payout_id`, `payout_clawback_id` (FK, `cascadeOnDelete`),
    `amount`. Unique `payout_clawback_imputations_pair_unique (payout_id, payout_clawback_id)`,
    index `payout_clawback_imputations_clawback_idx`.

**Proposition :**

- §28 : ajouter `refunded_payment_type`, `refunded_payment_id` et `clawback_amount` au tableau,
  l'index à « Contraintes et index », et `refundedPayment()` aux relations. Compléter le paragraphe
  des pivots par les trois colonnes de copie (TCK-2017).
- Créer **§107 `PayoutClawback`** (ou « Reprise au bailleur »), sur le modèle de §101 : « Modèle :
  aucun », deux tableaux, la règle d'imputation (au reversement suivant du même bailleur, reliquat
  reporté) et la reprise de données (aucune). L'ajouter à la table des matières, et la ligne d'unicité
  au tableau des unicités.

#### ME6 — §27 `Guarantor` : l'agence de la caution

**Constat :**

- `agency_id` (FK `agencies`, `nullOnDelete`, index — `2026_10_23_230000`, TCK-1993) est absente. Elle
  est posée à la création et rattrapée dans cet ordre, quand la source désigne **une** agence : par
  les baux qui portent la caution, puis par les profils de son auteur (supprimés compris). Sinon elle
  reste nulle.
- Le paragraphe « Données sensibles » dit la lecture claire « réservée à l'admin de l'agence de
  l'auteur (`GuarantorPolicy::agencyOf`, par `addedBy`) ». `agencyOf` lit **d'abord la colonne**, et
  ne se rabat sur l'auteur que si elle est nulle. C'est le défaut que la colonne répare : une caution
  dont l'auteur efface son compte n'était plus lisible dans l'agence.
- La relation `agency()` (belongsTo) n'est pas citée.

**Proposition.** Ajouter la ligne `agency_id` après `added_by_id`, avec sa reprise. Corriger la
parenthèse en « réservé à l'admin de l'agence de la caution (`GuarantorPolicy::agencyOf` :
`agency_id`, à défaut l'agence de l'auteur) ». Ajouter `agency()` aux relations, **dans le même
mouvement que C10 (013)** : `addedBy()` (pas `added_by()`), `leasesPivot()`, et les médias.

#### ME7 — §45 `PlatformPayout` : le rapprochement bancaire

**Constat.** `2026_10_22_174000` (TCK-1421) ajoute les mêmes colonnes que `payouts` :

- `bank_reconciled_at` datetime nullable ;
- `bank_statement_line_id`, FK `platform_payouts_bank_line_fk` vers `bank_statement_lines`,
  `nullOnDelete` ;
- l'unique partiel `platform_payouts_bank_line_unique (bank_statement_line_id) WHERE
  bank_statement_line_id IS NOT NULL`.

Le virement de clôture de la plateforme se rapproche ainsi d'un crédit du relevé de l'agence.

**Proposition.** Ajouter les deux colonnes et l'unique, et compléter la description : « se rapproche
d'un crédit du relevé de l'agence (TCK-1421) ». Ajouter la ligne au tableau des unicités. Dans §41,
compter `PlatformPayout` parmi les pièces rapprochées : il n'y passe pas par `matched_payment`, mais
par sa propre colonne. **À joindre à C13**, qui réécrit déjà cette liste.

#### ME8 — §41 `BankStatementLine` : la ligne en doublon

**Constat.** `duplicate_of_line_id` (FK auto-référente `bsl_duplicate_of_line_fk`, `nullOnDelete`,
index `bsl_duplicate_of_line_idx` — `2026_10_23_223500`, TCK-1919) est absente. Une ligne qui reprend
une transaction déjà importée pour l'agence (même référence, date, montant et sens) pointe vers la
première ligne qui l'a portée. Supprimer l'origine efface la marque.

**Proposition.** Ajouter la ligne après `counterparty`, et l'index. À appliquer avec C13.

#### ME9 — §11 `Review` : l'unicité porte le sujet noté

**Constat.** `2026_10_24_040000` (TCK-2062, ADR-0043 amendé le 2026-10-23) a **remplacé**
`reviews_author_context_uniq` par `reviews_author_subject_context_uniq (author_id, reviewable_type,
reviewable_id, context_type, context_id) WHERE context_id IS NOT NULL`. L'ancien index ne laissait
qu'un avis de cible `User` par auteur et par bail. Or l'agent du bail et un collaborateur sont tous
deux notables sur la même preuve, et le second avis rendait 500.

La §11 décrit l'ancien index, et justifie l'absence de `reviewable_id` : cette justification est
désormais fausse. Le tableau des unicités porte la même ligne périmée.

**Proposition :**

- §11 : remplacer la puce par « **`reviews_author_subject_context_uniq`** — unique partiel
  `(author_id, reviewable_type, reviewable_id, context_type, context_id) WHERE context_id IS NOT
  NULL` : un avis par auteur, **sujet noté** et preuve (TCK-2062). Un même bail rend éligible à noter
  le bien, l'agence, l'agent et chaque collaborateur ». Ajouter la migration à l'encadré « Schéma
  mesuré ».
- Tableau des unicités : même remplacement.

#### ME10 — §90 `GeoCity` et §91 `GeoNeighborhood` : les anciens noms

**Constat :**

- `geo_neighborhoods.former_names` jsonb nullable (`2026_10_20_220000`, TCK-1080) : écrite par
  `GeoNeighborhoodModeration::renommer()`, lue par `QuartierDuFiltre::idsDuReferentiel()` ;
- `geo_cities.former_names` jsonb nullable (`2026_10_21_224500`, TCK-1169) : écrite par
  `GeoReferentialLoader::ville()`, lue par `VilleDuFiltre`.

Les deux sont castées `array`. Une recherche ou une alerte rangée sous l'ancien nom désigne toujours
le lieu. Aucune reprise.

**Proposition.** Une ligne dans chaque section : après `renamed_at` en §91, après `name` en §90.

#### ME11 — §48 `Invitation` : les essais du rappel

**Constat.** `reminder_attempts` unsigned smallint, défaut 0 (`2026_10_24_150000`, TCK-2155), est
absente. Elle compte les essais du rappel automatique (`InvitationService::remindPending()`) : un SMS
refusé par tous les fournisseurs se retente un jour plus tard, trois essais au plus
(`MAX_REMINDER_ATTEMPTS`). Un rappel posé épuise le compte.

**Proposition :**

- ajouter la ligne après `last_reminded_at` ;
- `last_reminded_at` : « Date du dernier **essai** de rappel J+2 ».

#### ME12 — §86 `PlatformMetricDaily` : le « pas encore » rattrapé

**Constat.** La ligne `properties_published` se termine par « ⚠ Au 2026-10-23,
`PlatformMetricsSnapshotter` compte encore `status = published` ». Depuis TCK-2087, le compteur
lit `Property::query()->public()->count()`.

**Proposition.** Retirer la phrase ⚠, et dater la rupture de la série par TCK-2087.

#### ME13 — Règle 1 : `User::customer()` n'existe plus

**Constat :**

- La puce « Conséquence » lit le client d'un demandeur « depuis l'utilisateur (`User::customer()`,
  hasOne) ». La §1 dit cette relation retirée par TCK-2372 : un compte porte une fiche par agence, ce
  que les deux puces voisines (TCK-2350) disent aussi.
- La puce « Implémentation » nomme « `UserObserver` ou logique dans `LeaseService` ». Les deux puces
  neuves décrivent les vrais écrivains : `CustomerService::findOrCreateFromUser` et `linkUser`.

**Proposition :**

- « Conséquence » : « … le client du demandeur se lit par `customers.user_id` **dans l'agence du
  bien** (`Customer::where('user_id', …)`), un compte ayant une fiche par agence ; aucune relation
  `requesterCustomer()` ».
- « Implémentation » : « `CustomerService::findOrCreateFromUser` (candidature, offre, réservation)
  et `CustomerService::linkUser` (invitation acceptée) ».

Cela solde une partie de C17 (013). Les Règles 2 et 4 restent.

#### ME14 — Deux index omis et une redite

- **§3 `Property`** : l'index `properties_pending_owner_profile_idx (pending_owner_profile_id)`
  (`2026_10_25_120000`) n'est pas cité. Le nom de la FK, `properties_pending_owner_profile_fk`, non
  plus. Dans la prose de `user_id`, « seules trois voies le réécrivent » puis « Aujourd'hui, hors
  création, les trois voies le réécrivent » disent deux fois la même chose depuis que TCK-999 et
  TCK-1000 sont livrés. Proposition : garder la seconde phrase, retirer la première avec sa liste.
- **§69 `NotificationDeliveryAttempt`** : l'index `(agency_id, created_at)` de `2026_10_25_120500`
  (TCK-2326) manque à « Index ». Il y sert la frontière d'isolation, PostgreSQL n'indexant pas une
  clé étrangère.

#### ME15 — Le socle IA hors de ses tables

- **Paquets transversaux** : ajouter `laravel/ai` (v1.3), le SDK des agents du socle. Le paquet publie
  une migration `agent_conversations` que le dépôt **n'a pas publiée** : aucune table de plus. Une
  ligne suffit, sur le modèle de `laravel/scout`.
- **§103 `AiUsageSetting`** : ajouter que les plafonds **global journalier** et **par agence** ne sont
  pas en base. Ils vivent en configuration (`ai.budgets.daily_global_xof`,
  `ai.budgets.daily_per_agency_xof`) et sont lus par `AiBudget`, sur la somme de `ai_calls.cost_estimate`
  du jour (hors `is_evaluation`). À appliquer avec FE1.

---

**Sans recommandation, dit explicitement :**

- **§2.12 Radar** : aucun modèle à décrire avant le lot 1. ADR-0077 impose la section dans la PR de
  chaque modèle (`check-models-spec` le garde).
- **Tables du framework** : la connexion `database-long` (ADR-0078) partage la table `jobs`, sans
  colonne neuve.
- **§37, §76, §101, §102** : conformes à leurs migrations, rien à ajouter.
