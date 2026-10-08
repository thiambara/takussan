---
id: TCK-595
title: "Tableaux de bord justes et pilotage : chaque acteur voit ses vrais chiffres, l'agence voit ses agents, ses commissions et ses impayés par ancienneté"
status: doing
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#15-transactions--paiements
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#8-propertycollaborator
    - docs/models-spec.md#35-agentprofile-
    - docs/models-spec.md#28-payout-
    - docs/models-spec.md#6-bookingpayment
tags: [back, front, dashboard, reporting, commissions, performance, export, adr-requise]
---

## Objectif utilisateur

- **Bailleur / hôte solo** : il atterrit sur SA vue et y lit un encaissé, une occupation et un net reversé exacts, avec des cartes qui mènent aux éléments à traiter.
- **Client** : dès son premier jour, son accueil montre ses visites, réservations, échéances et demandes en cours, même sans dossier client.
- **Agent** : il voit SES biens, SES clients et SES commissions, et non ceux de l'agence.
- **Admin d'agence (`standard`)** : il compare ses agents, suit les commissions dues à chacun, lit ses impayés par ancienneté et ses cautions détenues, et exporte reversements, factures et commissions.
- **Super-admin** : il lit un flux encaissé, un GMV, un take rate et un MRR hors essais mesurés jour par jour, au lieu de les reconstruire.

## Contexte

Analyse par acteur du 2026-10-06, vague 73 (points O10, O11, O18, O20, C14, A5, A14, AD15, AD16,
AD17, S17, B10). Chaque constat ci-dessous a été **re-mesuré** sur `origin/dev` `e3ab4a4e`. Deux
faits neufs, plus graves que les rapports, sont signalés **(neuf)**.

### 1. Bailleur et hôte : mauvaise vue, chiffres faux (O10, O11, O18, O20)

- **Aiguillage** : `takussan-web/src/app/(dashboard)/app/overview/page.tsx:11-36` teste `isAdmin`
  avant `isOwner`. À la l.33, une agence `individual` part vers `/app/overview/agent`. Or l'hôte créé par
  « Publier » est `agency_admin` + `owner` (`docs/features.md:307`). Le layout de la vue bailleur l'accepte
  déjà (`overview/owner/layout.tsx`, `isOwner || isAdmin`), et l'API aussi
  (`DashboardOwnerController.php:21-26`). **(neuf)** Côté API, l'accueil `/app` a le même défaut :
  `DashboardRoleResolver.php:42-45` envoie tout `agency_admin` vers `AgencyMeMetrics`, alors que §2.5
  réserve le dashboard agence aux agences `standard`.
- **Occupation** (`app/Services/Dashboard/DashboardOwnerService.php`) :
  - le résumé divise les biens `status=rented` par toutes les lignes `Property` du bailleur (`:25,55-57`) ;
  - la série compte les baux `status=Active` **aujourd'hui** (`:116-124`), donc un bail `expired`,
    `terminated` ou `renewed` disparaît des mois où il occupait le bien ;
  - le dénominateur (`:101`) compte les brouillons, les biens `contract_type=sale` et les immeubles
    parents (`parent_id`, `Property.php:724-729`) ;
  - le numérateur compte des baux, pas des biens : deux baux sur un même bien comptent deux fois.
  - `DashboardAgencyService.php:85,156-165` reproduit les mêmes défauts pour l'agence.
- **Encaissé** : il ne somme que les `LeasePayment` (`:40-43,110-113`). Les `BookingPayment` de la
  courte durée en sont absents, et l'hôte voit 0. C'est le brut, sans `payouts.net_amount`.
  **(neuf)** Le calcul ne filtre pas `payment_type`. Or `DepositRefundService.php:81-93` crée un
  `LeasePayment` `deposit_refund` en `pending`, échu à J+30, qui a le locataire pour payeur. Une
  restitution de caution, donc de l'argent qui SORT, compte ainsi comme encaissement une fois payée, et
  comme impayé une fois échue (`:45-53`). Un dépôt de garantie (`deposit`) compte aussi comme revenu.
- **Tests** : `tests/Feature/Dashboard/DashboardOwnerTest.php:92-94` ne vérifie que la **longueur** de la
  série. La seule valeur testée est l'encaissé d'un unique loyer (`:56`).
- **Requêtes** : `summary()` en fait 9 (`:25,28,29,31,35,40,45,50,59`), `monthlyTimeseries` 1 + 2 × mois
  (`:101-125`), soit 34 pour 12 mois. Aucun tableau de bord n'a de cache (`grep Cache::` → 0). Le front
  attend le tableau de bord PUIS demande les versements (`overview/owner/page.tsx:27,35`).
- **Cartes inertes** : la maintenance affiche le texte fixe `seeModule` (`owner/page.tsx:120-124`). Le
  retard n'a pas de lien (`:76-81`), et les versements ne sont pas cliquables (`:129-150`).
- **(passe de correction) « Prochains versements » montre de l'argent qui ne va pas au bailleur.** La
  carte demande `filter[landlord_id]=moi&filter[status]=pending` (`owner/page.tsx:210-235`). Or la
  restitution de caution crée un `Payout` `pending` dont `landlord_id` est le bailleur et le montant
  celui rendu au **locataire** (`DepositRefundService.php:96-111`) : le bailleur le lit comme un
  versement à recevoir. La carte omet en outre les reversements `scheduled` et `processing`, qui sont
  pourtant à venir (`PayoutStatus`). TCK-594 ajoute `payouts.payee_role` et `filter[payee_role]` ; les
  appliquer dans les lecteurs du tableau de bord revient à ce ticket (TCK-594, Contraintes).

### 2. Les commissions n'existent pas (A5, AD15, B10)

- **(neuf) `leases.commission_amount` n'est écrit par aucun code applicatif** :
  - `StoreLeaseRequest.php:45` ne valide que `commission_rate`, et aucune règle `commission_amount`
    n'existe dans `UpdateLeaseRequest` ni dans `RenewLeaseRequest` ;
  - `grep commission_amount app` ne rend que `Lease.php:33,57,92`, en dehors des dashboards et des
    reversements ;
  - ni `LeaseFactory` (`:35`) ni aucun seeder ne le remplissent.

  Les tuiles « Commissions » de l'agent (`DashboardAgentService.php:73-91`), de l'agence
  (`DashboardAgencyService.php:87-91`) et `AgencyStatsController.php:58-66` valent donc **0 sur toute
  donnée réelle**. Leurs tests sont verts parce qu'ils posent la colonne à la main
  (`DashboardAgentTest.php:46,73`, `AgencyStatsTest.php:36-63`).
- Même remplie, la tuile de l'agent est la somme des commissions de **toute l'agence**, commentée
  « proxy metric » (`DashboardAgentService.php:73`). `leases` n'a aucune colonne de négociateur
  (`2026_04_17_160011_create_leases_table.php:12-42`). La vente est un `Lease` de `type=sale`
  (`LeaseType.php`).
- `property_collaborators.commission_share` est saisi, puis plafonné à 100 % sous le verrou du bien
  (`PropertyCollaboratorController.php:85-125`). Aucun calcul ne le lit : on ne le trouve que dans
  `PropertyCollaborator.php:16,21`, `PropertyResource.php:167-168` et `PropertyDuplicationService.php:82`.
- `AgentProfile.commission_rate` (`AgentProfile.php:25,32`) n'a aucun lecteur métier.
- **(consolidation) `property_collaborators.accepted_at` n'est jamais écrit par l'application.**
  `PropertyCollaboratorController::store` (`:26-46`) ne pose qu'`invited_at` ; il n'existe aucun parcours
  d'acceptation, et seul `PropertyCollaboratorSeeder.php:52` remplit la colonne. `PrimaryPropertyContact.php:39-44`
  a déjà écarté la règle « le plus ancien accepté » pour cette raison. Une ventilation réservée aux
  collaborateurs « acceptés » verserait donc 0 à **tout** collaborateur créé par l'API.

### 3. Vue agent : des chiffres d'agence, et une liste de biens en N+1 (A5, A14)

- Plusieurs compteurs de la vue agent portent sur toute l'agence :
  - `properties_managed` compte « créés par moi OU de l'agence » (`DashboardAgentService.php:30-36`) ;
  - le pipeline porte sur toute l'agence (`:41-48`) ;
  - `leases_to_sign` aussi (`:88-90`).

  - les réservations en attente portent sur ces mêmes biens d'agence (`:64-66`).

  Le front les présente pourtant comme personnels : « Vue agent », « Commissions mois »
  (`takussan-web/src/messages/fr.json:1364,1368`). La série coûte 2 requêtes par mois, et jusqu'à 36 mois
  sont acceptés (`:207-248`).
- **(passe de correction) Les visites de l'agent sont mal comptées.** « Visites à 7 jours »
  (`visits.upcoming_7d`, `:68-71`) ne compte que `scheduled` : une visite `confirmed`, l'état que
  vise le rappel (`SendPropertyVisitReminders.php:52`), en est absente. À l'inverse, « Visites du
  jour » (`visits.today` et `today_items`, `:131-149`) ne filtre aucun statut et compte les visites
  `cancelled` et `no_show`.
- La liste `GET /api/properties` part de `PropertyController.php:35`, qui charge
  `with(['address','owner','collaborators.user'])` sans `media` ni `agency`. Pour chaque ligne,
  `PropertyResource` fait ensuite :
  - `getFirstMedia('photos')` (`:111`) ;
  - le rendu de `owner` (`:148-151`), puis, dans `buildUserLite`, `getFirstMediaUrl('avatar')` (`:321`)
    et `actsAsAgent()` (`:277-285`), qui charge `agency` à la demande, puis `isAgentAt` et
    `hasProfile(BrokerProfile)`, une requête `exists` chacun (`HasProfiles.php:143,157-162`).

  Cela fait 4 à 5 requêtes par ligne. C'est une lecture de code : aucun test ne compte les requêtes.

