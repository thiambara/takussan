# Plan — Seeding « 1 an d'activité » pour Takussan

> ## ⚠️ DOCUMENT ANTÉRIEUR À L'IMPLÉMENTATION
>
> Il décrit l'état **d'avant** le chantier de seeding : « le seeding actuel est minimal :
> `DatabaseSeeder` crée un user de test et appelle 3 seeders », « `DemoSeeder` ~125 lignes ».
>
> La réalité au 2026-08-12 : **38 seeders**, ~450 biens. Ce fichier vaut comme **plan d'origine**,
> pas comme description. La source est `takussan-api/database/seeders/`.

## Contexte

Le seeding actuel de `takussan-api/` est minimal : `DatabaseSeeder` crée un user de test et appelle 3 seeders (`RolesAndPermissions`, `Tag`, `Property` → 10 propriétés), tandis que `DemoSeeder` (~125 lignes, non appelé par défaut) génère un dataset linéaire sans dimension temporelle : 2 agences, 9 properties, 4 leases avec 3 paiements chacun, 5 bookings. Aucune notion d'historique, pas de cycles mensuels, pas de distribution de statuts, pas de logs d'audit (alors que le trait `Auditable` est câblé sur la plupart des modèles via spatie/activitylog), pas de notifications accumulées.

**Objectif** : simuler une plateforme en production depuis 13 mois avec 3 agences sénégalaises, ~100 propriétés par agence, des baux à toutes les étapes de leur cycle de vie (actifs, renouvelés, expirés, terminés), des paiements mensuels cohérents avec pénalités de retard, des flux de maintenance, des conversations threadées, des notifications datées, et un activity log rétroactivement cohérent.

**Résultat attendu** : exécuter `php artisan migrate:fresh --seed --class=YearOfActivitySeeder` produit un dataset ~60-120k lignes en ~2-3 min, exploitable pour QA, dev frontend, démos commerciales et tests de performance.

---

## Décisions (validées avec l'utilisateur)

| Choix | Valeur retenue |
|---|---|
| Échelle | **3 agences** réalistes (Dakar, Thiès, Saint-Louis) |
| Volumétrie | **~100 propriétés / agence** (50 baux actifs, ~600 paiements, ~3k notifs, ~5k audit logs par agence) |
| Locale | **Faker `fr_FR` + provider custom Sénégal** (quartiers, prénoms wolof, tél +221) |
| Stratégie | **Remplacer `DemoSeeder`** par une architecture modulaire avec orchestrateur `YearOfActivitySeeder` |

---

## Architecture des fichiers cible

