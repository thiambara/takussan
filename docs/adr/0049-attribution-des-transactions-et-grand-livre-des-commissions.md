# ADR-0049 — Attribution des transactions et grand livre des commissions

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tickets** : [TCK-595](../backlog/tickets/TCK-595-tableaux-de-bord-justes-et-pilotage.md)
- **Précise** : le principe non négociable n° 3 (montant décimal en base),
  [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (le prédicat « personnel de
  l'agence ») et [ADR-0039](0039-les-sorties-d-argent.md) (`commission_rate` du bail reste le taux de
  gestion lu par les reversements).

## Contexte

Relu dans le code sur `4da78b10` (`dev`, après TCK-586 à 594) :

- **Une commission n'a ni montant ni auteur.** Aucun code applicatif n'écrit `leases.commission_amount` :
  `StoreLeaseRequest` ne valide que `commission_rate`, et ni `UpdateLeaseRequest`, ni la factory, ni
  aucun seeder ne remplissent la colonne. Les tuiles « Commissions » de l'agent, de l'agence et de
  `GET /api/agencies/{a}/stats` valent donc 0 sur toute donnée réelle, et leurs tests sont verts
  seulement parce qu'ils posent la colonne à la main.
- **Aucun bail ne dit qui l'a négocié.** `leases` n'a pas de colonne de négociateur. La tuile de
  l'agent somme les commissions de toute son agence, sous le commentaire « proxy metric ».
- **La ventilation est saisie, puis jamais lue.** `property_collaborators.commission_share` est
  plafonné à 100 % sous le verrou du bien, mais aucun calcul ne le lit. `AgentProfile.commission_rate`
  n'a aucun lecteur métier.
- **`accepted_at` n'est jamais écrit** par l'application : `PropertyCollaboratorController::store` ne
  pose qu'`invited_at`, et il n'existe aucun parcours d'acceptation. Une règle réservée aux
  collaborateurs « acceptés » verserait 0 à tout collaborateur créé par l'API.
- **Les chiffres consolidés d'une agence n'ont pas de capacité.** `GET /api/dashboard/agency` s'ouvre à
  tout agent (`isAgentAt`). `reports.view_global` ne peut pas garder une vue d'agence : elle est
  réservée à la plateforme (`Capability::platformReserved()`), et aucun rôle d'agence ne peut la porter.

## Décision

**Un bail désigne son négociateur. Sa commission se fixe à la création, et l'activation la ventile une
seule fois dans un grand livre interne à l'agence, entre les collaborateurs `agent` éligibles et le
négociateur. Les chiffres consolidés d'une agence s'ouvrent par une capacité d'agence neuve,
`reports.view_agency`.**

### 1. Le négociateur : `leases.agent_id`

`leases.agent_id` → `users`, nullable, avec la FK `leases_agent_id_fk` (`nullOnDelete`) et l'index
`leases_agent_id_signed_at_idx (agent_id, signed_at)`.

- **Valeur saisie** (`agent_id` dans `POST /api/leases` et `PATCH /api/leases/{id}`) : le compte doit
  être du **personnel actif de l'agence du bien** au sens de `PersonnelDeLAgence::estPersonnel()`
  (TCK-590), c'est-à-dire joignable et `isStaffAt()` (ADR-0031 §1). Sinon **422**. Un bailleur, un
  client ou le compte d'une autre agence est refusé. Un bien sans agence n'a aucun négociateur possible.
- **Valeur par défaut** (`LeaseService::create`) : le créateur du bail s'il est personnel de l'agence du
  bien, sinon `null`. Un bailleur qui crée son propre bail ne se désigne pas.
- **Renouvellement** : `LeaseRenewalService` recopie `agent_id` sur le bail enfant.

*Écarté* : un pivot `lease_agents` à plusieurs négociateurs. La co-négociation existe déjà sous forme de
collaborateurs du bien, avec leur part. Un second mécanisme pour la même chose se lirait comme deux
conventions concurrentes.

### 2. Le montant : `leases.commission_amount`

- **Saisi explicitement** (`numeric|min:0`) à la création et à la modification.
- **Dérivé pour une vente sans montant** : un bail `type=sale` qui porte `sale_price` et
  `commission_rate` mais pas de `commission_amount` naît avec
  `round(sale_price × commission_rate / 100, 2)`.
- **Aucune dérivation pour une location.** Son `commission_rate` reste le taux de gestion que lisent
  les reversements (ADR-0039). Le recopier en commission d'agence confondrait deux flux.
- Une modification après l'activation **ne régénère rien** : le grand livre est figé à l'activation
  (§3). Corriger une ligne revient à l'annuler, geste de l'admin.

### 3. Le grand livre : `commission_entries`

Une table, `commission_entries` : `agency_id`, `lease_id`, `beneficiary_id` (→ `users`), `origin`
(`negotiator` | `collaborator`, chaîne de caractères, ADR-0007), `base_amount`, `share_percent`,
`amount` (`decimal(14,2)`), `currency`, `status` (`due` | `paid` | `cancelled`), `earned_at`, `paid_at`,
`paid_by_id`, `cancelled_at`, `cancelled_by_id`, `metadata`. Elle porte l'unicité
`commission_entries_lease_benef_uq (lease_id, beneficiary_id)` et l'index
`commission_entries_agency_benef_idx (agency_id, beneficiary_id, earned_at)`.

**Naissance** : `App\Listeners\Lease\GenerateCommissionEntries` écoute `LeaseActivated` (déjà
`ShouldDispatchAfterCommit`) et appelle `CommissionLedgerService::generateFor(Lease)`.

- La base est `leases.commission_amount`. Sans base positive ou sans agence, aucune ligne n'est créée.
- `earned_at` = `signed_at` du bail, l'instant de l'activation.
- **Idempotence** : l'insertion passe par `insertOrIgnore` sur l'unicité `(lease_id, beneficiary_id)`.
  Une seconde émission de `LeaseActivated` n'ajoute rien. On n'insère pas « au cas où » en attrapant
  l'exception, ce qui violerait le piège PostgreSQL n° 1.

**Ventilation** (le premier point est tranché par la session le 2026-10-06, les autres sont les options
retenues par défaut) :

1. **Collaborateurs.** Chaque collaborateur `role=agent` du bien dont le `user_id` est, **au moment de
   l'activation**, personnel de l'agence du bien (`isStaffAt()`, le prédicat qu'applique
   `CollaboratorEligibleForProperty`, TCK-586 §5), reçoit `commission_share` % de la base.
   **`accepted_at` n'est pas lu** : rien ne l'écrit, et ce ticket n'ajoute aucun parcours
   d'acceptation. Un collaborateur dont le profil a été supprimé ou suspendu depuis son ajout ne reçoit
   rien.
2. **Négociateur.** Il reçoit le `commission_rate` % de son `AgentProfile` actif dans l'agence du bail,
   plafonné à `100 − Σ parts des collaborateurs servis`. Un négociateur sans profil agent (un admin
   d'agence) a un taux nul.
3. **Négociateur également collaborateur** : une seule ligne, d'origine `negotiator`, dont la part vaut
   sa part de collaborateur augmentée de son taux plafonné. Le détail des deux parts est conservé dans
   `metadata`.
4. **Le reliquat reste à l'agence, sans ligne.** Une part nulle ne crée pas de ligne.

Par construction, Σ des lignes ≤ `commission_amount`.

**Résiliation** : les lignes restent `due`, et l'admin peut les annuler. **Renouvellement** : aucune
ligne, car `LeaseRenewalService` n'émet pas `LeaseActivated`. Seul `agent_id` est recopié.
**Aucun rattrapage** des baux existants : ils n'ont ni montant ni négociateur, et inventer l'un ou
l'autre serait faux.

**Lecture et gestes** (`GET /api/commissions`, `POST /api/commissions/{id}/mark-paid|cancel`) :

- Le grand livre est **interne à l'agence**.
- Un membre du personnel ne lit que ses lignes, sauf s'il détient `reports.view_agency` à l'agence : il
  lit alors toutes celles de l'agence.
- `mark-paid` et `cancel` exigent `payouts.approve` à l'agence de la ligne (`CommissionEntryPolicy`), et
  seule une ligne `due` change d'état. Chaque geste est journalisé (`activity('CommissionEntry')`).
  Le bénéficiaire ne solde pas sa propre ligne. Les deux gestes rejoignent la famille protégée de
  `ProtectedActions` (2FA de l'admin d'agence), et `mark-paid` le step-up, comme
  `payouts/{payout}/mark-processed` (TCK-594).
- Le versement effectif (mobile money) est hors périmètre : seul le marquage est livré.

*Écarté* : calculer la commission à la volée depuis le bail et les parts courantes. Une part modifiée
après coup, ou un agent parti de l'agence, réécrirait l'historique d'un mois déjà clos. *Un chiffre ne
se reconstruit pas depuis un état courant.*

### 4. Les chiffres consolidés d'une agence : `reports.view_agency`

Un cas neuf, `Capability::ReportsViewAgency = 'reports.view_agency'` (bloc `reports.*`), absent de
`platformReserved()`, donc dans `agencyAssignable()`. Le rôle système `agency_admin`
(`SystemRoleCapabilities::agencyAdmin()` = `agencyAssignable()`) la reçoit par construction, l'agent
jamais. Les agences existantes la reçoivent par `membership:reconcile-system-roles` (joué par
`docker/release.sh`, TCK-528). Un rôle personnalisé ne la reçoit pas d'office.

Elle garde `GET /api/dashboard/agency`, `GET /api/agencies/{a}/stats`, `team-performance`,
`finance/aging` et `GET /api/dashboard/agent?scope=agency`. Le super-admin passe par sa branche
plateforme. Une agence `individual` reçoit 403 sur les vues cross-équipe (`features.md` §1.12).

*Écarté* : rouvrir `reports.view_global` aux rôles d'agence. Elle désigne une lecture
**multi-agences** ; la confondre avec la vue d'une agence ferait d'un admin d'agence un lecteur
potentiel de la plateforme.

### 5. La tuile « Commissions » de l'agence

`finance.commission_month` = Σ `leases.commission_amount` des baux **activés dans le mois** (`signed_at`
dans le mois, hors `draft` et `pending_signature`). Un bail résilié depuis reste compté, de même que ses
lignes restent `due`. L'ancienne règle, qui excluait `terminated`, faisait disparaître du mois de
signature une commission acquise.

La tuile de l'agent lit **ses** lignes du grand livre (`beneficiary_id` = lui, `status ≠ cancelled`,
`earned_at` dans la période).

## Conséquences

- La commission d'un bail créé avant cette décision vaut 0 et ne produit aucune ligne. C'est vrai, et
  c'est affiché comme tel.
- Le grand livre devient la seule source de la commission **d'un agent**, et `leases.commission_amount`
  celle **de l'agence**. Elles diffèrent du reliquat, ce qui est voulu.
- L'admin peut annuler une ligne, mais ne peut pas la modifier. Une erreur de part se corrige en
  annulant la ligne, puis par un geste hors de ce ticket (aucune saisie manuelle n'est livrée).
- Une seconde activation est impossible (`lease.not_draft_activate`), et l'unicité tient même si un
  écouteur est rejoué.
- Un collaborateur ajouté **après** l'activation ne reçoit rien. Un collaborateur retiré avant
  l'activation ne reçoit rien non plus.

## Application

- Schéma : migrations `add_agent_id_to_leases_table` et `create_commission_entries_table`.
- Code : `App\Services\Commission\CommissionLedgerService`, `App\Listeners\Lease\GenerateCommissionEntries`,
  `App\Models\CommissionEntry`, `App\Policies\CommissionEntryPolicy`,
  `App\Http\Controllers\Api\CommissionEntryController`, `routes/api/commissions.php`.
- Tests : `tests/Feature/Commission/CommissionLedgerTest.php` (ventilation, éligibilité sans
  `accepted_at`, idempotence, résiliation, renouvellement, plafond, vente),
  `CommissionEntryApiTest.php` (cloisonnement, 403 de l'agent, 200 de l'approbateur, journal), et
  `tests/Feature/Dashboard/DashboardAgencyAccessTest.php` (capacité). Chaque refus est prouvé par
  ablation.