### 4. Accueil du client (C14)

- Les tuiles de l'accueil client sont incomplètes :
  - `TenantTiles` (`components/dashboard/DashboardMeKpis.tsx:98-118`) rend 4 tuiles, et
    `maintenance_open` (`TenantMeMetrics.php:30`) n'est lu par **aucun** écran client ;
  - **correction du rapport** : `bookings.pending` et `upcoming_30d` SONT affichés sur
    `/app/overview/tenant` (`page.tsx:69-72,75-94`) ;
  - les visites ne figurent nulle part.
- Le compte sans dossier client ne voit rien :
  - sans ligne `Customer`, `DashboardRoleResolver.php:60-64` rend `null`, et `/app` affiche l'état vide
    générique ;
  - `DashboardTenantService.php:24-41` rend `has_customer_profile:false`, et `/app/overview/tenant`
    n'affiche que « noProfile » (`:44-48`) ;
  - la ligne `Customer` ne naît qu'à la première réservation ou au premier contact
    (`CustomerService::findOrCreateFromUser`, `Services/Model/CustomerService.php:33-49`).
- `city` et `search_intent` sont collectés (`UpdateMeRequest.php:34,46`) mais n'ont **aucun lecteur**.
- **(passe de correction) Un client de deux agences n'en voit qu'une.** `DashboardTenantService.php:24`
  prend `Customer::where('user_id', …)->first()`. Rien n'impose l'unicité de `customers.user_id` (aucun
  index unique dans les migrations de `customers`), et chaque agence rattache sa propre fiche au compte
  (`CustomerService::linkUser`, `:28-31`). Les baux, échéances et impayés de la seconde agence
  disparaissent de son accueil.
- **(passe de correction) Une restitution de caution s'affiche comme un loyer à payer.** Le
  `LeasePayment` `deposit_refund` a le locataire pour `payer_id` (`DepositRefundService.php:81-93`).
  `next_due`, `upcoming_30d` et les impayés du client (`DashboardTenantService.php:52-80`) ne filtrent
  pas `payment_type` : le client lit la caution qu'on lui doit sous « Prochain loyer »
  (`tenant/page.tsx:58-62`), puis « En retard » à J+30.

### 5. L'admin d'agence ne pilote ni son équipe ni ses impayés (AD16, AD17)