```
takussan-api/database/seeders/
├── DatabaseSeeder.php                          # [EDIT] entry point ; délègue à YearOfActivitySeeder
├── YearOfActivitySeeder.php                    # [NEW] orchestrateur principal (séquence déterministe)
│
├── System/                                     # données référentielles idempotentes
│   ├── RolesAndPermissionsSeeder.php           # [MOVE] existant, inchangé
│   ├── TagSeeder.php                           # [MOVE] existant, inchangé
│   └── SettingsSeeder.php                      # [NEW] settings globaux + par agence
│
├── Core/                                       # entités maîtres (non-temporelles)
│   ├── AgencySeeder.php                        # [NEW] 3 agences fixes + adresses
│   ├── UserSeeder.php                          # [NEW] super_admin, admins, agents, owners, tenants
│   └── IntegrationSeeder.php                   # [NEW] Wave, Orange Money, SMS par agence
│
├── Catalog/                                    # catalogue properties
│   ├── PropertySeeder.php                      # [REWRITE] ~100 properties × 3 agences
│   ├── PropertyCollaboratorSeeder.php          # [NEW] co-agents avec commission
│   ├── PropertyPriceHistorySeeder.php          # [NEW] 1-3 changements de prix sur 12 mois
│   └── PropertyMediaSeeder.php                 # [NEW] photos via faker→imagePlaceholder / picsum
│
├── Crm/                                        # customers & CRM
│   ├── CustomerSeeder.php                      # [NEW] leads, prospects, clients convertis
│   ├── CustomerNoteSeeder.php                  # [NEW] notes CRM datées
│   ├── GuarantorSeeder.php                     # [NEW] garants réutilisables
│   ├── UserCustomerRelationshipSeeder.php      # [NEW] liens agent↔client
│   ├── FavoriteSeeder.php                      # [NEW] favoris des users
│   └── SavedSearchSeeder.php                   # [NEW] recherches sauvegardées
│
├── Activity/                                   # données temporelles sur 13 mois
│   ├── PropertyVisitSeeder.php                 # [NEW] visites dispersées
│   ├── BookingSeeder.php                       # [NEW] bookings avec statuts réalistes
│   ├── BookingPaymentSeeder.php                # [NEW] acompte + solde
│   ├── LeaseSeeder.php                         # [NEW] mix actifs/expirés/renouvelés/terminés
│   ├── LeasePaymentSeeder.php                  # [NEW] 12 paiements / bail actif, cycle mensuel
│   ├── InventorySeeder.php                     # [NEW] état des lieux entrée/sortie
│   ├── PayoutSeeder.php                        # [NEW] payouts mensuels aux propriétaires
│   └── InvoiceSeeder.php                       # [NEW] factures par bail et par booking
│
├── Operations/                                 # opérations courantes
│   ├── MaintenanceRequestSeeder.php            # [NEW] tickets maintenance datés
│   ├── ConversationSeeder.php                  # [NEW] threads booking/lease/maintenance
│   ├── MessageSeeder.php                       # [NEW] 5-50 msgs / conversation
│   ├── DocumentSeeder.php                      # [NEW] contrats, pièces d'identité, etc.
│   ├── DocumentShareLinkSeeder.php             # [NEW] liens de partage expirables
│   └── TaskSeeder.php                          # [NEW] tâches internes des agents
│
├── Engagement/                                 # notifs, reviews, audit
│   ├── ReviewSeeder.php                        # [NEW] reviews post-lease / post-visit
│   ├── AppNotificationSeeder.php               # [NEW] notifs dérivées des événements
│   └── ActivityLogBackfillSeeder.php           # [NEW] backfill spatie/activitylog
│
└── Support/                                    # helpers partagés
    ├── SeedingContext.php                      # [NEW] cache des IDs créés (agences, users…)
    ├── Timeline.php                            # [NEW] helpers distribution temporelle
    ├── StatusDistribution.php                  # [NEW] tirage pondéré de statuts
    └── SenegalFakerProvider.php                # [NEW] provider Faker custom SN
```

---

## Ordre d'exécution (`YearOfActivitySeeder`)

L'orchestrateur appelle les seeders dans cet ordre strict (respect des FK) :

1. **System** → `RolesAndPermissions`, `Tag`, `Settings`
2. **Core** → `Agency`, `User`, `Integration`
3. **Catalog** → `Property`, `PropertyMedia`, `PropertyCollaborator`, `PropertyPriceHistory`
4. **CRM** → `Customer`, `Guarantor`, `UserCustomerRelationship`, `CustomerNote`, `Favorite`, `SavedSearch`
5. **Activity** → `PropertyVisit`, `Booking`, `BookingPayment`, `Lease`, `LeasePayment`, `Inventory`, `Invoice`, `Payout`
6. **Operations** → `MaintenanceRequest`, `Conversation`, `Message`, `Document`, `DocumentShareLink`, `Task`
7. **Engagement** → `Review`, `AppNotification`, `ActivityLogBackfill`

Le contexte `SeedingContext` (singleton applicatif enregistré pour la durée du seed) expose des collections en mémoire : `agencies()`, `owners(agencyId)`, `agents(agencyId)`, `customers(agencyId)`, `properties(agencyId)`, `activeLeases()`, etc. Chaque seeder écrit dans la DB + met à jour le contexte pour les seeders suivants, évitant les `SELECT *` répétés.

---

## Distribution de volumétrie (par agence)

| Entité | Cible | Commentaire |
|---|---|---|
| Users | ~30 | 1 agency_admin, 6 agents, 15 owners, 8 service providers |
| Customers | ~80 | 40% liés à un User, 60% CRM-only |
| Properties | ~100 | 75 Available, 15 Rented, 5 Sold, 3 Under maintenance, 2 Archived |
| PropertyVisits | ~400 | 4/property sur 13 mois |
| Bookings | ~120 | 50% completed, 20% expired, 15% cancelled, 15% confirmed/pending |
| Leases | ~70 | 50 actifs, 15 terminés/expirés, 3 renouvelés, 2 draft |
| LeasePayments | ~600 | 12/lease actif + partiels sur baux terminés |
| MaintenanceRequests | ~80 | mix d'états de `open` à `closed` |
| Conversations | ~200 | rattachées aux bookings/leases/maintenance |
| Messages | ~2000 | 5-20 par conversation |
| AppNotifications | ~3000 | dérivées des événements |
| ActivityLog entries | ~5000 | backfill rétroactif |

**Total cible 3 agences : ~60-120k lignes**, seeding ~2-3 min.

