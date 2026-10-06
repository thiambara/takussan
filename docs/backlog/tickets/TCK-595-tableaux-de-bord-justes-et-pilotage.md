---
id: TCK-595
title: "Tableaux de bord justes et pilotage : chaque acteur voit ses vrais chiffres, l'agence voit ses agents, ses commissions et ses impayés par ancienneté"
status: todo
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-06
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

### 3. Vue agent : des chiffres d'agence, et une liste de biens en N+1 (A5, A14)

- Plusieurs compteurs de la vue agent portent sur toute l'agence :
  - `properties_managed` compte « créés par moi OU de l'agence » (`DashboardAgentService.php:30-36`) ;
  - le pipeline porte sur toute l'agence (`:41-48`) ;
  - `leases_to_sign` aussi (`:88-90`).

  Le front les présente pourtant comme personnels : « Vue agent », « Commissions mois »
  (`takussan-web/src/messages/fr.json:1364,1368`). La série coûte 2 requêtes par mois, et jusqu'à 36 mois
  sont acceptés (`:207-248`).
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

### 5. L'admin d'agence ne pilote ni son équipe ni ses impayés (AD16, AD17)

- `DashboardAgencyService` ne rend que des agrégats d'agence. `grep -niE
  "objective|leaderboard|per_agent|by_agent|team-performance"` sur l'API et le web → 0. `/admin/team`
  est déjà réservé aux agences `standard` (`admin/team/page.tsx:27`).
- L'onglet Impayés (`OverduePaymentsTable.tsx:44`) est une liste plate figée sur `status=late`. Il ne
  propose ni ventilation par ancienneté, ni regroupement, ni cautions détenues (`grep deposit` sur les
  services de dashboard → 0). Le **correctif du rapport** est inexact : `OverdueReminderService`
  relance les FACTURES (`Services/Invoice/`, TCK-092), pas les loyers.
- Les exports forment une liste fermée : `payments, leases, customers, properties`
  (`ExportController.php:36`, `ExportDataService.php:158-167`). Il n'existe aucun export des
  reversements, des factures ni des commissions.

### 6. Le super-admin lit un « revenu » qui n'en est pas un (S17)

- La tuile « Revenu plateforme » est la somme de **tous** les loyers payés depuis toujours
  (`SystemMetricsController.php:71-73`, `fr.json:5982-5983`, `SystemMetricsGrid.tsx:200-210`).
- Le MRR compte les abonnements `Trialing` (et `PastDue`) (`PlatformReportingService.php:433-460`).
- Ni le GMV ni les frais plateforme ne sont rapportés, alors que `platform_fee_pct_at_payment` existe
  sur les deux tables de paiement (migration `2026_05_07_000224`).
- Le docblock `SystemMetricsController.php:29-37` le dit : 8 métriques sur 11 n'ont pas de tendance
  faute d'historique. Il n'existe aucune table d'instantanés.

## Contrat de données

**Modifiés** :
- `GET /api/dashboard/owner` : `finance.cashflow_month` (règle ci-dessous), `finance.lease_income_month`,
  `finance.booking_income_month`, `finance.net_paid_out_month`, `finance.deposits_held`,
  `occupancy.rate_percent` (aujourd'hui, longue durée), `occupancy.short_stay_percent` (mois courant,
  `null` sans bien courte durée), `maintenance.quotes_pending`, `visits.to_confirm`,
  `reviews.unanswered`. La série `timeseries` gagne `short_stay_occupancy` et `net_paid_out`.
- `GET /api/dashboard/agency` : mêmes règles d'occupation et d'encaissé. `finance.commission_month` lit
  le grand livre des commissions.
- `GET /api/dashboard/agent?scope=mine|agency` (défaut `mine`) : `scope` rendu. `finance.*` lit le grand
  livre filtré sur l'agent.
- `GET /api/dashboard/me` : un hôte d'agence `individual` → rôle `owner`. Un compte sans autre rôle →
  rôle `tenant`, même sans ligne `Customer`, avec `visits_upcoming`.
- `GET /api/admin/system/metrics` : `revenue.collected_total` (renommage sémantique de
  `platform_total_paid`, l'ancienne clé est conservée une version), `revenue.gmv_30d`,
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
  - *Impayé* = `LeasePayment` `pending|late` échus, **hors** `deposit_refund`.
  - *Net reversé* = Σ `payouts.net_amount` `completed`, par `processed_at`.
  - *Cautions détenues* = Σ `deposit` payés − Σ `deposit_refund` payés.
- **Montants décimaux en base**, arrondis à 2 décimales à la sortie (principe n° 3). Aucune conversion ×100.
- **Commissions** :
  - générées une seule fois par bail, à l'activation, par un écouteur de `LeaseActivated` (événement
    existant, `ShouldDispatchAfterCommit`), idempotent par unicité `(lease_id, beneficiary_id)`. On
    n'insère pas « au cas où » pour attraper l'exception (piège PostgreSQL n° 1) : `insertOrIgnore` ;
  - aucun rattrapage des baux existants, qui n'ont ni `commission_amount` ni négociateur : inventer
    l'un ou l'autre serait faux ;
  - le grand livre est **interne à l'agence**, et un agent ne lit que ses lignes.
- **Autorisations** (les nouveaux endpoints en sont les premiers lecteurs) :
  - `reports.view_global` à l'agence pour `team-performance`, `aging` et `scope=agency` ;
  - `payouts.approve` pour `mark-paid` et `cancel` ;
  - `reports.export` pour les nouveaux types d'export.
  - Une agence `individual` reçoit **403** sur `team-performance` (§1.12, pas de reporting
    cross-équipe). Une autre agence reçoit **403** partout.
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
  - **TCK-598** possède le bloc `collaborators` et `buildUserLite` de `PropertyResource`. Ce ticket n'y
    change que la source des données préchargées.
  - **TCK-596** transforme l'activation en signature OTP. Ce ticket ne touche pas `LeaseController` et
    s'abonne à `LeaseActivated`, que 596 doit continuer d'émettre.
  - **TCK-590** définit le statut d'une visite « demandée », que `visits.to_confirm` compte (à défaut :
    `scheduled` et à venir).
  - **TCK-592** (statuts de maintenance), **TCK-597** (avis) et **TCK-594** (`Payout`, dont le calcul du
    reversement) : ce ticket les lit et ne les modifie pas.
  - **TCK-588** possède les relances de loyer : la balance âgée ne relance pas.
  - **TCK-347** possède le formatage selon la locale.
  - Clés i18n : ajout seulement, blocs `dashboard.*`, `team.performance.*`, `admin.finances.aging.*`,
    `commissions.*`.
- **ADR requis** avant le code (voir Delta § 0).

## Delta à produire

### 0. Décisions
- [ ] **ADR-00NN (prochain numéro libre) « Attribution des transactions et grand livre des commissions »**,
      écrit et accepté avant le code. Il tranche :
  - où vit le négociateur : `leases.agent_id` → `users` ;
  - comment naît `commission_amount`. Option recommandée : saisi explicitement, et dérivé
    `sale_price × commission_rate / 100` pour une vente sans montant ; aucune dérivation pour une
    location, dont le `commission_rate` reste le taux de gestion lu par les reversements (TCK-594) ;
  - la règle de ventilation. Option recommandée :
    - chaque collaborateur `role=agent` **accepté** reçoit `commission_share` % ;
    - le négociateur reçoit `AgentProfile.commission_rate` %, plafonné à `100 − Σ parts` et sans double
      ligne s'il est aussi collaborateur ;
    - le reliquat reste à l'agence, sans ligne ;
  - le sort d'une commission quand le bail est résilié. Option recommandée : la ligne reste `due`, et
    l'admin peut l'annuler.
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
      `App\Listeners\Lease\GenerateCommissionEntries` sur `LeaseActivated`.
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
  - `mine` = biens dont il est `user_id` ou collaborateur `agent|manager` accepté ; clients
    `added_by_id` = lui (ou le champ d'assignation de TCK-591 s'il existe à la fusion) ; baux à signer
    dont il est `agent_id` ;
  - `agency` = le calcul actuel, sous `reports.view_global`.
- [ ] `monthlyTimeseries` en une requête groupée par mois sur le grand livre et sur `leases.signed_at`.
- [ ] Front : « Mes chiffres » / « Agence » ; libellés honnêtes.

### 4. Liste des biens (A14)
- [ ] `PropertyController::index` : eager-loading de `media`, `agency`, `owner.media`, et des profils
      agent nécessaires à `actsAsAgent`. **Seulement l'eager-loading** : la clause `where` appartient à
      TCK-587.
- [ ] `PropertyResource::actsAsAgent` lit des profils préchargés au lieu d'une requête par ligne. Ce
      calcul par lot vient par-dessus le retrait de la branche courtier (TCK-586).

### 5. Accueil client (C14)
- [ ] `DashboardTenantService` agrège sur **toutes** les lignes `Customer` de l'utilisateur. Sans aucune
      ligne, il rend des zéros et `has_customer_profile:false` au lieu de court-circuiter. Nouvelles clés
      `visits.upcoming` (5 prochaines, `customer.user_id` = moi) et `maintenance.open` (déjà calculée).
- [ ] `DashboardRoleResolver` : un compte sans autre rôle → `TenantMeMetrics`, jamais `null`.
- [ ] Front : accueil « ce qui m'attend » (§ Direction UX). La rangée « biens à {ville} pour
      {louer|acheter} » consomme la recherche publique existante, filtrée par `city` / `search_intent`.

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
- [ ] Front : la balance âgée remplace la liste plate de l'onglet Impayés de `/admin/finances`. Accès aux
      nouveaux exports.

### 8. Métriques plateforme (S17)
- [ ] Migration `create_platform_metrics_daily_table` (unique `platform_metrics_daily_date_uq`). Modèle
      `PlatformMetricDaily`.
- [ ] Job `App\Jobs\Reporting\SnapshotPlatformMetricsJob`, planifié `dailyAt('00:30')->withoutOverlapping()`
      dans `routes/console.php`. Commande `metrics:snapshot {--date=}` pour un jour donné (flux seulement
      pour le passé).
- [ ] `SystemMetricsController` : nouvelles clés, `trend` lu dans l'instantané J-30 (absent → pas de
      clé). `PlatformReportingService::revenueSnapshotAt` sort `Trialing` du MRR et le rend à part.
- [ ] Front : la tuile « Revenu plateforme » devient « Flux encaissé », avec des tuiles GMV, take rate,
      MRR et essais.

### 9. Tests (noms prescrits)
- [ ] `tests/Feature/Dashboard/DashboardOwnerMetricsTest.php`, `DashboardOwnerQueryBudgetTest.php`,
      `DashboardAgentScopeTest.php`, `DashboardMeRoutingTest.php`, `DashboardTenantSeekerTest.php`
- [ ] `tests/Feature/Commission/CommissionLedgerTest.php`, `CommissionEntryApiTest.php`
- [ ] `tests/Feature/Api/PropertyIndexQueryBudgetTest.php`
- [ ] `tests/Feature/Agency/TeamPerformanceTest.php`, `AgingBalanceTest.php`,
      `tests/Feature/Api/ExportReportingTypesTest.php`
- [ ] `tests/Feature/Admin/PlatformMetricsSnapshotTest.php`
- [ ] Les tests existants qui posent `commission_amount` à la main sont réécrits pour passer par
      l'activation.

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
      suffit pas : le test compare le tableau entier. Sur le code actuel, janvier vaut 0.
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
- [ ] **AC5 — Même règle pour l'agence.** R placé dans une agence `standard` sans autre bien :
      `GET /api/dashboard/agency` rend les mêmes valeurs qu'AC2 et AC4 pour l'occupation et l'encaissé.
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
      A, dont `AgentProfile.commission_rate` = 30. Sur le bien :
  - B est collaborateur `agent`, accepté, `commission_share` 20 ;
  - C est collaborateur `agent`, **non** accepté, `commission_share` 10.

  Après activation, `commission_entries` contient exactement 2 lignes : A 90 000 et B 60 000, toutes deux
  `due`. Une seconde émission de `LeaseActivated` ne crée aucune ligne de plus.
- [ ] **AC10 — Plafond de ventilation.** Les collaborateurs acceptés totalisent 80 % et le taux de A
      est 30 : la ligne de A vaut 20 % de la base, et Σ des lignes ≤ `commission_amount`.
- [ ] **AC11 — Vente sans montant.** Un bail `type=sale`, `sale_price` 50 000 000, `commission_rate` 3,
      sans `commission_amount` : il est créé avec `commission_amount` = `1500000.00`.
- [ ] **AC12 — Vue agent personnelle.** Sur le jeu d'AC9, plus un bail d'un autre agent de la même agence
      signé dans le mois (commission 500 000) :
  - `GET /api/dashboard/agent` pour A → `finance.commissions_month` = `90000.0` et `scope: "mine"` ;
  - pour B → `60000.0` ;
  - `scope=agency` → **403** pour un agent sans `reports.view_global`, **200** pour l'admin d'agence.
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
- [ ] **AC17 — Performance d'équipe.** Dans une agence `standard`, sur juillet 2026 :
  - l'agent A a 2 baux signés en juillet et 1 en juin, 3 visites `completed` et 1 `cancelled` ;
  - l'agent B a 1 visite `completed`.

  `GET /api/agencies/{agency}/team-performance?period=2026-07` rend : A `leases_signed: 2`,
  `visits_completed: 3` ; B `leases_signed: 0`, `visits_completed: 1`. Le nombre de requêtes est identique
  avec 2 et 6 agents. Les refus :
  - agence `individual` → **403** ;
  - agent sans `reports.view_global` → **403** ;
  - admin d'une autre agence → **403**.
- [ ] **AC18 — Balance âgée.** Au 2026-07-15, quatre loyers impayés échus de 10, 40, 75 et 120 jours
      (100 000 chacun) et une restitution de caution échue : `aging` rend une ligne de 1 × 100 000 dans
      chaque tranche, et ignore la restitution. `group_by=landlord` totalise par bailleur.
      `deposits_held` vaut la règle des Contraintes.
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
- [ ] **AC21 — Pas de régression silencieuse.** `php artisan test` vert. Pint, `npm run lint`,
      `npx tsc --noEmit` et `npm run test` propres. Les libellés nouveaux existent en `fr`, `en` et `wo`.

## Hors périmètre

- **Objectifs mensuels par agent** (jauge, cibles) : fonctionnalité absente de la spec (voir les
  questions au porteur).
- **Journal comptable SYSCOHADA** (plan de comptes, FEC) : il demande un plan de correspondance des
  comptes validé par un comptable. Seuls les exports bruts sont livrés ici.
- **Relance groupée depuis la balance âgée** : les relances de loyer appartiennent à TCK-588.
- **Commissions sur réservation courte durée** et **commission de gestion récurrente** ventilée aux
  agents. Le grand livre ne naît que de l'activation d'un bail ou d'une vente.
- **Délai de réponse aux leads** dans la performance d'équipe : il dépend du modèle de leads de TCK-590.
- **Versement effectif de la commission** à l'agent (mobile money) : seul le marquage « payée » est livré.
- Formatage selon la locale (TCK-347). Index des FK nues (TCK-349). Favoris dont le prix a bougé
  (TCK-599).
- Cache des tableaux de bord.

## Notes d'implémentation

_(à remplir par implementing-specs)_