- `DashboardAgencyService` ne rend que des agrégats d'agence. `grep -niE
  "objective|leaderboard|per_agent|by_agent|team-performance"` sur l'API et le web → 0. `/admin/team`
  est déjà réservé aux agences `standard` (`admin/team/page.tsx:27`).
- L'onglet Impayés (`OverduePaymentsTable.tsx:43`) est une liste plate figée sur `status=late`. Il ne
  propose ni ventilation par ancienneté, ni regroupement, ni cautions détenues (`grep deposit` sur les
  services de dashboard → 0). Le **correctif du rapport** est inexact : `OverdueReminderService`
  relance les FACTURES (`Services/Invoice/`, TCK-092), pas les loyers.
- **(passe de correction) L'onglet Impayés est vide pour un loyer sans pénalité.** Le statut `late`
  n'est posé que par `LateFeeCalculator::apply` (`LateFeeCalculator.php:130-134`), et seulement si le
  bail porte un `late_fee_percent` > 0 (`:75-78`), colonne nullable sans défaut
  (`2026_04_25_120000_add_late_fee_columns_to_leases_table.php:12`). Un loyer échu d'un bail sans
  pénalité reste `pending` : la tuile « Impayés » (`pending|late` échus,
  `DashboardAgencyService.php:69-77`) le compte, et l'onglet qui doit les lister ne le montre jamais.
- Les exports forment une liste fermée : `payments, leases, customers, properties`
  (`ExportController.php:36`, `ExportDataService.php:158-167`). Il n'existe aucun export des
  reversements, des factures ni des commissions.
- **(passe de correction) Un agent lit les finances de toute l'agence.** `GET /api/dashboard/agency`
  admet `isAgentAt` (`DashboardAgencyController.php:37-45`) : un agent obtient par appel direct le
  chiffre d'affaires, les impayés et les commissions de l'agence, alors que le rôle système agent ne
  porte aucune capacité de reporting (`SystemRoleCapabilities.php:61-88`).
- **(passe de correction) `reports.view_global` ne peut pas garder une vue d'agence.** Elle est
  **réservée à la plateforme** (`Capability.php:130-136`) : `agencyAssignable()` l'exclut, aucun
  `AgencyRole` ne peut la porter. La rédaction initiale de ce ticket la prescrivait pour
  `team-performance`, `aging` et `scope=agency` : l'admin d'agence aurait reçu 403 partout.
- **(passe de correction) La tuile « Équipe » compte les bailleurs.** `members_count`
  (`DashboardAgencyService.php:51-53`) additionne les profils agent et **bailleur**, de tout statut, et
  omet les admins d'agence ; elle s'affiche sous « Équipe », lien vers `/admin/team`
  (`AgencyActivityFeed.tsx:36`).

### 6. Le super-admin lit un « revenu » qui n'en est pas un (S17)

- La tuile « Revenu plateforme » est la somme de **tous** les loyers payés depuis toujours
  (`SystemMetricsController.php:71-73`, `fr.json:5982-5983`, `SystemMetricsGrid.tsx:200-210`). Elle ne
  filtre pas `payment_type` : une restitution de caution payée, argent **sortant**, s'y ajoute.
- Le MRR compte les abonnements `Trialing` (et `PastDue`) (`PlatformReportingService.php:433-460`).
  Il s'affiche aussi dans `GET /api/admin/reports/revenue` (`:140-178`), dont chaque point passé est
  jugé sur le statut **courant** de l'abonnement, alors que `trial_ends_at` dit quand l'essai a fini.
  Le commentaire « override-aware » est faux, mais sans effet sur la valeur : aucune colonne de prix
  surchargé n'existe (`AgencySubscription::$fillable` ne porte que `platform_fee_pct_override`).
- Ni le GMV ni les frais plateforme ne sont rapportés, alors que `platform_fee_pct_at_payment` existe
  sur les deux tables de paiement (migration `2026_05_07_000224`).
- Le docblock `SystemMetricsController.php:29-37` le dit : 8 métriques sur 11 n'ont pas de tendance
  faute d'historique. Il n'existe aucune table d'instantanés.

### 7. Les quatre vues d'ensemble formatent en français, quelle que soit la langue (consolidation)

- Les pages `takussan-web/src/app/(dashboard)/app/overview/{agency,agent,owner,tenant}/page.tsx` passent
  la locale **`'fr'` en dur** aux formateurs de `@/lib/format` : `const LOCALE: Locale = 'fr'`
  (`agent/page.tsx:24`), et `'fr'` littéral partout ailleurs (`owner/page.tsx:41-140`,
  `agency/page.tsx:53-107`, `tenant/page.tsx:57-87`). `agent/page.tsx:267,272` écrit en plus
  `Intl.DateTimeFormat('fr-SN', …)` pour l'heure des visites et les dates des tâches.
- Les libellés, eux, suivent la langue (`getTranslations`) : un utilisateur en `en` lit « Commissions
  this month » au-dessus de `150 000 F CFA` et d'une date française. `formatCurrency(…, 'en')` rendrait
  `150,000 F CFA` (`lib/format.ts:77,158-170`) : le helper est juste, c'est l'appel qui l'ignore.
- **Ce que TCK-347 ne couvre pas** (grep du 2026-10-06) : son inventaire et sa garde visent les
  littéraux BCP-47 (`'fr-SN'`, `'fr-FR'`). Il attrape donc `agent/page.tsx:267,272`, mais **pas** le
  code court `'fr'` passé à `formatCurrency` / `formatDate` / `formatNumber` / `formatPercent` dans les
  quatre pages (47 sites, `grep -oE "'fr'|LOCALE\)"`, mesuré le 2026-10-06).
  TCK-374 a porté les composants de `components/dashboard/admin/` sur `useLocale()`, pas ces pages.

## Contrat de données

**Modifiés** :
- `GET /api/dashboard/owner` : `finance.cashflow_month` (règle ci-dessous), `finance.lease_income_month`,
  `finance.booking_income_month`, `finance.net_paid_out_month`, `finance.deposits_held`,
  `occupancy.rate_percent` (aujourd'hui, longue durée), `occupancy.short_stay_percent` (mois courant,
  `null` sans bien courte durée), `maintenance.quotes_pending`, `visits.to_confirm`,
  `reviews.unanswered`. La série `timeseries` gagne `short_stay_occupancy` et `net_paid_out`.
- `GET /api/dashboard/agency` : mêmes règles d'occupation, d'encaissé et d'impayé.
  `finance.commission_month` = Σ `leases.commission_amount` des baux activés dans le mois.
  `members_count` = utilisateurs distincts portant un profil agent ou admin d'agence **actif** dans
  l'agence. Accès : `reports.view_agency` à l'agence, ou super-admin ; plus jamais un simple agent.
- `GET /api/dashboard/agent?scope=mine|agency` (défaut `mine`) : `scope` rendu. `finance.*` lit le grand
  livre filtré sur l'agent. `visits.upcoming_7d` compte `scheduled|confirmed` ; `visits.today` et
  `today_items` excluent `cancelled` et `no_show`.
- `GET /api/dashboard/me` et `GET /api/dashboard/tenant` : un hôte d'agence `individual` → rôle `owner`.
  Un compte sans autre rôle → rôle `tenant`, même sans ligne `Customer`, avec `visits_upcoming`. Les
  chiffres du client agrègent **toutes** ses lignes `Customer` et ignorent les `deposit_refund`.
- **Capacité nouvelle** `reports.view_agency` (« voir les chiffres consolidés de l'agence »),
  assignable à un rôle d'agence, donc portée par le rôle système `agency_admin` par construction
  (`SystemRoleCapabilities::agencyAdmin()` = `Capability::agencyAssignable()`), jamais par l'agent.
- `GET /api/admin/reports/revenue` : `mrr`, `arr`, `active_subscriptions` et `latest_*` excluent un
  abonnement en essai au point mesuré (`status = trialing`, ou `trial_ends_at` postérieur au point).
- `GET /api/admin/system/metrics` : `revenue.collected_total` (renommage sémantique de
  `platform_total_paid`, même règle que l'*Encaissé* des Contraintes ; l'ancienne clé est conservée
  une version, avec la même valeur corrigée), `revenue.gmv_30d`,
  `revenue.platform_fees_30d`, `revenue.take_rate`, `revenue.mrr`, `revenue.mrr_trialing`. `trend.*`
  est lu dans les instantanés.

**Nouveaux** (noms à confirmer par l'ADR) :
- `leases.agent_id` → FK `users`, nullable : le négociateur.
- Table `commission_entries` : agence, bail source, bénéficiaire, origine (`negotiator` | `collaborator`),
  base, part (%), montant `decimal(14,2)`, devise, statut `due | paid | cancelled`, `earned_at`,
  `paid_at`, `paid_by_id`, `metadata`.
- Routes :
  - `GET /api/commissions` (query builder : `filter[beneficiary_id]`, `filter[status]`,
    `filter[earned_between]`, `fields[commission_entries]`, `include=lease,beneficiary`) ;
  - `POST /api/commissions/{commissionEntry}/mark-paid` et `POST /api/commissions/{commissionEntry}/cancel` ;
  - `GET /api/agencies/{agency}/team-performance?period=YYYY-MM` ;
  - `GET /api/agencies/{agency}/finance/aging?group_by=tenant|landlord`.
- Exports `GET /api/export/{entity}` : nouveaux types `payouts`, `invoices`, `commissions`, `aging`,
  `deposits`.
- Table `platform_metrics_daily` : une ligne par jour, unique sur `date`.

## Direction UX / Artistique

- **Hôte et bailleur** : une seule vue, la sienne. Chaque nombre est une porte : impayés vers les échéances
  concernées, devis à valider vers la maintenance filtrée, visites à confirmer, avis sans réponse,
  versements ouverts en lecture seule. On ne rend pas un texte « Voir le module » à la place d'un chiffre.
- **Agent** : « Mes chiffres » par défaut. La bascule « Agence » n'apparaît que si l'agent a le droit de
  voir l'agence. La commission affichée est la sienne, avec son détail par bail.
- **Admin d'agence** : la performance d'équipe est un onglet de l'équipe, en tableau comparatif sobre (une
  ligne par agent, tri par colonne). La balance âgée prend la place de la liste plate des impayés : quatre
  tranches lisibles d'un coup d'œil, puis le détail regroupé par locataire ou par bailleur. Les cautions
  détenues figurent à côté.
- **Client** : un accueil « ce qui m'attend » (prochaine visite, réservation, échéance, demande
  d'intervention). Sans aucun dossier, il reçoit une invitation à chercher dans sa ville, jamais un état
  vide générique.
- **Super-admin** : le libellé dit ce que le chiffre mesure (« Flux encaissé », pas « Revenu »). Une
  tendance n'est montrée que si un instantané la mesure.
- Montants en XOF, chiffres tabulaires, mobile d'abord ; libellés dans les trois langues.

## Contraintes strictes (métier)

- **Un chiffre ne se reconstruit pas depuis un statut courant.** L'occupation d'un mois passé se lit
  dans les dates des baux et des réservations, jamais dans `status=active` d'aujourd'hui.
- **Règles de calcul** (l'ADR peut les amender ; les AC suivent l'ADR) :
  - *Biens éligibles longue durée* : biens du bailleur, **feuilles** (sans enfant), `contract_type=rent`,
    `rent_period` ∈ {monthly, yearly}, hors `draft/archived/pending_review/rejected/sold`, créés avant la
    fin du mois mesuré. En *courte durée*, même chose avec `rent_period` ∈ {daily, weekly}.
  - *Occupation longue durée d'un mois* = jours-biens couverts par un bail hors `draft` et
    `pending_signature` ÷ (biens éligibles × jours du mois). Fin effective d'un bail = la plus tôt entre
    `end_date` et `terminated_at`. Les jours d'un même bien ne sont comptés qu'une fois.
  - *Occupation courte durée* = nuitées des réservations `confirmed|completed` (`end_date` exclue) ÷
    (biens éligibles × jours du mois).
  - *Encaissé* = `LeasePayment` payés de type `rent|charges|regularization|penalty` + `BookingPayment`
    `paid` (montant − `refund_amount`). Jamais `deposit` ni `deposit_refund`.
  - *Impayé* = `LeasePayment` `pending|late` échus, **hors** `deposit_refund`, quel que soit le statut
    `late` ou non (un bail sans pénalité ne passe jamais `late`).
  - *Échéance du client* (`next_due`, `upcoming_30d`, impayés) : mêmes types que l'*Impayé*, sur
    toutes les lignes `Customer` du compte ; jamais un `deposit_refund`. `next_due` est la plus proche
    échéance **non échue** (`due_date` ≥ aujourd'hui) ; une échéance passée relève des impayés.
  - *Net reversé* = Σ `payouts.net_amount` `completed`, par `processed_at`, **`payee_role = landlord`**
    (TCK-594). Une caution rendue au locataire n'est jamais un versement au bailleur.
  - *Cautions détenues* = Σ `deposit` payés − Σ `deposit_refund` payés.
- **Montants décimaux en base**, arrondis à 2 décimales à la sortie (principe n° 3). Aucune conversion ×100.
- **Commissions** :
  - générées une seule fois par bail, à l'activation, par un écouteur de `LeaseActivated` (événement
    existant, `ShouldDispatchAfterCommit`), idempotent par unicité `(lease_id, beneficiary_id)`. On
    n'insère pas « au cas où » pour attraper l'exception (piège PostgreSQL n° 1) : `insertOrIgnore` ;
  - **option retenue par défaut** : un renouvellement (`LeaseRenewalService`, qui n'émet pas
    `LeaseActivated`) ne crée **aucune** ligne ; il recopie seulement `agent_id`. Une résiliation
    laisse les lignes `due` ; l'admin peut les annuler ;
  - aucun rattrapage des baux existants, qui n'ont ni `commission_amount` ni négociateur : inventer
    l'un ou l'autre serait faux ;
  - le grand livre est **interne à l'agence**, et un agent ne lit que ses lignes.
- **Autorisations** (les nouveaux endpoints en sont les premiers lecteurs) :
  - **`reports.view_agency`** à l'agence (option retenue par défaut, voir § 0) pour
    `GET /api/dashboard/agency`, `team-performance`, `aging` et `scope=agency`. **Jamais
    `reports.view_global`** : réservée à la plateforme (`Capability::platformReserved()`), aucun admin
    d'agence ne peut la porter. Le super-admin passe par sa branche plateforme ;
  - `payouts.approve` pour `mark-paid` et `cancel` ;
  - `reports.export` pour les nouveaux types d'export.
  - Une agence `individual` reçoit **403** sur `team-performance` (§1.12, pas de reporting
    cross-équipe). Une autre agence reçoit **403** partout.
  - Les agences existantes reçoivent la capacité nouvelle par `membership:reconcile-system-roles`
    (déjà joué par `docker/release.sh`, TCK-528) ; un rôle personnalisé ne la reçoit pas d'office.
- **Le négociateur** (`agent_id`) est un **personnel actif** de l'agence du bail (agent ou admin d'agence,
  jamais bailleur ni client). Il vaut par défaut le créateur du bail s'il est personnel, sinon `null`. Le
  prédicat est celui de TCK-587 ; avant sa fusion, on écrit `isAgentAt || isAgencyAdminAt` avec un
  commentaire `TCK-587`.
- **Plafond de requêtes** : chaque endpoint de tableau de bord touché par ce ticket a un nombre de
  requêtes **indépendant** du nombre de mois, de biens, de baux et d'agents. Le test le mesure par
  `DB::enableQueryLog()` / `DB::getQueryLog()`. Pas de cache : un tableau de bord en cache ment après un
  paiement, et la réduction des requêtes suffit.
- **Instantanés plateforme** : une valeur de stock (agences actives, annonces publiées…) ne s'invente pas
  pour une date passée. Un rattrapage ne remplit que les flux (GMV, frais), datés par `paid_at`.
- **Coordination vague 73** :
  - **TCK-587** possède l'autorisation et la clause `where` de `PropertyController::index`,
    `LeaseService::create` (autorisation), le contrôle de capacité en tête d'`ExportController` et
    `ExportDataService::scopeToActor`. Ce ticket n'ajoute que l'eager-loading, la valeur par défaut de
    `agent_id` dans `LeaseService::create`, les noms dans la liste d'`ExportController` et des méthodes
    de jeu de données qui scopent elles-mêmes à l'agence.
  - **TCK-586** retire la branche courtier de `PropertyResource::actsAsAgent` (l.268-285). Le calcul par
    lot de ce ticket vient par-dessus.
  - **TCK-586 §5** possède la règle d'éligibilité des collaborateurs (`CollaboratorEligibleForProperty`).
    Le grand livre en applique le prédicat `agent` à l'activation sans le recopier ni le modifier ; avant
    la fusion de 586, `isAgentAt || isAgencyAdminAt` avec un commentaire `TCK-586`. Ce ticket ne lit
    **pas** `accepted_at` (contrairement à ce qu'écrit encore la coordination de TCK-586).
  - **TCK-598** possède le bloc `collaborators` et `buildUserLite` de `PropertyResource`. Ce ticket n'y
    change que la source des données préchargées.
  - **TCK-596** transforme l'activation en signature OTP. Ce ticket ne touche pas `LeaseController` et
    s'abonne à `LeaseActivated`, que 596 doit continuer d'émettre.
  - **TCK-590** définit le statut d'une visite « demandée », que `visits.to_confirm` compte (à défaut :
    `scheduled` et à venir).
  - **TCK-592** (statuts de maintenance), **TCK-597** (avis) et **TCK-594** (`Payout`, dont le calcul du
    reversement) : ce ticket les lit et ne les modifie pas.
  - **TCK-594** crée `payouts.payee_role` (`landlord` | `tenant` | `service_provider`) et
    `filter[payee_role]`. Le *Net reversé* et la carte « Prochains versements » les lisent : **fusion
    de 594 d'abord** pour ces deux blocs, livrés dans la PR (c) ou après. **Pas de garde tolérante**
    (`Schema::hasColumn`, repli sans filtre) : elle rendrait, tant que la colonne manque, exactement le
    chiffre faux que ce ticket corrige, sans que rien ne le signale. Si 594 n'est pas fusionné, ces deux
    blocs attendent ; le reste du ticket n'en dépend pas.
  - **TCK-596** prend `LeaseRenewalService` pour son bloc d'échéancier ; ce ticket n'y ajoute que la
    ligne `agent_id` du tableau de création de l'enfant. Ordre de fusion indifférent.
  - **TCK-587** possède `SystemRoleCapabilities`, `CapabilityMatrix.tsx` et la garde « capacité sans
    lecteur ». Ce ticket ajoute un cas à `Capability` (une ligne, bloc `reports.*`) et sa clé de
    libellé ; il n'édite pas `SystemRoleCapabilities` (l'admin la reçoit par `agencyAssignable()`).
    Les endpoints de ce ticket sont les lecteurs de `reports.view_agency`. Ordre de fusion indifférent.
  - **TCK-588** possède les relances de loyer : la balance âgée ne relance pas.
  - **TCK-347** possède le formatage selon la locale **hors** des quatre pages
    `app/overview/{agency,agent,owner,tenant}/page.tsx`, que ce ticket réécrit (§ 7 du Contexte, § 10 du
    Delta). Ces quatre pages sont à nous, y compris `agent/page.tsx:267,272` (`'fr-SN'`), qui figurent
    dans l'inventaire de 347 : si 595 fusionne d'abord, 347 les trouve déjà propres ; si 347 fusionne
    d'abord, il ne reste ici que les `'fr'` courts. Ordre de fusion indifférent.
  - Clés i18n : ajout seulement, blocs `dashboard.*`, `team.performance.*`, `admin.finances.aging.*`,
    `commissions.*`.
- **ADR requis** avant le code (voir Delta § 0).

## Delta à produire

### 0. Décisions
- [ ] **ADR-00NN (prochain numéro libre) « Attribution des transactions et grand livre des commissions »**,
      écrit et accepté avant le code. Il tranche :
  - où vit le négociateur : `leases.agent_id` → `users` ;
  - comment naît `commission_amount`. **Option retenue par défaut** : saisi explicitement, et dérivé
    `sale_price × commission_rate / 100` pour une vente sans montant ; aucune dérivation pour une
    location, dont le `commission_rate` reste le taux de gestion lu par les reversements (TCK-594) ;
  - la règle de ventilation (**option retenue par défaut**, sauf le premier point, tranché) :
    - **Tranché par la session le 2026-10-06** : chaque collaborateur `role=agent` **éligible au sens
      de TCK-586 §5** reçoit `commission_share` %. Éligible = son `user_id` est, **au moment de
      l'activation**, personnel de l'agence du bien, profil non supprimé
      (`isAgentAt || isAgencyAdminAt`, prédicat de TCK-587, celui qu'applique
      `CollaboratorEligibleForProperty`). `accepted_at` n'est **pas** lu : rien ne l'écrit
      (Contexte § 2), et ce ticket n'ajoute aucun parcours d'acceptation ;
    - le négociateur reçoit `AgentProfile.commission_rate` %, plafonné à `100 − Σ parts` et sans double
      ligne s'il est aussi collaborateur ;
    - le reliquat reste à l'agence, sans ligne ;
  - le sort d'une commission quand le bail est résilié. **Option retenue par défaut** : la ligne reste
    `due`, et l'admin peut l'annuler ;
  - le renouvellement. **Option retenue par défaut** : aucune ligne, `agent_id` recopié ;
  - la capacité qui ouvre les chiffres consolidés d'une agence. **Option retenue par défaut** : un cas
    neuf `reports.view_agency`, assignable à un rôle d'agence ; `reports.view_global` reste à la
    plateforme.
- [ ] Livraison en trois PR, dans cet ordre (**option retenue par défaut**, un seul ticket) : (a) § 1,
      § 3 hors commissions, § 4, § 5, § 5 bis ; (b) ADR commissions, § 2, § 3 commissions, § 6 ;
      (c) § 7, § 8, et les deux blocs `payee_role` du § 1 (après la fusion de TCK-594).
- [ ] **ADR-00NN+1 « Instantanés quotidiens des métriques plateforme »** : table, heure du job, ce qui se
      rattrape (les flux) et ce qui ne se rattrape pas (les stocks).

### 1. Bailleur, hôte et agence
- [ ] `DashboardOwnerService` réécrit sur les règles ci-dessus : occupation par jours-biens et nuitées en
      une requête groupée par mois (`generate_series` + `GREATEST/LEAST`), encaissé par une requête
      groupée `date_trunc('month', paid_at)` par table de paiement, jointure sur `leases.landlord_id` au
      lieu de `whereHas`.
- [ ] Nouvelles clés du résumé (Contrat de données), dont `maintenance.quotes_pending`
      (`quote_submitted` sur ses biens), `visits.to_confirm` et `reviews.unanswered` (avis approuvés sans
      `reply_content`).
- [ ] `DashboardAgencyService` passe par les mêmes calculs, factorisés dans un service partagé
      `App\Services\Dashboard\PortfolioMetrics`.
- [ ] `DashboardRoleResolver` : un admin d'agence `individual` → `OwnerMeMetrics`.
- [ ] Front : `/app/overview` envoie l'agence `individual` vers la vue bailleur. Les cartes deviennent
      actionnables. Le tableau de bord et les versements se chargent en parallèle.
- [ ] *(après TCK-594)* `DashboardOwnerService` et `DashboardAgencyService` : *Net reversé* filtré
      `payee_role = landlord`. Front : la carte « Prochains versements » ne montre que les versements
      au bailleur (`payee_role = landlord`) encore à venir (`pending`, `scheduled`, `processing`).

### 2. Commissions
- [ ] Migration `add_agent_id_to_leases_table` : FK `leases_agent_id_fk`, index
      `leases_agent_id_signed_at_idx (agent_id, signed_at)`.
- [ ] `StoreLeaseRequest` / `UpdateLeaseRequest` : `agent_id` (personnel actif de l'agence du bien) et
      `commission_amount` (`numeric|min:0`). `LeaseService::create` pose les valeurs par défaut (§ ADR).
      `LeaseRenewalService` recopie `agent_id` sur l'enfant.
- [ ] Migration `create_commission_entries_table` : unique `commission_entries_lease_benef_uq`, index
      `commission_entries_agency_benef_idx (agency_id, beneficiary_id, earned_at)`. Modèle
      `CommissionEntry`, enum `CommissionEntryStatus`, factory.
- [ ] Service `App\Services\Commission\CommissionLedgerService::generateFor(Lease)` + écouteur
      `App\Listeners\Lease\GenerateCommissionEntries` sur `LeaseActivated`. Les collaborateurs servis
      sont `role = agent` dont le `user_id` passe le prédicat d'éligibilité de TCK-586 §5 à l'agence
      du bien, évalué à l'activation ; **aucune clause sur `accepted_at`** (ni `whereNotNull`, ni
      repli sur `invited_at`).
- [ ] `CommissionEntryController` (`index`, `markPaid`, `cancel`), `CommissionEntryPolicy`,
      `CommissionEntryResource`, `routes/api/commissions.php`. Chaque geste d'écriture est journalisé
      (`activity()`).
- [ ] `DashboardAgentService`, `DashboardAgencyService` et `AgencyStatsController` lisent les commissions
      dans `commission_entries` (agent : ses lignes ; agence : Σ `leases.commission_amount` des baux
      activés).
- [ ] Front : relevé des commissions pour l'agent (les siennes) et pour l'admin (toutes, avec « marquer
      payée » et « annuler »).

### 3. Vue agent
- [ ] `DashboardAgentService::summary(User, scope)` :
  - `mine` = biens dont il est `user_id` ou collaborateur `agent|manager` (sans condition
    d'`accepted_at`, jamais écrit — Contexte § 2) ; réservations en
    attente sur ces seuls biens ; clients `added_by_id` = lui (ou le champ d'assignation de TCK-591
    s'il existe à la fusion) ; baux à signer dont il est `agent_id` ;
  - `agency` = le calcul actuel, sous `reports.view_agency`.
- [ ] Visites : `upcoming_7d` compte `scheduled|confirmed` ; `today` et `today_items` excluent
      `cancelled` et `no_show`.
- [ ] `monthlyTimeseries` en une requête groupée par mois sur le grand livre et sur `leases.signed_at`.
- [ ] Front : « Mes chiffres » / « Agence » ; libellés honnêtes.

### 4. Liste des biens (A14)
- [ ] `PropertyController::index` : eager-loading de `media`, `agency`, `owner.media`, et des profils
      agent nécessaires à `actsAsAgent`. **Seulement l'eager-loading** : la clause `where` appartient à
      TCK-587.
- [ ] `PropertyResource::actsAsAgent` lit des profils préchargés au lieu d'une requête par ligne. Ce
      calcul par lot vient par-dessus le retrait de la branche courtier (TCK-586).

### 5. Accueil client (C14)
- [ ] `DashboardTenantService` agrège sur **toutes** les lignes `Customer` de l'utilisateur
      (`whereIn('tenant_id' | 'payer_id' | 'customer_id', $customerIds)`), et exclut
      `payment_type = deposit_refund` de `next_due`, `upcoming_30d` et des impayés. Sans aucune
      ligne, il rend des zéros et `has_customer_profile:false` au lieu de court-circuiter. Nouvelles clés
      `visits.upcoming` (5 prochaines, `customer.user_id` = moi) et `maintenance.open` (déjà calculée).
- [ ] `DashboardRoleResolver` : un compte sans autre rôle → `TenantMeMetrics`, jamais `null`.
- [ ] Front : accueil « ce qui m'attend » (§ Direction UX). La rangée « biens à {ville} pour
      {louer|acheter} » consomme la recherche publique existante, filtrée par `city` / `search_intent`.

### 5 bis. Accès et effectif du tableau de bord d'agence (passe de correction)
- [ ] `Capability::ReportsViewAgency = 'reports.view_agency'` (bloc `reports.*`), absent de
      `platformReserved()`. Libellé de la capacité dans les trois langues (bloc de clés du ticket).
- [ ] `DashboardAgencyController::show` : l'accès exige le super-admin ou
      `canActAt(Capability::ReportsViewAgency, $agency)` ; la branche `isAgentAt` (l.42) disparaît, et
      `primary_admin_id` ne suffit plus seul (l'admin principal porte la capacité par son rôle).
      `AgencyStatsController::show` prend la même garde.
- [ ] `DashboardAgencyService::summary` et `AgencyStatsController` : `members_count` = utilisateurs
      distincts ayant un profil agent **ou** admin d'agence **actif** dans l'agence, jamais un bailleur.
- [ ] Test `tests/Feature/Dashboard/DashboardAgencyAccessTest.php`.

### 6. Performance d'équipe (AD16)
- [ ] `TeamPerformanceController@show` + `TeamPerformanceService` + `ShowTeamPerformanceRequest`
      (`period` = `Y-m`, défaut le mois courant), route `agencies/{agency}/team-performance`. Une ligne
      par agent actif de l'agence :
  - `leases_signed` et `sales_signed` (`agent_id`, `signed_at` dans la période, hors `draft` et
    `pending_signature`) ;
  - `visits_completed` (`property_visits.agent_id`, `completed`, `scheduled_at` dans la période) ;
  - `customers_added` (`added_by_id`) ;
  - `commissions_earned` (Σ du grand livre, `earned_at` dans la période) ;
  - `properties_managed` et `tasks_overdue` (à date).
- [ ] Front : onglet « Performance » sous `/admin/team` (agences `standard`).

### 7. Reporting financier (AD17)
- [ ] `AgingBalanceController@show` + `AgingBalanceService` : tranches 1-30 / 31-60 / 61-90 / > 90 jours
      de retard (montant et nombre), `group_by=tenant|landlord`, total des cautions détenues (global et
      par bailleur).
- [ ] `ExportDataService` : méthodes `payouts`, `invoices`, `commissions`, `aging` et `deposits`, chacune
      scopée à l'agence de l'acteur, plus leur branche dans `collect()`. `ExportController` : ajout des
      cinq noms à la liste.
- [ ] `AgingBalanceService` applique la règle *Impayé* : un loyer `pending` échu y figure, qu'il soit
      passé `late` ou non.
- [ ] Front : la balance âgée remplace la liste plate de l'onglet Impayés de `/admin/finances`, qui ne
      lit plus `filter[status]=late`. Accès aux nouveaux exports.

### 8. Métriques plateforme (S17)
- [ ] Migration `create_platform_metrics_daily_table` (unique `platform_metrics_daily_date_uq`). Modèle
      `PlatformMetricDaily`.
- [ ] Job `App\Jobs\Reporting\SnapshotPlatformMetricsJob`, planifié `dailyAt('00:30')->withoutOverlapping()`
      dans `routes/console.php`. Commande `metrics:snapshot {--date=}` pour un jour donné (flux seulement
      pour le passé).
- [ ] `SystemMetricsController` : nouvelles clés, `trend` lu dans l'instantané J-30 (absent → pas de
      clé). `collected_total` (et `platform_total_paid` pendant sa version de transition) suit la règle
      *Encaissé* : jamais `deposit` ni `deposit_refund`.
- [ ] `PlatformReportingService::revenueSnapshotAt` sort du MRR, de l'ARR et du compte tout abonnement
      `trialing` **ou** dont `trial_ends_at` est postérieur au point mesuré, et rend le MRR d'essai à
      part. `past_due` reste dans le MRR jusqu'à la résiliation (**option retenue par défaut**). Le
      docblock « override-aware » est corrigé.
- [ ] Front : la tuile « Revenu plateforme » devient « Flux encaissé », avec des tuiles GMV, take rate,
      MRR et essais.

### 9. Tests (noms prescrits)
- [ ] `tests/Feature/Dashboard/DashboardOwnerMetricsTest.php`, `DashboardOwnerQueryBudgetTest.php`,
      `DashboardAgentScopeTest.php`, `DashboardMeRoutingTest.php`, `DashboardTenantSeekerTest.php`
- [ ] `tests/Feature/Commission/CommissionLedgerTest.php`, `CommissionEntryApiTest.php`
- [ ] `tests/Feature/Api/PropertyIndexQueryBudgetTest.php`
- [ ] `tests/Feature/Agency/TeamPerformanceTest.php`, `AgingBalanceTest.php`,
      `tests/Feature/Api/ExportReportingTypesTest.php`
- [ ] `tests/Feature/Admin/PlatformMetricsSnapshotTest.php`, `tests/Feature/Admin/PlatformRevenueMrrTest.php`
- [ ] `tests/Feature/Dashboard/DashboardAgentVisitsTest.php`, `DashboardTenantDepositRefundTest.php`
- [ ] Les tests existants qui posent `commission_amount` à la main sont réécrits pour passer par
      l'activation.

### 10. Locale des vues d'ensemble (consolidation)
- [ ] Front : les quatre pages `app/overview/{agency,agent,owner,tenant}/page.tsx` formatent montants,
      nombres, pourcentages et dates dans la **langue active de la requête** (celle que `getTranslations`
      sert déjà, lue côté serveur par next-intl), et non plus `'fr'` ni `'fr-SN'` écrits en dur ;
      `const LOCALE` (`agent/page.tsx:24`) et les deux `Intl.DateTimeFormat('fr-SN', …)` (`:267,272`)
      disparaissent au profit des helpers de `@/lib/format`. Le fuseau reste `Africa/Dakar`.
- [ ] Les écrans neufs de ce ticket (relevé des commissions, performance d'équipe, balance âgée,
      tuiles plateforme) suivent la même règle dès leur écriture.
- [ ] Test `takussan-web/src/app/(dashboard)/app/overview/__tests__/locale.tck-595.test.tsx`.

## Critères d'acceptation

Jeu de référence **R**, avec `Carbon::setTestNow('2026-07-15')`. Le bailleur B y possède :
- un immeuble parent P (location), avec deux lots feuilles L1 et L2 (mensuels) ;
- un lot L3 (mensuel) et un bien H (courte durée, `daily`) ;
- un bien S en vente et un brouillon D.

Tous ces biens sont créés le 2025-12-01. Les baux et réservations :

| Objet | Statut | Dates |
|---|---|---|
| Bail sur L1 | `expired` | 2026-01-01 → 2026-06-30 |
| Bail sur L2 | `active` | depuis le 2026-03-15, sans fin |
| Bail sur L3 | `terminated` | 2026-01-01 → 2026-12-31, `terminated_at` 2026-04-10 |
| Bail sur L3 | `draft` | dès le 2026-05-01 |
| Réservation sur H | `confirmed` | 2026-07-01 → 2026-07-06 |
| Réservation sur H | `cancelled` | 2026-07-10 → 2026-07-20 |

Paiements de juillet :
- loyer L2 de 150 000, payé ;
- dépôt de garantie de 300 000, payé ;
- restitution de caution de 100 000, payée ;
- restitution de caution de 40 000, `pending`, échue le 2026-07-01 ;
- loyer de 50 000, `pending`, échu le 2026-07-05 ;
- réservation sur H : `BookingPayment` de 80 000 payé, `refund_amount` 20 000 ;
- un `Payout` `completed` net de 135 000, traité le 2026-07-10.

- [ ] **AC1 — Occupation par chevauchement de dates.** Sur R,
      `GET /api/dashboard/owner?include=timeseries&months=7` rend `timeseries.occupancy` =
      `[66.67, 66.67, 84.95, 77.78, 66.67, 66.67, 33.33]` (janvier → juillet). Un `assertCount` seul ne
      suffit pas : le test compare le tableau entier. Sur le code actuel, janvier vaut 0. Un second bail
      `active` ajouté sur L2 du 2026-07-01 au 2026-07-31 laisse juillet à `33.33` : le code actuel compte
      deux baux, et un calcul en jours-biens sans dédoublonnage par bien rendrait `66.67` (ablation).
- [ ] **AC2 — Dénominateur.** Toujours sur R, `occupancy.rate_percent` = `33.33` (1 bien occupé sur
      L1, L2, L3). Ajouter un 4ᵉ bien en vente, un brouillon ou un parent ne change pas la valeur.
      Ajouter un 4ᵉ lot feuille mensuel la fait passer à `25.0`.
- [ ] **AC3 — Courte durée.** Toujours sur R, `occupancy.short_stay_percent` = `16.13` (5 nuitées / 31).
      La réservation annulée n'y entre pas.
- [ ] **AC4 — Encaissé, impayés, net.** Sur R :
  - `finance.cashflow_month` = `210000.0` (150 000 + 80 000 − 20 000) ;
  - `finance.booking_income_month` = `60000.0` ;
  - `finance.net_paid_out_month` = `135000.0` ;
  - `finance.deposits_held` = `200000.0` ;
  - `finance.overdue_count` = `1` et `finance.overdue_amount` = `50000.0` : la restitution échue n'est
    pas un impayé.
  - *(après TCK-594)* deux `Payout` `completed` de plus, traités le 2026-07-12, tous deux avec
    `landlord_id` = B : 100 000 né de la restitution de caution (`payee_role = tenant`) et 60 000 à un
    prestataire (`payee_role = service_provider`). `net_paid_out_month` reste `135000.0` ; sans le
    filtre, il vaudrait `295000.0` (ablation).
- [ ] **AC4 bis — Prochains versements.** Test de la vue bailleur : la requête des versements porte
      `filter[payee_role]=landlord` et `filter[status]=pending,scheduled,processing`. Rouge sur le code
      actuel (`status: 'pending'` seul, aucun `payee_role`).
- [ ] **AC5 — Même règle pour l'agence.** R placé dans une agence `standard` sans autre bien :
      `GET /api/dashboard/agency` rend les mêmes valeurs qu'AC2 et AC4 pour l'occupation, l'encaissé et
      les impayés (`overdue_count` = 1, `overdue_amount` = `50000.0`), et `unpaid_rate_percent` se
      calcule sur ces 50 000.
- [ ] **AC6 — Budget de requêtes, bailleur.** Le nombre de requêtes de `GET /api/dashboard/owner?include=timeseries`
      est **identique** pour `months=1` et `months=36`, et pour 1 bail comme pour 20. Le test inscrit le
      plafond à la valeur mesurée à l'implémentation, qui reste strictement inférieure à 34. Même
      exigence, même forme, pour `/dashboard/agent` et `/dashboard/agency`.
- [ ] **AC7 — Aiguillage de l'hôte.** Pour un admin d'agence `individual`, `GET /api/dashboard/me` rend
      `role: "owner"`. Le test front de l'aiguillage `/app/overview` vérifie la redirection vers
      `/app/overview/owner`, et reste `agency` pour une agence `standard`.
- [ ] **AC8 — Cartes actionnables.** Avec 2 interventions `quote_submitted`, 1 visite à confirmer et
      1 avis approuvé sans réponse sur les biens de B (et autant sur ceux d'un autre bailleur), le résumé
      rend `maintenance.quotes_pending: 2`, `visits.to_confirm: 1`, `reviews.unanswered: 1`. Le texte fixe
      `seeModule` n'est plus rendu.
- [ ] **AC9 — Commission à l'activation.** Un bail porte `commission_amount` = 300 000 et le négociateur
      A, dont `AgentProfile.commission_rate` = 30. Les collaborateurs du bien sont **tous créés par la
      route réelle** `POST /api/properties/{property}/collaborators`, jamais par factory ni `forceFill` :
  - B, agent actif de l'agence du bien, `role=agent`, `commission_share` 20 ;
  - C, agent de l'agence au moment de l'ajout, `role=agent`, `commission_share` 10, dont le profil
    agent est ensuite supprimé (retrait de l'agence, `deleted_at` posé), avant l'activation du bail.

  Le test assère d'abord que les lignes de B et de C ont `accepted_at` = `null` (c'est ce que la route
  écrit). Le bail est créé par `POST /api/leases` avec `commission_amount: 300000` et `agent_id` = A, et
  la réponse rend `commission_amount` = `300000.0` (le code actuel l'écarte à la validation et rend
  `null`). Après activation, `commission_entries` contient exactement 2 lignes : A 90 000 et **B 60 000**,
  toutes deux `due`, et aucune pour C. Ablations : une règle qui exige `accepted_at` rend B absent (1 ligne,
  rouge) ; une règle qui ignore l'éligibilité rend une ligne C de 30 000 (rouge). Une seconde émission de
  `LeaseActivated` ne crée aucune ligne de plus. La résiliation du bail laisse les deux lignes `due`. Son
  renouvellement ne crée aucune ligne, et l'enfant porte `agent_id` = A.
- [ ] **AC9 bis — La tuile d'agence n'est plus nulle.** Sur le jeu d'AC9, bail signé dans le mois :
      `GET /api/dashboard/agency` rend `finance.commission_month` = `300000.0`. Sur le code actuel, un
      bail créé par l'API rend `0.0`.
- [ ] **AC10 — Plafond de ventilation.** Les collaborateurs éligibles (créés par la route, `accepted_at`
      nul) totalisent 80 % et le taux de A
      est 30 : la ligne de A vaut 20 % de la base, et Σ des lignes ≤ `commission_amount`.
- [ ] **AC11 — Vente sans montant.** Un bail `type=sale`, `sale_price` 50 000 000, `commission_rate` 3,
      sans `commission_amount` : il est créé avec `commission_amount` = `1500000.00`.
- [ ] **AC12 — Vue agent personnelle.** Sur le jeu d'AC9, plus un bail d'un autre agent de la même agence
      signé dans le mois (commission 500 000) :
  - `GET /api/dashboard/agent` pour A → `finance.commissions_month` = `90000.0` et `scope: "mine"` ;
  - pour B → `60000.0` ;
  - l'agence compte 5 biens, dont 2 dont A est `user_id` et 1 où il est collaborateur `agent` (ajouté par
    la route, `accepted_at` nul),
    1 réservation `pending` sur un bien de A et 2 sur d'autres biens, et 3 baux `pending_signature`
    dont 1 avec `agent_id` = A : pour A, `properties_managed` = 3, `bookings.pending` = 1,
    `pipeline_ops.leases_to_sign` = 1 (le code actuel rend 5, 3 et 3) ;
  - `scope=agency` → **403** pour un agent (sans `reports.view_agency`), **200** pour l'admin d'agence
    du rôle système. Le 403 rougit quand on retire la garde (ablation).
- [ ] **AC12 bis — Visites de l'agent.** `setTestNow('2026-07-15 09:00')`. A a, entre le 16 et le
      21 juillet, 1 visite `scheduled`, 2 `confirmed` et 1 `cancelled` ; le 15 à 18 h, 1 `confirmed`
      et 1 `cancelled`. `visits.upcoming_7d` = 4, `visits.today` = 1, et `today_items` ne contient pas
      la visite annulée. Le code actuel rend `upcoming_7d` = 1 et `today` = 2.
- [ ] **AC13 — Grand livre cloisonné.** `GET /api/commissions` rend à A ses seules lignes. Il rend à
      l'admin toutes les lignes de son agence, et aucune d'une autre agence. `mark-paid` par A → **403**.
      Par l'admin (`payouts.approve`), il rend 200, statut `paid`, `paid_by_id` posé et une entrée
      d'activité. Sur une ligne d'une autre agence → **403**. Les deux refus rougissent quand on retire la
      policy (ablation).
- [ ] **AC14 — Négociateur valide.** Créer un bail avec un `agent_id` bailleur, client ou d'une autre
      agence → **422**.
- [ ] **AC15 — Liste des biens sans N+1.** `GET /api/properties?per_page=20` fait **le même nombre** de
      requêtes avec 2 biens et avec 20, chacun avec photo, propriétaire avec avatar et agence. Le test
      rougit quand on retire l'eager-loading de `media`.
- [ ] **AC16 — Client sans dossier.** Un compte neuf sans ligne `Customer` reçoit `200` et `role: "tenant"`
      sur `GET /api/dashboard/me`, au lieu de 404. Avec une visite `scheduled` dans 2 jours sur son
      `Customer`, `visits.upcoming` la contient, et `maintenance.open` est affiché à l'écran.
- [ ] **AC16 bis — Client de deux agences, caution rendue.** Un compte rattaché à deux lignes
      `Customer` (agences X et Y) a un bail `active` dans chacune, un loyer de 100 000 `pending` échu
      le 2026-07-05 dans Y, un loyer de 120 000 `pending` dû le 2026-08-01 dans X, et une restitution de
      caution de 40 000 `pending` due le 2026-07-20 dans X. `GET /api/dashboard/tenant` rend
      `leases.active` = 2, `payments.overdue_count` = 1, `payments.overdue_amount` = `100000.0`,
      `payments.next_due.amount` = `120000.0`, et aucun élément de `upcoming_30d` n'a le montant
      40 000. Le code actuel, qui ne lit que la première ligne `Customer` (X), rend `leases.active` = 1,
      0 impayé et une prochaine échéance de 40 000.
- [ ] **AC17 — Performance d'équipe.** Dans une agence `standard`, sur juillet 2026 :
  - l'agent A a 2 baux signés en juillet et 1 en juin, 3 visites `completed` et 1 `cancelled` ;
  - l'agent B a 1 visite `completed`.

  `GET /api/agencies/{agency}/team-performance?period=2026-07` rend : A `leases_signed: 2`,
  `visits_completed: 3` ; B `leases_signed: 0`, `visits_completed: 1`. Le nombre de requêtes est identique
  avec 2 et 6 agents. Les refus :
  - agence `individual` → **403** ;
  - agent (sans `reports.view_agency`) → **403** ;
  - admin d'une autre agence → **403** ;
  - admin d'agence du rôle système → **200**, sans aucune capacité ajoutée à la main (preuve que la
    garde n'est pas `reports.view_global`).
- [ ] **AC17 bis — Le tableau de bord d'agence n'est plus ouvert aux agents.** Un agent de l'agence
      `standard`, profil actif dans l'agence, reçoit **403** sur `GET /api/dashboard/agency` et sur
      `GET /api/agencies/{agency}/stats` (le code actuel rend 200 au premier). L'admin d'agence du rôle
      système reçoit 200. Un rôle personnalisé auquel on ajoute `reports.view_agency` ouvre l'accès à
      son porteur. Le 403 rougit quand on retire la garde (ablation). Sur une agence comptant 1 admin,
      2 agents actifs, 1 agent dont le profil est inactif et 3 bailleurs, `members_count` = `3` (le
      code actuel rend 6).
- [ ] **AC18 — Balance âgée.** Au 2026-07-15, quatre loyers impayés échus de 10, 40, 75 et 120 jours
      (100 000 chacun), **au statut `pending`** sur des baux sans `late_fee_percent`, et une restitution
      de caution échue : `aging` rend une ligne de 1 × 100 000 dans chaque tranche, et ignore la
      restitution. `group_by=landlord` totalise par bailleur. `deposits_held` vaut la règle des
      Contraintes. Ablation : restreindre le service à `status = late` rend 0 dans les quatre tranches.
  - *(consolidation)* Sur ce même jeu, `GET /api/payments/history?filter[status]=late` — ce que lit
    l'onglet aujourd'hui — rend **0** ligne, quand la tuile « Impayés » de `GET /api/dashboard/agency`
    rend `overdue_count` = 4 et `overdue_amount` = `400000.0` : c'est l'écart que l'onglet corrige, le
    test le consigne.
  - Front : le test de l'onglet Impayés simule la réponse `aging` de ce jeu (lignes au statut
    `pending`) et vérifie que l'onglet affiche les quatre tranches à `100 000 F CFA` chacune et un total
    de `400 000 F CFA` (le même total que la tuile), que sa requête vise `/finance/aging` et ne porte
    plus `filter[status]=late`. Rouge sur le code actuel (`OverduePaymentsTable.tsx:43` épingle
    `status: 'late'` et n'affiche aucune tranche).
- [ ] **AC19 — Nouveaux exports.** `GET /api/export/payouts|invoices|commissions|aging|deposits?format=csv`
      rend un CSV limité à l'agence de l'acteur : une ligne d'une autre agence n'y figure jamais. Sans
      `reports.export`, la réponse est **403**.
- [ ] **AC20 — Instantané plateforme.** Le 2026-07-14 :
  - un loyer de 100 000 est payé avec 5 % de frais, et une réservation de 200 000 avec 10 % ;
  - deux abonnements actifs (10 000 et 25 000), un `trialing` (15 000) et un `past_due` (5 000).

  Le job du 2026-07-15 pour la veille écrit une ligne : `gmv_amount` 300 000, `platform_fees_amount`
  25 000, `mrr_amount` 40 000, `mrr_trialing_amount` 15 000. Une seconde exécution ne crée pas de
  doublon. `GET /api/admin/system/metrics` rend `revenue.take_rate` = `0.0833`. Sans instantané à J-30,
  `trend` n'a pas la clé correspondante.
- [ ] **AC20 bis — Flux encaissé et MRR sans les essais.** Sur le jeu d'AC20, plus un dépôt de garantie
      de 300 000 payé et une restitution de caution de 100 000 payée :
  - `GET /api/admin/system/metrics` rend `revenue.collected_total` = `300000.0` (loyer + réservation)
    et `revenue.platform_total_paid` la même valeur ; le code actuel rend `500000.0` (loyers, dépôt et
    restitution, sans la réservation) ;
  - `GET /api/admin/reports/revenue?period=3m&granularity=month` rend `totals.latest_mrr` = `40000.0`
    et `totals.latest_active_subscriptions` = 3 (le code actuel : `55000.0` et 4) ;
  - dans un jeu séparé, un seul abonnement, aujourd'hui `active` à 10 000, `current_period_start`
    2026-04-20 et `trial_ends_at` 2026-06-20 : la ligne `rows` de mai a `mrr` = `0.0`, celle de juin
    `10000.0` (le code actuel rend `10000.0` aux deux).
- [ ] **AC20 ter — Les vues d'ensemble suivent la langue.** Le test `locale.tck-595.test.tsx` rend la
      page bailleur avec une réponse `GET /api/dashboard/owner` simulée (`finance.cashflow_month` =
      `150000`, `period.start` = `2026-07-01`) et la locale de requête simulée :
  - en `en`, le texte rendu contient `150,000 F CFA` et `1 Jul 2026`, et ne contient pas
    `150 000 F CFA` ni `juil.` ;
  - en `fr`, il contient `150 000 F CFA` (espace fine insécable U+202F) et `1 juil. 2026` — rendu
    français inchangé, caractère pour caractère ;
  - même paire d'assertions sur la tuile « Commissions » de la vue agent (`finance.commissions_month`
    = `150000`), et un horaire de visite à `2026-07-15T18:00:00Z` rendu `18:00` dans les deux langues
    (fuseau `Africa/Dakar`).

  Rouge sur le code actuel : en `en`, la page rend `150 000 F CFA`. Ablation : remettre `'fr'` dans un
  seul appel de `formatCurrency` rougit le cas `en`. En complément, une assertion sur la SOURCE des
  quatre pages refuse tout `'fr'` ou `'fr-SN'` passé comme argument de locale — elle seule ne suffirait
  pas : un helper qui ignorerait son argument la passerait aussi.
- [ ] **AC21 — Pas de régression silencieuse.** `php artisan test` vert. Pint, `npm run lint`,
      `npx tsc --noEmit` et `npm run test` propres. Les libellés nouveaux existent en `fr`, `en` et `wo`.

## Hors périmètre

- **Objectifs mensuels par agent** (jauge, cibles) : fonctionnalité absente de la spec. **Option
  retenue par défaut** : P3, ticket séparé une fois la performance d'équipe livrée.
- `GET /api/dashboard/stats` (`DashboardController::stats`) : mêmes défauts de portée (l'agent y lit
  les baux actifs de toute l'agence, l.111), mais **aucun écran ne l'appelle** (`grep dashboard/stats`
  sur le front → 0). Ce n'est pas un chiffre affiché ; sa suppression est une amélioration.
- **Journal comptable SYSCOHADA** (plan de comptes, FEC) : il demande un plan de correspondance des
  comptes validé par un comptable. Seuls les exports bruts sont livrés ici (**option retenue par
  défaut** : ticket séparé après validation par un comptable).
- **Relance groupée depuis la balance âgée** : les relances de loyer appartiennent à TCK-588.
- **Commissions sur réservation courte durée** et **commission de gestion récurrente** ventilée aux
  agents. Le grand livre ne naît que de l'activation d'un bail ou d'une vente.
- **Délai de réponse aux leads** dans la performance d'équipe : il dépend du modèle de leads de TCK-590.
- **Versement effectif de la commission** à l'agent (mobile money) : seul le marquage « payée » est livré.
- Formatage selon la locale **hors des quatre vues d'ensemble** (TCK-347). Index des FK nues (TCK-349). Favoris dont le prix a bougé
  (TCK-599).
- Cache des tableaux de bord.

## Notes d'implémentation

### Re-mesure sur `origin/dev` `4da78b10` (2026-10-08), avant le code

Rejouée par lecture de `chemin:ligne` après les fusions 586 à 594, 597 et 598. Ce qui a changé depuis
`e3ab4a4e` :

- **Encaissé, en partie fermé par TCK-594 (P4-5)** : `DashboardOwnerService`, `DashboardAgencyService`
  et `SystemMetricsController` filtrent déjà `deposit_refund` par le scope
  `LeasePayment::exceptDepositRefunds()`, qui est l'unique définition. Restent ouverts trois défauts :
  le `deposit` compte toujours comme revenu, les `BookingPayment` sont absents, et les **impayés**
  (owner, agency, tenant, `DashboardController`) ne filtrent toujours pas `deposit_refund` (H-2).
  `AccountDeletionService:307-309` compte aussi une restitution en attente comme dette (H-2, ligne
  modifiée par TCK-600).
- **Prédicat de personnel** : TCK-587 est fusionné. `MembershipCapabilityResolver::isStaffAt()` et
  `PersonnelDeLAgence::estPersonnel()` existent. Le grand livre et la validation d'`agent_id` les
  lisent directement, sans la forme provisoire `isAgentAt || isAgencyAdminAt`.
- **Visite « demandée »** : TCK-590 n'a créé aucun statut (`VisitStatus` : scheduled, confirmed,
  completed, cancelled, no_show). `visits.to_confirm` prend donc le repli du ticket, une visite
  `scheduled` à venir.
- **`LeaseActivated`** n'est émis que par `LeaseService::activate()` (`:82`). TCK-596 (en cours)
  doit continuer de l'émettre.
- **Sans changement, et confirmés** : `leases.commission_amount` n'est écrit par aucun code
  applicatif (`grep` : `Lease.php`, dashboards, `AgencyStatsController`, `PayoutService` ne le lit
  pas sur le bail). `StoreLeaseRequest` ne valide que `commission_rate`. `accepted_at` n'est jamais
  écrit (`PropertyCollaboratorController::store` ne pose qu'`invited_at`). `DashboardAgencyController`
  admet `isAgentAt`. `members_count` compte agents et bailleurs. `DashboardRoleResolver` envoie tout
  admin d'agence vers la vue agence et rend `null` sans `Customer`. `DashboardTenantService` lit
  `->first()`. Les tuiles et la série de l'agent portent sur l'agence. `reports.view_global` est
  dans `platformReserved()`.
- **TCK-600** (en cours) touche `AccountDeletionService` et `routes/console.php`, mais ni
  `SystemMetricsController` ni `PlatformReportingService`.

### Lot 1 — calculs justes, accès d'agence, aiguillage, client (`6b5c0a7b`)

- `PortfolioMetrics` fait une requête par série (`generate_series` sur les jours, `DISTINCT (bien, jour)`).
  PostgreSQL ignore les `NULL` dans `LEAST`/`GREATEST`, et `LEAST(end_date, terminated_at::date, fin)`
  donne donc la fin effective sans `COALESCE`. La fin est **incluse** : c'est ce qu'exige AC1, avril vaut
  77,78 avec dix jours de L3.
- **Décision à confirmer** : `commission_month` garde un bail `terminated` (ADR-0049 §5).
  `AgencyStatsTest::test_commission_month_excludes_unsigned_leases_and_keeps_terminated_ones` acte le
  changement : l'ancienne règle retirait la commission du mois de signature.
- `GET /api/dashboard/me` ne rend plus jamais 404. La clé `errors.dashboard.profile_unresolved`, sans
  lecteur, est retirée des trois langues.
- `AgencyPolicy::viewReports` exige aussi que le profil actif soit dans l'agence (contrat TCK-146, comme
  `update`). Un admin de X agissant sous son profil Y ne lit donc pas X.
- Ablations rejouées (`scratchpad/vague73/t595/ablations.log`) : chaque test d'AC1 à AC5, AC7, AC8,
  AC16, AC16 bis, AC17 bis et H-2 rougit sur le code d'origine ou sur sa mutation ciblée.

### Lot 2 — grand livre des commissions (ADR-0049 §1 à §3)

- `commission_amount` n'était ni dans les règles de `StoreLeaseRequest` ni dans `LeaseResource` : le
  montant saisi disparaissait et ne se relisait pas. Les deux l'ont maintenant, avec `agent_id`.
- Les montants des lignes sont arrondis au **centime inférieur**. Σ ≤ base tient donc par construction,
  quel que soit le nombre de parts. `round()` pouvait dépasser la base d'un demi-centime par ligne.
- **Décision à confirmer (ajoutée à l'ADR)** : `mark-paid` et `cancel` entrent dans la famille
  protégée de `ProtectedActions` (2FA de l'admin d'agence), et `mark-paid` exige le step-up, comme
  `payouts/{payout}/mark-processed`. Le bénéficiaire ne solde pas sa propre ligne.
- L'écouteur est en file (`ShouldQueue`), comme ses voisins sur `LeaseActivated`. La relance est sans
  effet grâce à `insertOrIgnore`.

### Lot 3 — vue agent et budget de requêtes (§3, AC6)

- La vue agent lisait `users.agency_id` (pont de compatibilité) et ignorait le profil actif. Elle lit
  maintenant `staffAgencyId()`. Tâches, visites et interventions restent personnelles dans les deux
  périmètres, seuls portefeuille, clients, réservations, baux et commissions changent avec `scope`.
- `scope=agency` reprend la règle de la tuile d'agence (ADR-0049 §5, `commissionBetween`), pas la somme
  du grand livre : le reliquat d'agence n'a pas de ligne.
- Mesuré pour AC6 (plafonds inscrits) : bailleur 26, agent 25, agence 29 requêtes, identiques pour
  `months` 1 et 36 et pour 1 et 20 baux. Le code d'origine fait 133 requêtes à 36 mois côté agence.
- `DashboardAgentTest` passe désormais par l'activation d'un bail négocié : un `commission_amount` posé à
  la main sur un bail actif ne crée aucune ligne.

### Lot 4 — liste des biens sans N+1 (§4, AC15)

- **Écart au Delta** : `agency` n'est pas préchargée. `is_agent` ne lit que `agency_id`. Une relation
  `agency` chargée ferait émettre le bloc `agency` dans chaque ligne de liste (`relationLoaded`), avec sa
  requête de note d'agence, soit une clé nouvelle et un N+1 de plus (contraire à TCK-539).
- `owner.agentProfiles` est préchargé avec le filtre `active()`. Le statut est relu en mémoire, et un
  profil suspendu ne fait pas d'un propriétaire un agent (test dédié).

### Lot 5 — performance d'équipe et balance âgée (§6, §7 sans les exports)

- Les deux contrôleurs vivent sous `Api\Agency\`, à côté de `TeamController`. La balance âgée reste
  ouverte à une agence `individual` : suivre ses impayés n'est pas du reporting cross-équipe.
- `AgingBalanceService` calcule les jours de retard avec la date de PHP (`?::date - due_date`), pas avec
  `current_date`, pour que `setTestNow` et le fuseau de l'application décident ensemble.
- **Exports (AC19) en attente de TCK-601**, non fusionné sur `origin/dev` au 2026-10-08 (dernier
  relevé `0e3c9027`). Ils viendront en dernier, sans test rouge laissé sur la branche d'ici là.

### Lot 6 — métriques plateforme (§8, ADR-0057)

- Le prédicat « en essai » s'écrit `status = trialing OR COALESCE(trial_ends_at > point, FALSE)`. Sans
  le `COALESCE`, un `trial_ends_at` nul rendait le prédicat NULL, et `FILTER (WHERE NOT …)` écartait
  l'abonnement des deux sommes (MRR mesuré à 0 avant correction).
- `ROW_SCHEMA_VERSION` passe à 3 : les lignes de `GET /api/admin/reports/revenue` changent de sens
  (essais exclus) et gagnent `mrr_trialing`. Une enveloppe mise en cache par l'ancien code n'est plus servie.
- `revenue.collected_total` compte tous les paiements payés, y compris sans `paid_at`. L'instantané,
  daté, ne compte que ceux qui en ont un. L'écart éventuel se lit dans la tendance : il est nommé ici.
- `trend.previous` change de clés : `revenue_collected_total` et `revenue_mrr` remplacent
  `revenue_platform_total_paid`. Le front suit dans le lot front.

### Lot 7 — front : vues d'ensemble (AC4 bis, AC7, AC8, AC16, AC20 ter, bascule agent)

- `localeDeLaRequete()` (`src/i18n/locale-serveur.ts`) rend la langue que `getTranslations` sert déjà
  à la page. Les quatre pages n'écrivent plus `'fr'` ni `'fr-SN'`, et les heures de la vue agent passent
  par `formatDate` (fuseau `Africa/Dakar`) : le cliquet de `check-locale-figee.mjs` descend de 22 à 20.
- La bascule « Mes chiffres » / « Agence » n'est rendue qu'avec `reports.view_agency`
  (`GET /api/me/capabilities`, lu côté serveur). Un `?scope=agency` saisi sans la capacité retombe sur
  `mine` au lieu du 403. La « Vue agence » quitte la barre latérale de l'agent, et le layout de
  `/app/overview/agency` le renvoie sur sa vue : l'API la lui refuse (AC17 bis).
- Les cartes du bailleur mènent aux listes non filtrées (`/app/maintenance`, `/app/visits`,
  `/app/profile/reviews`) : ces listes ne lisent aucun filtre d'URL. Un filtre par lien est hors périmètre.
- L'accueil client sans dossier invite à chercher dans `preferences.city` (recherche publique,
  `contract_type` déduit de `search_intent`), et garde « ce qui m'attend » : une demande d'intervention
  ne suppose pas de dossier.

### Lot 8 — front : relevé des commissions (§2)

- `/app/commissions` (agent et admin d'agence, garde dans le layout) lit `GET /api/commissions` avec
  ses champs, `include=lease,beneficiary`, et affiche `meta.totals` par statut : la somme porte sur
  toute la portée, pas sur la page.
- « Marquer payée » et « Annuler » ne s'offrent qu'avec `payouts.approve`, et jamais sur la ligne dont
  on est le bénéficiaire (la policy la refuse). Le step-up passe par `useApiMutation`.
- Nouvelle entrée de navigation « Commissions » pour l'agent et l'admin ; espace i18n `commissions`
  ajouté à la frontière `(dashboard)/app` (`namespaces.json`, les plafonds des autres frontières
  inchangés).

### Lot 9 — front : balance âgée et performance d'équipe (§6, §7, AC18 front)

- L'onglet « Impayés » de `/admin/finances` garde son composant (`OverduePaymentsTable`) mais lit
  `GET /api/agencies/{agency}/finance/aging` : quatre tranches, total, cautions détenues, détail par
  locataire (lien vers la fiche client) ou par bailleur. Plus aucun `filter[status]=late`.
- L'onglet « Performance » de `/admin/team` vit dans `?vue=performance`, offert aux agences
  `standard` avec `reports.view_agency`. Le tri se fait sur la réponse entière : l'API rend une ligne
  par agent, sans pagination.
- **Écart** : l'accès front aux nouveaux exports (§7) attend AC19, lui-même en attente de TCK-601.

### Lot 10 — front : tuiles plateforme (§8)

- « Revenu plateforme » devient « Flux encaissé » (`revenue.collected_total`, repli sur
  `platform_total_paid` pour une API antérieure), sa tendance lit `revenue_collected_total`. Quatre
  tuiles suivent : volume d'affaires 30 j, take rate, MRR (tendance `revenue_mrr`), MRR en essai.
  Chacune n'est rendue que si l'API rend sa clé.
- Chaque tuile garde une destination unique (garde de TCK-461) : le MRR mène à
  `/super-admin/reports?tab=revenue`, d'où `ReportingShell` prend désormais un `initialTab`. Le take
  rate mène aux réglages (les frais plateforme), le volume aux reversements, les essais aux plans.

### Lot 11 — fusion de `dev` (TCK-601) et exports financiers (§7, AC19)

- Fusion d'`origin/dev` `33932c60` : PrivacyRequest garde le § 79 de `models-spec.md`,
  CommissionEntry et PlatformMetricDaily passent aux § 80 et 81. Le layout de `/app/commissions`
  passe par `assertCanReachAgencyStaffArea` (cliquet de `check-auth-interrupts.mjs`).
- `GET /api/export/payouts|invoices|commissions|aging|deposits` : `reports.export` au personnel,
  **403 au bailleur et au locataire** (`STAFF_ONLY`). `aging` exporte à la ligne (retard, tranche)
  avec la règle *Impayé* ; `deposits` rend une ligne par bail, encaissé moins restitué, sans borne
  de dates. Dans `scopeToActor`, une entité inconnue des branches bailleur et locataire ne rend
  plus rien (`1 = 0`) au lieu de tout rendre.
- Front : les cinq types s'offrent dans `/app/overview/exports` au personnel qui tient
  `reports.export`, jamais au bailleur, et le BFF les relaie.