---

## Stratégies techniques critiques

### 1. Distribution temporelle

`Support/Timeline.php` expose :

```php
Timeline::seedStart()                   // now()->subMonths(13)
Timeline::randomDateBetween($from, $to) // Carbon
Timeline::monthlyBuckets($from, $to)    // iterate mois par mois
Timeline::businessHour($date)           // jitter 08h-18h
```

Chaque entité temporelle reçoit `created_at` / `updated_at` explicites dans la fenêtre appropriée, écrits via `DB::table()->insert()` pour contourner le `$timestamps = true` automatique.

### 2. Distribution de statuts

`Support/StatusDistribution.php` : tirage pondéré déterministe.

```php
StatusDistribution::pick([
    LeaseStatus::Active->value     => 70,
    LeaseStatus::Terminated->value => 20,
    LeaseStatus::Expired->value    => 7,
    LeaseStatus::Draft->value      => 3,
]);
```

Statuts pré-calculés pour : Lease, LeasePayment, Booking, Maintenance, PropertyVisit, Payout, Invoice, Task, CustomerPipelineStage.

### 3. Cycle mensuel des LeasePayments

Pour chaque `Lease` actif démarrant au mois M, générer 12 `LeasePayment` (un par mois) avec :
- `due_date` = M + n mois (jour fixe du bail)
- `paid_at` = due_date + 0-5 jours (70%), null (pending/late) sinon
- `status` dérivé : paid / late (si due_date passée et non payée) / pending (futur)
- Pénalité appliquée si `late` et due_date > 7j passée (réutilise la logique métier de `ApplyLatePaymentPenalties`)

**Réutilisation** : appeler `dispatch_sync(new ApplyLatePaymentPenalties())` en fin de seed pour que la logique de pénalité soit la vraie, pas une duplication.

### 4. Audit log rétroactif

Les modèles utilisent `Auditable` (spatie/activitylog) via `LogsActivity`. Pendant le seed massif, les observers seraient 10× trop lents.

**Approche en deux temps** :

- Étape 1 — **désactiver les events pendant les INSERTs massifs** :
  ```php
  Model::withoutEvents(fn() => ...);
  ```
  → aucun log écrit pendant la génération bulk.

- Étape 2 — `ActivityLogBackfillSeeder` génère manuellement les entrées `activity_log` via `DB::table('activity_log')->insert([...])` avec timestamps cohérents :
  - 1 entrée `created` au `created_at` de l'entité
  - entrées `updated` aux transitions de statut (lease.status passé à active, puis terminated ; lease_payment.status passé à paid…)
  - `causer_id` = un user plausible de l'agence (agent, landlord, ou super_admin)

### 5. Notifications dérivées

`AppNotificationSeeder` parcourt les entités déjà créées et génère les notifs qu'auraient produit les jobs programmés :
- `SendLeasePaymentReminders` → notif 3j avant chaque due_date
- `SendPropertyVisitReminders` → notif 1j avant chaque visite scheduled
- `ExpireBookings` → notif à chaque booking passé à expired
- Plus : confirmations de paiement reçu, assignation maintenance, renouvellement de bail

Chaque notif a `created_at` = date de l'événement déclencheur, pas `now()`.

### 6. Provider Faker Sénégal

`Support/SenegalFakerProvider.php` étend `\Faker\Provider\Base` :

```php
public function senegaleseFirstName(): string      // Mouhamed, Awa, Fatou, Cheikh…
public function senegalesePhoneNumber(): string    // +221 77/78/76/70/75/33 + 7 digits
public function dakarNeighborhood(): string        // Plateau, Almadies, Mermoz, Sacré-Cœur…
public function senegaleseCity(): string           // Dakar, Thiès, Saint-Louis, Rufisque…
```

Enregistré dans `SeedingContext::bootFaker()` et utilisé par les seeders et (optionnellement) par les Factories existantes via override.

**Config à modifier** : `.env.example` → `APP_FAKER_LOCALE=fr_FR` (les providers custom s'ajoutent par-dessus).

### 7. Performance

- Wrapper chaque seeder dans `DB::transaction()`.
- Utiliser `Model::withoutEvents()` + insertions en chunks de 500 via `DB::table()->insert()` là où possible.
- Désactiver les scout/queue listeners : `Config::set('queue.default', 'sync')` au début du seeding ; bypass scout via `Model::withoutSyncingToSearch()`.
- Activer `DB::disableQueryLog()` en tête d'orchestrateur.

### 8. Idempotence et reproductibilité

- Données référentielles (`Role`, `Permission`, `Tag`, `Setting`) : `firstOrCreate` / `updateOrCreate`.
- Seed aléatoire fixe : `faker()->seed(2026)` dans `SeedingContext::bootFaker()` → runs reproductibles (utile en CI).
- Comptes de démo fixes avec emails stables : `admin@dakarimmo.sn`, `agent1@thies-properties.sn`, etc. (facilite les tests E2E).

---

## Fichiers existants à modifier/supprimer

| Fichier | Action |
|---|---|
| `database/seeders/DemoSeeder.php` | **SUPPRIMER** (remplacé par l'archi modulaire) |
| `database/seeders/DatabaseSeeder.php` | **MODIFIER** : appelle `YearOfActivitySeeder` au lieu des 3 seeders actuels |
| `database/seeders/RolesAndPermissionsSeeder.php` | **DÉPLACER** dans `System/` (namespace `Database\Seeders\System`) |
| `database/seeders/TagSeeder.php` | **DÉPLACER** dans `System/` |
| `database/seeders/PropertySeeder.php` | **SUPPRIMER** (remplacé par `Catalog/PropertySeeder.php` plus riche) |
| `.env.example` | `APP_FAKER_LOCALE=fr_FR` |
| `composer.json` (autoload) | Rien (PSR-4 auto-découvre les sous-dossiers si namespace aligné) |

**Factories à enrichir** (`database/factories/`) :
- Ajouter `PropertyCollaboratorFactory`, `PropertyPriceHistoryFactory`, `DocumentShareLinkFactory`, `TaskFactory`, `AppNotificationFactory`, `UserCustomerRelationshipFactory` (aujourd'hui manquantes).
- Harmoniser les factories existantes pour accepter un `Timeline` via state : `->onDate(Carbon $d)`.

---

## Fichiers à réutiliser (pas de duplication)

| Besoin | Réutiliser |
|---|---|
| Appliquer pénalités de retard | `App\Jobs\ApplyLatePaymentPenalties` → `dispatch_sync()` post-seed |
| Expirer bookings | `App\Jobs\ExpireBookings` → `dispatch_sync()` post-seed |
| Enums de statuts | Tous les enums de `app/Models/Enums/` (ne PAS hard-coder de strings) |
| Permissions | `RolesAndPermissionsSeeder` existant (7 rôles, 102 perms) — inchangé |
| Tags | `TagSeeder` existant (features/amenities/segments FR) — inchangé |
| Observers | Désactivés pendant le seed (`withoutEvents`) pour éviter les effets de bord |

---

## Vérification end-to-end

1. **Reset + seed complet** :
   ```bash
   cd takussan-api
   php artisan migrate:fresh --seed
   ```
   Doit terminer en < 5 min sans erreur.

2. **Contrôle volumétrique** (via `php artisan tinker`) :
   ```php
   Agency::count()              // === 3
   Property::count()            // ≈ 300
   Lease::active()->count()     // ≈ 150
   LeasePayment::count()        // ≈ 1800
   ActivityLog\Activity::count() // ≥ 10000
   AppNotification::count()     // ≥ 5000
   ```

3. **Contrôle temporel** :
   ```php
   Lease::min('start_date') // ≥ now()->subMonths(13)
   LeasePayment::where('status', 'paid')->count() / LeasePayment::count() // ≈ 0.7
   ```

4. **Contrôle de cohérence** :
   - Chaque `LeasePayment` pointe un `Lease` existant.
   - Chaque `Payout` couvre des `LeasePayment::paid`.
   - Chaque `AppNotification.created_at` ≤ date de l'événement référencé.
   - `php artisan test` passe toujours (les tests utilisent `RefreshDatabase`, donc indépendants du seed).

5. **Contrôle front** : `npm run dev` dans `takussan-web/`, se connecter avec un compte fixe (`admin@dakarimmo.sn`), vérifier que les écrans dashboard/leases/payments/maintenance affichent des données plausibles sur 13 mois.

6. **Lint** : `./vendor/bin/pint` avant commit (règle mémoire utilisateur).

---

## Hors périmètre

- Génération de vraies images (on utilisera des URLs picsum.photos ou placeholder).
- Seeding des tables `media` avec des fichiers physiques (colonnes DB seulement).
- Performance sub-seconde : l'objectif est < 5 min, pas < 30 s.
- Migration des données existantes (DB de prod) : ce plan traite uniquement du seed de dev.
- Scénarios de bug / données malformées pour tests d'erreur (pourra faire l'objet d'un ticket séparé).
