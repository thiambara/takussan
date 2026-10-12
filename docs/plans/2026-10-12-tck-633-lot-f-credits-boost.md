# TCK-633 lot F — Crédits d'espace et boost des annonces Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Livrer le lot F de TCK-633 (AC13 à AC16) : un registre de crédits entiers par espace
(lots datés, mouvements en insertion seule, consommation ordonnée sous verrou), l'offre de bienvenue
une fois par numéro vérifié, le catalogue Remontée / Vedette / Badge avec ses règles et son cycle de
vie (pause, reprise, remboursement au prorata, fin sans remboursement), le tick `boosts:tick`, la
recherche à emplacements « Sponsorisé » tournants et places réservées en tête de première page, la
mesure impressions / clics, l'API annonceur et super-admin, et les écrans (annonceur, public,
super-admin) — sans aucun achat de crédits (phase 2, ADR-0061 §11).

**Architecture:** Tout le métier vit dans deux domaines de services : `App\Services\Credits`
(`CreditLedger` — seul écrivain de `credit_lots` / `credit_movements`, verrou sur la ligne
`agencies` puis lecture des lots —, `WelcomeCreditService`, `CreditExpiryNotifier`) et
`App\Services\Boost` (`BoostSettings`, `BoostPurchaseService`, `BoostLifecycle` — seul écrivain de
`properties.featured / sponsored_until / badge / badge_until` —, `SponsoredRotation`,
`BoostStatsRecorder`, `LegacyFeaturedConversion`). `PropertyObserver` et un `AgencyBoostObserver`
déclenchent la réconciliation ; `boosts:tick` (5 min) la rejoue comme filet. La recherche publique
ajoute une requête « vivier » Meilisearch (mêmes filtres + `featured = true`, ids seuls), une rotation
déterministe et, si des places réservées existent, une requête organique d'exclusion. Le front ajoute
`components/boost/**` (bouton Booster, page Crédits, emplacements sponsorisés, marques, consoles
super-admin) sans toucher aux types partagés : les champs neufs passent par des types d'extension
locaux.

**Tech Stack:** Laravel 13 (PHP 8.4), PostgreSQL 17 (trigger PL/pgSQL), Meilisearch (Scout),
PHPUnit (`Tests\TestCase`, `Tests\ApiTestCase`, `InteractsWithMeilisearch`), Next.js 16 / React 19,
TanStack Query, next-intl (fr/en/wo), base-ui (shadcn `base-nova`), vitest + Testing Library.

---

## Sources qui font foi (relues pour ce plan)

- `docs/adr/0061-credits-d-espace-et-boost-des-annonces.md` — §1 à §11.
- `docs/backlog/tickets/TCK-633-lot-retours-porteur-publication-recherche-boost.md` — lot F, contrat
  d'API, AC13 à AC16, exigences UX.
- `docs/plans/2026-10-12-tck-633-lot-retours-porteur.md` — territoires, fichiers co-tenus, règles de
  l'arbre partagé, interfaces C → F, F → E, F → B.
- `takussan-api/CLAUDE.md`, `takussan-web/CLAUDE.md`, `CLAUDE.md` racine (pièges PostgreSQL 1 à 9).

## Contraintes globales (rappel exécutable)

1. **Arbre partagé** : aucune commande git qui écrit (`add`, `commit`, `checkout`, `stash`,
   `restore`, `reset`, `switch`, `merge`, `push`). À chaque fin de tâche : **« signaler à la session
   les fichiers à commiter »** — la liste est donnée dans la tâche.
2. **Territoire** : fichiers tenus seuls par F, fichiers neufs propres au lot, et fichiers co-tenus
   listés pour F (édités **uniquement par l'outil Edit**, petits blocs ancrés ; si Edit signale un
   changement : relire puis rejouer). **Tout autre fichier existant est une COLLISION** : l'agent ne
   l'édite pas, il recopie le bloc « Collision Cn » de ce plan dans le champ `collisions` de son
   rapport. La table des collisions est plus bas ; chaque tâche dit lesquelles elle produit.
3. **Tests** : uniquement `php artisan test <fichier>` / `npx vitest run <fichier>` ou
   `php bin/impacted-tests.php --run`. **Jamais la suite entière, jamais une commande > 10 min.**
   Prérequis : `docker compose up -d postgres meilisearch redis` (depuis la racine du dépôt).
4. **Ablation** : copie dans `"${TMPDIR:-/tmp}/tck633f"`, `md5 -q` avant, retrait, test rouge,
   restauration par `cp`, `md5 -q` identique. Jamais `git checkout`. Pas de `timeout` (absent sur
   macOS).
5. **PostgreSQL** : jamais `try { create } catch (UniqueConstraintViolation)` (piège 1 →
   `insertOrIgnore`) ; verrou sur la **ligne parent** (`agencies`), jamais `lockForUpdate()->sum()`
   (piège 2) ; noms d'index et de FK **explicites ≤ 63 caractères** (piège 3) ; longueurs de
   `VARCHAR` respectées (piège 5) ; jamais d'identifiant en dur dans un test (piège 6) ; une FK
   n'est pas indexée d'office (piège 8) ; jamais `enum()` (ADR-0007).
6. **Crédits entiers**, jamais ×100 (principe 3 ne s'applique pas : ce n'est pas un montant).
7. **Erreurs** : `abort_code` / `abort_code_if` avec une clé de `lang/{fr,en,wo}/errors.php`
   (co-tenu : Edit seulement, groupes `boost` et `credits`, insérés à leur place alphabétique).
8. **Validation** : toute règle dans un `FormRequest` qui étend `App\Http\Requests\BaseFormRequest`
   (`authorize()` refuse par défaut) ; autorisation par policy (`$this->authorize(...)` ou délégation
   `$this->user()?->can(...)` dans `authorize()`), jamais une règle recopiée dans un contrôleur
   (`scripts/check-controller-authorization.mjs`).
9. **Réponses** : `$this->json(...)`, `$this->paginated(...)` ou `$this->paginationMeta(...)`
   (jamais une `meta` recopiée) ; ressources qui étendent `App\Http\Resources\Bases\BaseResource`,
   dates par `iso()`.
10. **Front** : `apiRequest` / `useApiQuery` / `useApiMutation` exigent le préfixe `/api` écrit par
    l'appelant ; console super-admin par le relais `/api/super-admin/...` (`fetch` + `cheminApi`) et
    `avecGardeDoubleFacteur` sur chaque écriture ; textes en fr / en / wo, vouvoiement ;
    `interface XxxProps` en `readonly` ; tests sous `__tests__/` avec `withIntl`.
11. **Pint** avant tout signalement de fichiers PHP : `./vendor/bin/pint <fichiers>` ;
    `npx tsc --noEmit` et `npm run lint` avant tout signalement de fichiers front.
12. **Rapport** : `docs/plans/rapports/tck-633-lot-f.json` (verdict en premier, puis `fichiers`,
    `tests`, `ablations`, `ecarts_au_ticket`, `collisions`), message final d'une ligne.

## Table des collisions (fichiers hors territoire F — appliqués par la session, jamais par l'agent)

| Id | Fichier | Changement exact (donné dans la tâche citée) | Effet tant qu'elle n'est pas appliquée |
|---|---|---|---|
| C1 | `takussan-api/app/Support/Security/ProtectedActions.php` (l. 201-256, `STEP_UP`) | 5 entrées step-up (T18) | `AdminCreditsStepUpTest` rouge ; écritures super-admin sans step-up |
| C2 | `takussan-api/routes/console.php` (fin de fichier) | `Schedule::command('boosts:tick')->everyFiveMinutes()->withoutOverlapping();` (T13) | `BoostsTickScheduleTest` rouge ; tick non planifié |
| C3 | `takussan-api/app/Http/Resources/PropertyResource.php` (après l. 122) | `badge`, `badge_until` (T17) | badge absent des réponses ; `PropertyResourceBadgeTest` rouge |
| C4 | `takussan-api/tests/Unit/Services/Membership/MembershipCapabilityResolverTest.php` (l. 377-396) | 44/46 → 45/47 (T8) | ce test rougit dès l'ajout de `boost.spend` |
| C5 | `takussan-api/tests/Feature/Admin/Platform/PlatformSettingsCatalogueTest.php` (l. 17-38) | liste des 9 clés (T3) | ce test rougit dès l'ajout des 6 réglages |
| C6 | `takussan-api/tests/Feature/Public/PropertyListTest.php` (l. 38-47) | ordre organique `ranked_at` (T14) | ce test rougit dès le changement de tri |
| C7 | `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/CompteurDeVue.tsx` | `?src=sponsored` (T16) | les clics sponsorisés ne sont pas comptés |
| C8 | `takussan-web/src/types/super-admin.ts:510` + `takussan-web/src/components/admin/super/platform-settings.tsx:28` | catégorie `boost` (T23) | les six réglages n'apparaissent pas dans la console |
| C9 | `takussan-web/src/messages/{fr,en,wo}.json` hors espace F | `nav.sidebar.credits`, `nav.superAdmin.items.credits`, `nav.superAdmin.items.boosts`, `admin.roles.domains.boost`, `admin.roles.capabilities.boost.spend`, `superAdmin.platformSettings.categories.boost`, `superAdmin.platformSettings.keys.credits.*` / `.boost.*` (T8, T21, T23) | libellés bruts à l'écran ; `npm run check:i18n` rouge |
| C10 | `takussan-web/src/i18n/namespaces.json` | `cd takussan-web && node scripts/check-i18n-namespaces.mjs --update` après fusion des lots (T24) | `check-i18n-namespaces` rouge (`credits`, `boost`) |
| C11 | `takussan-api/app/Domain/Notifications/NotificationTarget.php` (l. 32-55) | `'credits' => '/app/credits',` (T6) | notifications de crédits sans lien (repli géré, aucun rouge) |
| C12 | écran de succès de publication (créé par le lot C) | y poser `<BoostButton propertyId=… isPublic />` (T20) | Booster absent de l'écran de succès |
| C13 | `docs/models-spec.md` | 6 modèles neufs + 4 colonnes de `properties` (étape 3 du plan maître) | `scripts/check-models-spec.mjs` rouge |

> **Pourquoi des collisions et non des éditions.** Règle 2 du plan maître : *un fichier hors
> territoire dont il a besoin → champ `collisions` de son rapport, jamais une édition.* Les tests qui
> dépendent d'une collision sont écrits par l'agent et **lancés par la session** après l'avoir
> appliquée ; chaque tâche les marque « différé (Cn) ».

## Carte des fichiers

### Back — fichiers neufs (propres au lot)

| Fichier | Rôle |
|---|---|
| `takussan-api/database/migrations/2026_10_12_700100_create_boost_tables.php` | `boost_products`, `property_boosts`, `property_boost_daily_stats` |
| `takussan-api/database/migrations/2026_10_12_700200_create_credit_ledger_tables.php` | `credit_lots`, `credit_movements` (+ trigger insertion seule), `credit_welcome_grants` |
| `takussan-api/database/migrations/2026_10_12_700300_add_boost_columns_to_properties.php` | `ranked_at`, `sponsored_until`, `badge`, `badge_until` (+ rattrapage `ranked_at`) |
| `takussan-api/database/migrations/2026_10_12_700400_seed_boost_catalogue_and_convert_featured.php` | catalogue initial + conversion des `featured` existants en Vedettes offertes |
| `takussan-api/app/Models/Enums/{BoostKind,BoostStatus,BoostBadge,CreditLotOrigin,CreditMovementType}.php` | énumérations |
| `takussan-api/app/Models/{CreditLot,CreditMovement,CreditWelcomeGrant,BoostProduct,PropertyBoost,PropertyBoostDailyStat}.php` | modèles |
| `takussan-api/app/Support/PhoneFingerprint.php` | empreinte HMAC d'un numéro (interface C → F) |
| `takussan-api/app/Services/Credits/{CreditLedger,InsufficientCredits,WelcomeCreditService,CreditExpiryNotifier}.php` | registre |
| `takussan-api/app/Services/Boost/{BoostSettings,BoostPurchaseService,BoostLifecycle,SponsoredRotation,BoostStatsRecorder,LegacyFeaturedConversion}.php` | boost |
| `takussan-api/app/Observers/AgencyBoostObserver.php` | suspension / réactivation d'espace |
| `takussan-api/app/Policies/{CreditLotPolicy,PropertyBoostPolicy}.php` | autorisation (découverte automatique `App\Models\X` → `App\Policies\XPolicy`) |
| `takussan-api/app/Listeners/Credits/{GrantWelcomeCreditsOnPhoneVerified,GrantWelcomeCreditsOnSpaceCreated}.php` | écouteurs (découverte automatique ; **dépendent du lot C**) |
| `takussan-api/app/Notifications/Credits/{CreditsGrantedNotification,CreditsExpiringNotification}.php`, `takussan-api/app/Notifications/Boost/{BoostEndedNotification,BoostRefundedNotification}.php` | notifications (cloche, `toAppNotification`) |
| `takussan-api/lang/{fr,en,wo}/credits.php` | textes des notifications |
| `takussan-api/app/Console/Commands/BoostsTick.php` | `boosts:tick` |
| `takussan-api/routes/api/credits.php`, `takussan-api/routes/api/admin-credits.php` | routes |
| `takussan-api/app/Http/Controllers/Api/Credits/{CreditController,BoostProductController,PropertyBoostController}.php` | API annonceur |
| `takussan-api/app/Http/Controllers/Api/Admin/{AdminBoostProductController,AdminCreditWalletController,AdminBoostController,AdminBoostStatsController}.php` | API super-admin |
| `takussan-api/app/Http/Requests/Credits/StorePropertyBoostRequest.php`, `takussan-api/app/Http/Requests/Api/Admin/{StoreBoostProductRequest,UpdateBoostProductRequest,AdjustCreditWalletRequest,CancelBoostRequest,OfferBoostRequest,BoostStatsRequest}.php` | validation |
| `takussan-api/app/Http/Resources/Credits/{CreditLotResource,CreditMovementResource,BoostProductResource,PropertyBoostResource,CreditWalletResource}.php` | ressources |
| `takussan-api/database/seeders/System/{BoostProductSeeder,OfferedFeaturedSeeder}.php` (namespace `Database\Seeders\System`, comme `PlanSeeder`) | catalogue, Vedettes offertes de démonstration |
| `takussan-api/tests/**` (listés par tâche) | tests |

### Back — fichiers co-tenus édités par F (Edit seulement)

| Fichier | Lignes relues | Ce que F y change |
|---|---|---|
| `takussan-api/app/Models/Property.php` (912 l.) | casts 66-94, `$queryFields` 128-135, `booted()` 137-173, `toSearchableArray()` 391-453, relations 775-911 | casts, `$queryFields`, hooks `saving` / `replicating`, `ranked_at` dans l'index, relation `boosts()` |
| `takussan-api/app/Models/Agency.php` | `use` 1-23, classe 25-29, `primaryAdmin()` 164 | `#[ObservedBy(AgencyBoostObserver)]`, relation `creditLots()` |
| `takussan-api/app/Models/Enums/Capability.php` | cas 17-100 | `case BoostSpend = 'boost.spend';` |
| `takussan-api/app/Http/Requests/UpdatePropertyRequest.php` | l. 58 | `'featured' => ['prohibited']` |
| `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php` | `index()` 139-158, `view()` 619-631 | tri `ranked_at`, clic `src=sponsored` |
| `takussan-api/app/Services/Search/PropertySearchService.php` | `search()` 79-153, `buildSort()` 581-592, `hydrate()` 600-626 | vivier, rotation, places réservées, tri `ranked_at` |
| `takussan-api/app/Services/Property/HomepageDiscoveryService.php` (F seul) | `discover()` 75-125, `ranked()` 215-225 | tri `ranked_at`, rotation de la rangée vedette, impressions |
| `takussan-api/app/Observers/PropertyObserver.php` (F seul) | `updated()` 165-179, `deleted()` 190-197 | appel de `BoostLifecycle::reconcile()` |
| `takussan-api/app/Domain/Settings/EditablePlatformSettings.php` (F seul) | `all()` 27-56 | 6 réglages |
| `takussan-api/config/scout.php` (F seul) | `filterableAttributes` 183-189, `sortableAttributes` 210 | `id`, `ranked_at` |
| `takussan-api/lang/{fr,en,wo}/errors.php` | clés de premier niveau 14-300 | groupes `boost`, `credits` |
| `takussan-api/database/seeders/DatabaseSeeder.php` | `run()` 16-22 | appel de `BoostProductSeeder` et `OfferedFeaturedSeeder` |

### Front — fichiers neufs (propres au lot)

| Fichier | Rôle |
|---|---|
| `takussan-web/src/components/boost/types.ts` | types locaux (aucune édition de `types/property.ts` ni `types/search.ts`) |
| `takussan-web/src/components/boost/api.ts` | requêtes annonceur |
| `takussan-web/src/components/boost/BoostButton.tsx`, `BoostDialog.tsx` | Booster |
| `takussan-web/src/components/boost/CreditsPanel.tsx` | page Crédits |
| `takussan-web/src/components/boost/EmplacementSponsorise.tsx`, `MarquesDeBoost.tsx`, `lecture-recherche.ts`, `arrivee-sponsorisee.ts` | public |
| `takussan-web/src/components/boost/admin/{api.ts,AdminCreditWallets.tsx,AdminCreditWalletDetail.tsx,AdminBoosts.tsx,AdminBoostCatalogue.tsx,AdminBoostStats.tsx,BoostsNav.tsx}` | super-admin |
| `takussan-web/src/app/(dashboard)/app/credits/page.tsx` | page annonceur |
| `takussan-web/src/app/(super-admin)/super-admin/credits/page.tsx`, `credits/[agencyId]/page.tsx`, `boosts/page.tsx`, `boosts/catalogue/page.tsx`, `boosts/stats/page.tsx` | pages super-admin |
| `takussan-web/src/components/boost/**/__tests__/*.test.tsx` | tests |

### Front — fichiers co-tenus édités par F (Edit seulement)

| Fichier | Lignes relues | Ce que F y change |
|---|---|---|
| `takussan-web/src/components/property-dashboard/PropertyHeaderActions.tsx` (294 l.) | 148, 182-187 | `<BoostButton>` avant `AddDocumentButton` |
| `takussan-web/src/components/property-dashboard/PropertyRowActions.tsx` (296 l.) | 1-36, 146, 212-226 | entrée de menu « Booster » + dialogue hors menu |
| `takussan-web/src/components/property/PropertiesDiscoveryPage.tsx` (656 l.) | 236-252, 622-633 | emplacements sponsorisés, marques |
| `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyHeader.tsx` | 50-55 | marques de boost |
| `takussan-web/src/components/layout/AppSidebar.tsx` | 6-33, 240-245 | entrée « Crédits » |
| `takussan-web/src/components/layout/SuperAdminSidebar.tsx` | 6-33, 126-135 | entrées « Crédits », « Mise en avant » |
| `takussan-web/src/messages/{fr,en,wo}.json` | racine | espaces `credits`, `boost`, `search.sponsored`, `superAdmin.credits`, `superAdmin.boosts` |

---

## Tâche 1 — Schéma : tables du boost, du registre, colonnes de `properties`

**Fichiers :** créer les migrations `700100`, `700200`, `700300` ; créer
`takussan-api/tests/Feature/Credits/CreditSchemaTest.php`.

**Étape 1.1 — écrire le test (rouge).** `takussan-api/tests/Feature/Credits/CreditSchemaTest.php` :

```php
<?php

namespace Tests\Feature\Credits;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §2) — le schéma du registre : les tables existent, `credit_movements`
 * REFUSE toute modification et toute suppression directe, et une suppression en CASCADE d'un parent
 * reste possible (sinon un bien supprimé pour de bon ne pourrait plus l'être).
 */
class CreditSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_les_tables_et_colonnes_existent(): void
    {
        foreach (['boost_products', 'property_boosts', 'property_boost_daily_stats', 'credit_lots', 'credit_movements', 'credit_welcome_grants'] as $table) {
            $this->assertTrue(Schema::hasTable($table), $table);
        }
        $this->assertTrue(Schema::hasColumns('properties', ['ranked_at', 'sponsored_until', 'badge', 'badge_until']));
        $this->assertTrue(Schema::hasColumns('credit_lots', ['agency_id', 'origin', 'initial_amount', 'remaining_amount', 'expires_at', 'granted_by_id', 'reason', 'expiry_notice_sent_at']));
        $this->assertTrue(Schema::hasColumns('credit_movements', ['agency_id', 'credit_lot_id', 'type', 'amount', 'property_boost_id', 'actor_id', 'reason', 'created_at']));
        $this->assertFalse(Schema::hasColumn('credit_movements', 'updated_at'));
    }

    public function test_un_mouvement_ne_se_modifie_ni_ne_se_supprime(): void
    {
        [$agencyId, $lotId] = $this->lotBrut();
        $id = DB::table('credit_movements')->insertGetId([
            'agency_id' => $agencyId, 'credit_lot_id' => $lotId, 'type' => 'grant', 'amount' => 10, 'created_at' => now(),
        ]);

        foreach ([
            fn () => DB::table('credit_movements')->where('id', $id)->update(['amount' => 99]),
            fn () => DB::table('credit_movements')->where('id', $id)->delete(),
        ] as $tentative) {
            try {
                // Savepoint : l'erreur PostgreSQL n'abandonne que lui, pas la transaction du test (piège 1).
                DB::transaction($tentative);
                $this->fail('credit_movements a accepté une modification directe.');
            } catch (QueryException $e) {
                $this->assertStringContainsString('insertion seule', $e->getMessage());
            }
        }

        $this->assertSame(10, (int) DB::table('credit_movements')->where('id', $id)->value('amount'));
    }

    public function test_la_suppression_en_cascade_d_un_parent_reste_possible(): void
    {
        [$agencyId, $lotId] = $this->lotBrut();
        DB::table('credit_movements')->insert([
            'agency_id' => $agencyId, 'credit_lot_id' => $lotId, 'type' => 'grant', 'amount' => 10, 'created_at' => now(),
        ]);

        DB::table('agencies')->where('id', $agencyId)->delete();

        $this->assertSame(0, DB::table('credit_movements')->where('agency_id', $agencyId)->count());
    }

    public function test_un_lot_ne_descend_pas_sous_zero(): void
    {
        [, $lotId] = $this->lotBrut();

        try {
            DB::transaction(fn () => DB::table('credit_lots')->where('id', $lotId)->update(['remaining_amount' => -1]));
            $this->fail('credit_lots a accepté un restant négatif.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('credit_lots_amounts_check', $e->getMessage());
        }
    }

    /** @return array{0:int,1:int} */
    private function lotBrut(): array
    {
        $agencyId = \App\Models\Agency::factory()->create()->id;
        $lotId = DB::table('credit_lots')->insertGetId([
            'agency_id' => $agencyId, 'origin' => 'admin_grant', 'initial_amount' => 10, 'remaining_amount' => 10,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return [$agencyId, $lotId];
    }
}
```

**Étape 1.2 — lancer, constater le rouge.**

```bash
cd takussan-api && php artisan test tests/Feature/Credits/CreditSchemaTest.php
```

Attendu : 4 échecs (`Failed asserting that false is true` sur `boost_products`, `relation "credit_lots" does not exist`).

**Étape 1.3 — migration `700100`.** `takussan-api/database/migrations/2026_10_12_700100_create_boost_tables.php` :

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 lot F (ADR-0061 §4, §5, §10) — le catalogue, les boosts achetés ou offerts, et leurs
 * compteurs quotidiens. Genres et statuts en `string` (ADR-0007 : jamais `enum()`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('boost_products', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 20);
            $table->string('variant', 20)->nullable();
            $table->unsignedSmallInteger('duration_days')->default(0);
            $table->unsignedInteger('price_credits');
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            // Une offre = (genre, variante, durée). `nulls not distinct` : sans lui, deux Remontées
            // à variante nulle passeraient l'unicité (PostgreSQL tient deux NULL pour distincts).
            $table->unique(['kind', 'variant', 'duration_days'], 'boost_products_offer_unique')->nullsNotDistinct();
        });
        DB::statement('ALTER TABLE boost_products ADD CONSTRAINT boost_products_price_check CHECK (price_credits >= 0)');

        Schema::create('property_boosts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained('properties', 'id', 'property_boosts_property_fk')->cascadeOnDelete();
            $table->foreignId('agency_id')->constrained('agencies', 'id', 'property_boosts_agency_fk')->cascadeOnDelete();
            $table->foreignId('boost_product_id')->nullable()->constrained('boost_products', 'id', 'property_boosts_product_fk')->nullOnDelete();
            $table->string('kind', 20);
            $table->string('variant', 20)->nullable();
            // Prix et durée FIGÉS à l'achat (ADR-0061 §4) ; une prolongation de Vedette les cumule.
            $table->unsignedInteger('price_credits');
            $table->unsignedSmallInteger('duration_days');
            $table->timestamp('starts_at');
            $table->timestamp('ends_at')->nullable();
            $table->string('status', 20);
            $table->unsignedInteger('remaining_seconds')->nullable();
            $table->timestamp('paused_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->boolean('offered')->default(false);
            $table->text('offer_reason')->nullable();
            $table->foreignId('purchased_by_id')->nullable()->constrained('users', 'id', 'property_boosts_purchased_by_fk')->nullOnDelete();
            $table->text('cancel_reason')->nullable();
            $table->foreignId('cancelled_by_id')->nullable()->constrained('users', 'id', 'property_boosts_cancelled_by_fk')->nullOnDelete();
            $table->unsignedInteger('refunded_credits')->nullable();
            $table->timestamps();
            $table->index(['property_id', 'kind', 'status'], 'property_boosts_property_kind_status_idx');
            $table->index(['status', 'ends_at'], 'property_boosts_status_ends_at_idx');
            $table->index('agency_id', 'property_boosts_agency_idx');
        });

        Schema::create('property_boost_daily_stats', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_boost_id')->constrained('property_boosts', 'id', 'property_boost_daily_stats_boost_fk')->cascadeOnDelete();
            $table->date('date');
            $table->unsignedInteger('impressions')->default(0);
            $table->unsignedInteger('clicks')->default(0);
            $table->timestamps();
            $table->unique(['property_boost_id', 'date'], 'property_boost_daily_stats_boost_date_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('property_boost_daily_stats');
        Schema::dropIfExists('property_boosts');
        Schema::dropIfExists('boost_products');
    }
};
```

**Étape 1.4 — migration `700200`.** `takussan-api/database/migrations/2026_10_12_700200_create_credit_ledger_tables.php` :

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 lot F (ADR-0061 §1, §2, §3) — le registre de crédits d'un espace.
 *
 * `credit_movements` est en INSERTION SEULE, tenue par un trigger et non par une convention : un
 * UPDATE ou un DELETE direct lève. Deux exceptions, toutes deux structurelles :
 *   · la suppression EN CASCADE d'un parent (`pg_trigger_depth() > 1` : elle vient d'un trigger
 *     d'intégrité référentielle) — sinon une agence ou un lot supprimés pour de bon bloqueraient ;
 *   · la mise à NULL de `property_boost_id` / `actor_id` par `ON DELETE SET NULL` — le montant, le
 *     type, le lot et la date restent intouchables.
 * `TRUNCATE` ne déclenche pas les triggers de ligne : seul le harnais de test l'emploie.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('credit_lots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies', 'id', 'credit_lots_agency_fk')->cascadeOnDelete();
            $table->string('origin', 20);
            $table->unsignedInteger('initial_amount');
            $table->unsignedInteger('remaining_amount');
            $table->timestamp('expires_at')->nullable();
            $table->foreignId('granted_by_id')->nullable()->constrained('users', 'id', 'credit_lots_granted_by_fk')->nullOnDelete();
            $table->text('reason')->nullable();
            $table->timestamp('expiry_notice_sent_at')->nullable();
            $table->timestamps();
            $table->index(['agency_id', 'expires_at'], 'credit_lots_agency_expires_idx');
        });
        DB::statement('ALTER TABLE credit_lots ADD CONSTRAINT credit_lots_amounts_check CHECK (initial_amount > 0 AND remaining_amount >= 0 AND remaining_amount <= initial_amount)');

        Schema::create('credit_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies', 'id', 'credit_movements_agency_fk')->cascadeOnDelete();
            $table->foreignId('credit_lot_id')->constrained('credit_lots', 'id', 'credit_movements_lot_fk')->cascadeOnDelete();
            $table->string('type', 20);
            $table->integer('amount');
            $table->foreignId('property_boost_id')->nullable()->constrained('property_boosts', 'id', 'credit_movements_boost_fk')->nullOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users', 'id', 'credit_movements_actor_fk')->nullOnDelete();
            $table->text('reason')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['agency_id', 'id'], 'credit_movements_agency_id_idx');
            $table->index('credit_lot_id', 'credit_movements_lot_idx');
            $table->index('property_boost_id', 'credit_movements_boost_idx');
        });
        DB::statement('ALTER TABLE credit_movements ADD CONSTRAINT credit_movements_amount_check CHECK (amount <> 0)');

        DB::unprepared(<<<'SQL'
            CREATE FUNCTION credit_movements_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    IF pg_trigger_depth() > 1 THEN
                        RETURN OLD;
                    END IF;
                    RAISE EXCEPTION 'credit_movements est en insertion seule (ADR-0061)' USING ERRCODE = 'P0001';
                END IF;
                IF NEW.id IS DISTINCT FROM OLD.id
                    OR NEW.agency_id IS DISTINCT FROM OLD.agency_id
                    OR NEW.credit_lot_id IS DISTINCT FROM OLD.credit_lot_id
                    OR NEW.type IS DISTINCT FROM OLD.type
                    OR NEW.amount IS DISTINCT FROM OLD.amount
                    OR NEW.reason IS DISTINCT FROM OLD.reason
                    OR NEW.created_at IS DISTINCT FROM OLD.created_at
                    OR (NEW.property_boost_id IS DISTINCT FROM OLD.property_boost_id AND NEW.property_boost_id IS NOT NULL)
                    OR (NEW.actor_id IS DISTINCT FROM OLD.actor_id AND NEW.actor_id IS NOT NULL) THEN
                    RAISE EXCEPTION 'credit_movements est en insertion seule (ADR-0061)' USING ERRCODE = 'P0001';
                END IF;
                RETURN NEW;
            END
            $$;
            CREATE TRIGGER credit_movements_append_only_trg
                BEFORE UPDATE OR DELETE ON credit_movements
                FOR EACH ROW EXECUTE FUNCTION credit_movements_append_only();
            SQL);

        Schema::create('credit_welcome_grants', function (Blueprint $table) {
            $table->id();
            // Empreinte HMAC du numéro (`App\Support\PhoneFingerprint`) : survit à l'anonymisation
            // du compte, qui efface `users.phone` (ADR-0061 §3).
            $table->string('phone_hash', 64)->unique('credit_welcome_grants_phone_hash_unique');
            $table->foreignId('agency_id')->nullable()->constrained('agencies', 'id', 'credit_welcome_grants_agency_fk')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users', 'id', 'credit_welcome_grants_user_fk')->nullOnDelete();
            $table->foreignId('credit_lot_id')->nullable()->constrained('credit_lots', 'id', 'credit_welcome_grants_lot_fk')->nullOnDelete();
            $table->timestamp('granted_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('credit_welcome_grants');
        DB::unprepared('DROP TRIGGER IF EXISTS credit_movements_append_only_trg ON credit_movements');
        Schema::dropIfExists('credit_movements');
        DB::unprepared('DROP FUNCTION IF EXISTS credit_movements_append_only()');
        Schema::dropIfExists('credit_lots');
    }
};
```

**Étape 1.5 — migration `700300`.** `takussan-api/database/migrations/2026_10_12_700300_add_boost_columns_to_properties.php` :

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 lot F (ADR-0061 §5, §7) — `ranked_at` porte l'ordre organique (une Remontée le remet à
 * maintenant) ; `sponsored_until`, `badge`, `badge_until` sont des PROJECTIONS des boosts actifs,
 * écrites par `App\Services\Boost\BoostLifecycle` seul.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->timestamp('ranked_at')->nullable();
            $table->timestamp('sponsored_until')->nullable();
            $table->string('badge', 20)->nullable();
            $table->timestamp('badge_until')->nullable();
            $table->index('ranked_at', 'properties_ranked_at_idx');
        });

        DB::table('properties')->whereNull('ranked_at')->whereNotNull('published_at')
            ->update(['ranked_at' => DB::raw('published_at')]);
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropIndex('properties_ranked_at_idx');
            $table->dropColumn(['ranked_at', 'sponsored_until', 'badge', 'badge_until']);
        });
    }
};
```

**Étape 1.6 — vert.**

```bash
cd takussan-api && php artisan test tests/Feature/Credits/CreditSchemaTest.php
```

Attendu : `Tests: 4 passed`.

**Étape 1.7 — ablation.** Retirer le trigger, constater le rouge, restaurer.

```bash
cd takussan-api && mkdir -p "${TMPDIR:-/tmp}/tck633f" \
 && F=database/migrations/2026_10_12_700200_create_credit_ledger_tables.php \
 && cp "$F" "${TMPDIR:-/tmp}/tck633f/700200.php" && md5 -q "$F" \
 && perl -0pi -e 's/CREATE TRIGGER credit_movements_append_only_trg\s+BEFORE UPDATE OR DELETE ON credit_movements\s+FOR EACH ROW EXECUTE FUNCTION credit_movements_append_only\(\);//' "$F" \
 && php artisan test tests/Feature/Credits/CreditSchemaTest.php ; \
 cp "${TMPDIR:-/tmp}/tck633f/700200.php" "$F" && md5 -q "$F"
```

Attendu : `test_un_mouvement_ne_se_modifie_ni_ne_se_supprime` rouge (`credit_movements a accepté une
modification directe`), puis les deux `md5` identiques. Relancer l'étape 1.6 : vert.

**Étape 1.8 — signaler à la session les fichiers à commiter :** les trois migrations,
`tests/Feature/Credits/CreditSchemaTest.php`. (Commit suggéré :
`feat(api): schéma du registre de crédits et du boost (TCK-633)`.)

---

## Tâche 2 — Énumérations, modèles, relations, `ranked_at` et duplication

**Fichiers :** créer les 5 énumérations et 6 modèles ; Edit `app/Models/Property.php`,
`app/Models/Agency.php` ; créer `tests/Feature/Boost/BoostModelsTest.php`.

**Étape 2.1 — test (rouge).** `takussan-api/tests/Feature/Boost/BoostModelsTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\Enums\BoostBadge;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/** TCK-633 lot F (ADR-0061 §5, §7) — `ranked_at` suit la publication, et une copie n'hérite d'aucun boost. */
class BoostModelsTest extends TestCase
{
    use RefreshDatabase;

    public function test_ranked_at_prend_la_date_de_publication(): void
    {
        $at = Carbon::parse('2026-10-01 09:00:00');
        $property = Property::factory()->published()->create(['published_at' => $at]);

        $this->assertTrue($property->fresh()->ranked_at->equalTo($at));
    }

    public function test_une_republication_remonte_le_bien(): void
    {
        // Instants sans fraction : `timestamp(0)` ARRONDIT les microsecondes, il ne les tronque pas.
        $this->travelTo(Carbon::parse('2026-10-01 09:00:00'));
        $property = Property::factory()->published()->create(['published_at' => now()->subDays(10)]);
        $this->travelTo(Carbon::parse('2026-10-02 10:00:00'));

        $property->update(['published_at' => now()]);

        $this->assertTrue($property->fresh()->ranked_at->equalTo(Carbon::parse('2026-10-02 10:00:00')));
    }

    public function test_un_ranked_at_explicite_n_est_pas_ecrase(): void
    {
        $this->travelTo(Carbon::parse('2026-10-01 09:00:00'));
        $ranked = Carbon::parse('2026-10-01 09:30:00');
        $property = Property::factory()->published()->create(['published_at' => now(), 'ranked_at' => $ranked]);

        $this->assertTrue($property->fresh()->ranked_at->equalTo($ranked));
    }

    public function test_une_copie_n_herite_d_aucune_mise_en_avant(): void
    {
        $property = Property::factory()->published()->create([
            'featured' => true, 'sponsored_until' => now()->addDays(3),
            'badge' => BoostBadge::Urgent, 'badge_until' => now()->addDays(3),
        ]);

        $copie = $property->replicate();

        $this->assertFalse((bool) $copie->featured);
        $this->assertNull($copie->sponsored_until);
        $this->assertNull($copie->badge);
        $this->assertNull($copie->badge_until);
        $this->assertNull($copie->ranked_at);
    }

    public function test_relations(): void
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $boost = PropertyBoost::query()->create([
            'property_id' => $property->id, 'agency_id' => $agency->id, 'kind' => BoostKind::Bump,
            'price_credits' => 5, 'duration_days' => 0, 'starts_at' => now(), 'status' => BoostStatus::Ended,
        ]);

        $this->assertTrue($property->boosts()->whereKey($boost->id)->exists());
        $this->assertTrue($boost->property->is($property));
        $this->assertSame(0, $agency->creditLots()->count());
    }
}
```

`php artisan test tests/Feature/Boost/BoostModelsTest.php` → rouge (`Class "App\Models\Enums\BoostBadge" not found`).

**Étape 2.2 — énumérations** (`takussan-api/app/Models/Enums/`) :

```php
<?php

namespace App\Models\Enums;

/** TCK-633 lot F (ADR-0061 §5) — Remontée, Vedette, Badge. */
enum BoostKind: string
{
    case Bump = 'bump';
    case Featured = 'featured';
    case Badge = 'badge';
}
```

```php
<?php

namespace App\Models\Enums;

/** TCK-633 lot F (ADR-0061 §5, §8). */
enum BoostStatus: string
{
    case Active = 'active';
    case Paused = 'paused';
    case Ended = 'ended';
    case Cancelled = 'cancelled';
    case Refunded = 'refunded';

    /** @return list<self> les statuts d'un boost qui occupe encore le bien */
    public static function live(): array
    {
        return [self::Active, self::Paused];
    }
}
```

```php
<?php

namespace App\Models\Enums;

/** TCK-633 lot F (ADR-0061 §5) — un seul badge actif par bien. */
enum BoostBadge: string
{
    case Urgent = 'urgent';
    case PriceDrop = 'price_drop';
}
```

```php
<?php

namespace App\Models\Enums;

/** TCK-633 lot F (ADR-0061 §1) — `purchase` est réservé à la phase 2 (§11) : aucun code ne l'écrit. */
enum CreditLotOrigin: string
{
    case Welcome = 'welcome';
    case AdminGrant = 'admin_grant';
    case Refund = 'refund';
    case Purchase = 'purchase';
}
```

```php
<?php

namespace App\Models\Enums;

/** TCK-633 lot F (ADR-0061 §2). Positifs : grant, refund. Négatifs : spend, expire, admin_debit. */
enum CreditMovementType: string
{
    case Grant = 'grant';
    case Spend = 'spend';
    case Refund = 'refund';
    case Expire = 'expire';
    case AdminDebit = 'admin_debit';
}
```

**Étape 2.3 — modèles** (`takussan-api/app/Models/`) :

```php
<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\CreditLotOrigin;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * TCK-633 lot F (ADR-0061 §1) — un lot daté de crédits d'un espace. Écrit par
 * `App\Services\Credits\CreditLedger` SEUL : `remaining_amount` n'a de sens qu'adossé aux
 * mouvements qui l'expliquent.
 */
class CreditLot extends AbstractModel
{
    protected $fillable = [
        'agency_id', 'origin', 'initial_amount', 'remaining_amount', 'expires_at',
        'granted_by_id', 'reason', 'expiry_notice_sent_at',
    ];

    protected $casts = [
        'origin' => CreditLotOrigin::class,
        'initial_amount' => 'integer',
        'remaining_amount' => 'integer',
        'expires_at' => 'datetime',
        'expiry_notice_sent_at' => 'datetime',
    ];

    /** Un lot dont il reste quelque chose et qui n'a pas expiré. */
    public function scopeSpendable(Builder $query): Builder
    {
        return $query->where('remaining_amount', '>', 0)
            ->where(fn (Builder $q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }

    /** ADR-0061 §2 : expiration la plus proche d'abord, sans expiration en dernier, puis ancienneté. */
    public function scopeInConsumptionOrder(Builder $query): Builder
    {
        return $query->orderByRaw('expires_at ASC NULLS LAST')->orderBy('created_at')->orderBy('id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function grantedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'granted_by_id');
    }

    public function movements(): HasMany
    {
        return $this->hasMany(CreditMovement::class);
    }
}
```

```php
<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\CreditMovementType;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * TCK-633 lot F (ADR-0061 §2) — un mouvement du registre, en INSERTION SEULE. Le trigger
 * `credit_movements_append_only` le tient en base ; ce modèle le dit plus tôt, en PHP.
 */
class CreditMovement extends AbstractModel
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'agency_id', 'credit_lot_id', 'type', 'amount', 'property_boost_id', 'actor_id', 'reason',
    ];

    protected $casts = [
        'type' => CreditMovementType::class,
        'amount' => 'integer',
        'created_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::updating(static fn () => throw new LogicException('credit_movements est en insertion seule (ADR-0061).'));
        static::deleting(static fn () => throw new LogicException('credit_movements est en insertion seule (ADR-0061).'));
    }

    /** @param  array<string, mixed>  $attributes */
    public static function record(array $attributes): self
    {
        return static::query()->create($attributes);
    }

    public function lot(): BelongsTo
    {
        return $this->belongsTo(CreditLot::class, 'credit_lot_id');
    }

    public function boost(): BelongsTo
    {
        return $this->belongsTo(PropertyBoost::class, 'property_boost_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
```

```php
<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;

/** TCK-633 lot F (ADR-0061 §3) — le registre « une offre de bienvenue par numéro ». */
class CreditWelcomeGrant extends AbstractModel
{
    protected $fillable = ['phone_hash', 'agency_id', 'user_id', 'credit_lot_id', 'granted_at'];

    protected $casts = ['granted_at' => 'datetime'];
}
```

```php
<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\BoostBadge;
use App\Models\Enums\BoostKind;

/** TCK-633 lot F (ADR-0061 §4) — une offre du catalogue. Prix et durée se FIGENT dans le boost acheté. */
class BoostProduct extends AbstractModel
{
    protected $fillable = ['kind', 'variant', 'duration_days', 'price_credits', 'is_active', 'sort_order'];

    protected $casts = [
        'kind' => BoostKind::class,
        'variant' => BoostBadge::class,
        'duration_days' => 'integer',
        'price_credits' => 'integer',
        'is_active' => 'boolean',
        'sort_order' => 'integer',
    ];
}
```

```php
<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\BoostBadge;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** TCK-633 lot F (ADR-0061 §5, §8) — un boost acheté ou offert. Écrit par `App\Services\Boost\*` seul. */
class PropertyBoost extends AbstractModel
{
    protected $fillable = [
        'property_id', 'agency_id', 'boost_product_id', 'kind', 'variant', 'price_credits', 'duration_days',
        'starts_at', 'ends_at', 'status', 'remaining_seconds', 'paused_at', 'ended_at', 'offered',
        'offer_reason', 'purchased_by_id', 'cancel_reason', 'cancelled_by_id', 'refunded_credits',
    ];

    protected $casts = [
        'kind' => BoostKind::class,
        'variant' => BoostBadge::class,
        'status' => BoostStatus::class,
        'price_credits' => 'integer',
        'duration_days' => 'integer',
        'remaining_seconds' => 'integer',
        'refunded_credits' => 'integer',
        'offered' => 'boolean',
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'paused_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class)->withTrashed();
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(BoostProduct::class, 'boost_product_id');
    }

    public function dailyStats(): HasMany
    {
        return $this->hasMany(PropertyBoostDailyStat::class);
    }
}
```

```php
<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;

/** TCK-633 lot F (ADR-0061 §10) — impressions et clics d'un boost, par jour (UTC). */
class PropertyBoostDailyStat extends AbstractModel
{
    protected $fillable = ['property_boost_id', 'date', 'impressions', 'clicks'];

    protected $casts = ['date' => 'date', 'impressions' => 'integer', 'clicks' => 'integer'];
}
```

**Étape 2.4 — Edit `takussan-api/app/Models/Property.php`** (co-tenu, quatre blocs).

(a) casts — ancre `'platform_hold_at' => 'datetime',` (l. 88) ; remplacer par :

```php
        'platform_hold_at' => 'datetime',
        // TCK-633 lot F (ADR-0061 §5, §7) — projections des boosts, écrites par `BoostLifecycle` seul.
        'ranked_at' => 'datetime',
        'sponsored_until' => 'datetime',
        'badge' => \App\Models\Enums\BoostBadge::class,
        'badge_until' => 'datetime',
```

(b) `$queryFields` — ancre `'deposit_months', 'advance_months', 'agency_fee_months', 'monthly_charges', 'virtual_tour_url',` (l. 134) ; remplacer par :

```php
        'deposit_months', 'advance_months', 'agency_fee_months', 'monthly_charges', 'virtual_tour_url',
        'ranked_at', 'sponsored_until', 'badge', 'badge_until',
```

(c) `booted()` — ancre (l. 168-172) :

```php
        // TCK-086 — soft-cascade: detach children when the parent is (soft-)deleted.
```

insérer **avant** elle :

```php
        // TCK-633 lot F (ADR-0061 §7) — l'ordre organique est `ranked_at`. Une (re)publication le
        // porte à la date de publication, sauf s'il est déjà plus récent (une Remontée) ou s'il est
        // écrit explicitement dans la même sauvegarde.
        static::saving(function (self $m) {
            if ($m->published_at !== null && $m->isDirty('published_at') && ! $m->isDirty('ranked_at')
                && ($m->ranked_at === null || $m->ranked_at->lt($m->published_at))) {
                $m->ranked_at = $m->published_at;
            }
        });

        // TCK-633 lot F (ADR-0061 §5) — une copie (`PropertyDuplicationService`) n'hérite d'aucune
        // mise en avant : elles sont attachées à des boosts payés pour l'original.
        static::replicating(function (self $m) {
            $m->forceFill(['featured' => false, 'sponsored_until' => null, 'badge' => null, 'badge_until' => null, 'ranked_at' => null]);
        });

```

(d) relation — ancre la dernière accolade de la classe : chercher `public function agency(): BelongsTo` dans
la zone 775-911, et insérer **avant** cette méthode :

```php
    /** TCK-633 lot F (ADR-0061 §5). */
    public function boosts(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(PropertyBoost::class);
    }

```

> Relu : `PropertyFactory::definition()` passe par `Model::unguarded()` (fabrique Laravel), donc
> `ranked_at` explicite dans un test est bien écrit sans entrer dans `$fillable`. `featured` **reste**
> dans `$fillable` (l. 50-64) : fabriques et seeders l'écrivent ; la protection est à la requête (T11).

**Étape 2.5 — Edit `takussan-api/app/Models/Agency.php`** (co-tenu F seul).

(a) ancre `use Illuminate\Database\Eloquent\Factories\HasFactory;` → remplacer par :

```php
use App\Observers\AgencyBoostObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
```

(b) ancre `class Agency extends AbstractModel implements HasMedia` → remplacer par :

```php
/** TCK-633 lot F (ADR-0061 §8) — suspendre ou réactiver l'espace met en pause ou reprend ses boosts. */
#[ObservedBy([AgencyBoostObserver::class])]
class Agency extends AbstractModel implements HasMedia
```

(c) ancre `    public function primaryAdmin(): BelongsTo` → insérer **avant** :

```php
    /** TCK-633 lot F (ADR-0061 §1). */
    public function creditLots(): HasMany
    {
        return $this->hasMany(CreditLot::class);
    }

```

L'observateur doit exister pour que la classe se charge ; créer dès maintenant
`takussan-api/app/Observers/AgencyBoostObserver.php` (sa logique arrive en T12) :

```php
<?php

namespace App\Observers;

use App\Models\Agency;

/** TCK-633 lot F (ADR-0061 §8) — branché en tâche 12. */
class AgencyBoostObserver
{
    public function updated(Agency $agency): void {}
}
```

**Étape 2.6 — vert.** `php artisan test tests/Feature/Boost/BoostModelsTest.php` → `Tests: 5 passed`.

**Étape 2.7 — ablation.** Retirer le hook `replicating` :

```bash
cd takussan-api && F=app/Models/Property.php && cp "$F" "${TMPDIR:-/tmp}/tck633f/Property.php" && md5 -q "$F" \
 && perl -0pi -e 's/static::replicating\(function \(self \$m\) \{.*?\}\);//s' "$F" \
 && php artisan test tests/Feature/Boost/BoostModelsTest.php --filter=copie ; \
 cp "${TMPDIR:-/tmp}/tck633f/Property.php" "$F" && md5 -q "$F"
```

Attendu : `test_une_copie_n_herite_d_aucune_mise_en_avant` rouge, `md5` identiques.

**Étape 2.8 — signaler à la session les fichiers à commiter :** 5 énumérations, 6 modèles,
`app/Observers/AgencyBoostObserver.php`, `app/Models/Property.php`, `app/Models/Agency.php`,
`tests/Feature/Boost/BoostModelsTest.php` (après `./vendor/bin/pint` sur ces fichiers).

---

## Tâche 3 — Réglages plateforme (six valeurs) et leur lecteur

**Fichiers :** Edit `app/Domain/Settings/EditablePlatformSettings.php` ; créer
`app/Services/Boost/BoostSettings.php`, `tests/Feature/Boost/BoostSettingsTest.php`. **Collision C5.**

**Étape 3.1 — test (rouge).** `takussan-api/tests/Feature/Boost/BoostSettingsTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Domain\Settings\EditablePlatformSettings;
use App\Models\User;
use App\Services\Admin\PlatformSettingService;
use App\Services\Boost\BoostSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/** TCK-633 lot F (ADR-0061 §6, AC16) — six réglages, leurs défauts, leurs bornes, et un seul lecteur. */
class BoostSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_les_defauts_sont_ceux_de_l_adr(): void
    {
        $s = app(BoostSettings::class);

        $this->assertSame(500, $s->welcomeAmount());
        $this->assertSame(180, $s->welcomeValidityDays());
        $this->assertSame(7, $s->expiryNoticeDays());
        $this->assertSame(24, $s->bumpCooldownHours());
        $this->assertSame(3, $s->sponsoredSlotsPerPage());
        $this->assertSame(2, $s->reservedTopResults());
    }

    public function test_une_valeur_reglee_par_la_console_est_lue(): void
    {
        app(PlatformSettingService::class)->bulkUpdate(['boost.reserved_top_results' => 0, 'credits.welcome_amount' => 250], User::factory()->create());

        $this->assertSame(0, app(BoostSettings::class)->reservedTopResults());
        $this->assertSame(250, app(BoostSettings::class)->welcomeAmount());
    }

    public function test_les_bornes_sont_appliquees(): void
    {
        $this->expectException(ValidationException::class);
        app(PlatformSettingService::class)->bulkUpdate(['boost.sponsored_slots_per_page' => 50], User::factory()->create());
    }

    public function test_les_six_cles_sont_au_catalogue(): void
    {
        foreach (['credits.welcome_amount', 'credits.welcome_validity_days', 'credits.expiry_notice_days', 'boost.bump_cooldown_hours', 'boost.sponsored_slots_per_page', 'boost.reserved_top_results'] as $cle) {
            $this->assertTrue(EditablePlatformSettings::has($cle), $cle);
            $this->assertSame('boost', EditablePlatformSettings::get($cle)['category']);
        }
    }
}
```

Rouge : `Class "App\Services\Boost\BoostSettings" not found`.

**Étape 3.2 — Edit `EditablePlatformSettings.php`** (F seul). Ancre (l. 47-54) :

```php
            'platform.session_max_minutes' => [
                'category' => 'limits',
                'type' => 'integer',
                'default' => 480,
                'public' => false,
                'requires_restart' => true,
                'rules' => ['required', 'integer', 'min:15', 'max:1440'],
            ],
```

ajouter **après** ce bloc :

```php
            // TCK-633 lot F (ADR-0061 §6) — crédits et mise en avant. Lus par `App\Services\Boost\BoostSettings`.
            'credits.welcome_amount' => [
                'category' => 'boost', 'type' => 'integer', 'default' => 500, 'public' => false,
                'rules' => ['required', 'integer', 'min:0', 'max:100000'],
            ],
            'credits.welcome_validity_days' => [
                'category' => 'boost', 'type' => 'integer', 'default' => 180, 'public' => false,
                'rules' => ['required', 'integer', 'min:1', 'max:3650'],
            ],
            'credits.expiry_notice_days' => [
                'category' => 'boost', 'type' => 'integer', 'default' => 7, 'public' => false,
                'rules' => ['required', 'integer', 'min:0', 'max:90'],
            ],
            'boost.bump_cooldown_hours' => [
                'category' => 'boost', 'type' => 'integer', 'default' => 24, 'public' => false,
                'rules' => ['required', 'integer', 'min:0', 'max:720'],
            ],
            'boost.sponsored_slots_per_page' => [
                'category' => 'boost', 'type' => 'integer', 'default' => 3, 'public' => false,
                'rules' => ['required', 'integer', 'min:0', 'max:10'],
            ],
            'boost.reserved_top_results' => [
                'category' => 'boost', 'type' => 'integer', 'default' => 2, 'public' => false,
                'rules' => ['required', 'integer', 'min:0', 'max:10'],
            ],
```

**Étape 3.3 — lecteur.** `takussan-api/app/Services/Boost/BoostSettings.php` — chaque lecture est
littérale (`scripts/check-platform-catalogue-readers.mjs` exige `getValue('clé')`) :

```php
<?php

namespace App\Services\Boost;

use App\Services\Admin\PlatformSettingService;

/** TCK-633 lot F (ADR-0061 §6) — le seul lecteur des six réglages du crédit et du boost. */
final class BoostSettings
{
    public function __construct(private readonly PlatformSettingService $settings) {}

    public function welcomeAmount(): int
    {
        return (int) $this->settings->getValue('credits.welcome_amount');
    }

    public function welcomeValidityDays(): int
    {
        return (int) $this->settings->getValue('credits.welcome_validity_days');
    }

    public function expiryNoticeDays(): int
    {
        return (int) $this->settings->getValue('credits.expiry_notice_days');
    }

    public function bumpCooldownHours(): int
    {
        return (int) $this->settings->getValue('boost.bump_cooldown_hours');
    }

    public function sponsoredSlotsPerPage(): int
    {
        return (int) $this->settings->getValue('boost.sponsored_slots_per_page');
    }

    public function reservedTopResults(): int
    {
        return (int) $this->settings->getValue('boost.reserved_top_results');
    }
}
```

**Étape 3.4 — vert.** `php artisan test tests/Feature/Boost/BoostSettingsTest.php` → `4 passed` ;
`node ../scripts/check-platform-catalogue-readers.mjs` → vert.

**Étape 3.5 — ablation.** Remplacer `'max:10'],` de `boost.sponsored_slots_per_page` par `'max:100'],`
(perl ciblé sur la ligne qui suit `boost.sponsored_slots_per_page`), relancer
`--filter=bornes` → rouge (`Failed asserting that exception of type ValidationException is thrown`),
restaurer par `cp`, `md5` identiques.

**Collision C5 (à recopier dans le rapport)** — `tests/Feature/Admin/Platform/PlatformSettingsCatalogueTest.php`,
dans les deux assertions (l. 19-22 et 31-34), remplacer la liste
`['currency.default', 'currency.supported', 'platform.session_max_minutes']` par :

```php
[
    'currency.default', 'currency.supported', 'platform.session_max_minutes',
    'credits.welcome_amount', 'credits.welcome_validity_days', 'credits.expiry_notice_days',
    'boost.bump_cooldown_hours', 'boost.sponsored_slots_per_page', 'boost.reserved_top_results',
]
```

et renommer `test_le_catalogue_se_reduit_aux_trois_cles_lues` en
`test_le_catalogue_se_reduit_aux_neuf_cles_lues`. Test différé (C5) :
`php artisan test tests/Feature/Admin/Platform/PlatformSettingsCatalogueTest.php`.

**Étape 3.6 — signaler à la session les fichiers à commiter :** `EditablePlatformSettings.php`,
`app/Services/Boost/BoostSettings.php`, `tests/Feature/Boost/BoostSettingsTest.php` ; collision C5.

---

## Tâche 4 — Le registre : `CreditLedger`, invariant et ordre de consommation

**Fichiers :** créer `app/Support/PhoneFingerprint.php`, `app/Services/Credits/CreditLedger.php`,
`app/Services/Credits/InsufficientCredits.php`, `tests/Feature/Credits/CreditLedgerInvariantTest.php`,
`tests/Feature/Credits/CreditConsumptionOrderTest.php`, `tests/Unit/Support/PhoneFingerprintTest.php`.

**Étape 4.1 — tests (rouges).**

`takussan-api/tests/Feature/Credits/CreditLedgerInvariantTest.php` :

```php
<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\CreditMovement;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\CreditMovementType;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\User;
use App\Services\Credits\CreditLedger;
use App\Services\Credits\InsufficientCredits;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use LogicException;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §2) — l'invariant du registre, vérifiable ligne à ligne :
 *   · chaque lot a EXACTEMENT un mouvement positif, égal à son montant initial ;
 *   · montant initial + somme de ses mouvements négatifs = restant.
 * Et le solde est la somme des restants des lots non expirés.
 */
class CreditLedgerInvariantTest extends TestCase
{
    use RefreshDatabase;

    private CreditLedger $ledger;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ledger = app(CreditLedger::class);
    }

    public function test_un_parcours_complet_tient_l_invariant(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create();

        $this->ledger->grant($agency, CreditLotOrigin::Welcome, 500, now()->addDays(180));
        $this->ledger->grant($agency, CreditLotOrigin::AdminGrant, 40, now()->addDays(2), $admin, 'Geste commercial');
        // 120 : les 40 de l'octroi (expiration la plus proche) puis 80 de la bienvenue → 420.
        $this->ledger->spend($agency, 120);
        // 30 : bienvenue → 390.
        $this->ledger->spend($agency, 30, CreditMovementType::AdminDebit, null, $admin, 'Correction');
        $this->ledger->grant($agency, CreditLotOrigin::AdminGrant, 25, now()->addDay(), $admin, 'Essai');

        $this->travel(3)->days();
        // Le lot de 25, intact, expire ; celui de 40, déjà vide, n'a rien à expirer.
        $this->assertSame(1, $this->ledger->expireDue());

        $boost = $this->boost($agency);
        // 20 : bienvenue → 370 ; puis 12 remboursés dans un lot `refund`.
        $this->ledger->spend($agency, 20, CreditMovementType::Spend, $boost);
        $this->ledger->refund($boost, 12);

        $this->assertSame([], $this->ledger->invariantViolations());
        $this->assertSame(382, $this->ledger->balance($agency));

        foreach (CreditLot::query()->where('agency_id', $agency->id)->get() as $lot) {
            $positifs = CreditMovement::query()->where('credit_lot_id', $lot->id)->where('amount', '>', 0)->get();
            $this->assertCount(1, $positifs, "lot {$lot->id}");
            $this->assertSame($lot->initial_amount, $positifs->first()->amount);
        }
    }

    public function test_le_controle_voit_un_restant_falsifie(): void
    {
        $agency = Agency::factory()->create();
        $lot = $this->ledger->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDays(10));

        DB::table('credit_lots')->where('id', $lot->id)->update(['remaining_amount' => 99]);

        $this->assertSame([$lot->id], $this->ledger->invariantViolations());
    }

    public function test_un_lot_expire_ne_compte_plus_et_se_solde_par_un_mouvement(): void
    {
        $agency = Agency::factory()->create();
        $lot = $this->ledger->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDay());

        $this->travel(2)->days();

        $this->assertSame(0, $this->ledger->balance($agency));
        $this->assertSame(1, $this->ledger->expireDue());
        $this->assertSame(0, $this->ledger->expireDue(), 'expirer deux fois ne crée pas deux mouvements');
        $this->assertSame(0, $lot->fresh()->remaining_amount);
        $this->assertSame(-100, (int) CreditMovement::query()->where('credit_lot_id', $lot->id)->where('type', CreditMovementType::Expire)->value('amount'));
        $this->assertSame([], $this->ledger->invariantViolations());
    }

    public function test_un_solde_insuffisant_n_ecrit_rien(): void
    {
        $agency = Agency::factory()->create();
        $this->ledger->grant($agency, CreditLotOrigin::Welcome, 10, now()->addDays(10));
        $avant = CreditMovement::query()->count();

        try {
            $this->ledger->spend($agency, 11);
            $this->fail('dépense au-delà du solde acceptée');
        } catch (InsufficientCredits $e) {
            $this->assertSame(1, $e->missing());
            $this->assertSame(10, $e->balance);
        }

        $this->assertSame($avant, CreditMovement::query()->count());
        $this->assertSame(10, $this->ledger->balance($agency));
    }

    public function test_un_montant_nul_ou_negatif_est_refuse(): void
    {
        $agency = Agency::factory()->create();

        $this->expectException(InvalidArgumentException::class);
        $this->ledger->grant($agency, CreditLotOrigin::Welcome, 0, null);
    }

    public function test_l_achat_de_credits_reste_la_phase_2(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->ledger->grant(Agency::factory()->create(), CreditLotOrigin::Purchase, 10, null);
    }

    public function test_un_mouvement_ne_se_modifie_pas_par_le_modele(): void
    {
        $agency = Agency::factory()->create();
        $lot = $this->ledger->grant($agency, CreditLotOrigin::Welcome, 10, null);
        $mouvement = CreditMovement::query()->where('credit_lot_id', $lot->id)->firstOrFail();

        $this->expectException(LogicException::class);
        $mouvement->update(['reason' => 'réécrit']);
    }

    public function test_le_remboursement_herite_de_l_expiration_la_plus_lointaine(): void
    {
        $agency = Agency::factory()->create();
        $this->ledger->grant($agency, CreditLotOrigin::Welcome, 10, now()->addDays(5));
        $this->ledger->grant($agency, CreditLotOrigin::AdminGrant, 10, now()->addDays(30));
        $boost = $this->boost($agency);
        $this->ledger->spend($agency, 15, CreditMovementType::Spend, $boost);

        $lot = $this->ledger->refund($boost, 6);

        $this->assertSame(CreditLotOrigin::Refund, $lot->origin);
        $this->assertTrue($lot->expires_at->isSameDay(now()->addDays(30)));

        // Un lot débité sans expiration → remboursement sans expiration.
        $agency2 = Agency::factory()->create();
        $this->ledger->grant($agency2, CreditLotOrigin::AdminGrant, 5, now()->addDays(5));
        DB::table('credit_lots')->insert(['agency_id' => $agency2->id, 'origin' => 'admin_grant', 'initial_amount' => 1, 'remaining_amount' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $sansExpiration = CreditLot::query()->where('agency_id', $agency2->id)->whereNull('expires_at')->firstOrFail();
        CreditMovement::record(['agency_id' => $agency2->id, 'credit_lot_id' => $sansExpiration->id, 'type' => CreditMovementType::Grant, 'amount' => 1]);
        $boost2 = $this->boost($agency2);
        $this->ledger->spend($agency2, 6, CreditMovementType::Spend, $boost2);

        $this->assertNull($this->ledger->refund($boost2, 3)->expires_at);
    }

    private function boost(Agency $agency): PropertyBoost
    {
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);

        return PropertyBoost::query()->create([
            'property_id' => $property->id, 'agency_id' => $agency->id, 'kind' => BoostKind::Featured,
            'price_credits' => 20, 'duration_days' => 7, 'starts_at' => now(), 'ends_at' => now()->addDays(7),
            'status' => BoostStatus::Active,
        ]);
    }
}
```

`takussan-api/tests/Feature/Credits/CreditConsumptionOrderTest.php` :

```php
<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\CreditMovement;
use App\Models\Enums\CreditLotOrigin;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §2) — l'ordre de consommation : l'expiration la plus proche d'abord, les
 * lots sans expiration en dernier, puis l'ancienneté ; un mouvement par lot entamé.
 */
class CreditConsumptionOrderTest extends TestCase
{
    use RefreshDatabase;

    public function test_l_ordre_de_consommation(): void
    {
        $ledger = app(CreditLedger::class);
        $agency = Agency::factory()->create();

        $this->travelTo(now()->startOfDay());
        $a = $ledger->grant($agency, CreditLotOrigin::AdminGrant, 100, now()->addDays(30));
        $c = $ledger->grant($agency, CreditLotOrigin::AdminGrant, 200, null);
        $b = $ledger->grant($agency, CreditLotOrigin::Welcome, 50, now()->addDays(10));
        $this->travel(1)->minutes();
        // Créé APRÈS `b` mais expirant AVANT lui : l'expiration la plus proche prime sur l'ancienneté.
        $d = $ledger->grant($agency, CreditLotOrigin::AdminGrant, 40, now()->addDays(9));
        $echu = $ledger->grant($agency, CreditLotOrigin::AdminGrant, 999, now()->addMinutes(2));
        $this->travel(5)->minutes();

        $premiers = $ledger->spend($agency, 120);

        $this->assertSame(
            [[$d->id, -40], [$b->id, -50], [$a->id, -30]],
            array_map(fn (CreditMovement $m) => [$m->credit_lot_id, $m->amount], $premiers),
        );

        $suivants = $ledger->spend($agency, 100);

        $this->assertSame(
            [[$a->id, -70], [$c->id, -30]],
            array_map(fn (CreditMovement $m) => [$m->credit_lot_id, $m->amount], $suivants),
        );
        $this->assertSame(999, $echu->fresh()->remaining_amount, 'un lot échu n’est jamais consommé');
        $this->assertSame(170, $ledger->balance($agency));
    }
}
```

Second test de la même classe — à expiration égale, l'ancienneté départage (ajouter avant la
dernière accolade de la classe) :

```php
    public function test_a_expiration_egale_l_anciennete_departage(): void
    {
        $ledger = app(CreditLedger::class);
        $agency = Agency::factory()->create();
        $this->travelTo(now()->startOfDay());
        $expire = now()->addDays(10);
        $ancien = $ledger->grant($agency, CreditLotOrigin::Welcome, 10, $expire);
        $this->travel(1)->minutes();
        $recent = $ledger->grant($agency, CreditLotOrigin::AdminGrant, 10, $expire);

        $mouvements = $ledger->spend($agency, 15);

        $this->assertSame([[$ancien->id, -10], [$recent->id, -5]], array_map(fn (CreditMovement $m) => [$m->credit_lot_id, $m->amount], $mouvements));
    }
```

`takussan-api/tests/Unit/Support/PhoneFingerprintTest.php` (étend `Tests\TestCase` : lit `config('app.key')`) :

```php
<?php

namespace Tests\Unit\Support;

use App\Support\PhoneFingerprint;
use Tests\TestCase;

/** TCK-633 lot F (interface C → F) — une empreinte par NUMÉRO, quelle qu'en soit l'écriture. */
class PhoneFingerprintTest extends TestCase
{
    public function test_deux_ecritures_du_meme_numero_ont_la_meme_empreinte(): void
    {
        $this->assertSame(PhoneFingerprint::of('+221771234567'), PhoneFingerprint::of('77 123 45 67'));
        $this->assertSame(PhoneFingerprint::of('+221771234567'), PhoneFingerprint::of('00221771234567'));
        $this->assertNotSame(PhoneFingerprint::of('+221771234567'), PhoneFingerprint::of('+221771234568'));
        $this->assertSame(64, strlen(PhoneFingerprint::of('+221771234567')));
    }

    public function test_l_empreinte_depend_de_la_cle(): void
    {
        $avant = PhoneFingerprint::of('+221771234567');
        config(['app.key' => 'base64:'.base64_encode(str_repeat('k', 32))]);

        $this->assertNotSame($avant, PhoneFingerprint::of('+221771234567'));
    }
}
```

Lancer les trois → rouges (`Class "App\Services\Credits\CreditLedger" not found`).

**Étape 4.2 — `takussan-api/app/Support/PhoneFingerprint.php`** :

```php
<?php

namespace App\Support;

/**
 * TCK-633 lot F (ADR-0061 §3, interface C → F du plan maître) — l'empreinte d'un numéro : HMAC
 * sha256 de sa forme canonique, clé `app.key`. Même construction que
 * `AlertSubscriber::contactHash()` ; le numéro en clair n'est jamais conservé.
 */
final class PhoneFingerprint
{
    public static function of(string $e164): string
    {
        return hash_hmac('sha256', 'phone|'.CanonicalPhone::fold($e164), (string) config('app.key'));
    }
}
```

**Étape 4.3 — `takussan-api/app/Services/Credits/InsufficientCredits.php`** :

```php
<?php

namespace App\Services\Credits;

use RuntimeException;

/** TCK-633 lot F — solde insuffisant ; l'appelant HTTP le traduit en 422 `credits.insufficient`. */
final class InsufficientCredits extends RuntimeException
{
    public function __construct(public readonly int $required, public readonly int $balance)
    {
        parent::__construct("Solde insuffisant : {$balance} pour {$required}.");
    }

    public function missing(): int
    {
        return max(0, $this->required - $this->balance);
    }
}
```

**Étape 4.4 — `takussan-api/app/Services/Credits/CreditLedger.php`** :

```php
<?php

namespace App\Services\Credits;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\CreditMovement;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\CreditMovementType;
use App\Models\PropertyBoost;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * TCK-633 lot F (ADR-0061 §1, §2) — le SEUL écrivain de `credit_lots` et `credit_movements`.
 *
 * Toute écriture qui débite passe par le même point de sérialisation : la ligne `agencies` de
 * l'espace, verrouillée AVANT la lecture des lots (piège PostgreSQL n°2 : on ne verrouille pas un
 * agrégat, on verrouille le parent). Les crédits sont des ENTIERS : jamais ×100.
 */
final class CreditLedger
{
    public function balance(Agency|int $agency): int
    {
        $id = $agency instanceof Agency ? $agency->getKey() : $agency;

        return (int) CreditLot::query()->where('agency_id', $id)->spendable()->sum('remaining_amount');
    }

    public function grant(
        Agency $agency,
        CreditLotOrigin $origin,
        int $amount,
        ?CarbonInterface $expiresAt,
        ?User $actor = null,
        ?string $reason = null,
        ?PropertyBoost $boost = null,
    ): CreditLot {
        if ($amount <= 0) {
            throw new InvalidArgumentException('Un lot porte un montant strictement positif.');
        }
        if ($origin === CreditLotOrigin::Purchase) {
            throw new InvalidArgumentException('L’achat de crédits est la phase 2 (ADR-0061 §11).');
        }

        return DB::transaction(function () use ($agency, $origin, $amount, $expiresAt, $actor, $reason, $boost): CreditLot {
            $lot = CreditLot::query()->create([
                'agency_id' => $agency->getKey(),
                'origin' => $origin,
                'initial_amount' => $amount,
                'remaining_amount' => $amount,
                'expires_at' => $expiresAt,
                'granted_by_id' => $actor?->getKey(),
                'reason' => $reason,
            ]);

            CreditMovement::record([
                'agency_id' => $agency->getKey(),
                'credit_lot_id' => $lot->getKey(),
                'type' => $origin === CreditLotOrigin::Refund ? CreditMovementType::Refund : CreditMovementType::Grant,
                'amount' => $amount,
                'property_boost_id' => $boost?->getKey(),
                'actor_id' => $actor?->getKey(),
                'reason' => $reason,
            ]);

            return $lot;
        });
    }

    /**
     * Débite `$amount` crédits dans l'ordre de consommation, un mouvement par lot entamé.
     *
     * @return list<CreditMovement>
     *
     * @throws InsufficientCredits
     */
    public function spend(
        Agency $agency,
        int $amount,
        CreditMovementType $type = CreditMovementType::Spend,
        ?PropertyBoost $boost = null,
        ?User $actor = null,
        ?string $reason = null,
    ): array {
        if ($amount <= 0) {
            throw new InvalidArgumentException('Une dépense porte un montant strictement positif.');
        }
        if (! in_array($type, [CreditMovementType::Spend, CreditMovementType::AdminDebit], true)) {
            throw new InvalidArgumentException("Type de débit invalide : {$type->value}.");
        }

        return DB::transaction(function () use ($agency, $amount, $type, $boost, $actor, $reason): array {
            // 1. Le point de sérialisation : la ligne PARENT.
            Agency::query()->whereKey($agency->getKey())->lockForUpdate()->firstOrFail();

            // 2. Les lots se lisent APRÈS le verrou : lus avant, ils seraient périmés pour qui attendait.
            $lots = CreditLot::query()
                ->where('agency_id', $agency->getKey())
                ->spendable()
                ->inConsumptionOrder()
                ->get();

            $balance = (int) $lots->sum('remaining_amount');
            if ($balance < $amount) {
                throw new InsufficientCredits($amount, $balance);
            }

            $left = $amount;
            $movements = [];
            foreach ($lots as $lot) {
                if ($left === 0) {
                    break;
                }
                $take = min($left, $lot->remaining_amount);
                $lot->forceFill(['remaining_amount' => $lot->remaining_amount - $take])->save();
                $movements[] = CreditMovement::record([
                    'agency_id' => $agency->getKey(),
                    'credit_lot_id' => $lot->getKey(),
                    'type' => $type,
                    'amount' => -$take,
                    'property_boost_id' => $boost?->getKey(),
                    'actor_id' => $actor?->getKey(),
                    'reason' => $reason,
                ]);
                $left -= $take;
            }

            return $movements;
        });
    }

    /**
     * ADR-0061 §8 — un remboursement est un lot `refund` qui hérite de l'expiration la plus
     * lointaine des lots que le boost a débités, nulle si l'un d'eux n'expirait pas.
     */
    public function refund(PropertyBoost $boost, int $amount, ?User $actor = null, ?string $reason = null): ?CreditLot
    {
        if ($amount <= 0) {
            return null;
        }

        $agency = Agency::withTrashed()->findOrFail($boost->agency_id);
        $lotIds = CreditMovement::query()
            ->where('property_boost_id', $boost->getKey())
            ->where('type', CreditMovementType::Spend)
            ->pluck('credit_lot_id');
        $lots = CreditLot::query()->whereIn('id', $lotIds)->get(['id', 'expires_at']);

        $expiresAt = $lots->isEmpty() || $lots->contains(fn (CreditLot $lot) => $lot->expires_at === null)
            ? null
            : $lots->max('expires_at');

        return $this->grant($agency, CreditLotOrigin::Refund, $amount, $expiresAt, $actor, $reason, $boost);
    }

    /** ADR-0061 §1 — un crédit (lot `admin_grant`) ou un débit (`admin_debit`) manuel, motivé. */
    public function adminAdjust(Agency $agency, int $amount, User $actor, string $reason, int $validityDays): ?CreditLot
    {
        if ($amount > 0) {
            return $this->grant($agency, CreditLotOrigin::AdminGrant, $amount, now()->addDays($validityDays), $actor, $reason);
        }

        $this->spend($agency, -$amount, CreditMovementType::AdminDebit, null, $actor, $reason);

        return null;
    }

    /** ADR-0061 §9 — solde chaque lot échu par un mouvement `expire`. Idempotent. Rend le nombre de lots expirés. */
    public function expireDue(): int
    {
        $count = 0;
        $agencyIds = CreditLot::query()
            ->where('remaining_amount', '>', 0)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->distinct()
            ->pluck('agency_id');

        foreach ($agencyIds as $agencyId) {
            DB::transaction(function () use ($agencyId, &$count): void {
                Agency::withTrashed()->whereKey($agencyId)->lockForUpdate()->first();
                $lots = CreditLot::query()
                    ->where('agency_id', $agencyId)
                    ->where('remaining_amount', '>', 0)
                    ->whereNotNull('expires_at')
                    ->where('expires_at', '<=', now())
                    ->get();
                foreach ($lots as $lot) {
                    $amount = $lot->remaining_amount;
                    $lot->forceFill(['remaining_amount' => 0])->save();
                    CreditMovement::record([
                        'agency_id' => $agencyId,
                        'credit_lot_id' => $lot->getKey(),
                        'type' => CreditMovementType::Expire,
                        'amount' => -$amount,
                    ]);
                    $count++;
                }
            });
        }

        return $count;
    }

    /**
     * Les lots qui violent l'invariant (ADR-0061 §2). Vide quand le registre est sain.
     *
     * @return list<int>
     */
    public function invariantViolations(?int $agencyId = null): array
    {
        return DB::table('credit_lots as l')
            ->leftJoin('credit_movements as m', 'm.credit_lot_id', '=', 'l.id')
            ->when($agencyId !== null, fn ($q) => $q->where('l.agency_id', $agencyId))
            ->groupBy('l.id', 'l.initial_amount', 'l.remaining_amount')
            ->havingRaw('l.initial_amount + COALESCE(SUM(CASE WHEN m.amount < 0 THEN m.amount ELSE 0 END), 0) <> l.remaining_amount')
            ->orHavingRaw('COALESCE(SUM(CASE WHEN m.amount > 0 THEN m.amount ELSE 0 END), 0) <> l.initial_amount')
            ->orHavingRaw('COUNT(CASE WHEN m.amount > 0 THEN 1 END) <> 1')
            ->orderBy('l.id')
            ->pluck('l.id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}
```

**Étape 4.5 — vert.**

```bash
cd takussan-api && php artisan test tests/Feature/Credits/CreditLedgerInvariantTest.php \
 && php artisan test tests/Feature/Credits/CreditConsumptionOrderTest.php \
 && php artisan test tests/Unit/Support/PhoneFingerprintTest.php
```

Attendu : `8 passed`, `2 passed`, `2 passed`.

**Étape 4.6 — ablations** (chacune : `cp` dans `${TMPDIR:-/tmp}/tck633f`, `md5 -q`, retrait, test,
`cp` retour, `md5 -q`) :

1. Ordre : remplacer `orderByRaw('expires_at ASC NULLS LAST')` par `orderByRaw('expires_at DESC NULLS LAST')`
   dans `app/Models/CreditLot.php` → `CreditConsumptionOrderTest` rouge (2 échecs).
2. Restant non décrémenté : dans `spend()`, remplacer `$lot->remaining_amount - $take` par
   `$lot->remaining_amount` → `test_un_parcours_complet_tient_l_invariant` rouge
   (`invariantViolations()` non vide).
3. Lots échus consommés : retirer `->spendable()` dans `spend()` → `test_l_ordre_de_consommation`
   rouge (le lot de 999 est entamé).

**Étape 4.7 — signaler à la session les fichiers à commiter :** `app/Support/PhoneFingerprint.php`,
`app/Services/Credits/{CreditLedger,InsufficientCredits}.php`, les trois tests.

---

## Tâche 5 — `CreditConcurrentSpendTest` : la course, prouvée sur deux connexions réelles

**Le problème.** Sous `RefreshDatabase`, tout le test vit dans UNE transaction de la connexion
Laravel : une seconde connexion ne voit pas ses lignes, ne peut pas verrouiller la ligne d'agence, et
un « test de concurrence » fait dans ces conditions est séquentiel — il serait vert sans aucun verrou.

**La forme retenue, et pourquoi elle est honnête.** Un seul processus PHP, **deux connexions
PostgreSQL** :

- la classe garde `RefreshDatabase` (c'est lui qui migre, et `TestDatabaseIsolationTest` rappelle que
  sans l'un des quatre traits la base n'est pas renommée) mais surcharge `connectionsToTransact()` en
  `[]` : les lignes sont **commitées**, donc visibles et verrouillables par une autre connexion ;
- la connexion B (extension `pgsql`, installée en CI — `.github/workflows/api-ci.yml:117` — et en
  local, mesuré `php -m`) ouvre une transaction, **verrouille la ligne `agencies`**, débite le lot
  entier, puis envoie `SELECT pg_sleep(1); COMMIT` **en asynchrone** (`pg_send_query`) ;
- pendant que le serveur dort, la connexion A (Laravel) appelle `CreditLedger::spend()` : elle doit
  **attendre** le verrou, puis lire les lots **après** le COMMIT de B, et donc échouer en solde
  insuffisant.

Deux défauts distincts le font rougir, et c'est ce qui en fait une preuve et non une illustration :
lire les lots **avant** le verrou (A lit 30, attend, puis écrit `30 − 20 = 10` par-dessus le `0` de
B), et ne **pas** verrouiller (A ne bloque que sur la ligne du lot, puis écrit la même valeur
périmée). Ce qu'il ne prouve pas : une course entre deux processus PHP-FPM réels sous charge ; il
prouve la propriété dont elle dépend — *qui débite attend le verrou de l'espace et relit après lui.*
Le nettoyage est explicite (`TRUNCATE`, qui ne déclenche pas le trigger de ligne) puisque rien n'est
annulé par une transaction.

**Fichier :** `takussan-api/tests/Feature/Credits/CreditConcurrentSpendTest.php` :

```php
<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\CreditMovement;
use App\Models\Enums\CreditLotOrigin;
use App\Services\Credits\CreditLedger;
use App\Services\Credits\InsufficientCredits;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §2) — deux dépenses concurrentes ne découvrent jamais le solde. Voir le
 * plan `docs/plans/2026-10-12-tck-633-lot-f-credits-boost.md`, tâche 5, pour ce que ce test prouve
 * et ne prouve pas.
 */
class CreditConcurrentSpendTest extends TestCase
{
    use RefreshDatabase;

    private ?int $agencyId = null;

    /** Aucune transaction enveloppante : la connexion B doit VOIR et VERROUILLER ces lignes. */
    protected function connectionsToTransact(): array
    {
        return [];
    }

    protected function tearDown(): void
    {
        DB::statement('TRUNCATE TABLE credit_movements, credit_welcome_grants, credit_lots');
        if ($this->agencyId !== null) {
            DB::table('agencies')->where('id', $this->agencyId)->delete();
        }
        parent::tearDown();
    }

    public function test_une_depense_attend_le_verrou_de_l_espace_et_relit_apres_lui(): void
    {
        $this->assertTrue(function_exists('pg_send_query'), 'ext-pgsql requise (installée en CI, api-ci.yml:117).');

        // Sans événements : ni rôles système, ni indexation — rien d'autre à nettoyer.
        $agency = Agency::withoutEvents(fn () => Agency::factory()->create());
        $this->agencyId = $agency->id;
        $lot = app(CreditLedger::class)->grant($agency, CreditLotOrigin::AdminGrant, 30, null);

        $b = $this->secondeConnexion();
        pg_query($b, 'BEGIN');
        pg_query_params($b, 'SELECT id FROM agencies WHERE id = $1 FOR UPDATE', [$agency->id]);
        pg_query_params($b, 'UPDATE credit_lots SET remaining_amount = 0, updated_at = now() WHERE id = $1', [$lot->id]);
        pg_query_params($b, "INSERT INTO credit_movements (agency_id, credit_lot_id, type, amount, created_at) VALUES ($1, $2, 'spend', -30, now())", [$agency->id, $lot->id]);
        pg_send_query($b, 'SELECT pg_sleep(1); COMMIT');

        $debut = microtime(true);
        try {
            app(CreditLedger::class)->spend($agency, 20);
            $this->fail('A a dépensé des crédits que B venait de consommer : les lots sont lus avant le verrou, ou sans lui.');
        } catch (InsufficientCredits $e) {
            $this->assertSame(0, $e->balance);
        } finally {
            while (pg_get_result($b) !== false) {
                // vider les résultats de `pg_sleep` puis du COMMIT
            }
            pg_close($b);
        }
        $attente = microtime(true) - $debut;

        $this->assertGreaterThan(0.5, $attente, 'A n’a pas attendu le verrou de B : la ligne d’agence n’est pas le point de sérialisation.');
        $this->assertSame(0, CreditLot::query()->findOrFail($lot->id)->remaining_amount);
        $this->assertSame(-30, (int) CreditMovement::query()->where('credit_lot_id', $lot->id)->where('amount', '<', 0)->sum('amount'));
        $this->assertSame([], app(CreditLedger::class)->invariantViolations($agency->id));
    }

    /** @return \PgSql\Connection */
    private function secondeConnexion()
    {
        $cfg = DB::connection()->getConfig();
        $parts = [
            'host' => $cfg['host'] ?? '127.0.0.1',
            'port' => $cfg['port'] ?? '5432',
            'dbname' => $cfg['database'],
            'user' => $cfg['username'] ?? null,
            'password' => $cfg['password'] ?? null,
        ];
        $dsn = implode(' ', array_map(
            fn (string $k, $v) => $k."='".addcslashes((string) $v, "'\\")."'",
            array_keys(array_filter($parts, fn ($v) => $v !== null && $v !== '')),
            array_filter($parts, fn ($v) => $v !== null && $v !== ''),
        ));

        $connexion = pg_connect($dsn, PGSQL_CONNECT_FORCE_NEW);
        $this->assertNotFalse($connexion, 'seconde connexion PostgreSQL impossible');

        return $connexion;
    }
}
```

**Étapes.**

1. Écrire le test ; avec `CreditLedger` de la tâche 4 il est **vert** d'emblée — c'est attendu, la
   tâche 4 a posé le verrou. La preuve est l'ablation :
2. `php artisan test tests/Feature/Credits/CreditConcurrentSpendTest.php` → `1 passed` (≈ 1 s).
3. **Ablation A (lecture avant verrou)** — dans `app/Services/Credits/CreditLedger.php`, déplacer la
   ligne `Agency::query()->whereKey($agency->getKey())->lockForUpdate()->firstOrFail();` **après** le
   bloc `$lots = …->get();` :

   ```bash
   cd takussan-api && F=app/Services/Credits/CreditLedger.php && cp "$F" "${TMPDIR:-/tmp}/tck633f/CreditLedger.php" && md5 -q "$F" \
    && perl -0pi -e 's/(\s+\/\/ 1\. Le point de sérialisation : la ligne PARENT\.\n\s+Agency::query\(\)->whereKey\(\$agency->getKey\(\)\)->lockForUpdate\(\)->firstOrFail\(\);\n)(.*?->get\(\);\n)/\n$2$1/s' "$F" \
    && php artisan test tests/Feature/Credits/CreditConcurrentSpendTest.php ; \
    cp "${TMPDIR:-/tmp}/tck633f/CreditLedger.php" "$F" && md5 -q "$F"
   ```

   Attendu : rouge, `A a dépensé des crédits que B venait de consommer`.
4. **Ablation B (aucun verrou)** — supprimer la même ligne (`perl -0pi -e 's/\n\s+Agency::query\(\)->whereKey\(\$agency->getKey\(\)\)->lockForUpdate\(\)->firstOrFail\(\);//'`),
   relancer → rouge, même message ; restaurer, `md5` identiques.
5. **Le nettoyage, prouvé** : ajouter à la classe, APRÈS le test de course (PHPUnit les joue dans
   l'ordre de déclaration, dans le même processus), une seconde méthode :

   ```php
       /** Le test précédent a commité ; `tearDown()` doit n'avoir rien laissé aux classes suivantes. */
       public function test_le_test_de_course_ne_laisse_aucune_ligne(): void
       {
           $this->assertSame(0, CreditLot::query()->count());
           $this->assertSame(0, CreditMovement::query()->count());
           $this->assertSame(0, Agency::query()->withTrashed()->count());
       }
   ```

   Ablation : vider le corps de `tearDown()` sauf `parent::tearDown();` → cette méthode rougit ;
   restaurer par `cp`, `md5`.

**Signaler à la session les fichiers à commiter :** `tests/Feature/Credits/CreditConcurrentSpendTest.php`.

---

## Tâche 6 — Notifications (cloche) des crédits et du boost

**Choix.** Le plan maître attribue `app/Notifications/Credits/**` et `app/Notifications/Boost/**` à F,
et le ticket nomme quatre classes : on les écrit, dans la forme qui évite toute collision —
canal `database` (remplacé par `AppDatabaseChannel`) et `toAppNotification()`, sur le modèle relu de
`app/Notifications/FavoriteChangesNotification.php` (l. 53-120). Les textes vivent dans un fichier de
langue **neuf**, `lang/{fr,en,wo}/credits.php` ; la langue est celle du destinataire
(`User implements HasLocalePreference`, `app/Models/User.php:43`, `preferredLocale()` l. 568). Écart
consigné : ADR-0032 préfère un `NotificationCode` ; l'ajouter toucherait
`app/Domain/Notifications/NotificationCode.php` et trois dictionnaires hors territoire.

**Fichiers :** créer les 4 notifications, `lang/{fr,en,wo}/credits.php`,
`tests/Feature/Notifications/CreditsNotificationsTest.php`. **Collision C11** (facultative).

**Étape 6.1 — test (rouge).** `takussan-api/tests/Feature/Notifications/CreditsNotificationsTest.php` :

```php
<?php

namespace Tests\Feature\Notifications;

use App\Models\AppNotification;
use App\Models\User;
use App\Notifications\Boost\BoostEndedNotification;
use App\Notifications\Boost\BoostRefundedNotification;
use App\Notifications\Credits\CreditsExpiringNotification;
use App\Notifications\Credits\CreditsGrantedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** TCK-633 lot F (AC13, AC15) — quatre notifications de cloche, dans la langue du destinataire. */
class CreditsNotificationsTest extends TestCase
{
    use RefreshDatabase;

    public function test_chaque_notification_ecrit_une_ligne_de_cloche(): void
    {
        $user = User::factory()->create();

        $user->notify(new CreditsGrantedNotification(500, '2027-04-10', 'Agence Teranga'));
        $user->notify(new CreditsExpiringNotification(120, '2026-10-19', 'Agence Teranga'));
        $user->notify(new BoostEndedNotification(7, 'Villa à Ngor'));
        $user->notify(new BoostRefundedNotification(7, 'Villa à Ngor', 23));

        $lignes = AppNotification::query()->where('user_id', $user->id)->orderBy('id')->get();
        $this->assertCount(4, $lignes);
        $this->assertStringContainsString('500', $lignes[0]->body);
        $this->assertStringContainsString('Agence Teranga', $lignes[0]->body);
        $this->assertStringContainsString('120', $lignes[1]->body);
        $this->assertStringContainsString('Villa à Ngor', $lignes[2]->body);
        $this->assertStringContainsString('23', $lignes[3]->body);
    }

    public function test_le_texte_suit_la_langue_du_destinataire(): void
    {
        // `User::preferredLocale()` lit `preferred_language` (app/Models/User.php:568-571).
        $user = User::factory()->create(['preferred_language' => 'en']);

        $user->notify(new BoostEndedNotification(7, 'Villa'));

        $this->assertSame('Promotion ended', AppNotification::query()->where('user_id', $user->id)->value('title'));
    }
}
```

**Étape 6.2 — les classes.** `takussan-api/app/Notifications/Credits/CreditsGrantedNotification.php` :

```php
<?php

namespace App\Notifications\Credits;

use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\NotificationType;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Carbon;

/** TCK-633 lot F (ADR-0061 §3, AC13) — des crédits arrivent sur l'espace (bienvenue, octroi, remboursement). */
class CreditsGrantedNotification extends Notification
{
    use Queueable;

    public function __construct(
        public readonly int $credits,
        public readonly ?string $expiresOn,
        public readonly string $agencyName,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toAppNotification(object $notifiable): array
    {
        $params = ['credits' => $this->credits, 'agency' => $this->agencyName];

        return [
            'type' => NotificationType::System,
            'title' => __('credits.notifications.granted.title'),
            'body' => $this->expiresOn === null
                ? __('credits.notifications.granted.body_no_expiry', $params)
                : __('credits.notifications.granted.body', $params + ['date' => Carbon::parse($this->expiresOn)->locale(app()->getLocale())->isoFormat('LL')]),
            'data' => $this->toArray($notifiable),
            // C11 : `credits` n'existe pas encore dans `NotificationTarget::PATHS` → `fromArray()` rend null
            // (pas de lien) ; une fois C11 appliquée, le lien mène à `/app/credits`. Aucun rouge dans les deux cas.
            'target' => NotificationTarget::fromArray(['kind' => 'credits'])?->toArray(),
        ];
    }

    public function toArray(object $notifiable): array
    {
        return ['credits' => $this->credits, 'expires_on' => $this->expiresOn];
    }
}
```

`takussan-api/app/Notifications/Credits/CreditsExpiringNotification.php` :

```php
<?php

namespace App\Notifications\Credits;

use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\NotificationType;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Carbon;

/** TCK-633 lot F (ADR-0061 §9) — préavis d'expiration, envoyé une fois par lot. */
class CreditsExpiringNotification extends Notification
{
    use Queueable;

    public function __construct(
        public readonly int $credits,
        public readonly string $expiresOn,
        public readonly string $agencyName,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::System,
            'title' => __('credits.notifications.expiring.title'),
            'body' => __('credits.notifications.expiring.body', [
                'credits' => $this->credits,
                'agency' => $this->agencyName,
                'date' => Carbon::parse($this->expiresOn)->locale(app()->getLocale())->isoFormat('LL'),
            ]),
            'data' => $this->toArray($notifiable),
            'target' => NotificationTarget::fromArray(['kind' => 'credits'])?->toArray(),
        ];
    }

    public function toArray(object $notifiable): array
    {
        return ['credits' => $this->credits, 'expires_on' => $this->expiresOn];
    }
}
```

`takussan-api/app/Notifications/Boost/BoostEndedNotification.php` :

```php
<?php

namespace App\Notifications\Boost;

use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\NotificationType;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/** TCK-633 lot F (ADR-0061 §8, §9) — une Vedette ou un Badge a pris fin (échéance ou modération). */
class BoostEndedNotification extends Notification
{
    use Queueable;

    public function __construct(public readonly int $propertyId, public readonly string $propertyTitle) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::System,
            'title' => __('credits.boost.ended.title'),
            'body' => __('credits.boost.ended.body', ['property' => $this->propertyTitle]),
            'data' => $this->toArray($notifiable),
            'target' => NotificationTarget::of('property', $this->propertyId)->toArray(),
        ];
    }

    public function toArray(object $notifiable): array
    {
        return ['property_id' => $this->propertyId];
    }
}
```

`takussan-api/app/Notifications/Boost/BoostRefundedNotification.php` :

```php
<?php

namespace App\Notifications\Boost;

use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\NotificationType;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/** TCK-633 lot F (ADR-0061 §8, AC15) — Vedette interrompue (loué, vendu, supprimé, annulation), jours pleins remboursés. */
class BoostRefundedNotification extends Notification
{
    use Queueable;

    public function __construct(
        public readonly int $propertyId,
        public readonly string $propertyTitle,
        public readonly int $credits,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::System,
            'title' => __('credits.boost.refunded.title'),
            'body' => __('credits.boost.refunded.body', ['property' => $this->propertyTitle, 'credits' => $this->credits]),
            'data' => $this->toArray($notifiable),
            'target' => NotificationTarget::of('property', $this->propertyId)->toArray(),
        ];
    }

    public function toArray(object $notifiable): array
    {
        return ['property_id' => $this->propertyId, 'credits' => $this->credits];
    }
}
```

**Étape 6.3 — textes.** `takussan-api/lang/fr/credits.php` :

```php
<?php

// TCK-633 lot F (ADR-0061) — notifications du registre de crédits et du boost. Le nombre suit un
// deux-points : aucun accord singulier / pluriel à porter.
return [
    'notifications' => [
        'granted' => [
            'title' => 'Crédits ajoutés à votre espace',
            'body' => 'Crédits ajoutés à :agency : :credits. Ils sont valables jusqu’au :date.',
            'body_no_expiry' => 'Crédits ajoutés à :agency : :credits.',
        ],
        'expiring' => [
            'title' => 'Des crédits expirent bientôt',
            'body' => 'Crédits de :agency qui expirent le :date : :credits. Utilisez-les pour mettre vos annonces en avant.',
        ],
    ],
    'boost' => [
        'ended' => [
            'title' => 'Mise en avant terminée',
            'body' => 'La mise en avant de « :property » est terminée.',
        ],
        'refunded' => [
            'title' => 'Mise en avant remboursée',
            'body' => 'La mise en avant de « :property » a pris fin. Crédits remboursés : :credits.',
        ],
    ],
];
```

`takussan-api/lang/en/credits.php` :

```php
<?php

// TCK-633 lot F (ADR-0061) — credit ledger and listing promotion notifications.
return [
    'notifications' => [
        'granted' => [
            'title' => 'Credits added to your workspace',
            'body' => 'Credits added to :agency: :credits. They are valid until :date.',
            'body_no_expiry' => 'Credits added to :agency: :credits.',
        ],
        'expiring' => [
            'title' => 'Some credits expire soon',
            'body' => 'Credits of :agency expiring on :date: :credits. Use them to promote your listings.',
        ],
    ],
    'boost' => [
        'ended' => [
            'title' => 'Promotion ended',
            'body' => 'The promotion of “:property” has ended.',
        ],
        'refunded' => [
            'title' => 'Promotion refunded',
            'body' => 'The promotion of “:property” has stopped. Credits refunded: :credits.',
        ],
    ],
];
```

`takussan-api/lang/wo/credits.php` :

```php
<?php

// TCK-633 lot F (ADR-0061) — yégle yi ci kredi yi ak yokk gis-gisu yéenekaay yi.
return [
    'notifications' => [
        'granted' => [
            'title' => 'Kredi yu bees dugg na ci sa bérab',
            'body' => 'Kredi yu dugg ci :agency : :credits. Ñu ngi jariñ ba :date.',
            'body_no_expiry' => 'Kredi yu dugg ci :agency : :credits.',
        ],
        'expiring' => [
            'title' => 'Ay kredi dinañu jeex ci kanam',
            'body' => 'Kredi yu :agency yuy jeex ci :date : :credits. Jëfandikoo leen ngir yokk gis-gisu say yéenekaay.',
        ],
    ],
    'boost' => [
        'ended' => [
            'title' => 'Yokk gis-gis gi jeex na',
            'body' => 'Yokk gis-gisu « :property » jeex na.',
        ],
        'refunded' => [
            'title' => 'Yokk gis-gis gi delloo nañu ko',
            'body' => 'Yokk gis-gisu « :property » taxaw na. Kredi yu ñu delloo : :credits.',
        ],
    ],
];
```

> Le wolof suit le registre des fichiers `lang/wo/*.php` existants ; le relire contre
> `lang/wo/notifications.php` (même voix, même vocabulaire « yéenekaay ») et l'aligner si un terme
> y est fixé autrement.

**Étape 6.4 — vert.** `php artisan test tests/Feature/Notifications/CreditsNotificationsTest.php` → `2 passed` ;
`php artisan test --filter=LangGroupParityTest` → vert (les trois fichiers ont les mêmes clés) ;
`php artisan test tests/Feature/Notifications/AppDatabaseChannelTest.php` → vert.

**Étape 6.5 — ablation.** Retirer `'credits' => $this->credits,` du tableau de `BoostRefundedNotification::toAppNotification`
(le corps garde alors `:credits` littéral) → `test_chaque_notification_ecrit_une_ligne_de_cloche` rouge ; restaurer, `md5`.

**Collision C11 (facultative)** — `app/Domain/Notifications/NotificationTarget.php`, dans `PATHS`
après `'favorites' => '/app/favorites',` (l. 54) ajouter :

```php
        // TCK-633 lot F — une notification de crédits ouvre la page Crédits de l'espace.
        'credits' => '/app/credits',
```

**Étape 6.6 — signaler à la session les fichiers à commiter :** les 4 notifications,
`lang/{fr,en,wo}/credits.php`, le test ; collision C11.

---

## Tâche 7 — Offre de bienvenue, une fois par numéro vérifié

**Fichiers :** créer `app/Services/Credits/WelcomeCreditService.php`,
`tests/Feature/Credits/WelcomeCreditOncePerPhoneTest.php` ; **puis, seulement quand le lot C a posé
ses événements**, `app/Listeners/Credits/GrantWelcomeCreditsOnPhoneVerified.php`,
`app/Listeners/Credits/GrantWelcomeCreditsOnSpaceCreated.php`,
`tests/Feature/Credits/WelcomeCreditListenersTest.php`.

**Pré-condition des écouteurs** (relevée le 2026-10-12 : `app/Events/` ne contient ni l'un ni
l'autre) :

```bash
cd takussan-api && ls app/Events/Auth/PhoneVerified.php app/Events/Onboarding/SpaceCreated.php
```

Si l'une manque : écrire le service et son test (étapes 7.1-7.4), **ne pas créer les écouteurs**
(une classe d'écouteur qui type-hinte une classe absente est découverte au démarrage), et consigner
« écouteurs différés : dépendent du lot C » dans le rapport. La session les crée après fusion de C,
avec le code des étapes 7.5-7.6.

**Étape 7.1 — test (rouge).** `takussan-api/tests/Feature/Credits/WelcomeCreditOncePerPhoneTest.php` :

```php
<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\CreditWelcomeGrant;
use App\Models\Enums\CreditLotOrigin;
use App\Models\User;
use App\Notifications\Credits\CreditsGrantedNotification;
use App\Services\Admin\PlatformSettingService;
use App\Services\Credits\CreditLedger;
use App\Services\Credits\WelcomeCreditService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §3, AC13) — 500 crédits dès que l'admin principal a un numéro vérifié :
 * à la naissance de l'espace s'il l'est déjà, sinon à la vérification ; UNE fois par numéro, même
 * réécrit autrement, même après l'anonymisation du compte qui l'a reçue.
 */
class WelcomeCreditOncePerPhoneTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221771234567';

    public function test_admin_deja_verifie_credite_a_la_naissance_de_l_espace(): void
    {
        Notification::fake();
        [$admin, $agency] = $this->espace(verifie: true);

        $lot = app(WelcomeCreditService::class)->onSpaceCreated($agency);

        $this->assertNotNull($lot);
        $this->assertSame(CreditLotOrigin::Welcome, $lot->origin);
        $this->assertSame(500, $lot->initial_amount);
        $this->assertTrue($lot->expires_at->isSameDay(now()->addDays(180)));
        $this->assertSame(500, app(CreditLedger::class)->balance($agency));
        Notification::assertSentTo($admin, CreditsGrantedNotification::class, fn ($n) => $n->credits === 500);
    }

    public function test_non_verifie_rien_a_la_naissance_puis_credite_a_la_verification(): void
    {
        [$admin, $agency] = $this->espace(verifie: false);

        $this->assertNull(app(WelcomeCreditService::class)->onSpaceCreated($agency));
        $this->assertSame(0, CreditLot::query()->count());

        $admin->forceFill(['phone_verified_at' => now()])->save();
        $lot = app(WelcomeCreditService::class)->onPhoneVerified($admin->fresh());

        $this->assertSame($agency->id, $lot->agency_id);
    }

    public function test_un_second_espace_du_meme_numero_ne_recoit_rien(): void
    {
        [$admin, $agency] = $this->espace(verifie: true);
        app(WelcomeCreditService::class)->onSpaceCreated($agency);
        $second = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        $this->assertNull(app(WelcomeCreditService::class)->onSpaceCreated($second));
        $this->assertSame(0, app(CreditLedger::class)->balance($second));
        $this->assertSame(1, CreditWelcomeGrant::query()->count());
    }

    public function test_le_numero_reecrit_ou_repris_apres_anonymisation_ne_recoit_rien(): void
    {
        [$admin, $agency] = $this->espace(verifie: true);
        app(WelcomeCreditService::class)->onSpaceCreated($agency);

        // Ce que fait `AccountDeletionService::anonymize()` (l. 218) au numéro : il l'efface.
        $admin->forceFill(['phone' => null, 'phone_verified_at' => null])->save();

        $autre = User::factory()->create(['phone' => '77 123 45 67', 'phone_verified_at' => now()]);
        $autreEspace = Agency::factory()->create(['primary_admin_id' => $autre->id]);

        $this->assertNull(app(WelcomeCreditService::class)->onSpaceCreated($autreEspace));
        $this->assertSame(0, app(CreditLedger::class)->balance($autreEspace));
    }

    public function test_un_montant_regle_a_zero_n_octroie_rien_et_ne_consomme_pas_le_numero(): void
    {
        app(PlatformSettingService::class)->bulkUpdate(['credits.welcome_amount' => 0], User::factory()->create());
        [, $agency] = $this->espace(verifie: true);

        $this->assertNull(app(WelcomeCreditService::class)->onSpaceCreated($agency));
        $this->assertSame(0, CreditWelcomeGrant::query()->count());
    }

    /** @return array{0: User, 1: Agency} */
    private function espace(bool $verifie): array
    {
        $admin = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => $verifie ? now() : null]);
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        return [$admin, $agency];
    }
}
```

**Étape 7.2 — rouge** : `php artisan test tests/Feature/Credits/WelcomeCreditOncePerPhoneTest.php`
→ `Class "App\Services\Credits\WelcomeCreditService" not found`.

**Étape 7.3 — `takussan-api/app/Services/Credits/WelcomeCreditService.php`** :

```php
<?php

namespace App\Services\Credits;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\Enums\CreditLotOrigin;
use App\Models\User;
use App\Notifications\Credits\CreditsGrantedNotification;
use App\Services\Boost\BoostSettings;
use App\Support\PhoneFingerprint;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 lot F (ADR-0061 §3) — l'offre de bienvenue, à l'admin principal de l'espace, une fois par
 * numéro vérifié. Le registre `credit_welcome_grants` porte l'empreinte du numéro, pas le compte :
 * il survit à l'anonymisation.
 *
 * L'unicité tient par `insertOrIgnore` (ON CONFLICT DO NOTHING) — jamais par une exception attrapée,
 * qui abandonnerait la transaction PostgreSQL (piège n°1). Deux octrois simultanés pour le même
 * numéro : le second attend le premier sur l'index unique, puis n'insère rien.
 */
final class WelcomeCreditService
{
    public function __construct(
        private readonly CreditLedger $ledger,
        private readonly BoostSettings $settings,
    ) {}

    public function onSpaceCreated(Agency $agency): ?CreditLot
    {
        $admin = $agency->primaryAdmin;
        if ($admin === null || ! $this->hasVerifiedPhone($admin)) {
            return null;
        }

        return $this->grant($agency, $admin);
    }

    public function onPhoneVerified(User $user): ?CreditLot
    {
        if (! $this->hasVerifiedPhone($user)) {
            return null;
        }
        $agency = Agency::query()->where('primary_admin_id', $user->getKey())->orderBy('id')->first();

        return $agency === null ? null : $this->grant($agency, $user);
    }

    private function hasVerifiedPhone(User $user): bool
    {
        return is_string($user->phone) && $user->phone !== '' && $user->phone_verified_at !== null;
    }

    private function grant(Agency $agency, User $admin): ?CreditLot
    {
        $amount = $this->settings->welcomeAmount();
        if ($amount <= 0) {
            return null;
        }
        $hash = PhoneFingerprint::of((string) $admin->phone);

        $lot = DB::transaction(function () use ($agency, $admin, $amount, $hash): ?CreditLot {
            $inserted = DB::table('credit_welcome_grants')->insertOrIgnore([
                'phone_hash' => $hash,
                'agency_id' => $agency->getKey(),
                'user_id' => $admin->getKey(),
                'granted_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            if ($inserted === 0) {
                return null;
            }

            $lot = $this->ledger->grant($agency, CreditLotOrigin::Welcome, $amount, now()->addDays($this->settings->welcomeValidityDays()));
            DB::table('credit_welcome_grants')->where('phone_hash', $hash)->update(['credit_lot_id' => $lot->getKey()]);

            return $lot;
        });

        if ($lot !== null) {
            $admin->notify(new CreditsGrantedNotification($lot->initial_amount, $lot->expires_at?->toDateString(), (string) $agency->name));
        }

        return $lot;
    }
}
```

**Étape 7.4 — vert** : `5 passed`. **Ablations** : (1) retirer le bloc `if ($inserted === 0) { return null; }`
→ `test_un_second_espace_du_meme_numero_ne_recoit_rien` rouge (`insertOrIgnore` ne lève pas : le
second espace reçoit 500 et l'assertion de solde nul échoue) ; (2) remplacer `PhoneFingerprint::of((string) $admin->phone)` par
`hash('sha256', (string) $admin->phone)` → `test_le_numero_reecrit_ou_repris_apres_anonymisation_ne_recoit_rien`
rouge (`'77 123 45 67'` n'a plus la même empreinte). Restaurer par `cp`, `md5`.

**Étape 7.5 — écouteurs (seulement si la pré-condition est remplie).**
`takussan-api/app/Listeners/Credits/GrantWelcomeCreditsOnPhoneVerified.php` :

```php
<?php

namespace App\Listeners\Credits;

use App\Events\Auth\PhoneVerified;
use App\Services\Credits\WelcomeCreditService;

/** TCK-633 lot F (ADR-0061 §3) — découvert automatiquement (aucun `Event::listen`, cf. takussan-api/CLAUDE.md). */
class GrantWelcomeCreditsOnPhoneVerified
{
    public function __construct(private readonly WelcomeCreditService $service) {}

    public function handle(PhoneVerified $event): void
    {
        $this->service->onPhoneVerified($event->user);
    }
}
```

`takussan-api/app/Listeners/Credits/GrantWelcomeCreditsOnSpaceCreated.php` :

```php
<?php

namespace App\Listeners\Credits;

use App\Events\Onboarding\SpaceCreated;
use App\Services\Credits\WelcomeCreditService;

/** TCK-633 lot F (ADR-0061 §3). */
class GrantWelcomeCreditsOnSpaceCreated
{
    public function __construct(private readonly WelcomeCreditService $service) {}

    public function handle(SpaceCreated $event): void
    {
        $this->service->onSpaceCreated($event->agency);
    }
}
```

**Étape 7.6 — test des écouteurs** `takussan-api/tests/Feature/Credits/WelcomeCreditListenersTest.php` :

```php
<?php

namespace Tests\Feature\Credits;

use App\Events\Auth\PhoneVerified;
use App\Events\Onboarding\SpaceCreated;
use App\Models\Agency;
use App\Models\User;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** TCK-633 lot F — les deux événements du lot C déclenchent l'offre, chacun une fois. */
class WelcomeCreditListenersTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_verification_du_numero_credite_l_espace(): void
    {
        $admin = User::factory()->create(['phone' => '+221771234560', 'phone_verified_at' => now()]);
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        event(new PhoneVerified($admin));

        $this->assertSame(500, app(CreditLedger::class)->balance($agency));
    }

    public function test_la_naissance_de_l_espace_le_credite_une_seule_fois(): void
    {
        $admin = User::factory()->create(['phone' => '+221771234561', 'phone_verified_at' => now()]);
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        event(new SpaceCreated($agency));
        event(new SpaceCreated($agency));

        $this->assertSame(500, app(CreditLedger::class)->balance($agency));
    }
}
```

Lancer aussi `php artisan test tests/Feature/Events/EventListenerDuplicationTest.php` (aucun écouteur
inscrit deux fois). **Écart à consigner** : le plan maître place `SpaceCreated` dans le service
d'onboarding ; `AgencyController.php:59` et `AgencyProvisioningService.php:49` créent aussi des
espaces — si C ne les couvre pas, l'offre n'arrive qu'à la vérification du numéro (rattrapage
correct, mais pas « à la naissance »).

**Étape 7.7 — signaler à la session les fichiers à commiter :** `WelcomeCreditService.php`, le test ;
les écouteurs et leur test **si** la pré-condition est remplie.

---

## Tâche 8 — Capacité `boost.spend` et policies

**Fichiers :** Edit `app/Models/Enums/Capability.php` (co-tenu F) ; créer `app/Policies/CreditLotPolicy.php`,
`app/Policies/PropertyBoostPolicy.php`, `tests/Feature/Boost/BoostSpendCapabilityTest.php`.
**Collisions C4, C9 (libellés `admin.roles.*`).**

**Étape 8.1 — test (rouge).** `takussan-api/tests/Feature/Boost/BoostSpendCapabilityTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\Enums\Capability;
use App\Models\Property;
use App\Models\PropertyBoost;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §5) — `boost.spend` : capacité d'agence, accordée à l'admin d'espace par
 * `agencyAssignable()`, PAS à l'agent système (un rôle personnalisé peut la lui donner).
 */
class BoostSpendCapabilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_capacite_est_assignable_par_une_agence(): void
    {
        $this->assertSame('boost.spend', Capability::BoostSpend->value);
        $this->assertSame('boost', Capability::BoostSpend->domain());
        $this->assertContains(Capability::BoostSpend, Capability::agencyAssignable());
        $this->assertNotContains(Capability::BoostSpend, Capability::platformReserved());
    }

    public function test_l_admin_d_espace_peut_booster_et_lire_le_solde_l_agent_non(): void
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);

        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        $this->assertTrue($admin->canActAt(Capability::BoostSpend, $agency));
        $this->assertTrue(Gate::forUser($admin)->allows('viewAny', [CreditLot::class, $agency]));
        $this->assertTrue(Gate::forUser($admin)->allows('create', [PropertyBoost::class, $property]));

        $agent = $this->actingAsRole('agent', ['agency' => $agency]);
        $this->assertFalse($agent->canActAt(Capability::BoostSpend, $agency));
        $this->assertFalse(Gate::forUser($agent)->allows('viewAny', [CreditLot::class, $agency]));
        $this->assertFalse(Gate::forUser($agent)->allows('create', [PropertyBoost::class, $property]));
    }

    public function test_un_admin_d_un_autre_espace_ne_peut_rien(): void
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $autre = $this->actingAsRole('agency_admin', ['agency' => Agency::factory()->create()]);

        $this->assertFalse(Gate::forUser($autre)->allows('viewAny', [CreditLot::class, $agency]));
        $this->assertFalse(Gate::forUser($autre)->allows('create', [PropertyBoost::class, $property]));
    }
}
```

Rouge : `Undefined constant App\Models\Enums\Capability::BoostSpend`.

**Étape 8.2 — Edit `Capability.php`.** Ancre `    case RolesDeleteCustom = 'roles.delete_custom';`
(l. 100) → remplacer par :

```php
    case RolesDeleteCustom = 'roles.delete_custom';

    // ─── Mise en avant (TCK-633 lot F, ADR-0061 §5) ─────────────────────────────────────
    // Dépenser les crédits de l'espace pour booster un bien. Accordée à l'admin d'espace par
    // `agencyAssignable()` ; l'agent système ne la reçoit pas (`SystemRoleCapabilities::agent()`
    // inchangé) — un rôle personnalisé peut la lui donner. Les rôles système des agences existantes
    // la reçoivent par `membership:reconcile-system-roles` (docker/release.sh).
    case BoostSpend = 'boost.spend';
```

**Étape 8.3 — policies** (découvertes par convention `App\Models\X` → `App\Policies\XPolicy`, ce que
`scripts/check-controller-authorization.mjs` contrôle 4 accepte).

`takussan-api/app/Policies/CreditLotPolicy.php` :

```php
<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\User;

/** TCK-633 lot F (ADR-0061 §1) — lire le portefeuille d'un espace : qui peut y dépenser. */
class CreditLotPolicy
{
    public function viewAny(User $user, Agency $agency): bool
    {
        return $user->canActAt(Capability::BoostSpend, $agency);
    }
}
```

`takussan-api/app/Policies/PropertyBoostPolicy.php` :

```php
<?php

namespace App\Policies;

use App\Models\Enums\Capability;
use App\Models\Property;
use App\Models\User;

/** TCK-633 lot F (ADR-0061 §5) — booster un bien : le gérer ET pouvoir dépenser les crédits de son espace. */
class PropertyBoostPolicy
{
    public function viewAny(User $user, Property $property): bool
    {
        return $user->can('view', $property);
    }

    public function create(User $user, Property $property): bool
    {
        return $property->agency !== null
            && $user->can('update', $property)
            && $user->canActAt(Capability::BoostSpend, $property->agency);
    }
}
```

**Étape 8.4 — vert** : `php artisan test tests/Feature/Boost/BoostSpendCapabilityTest.php` → `3 passed` ;
`node ../scripts/check-capability-readers.mjs` → vert (forme 1 dans les deux policies) ;
`node ../scripts/check-controller-authorization.mjs` → vert.

**Étape 8.5 — ablation.** Dans `CreditLotPolicy::viewAny`, rendre `true` → le volet « agent » de
`test_l_admin_d_espace_peut_booster_et_lire_le_solde_l_agent_non` rougit ; restaurer, `md5`.

**Collision C4** — `tests/Unit/Services/Membership/MembershipCapabilityResolverTest.php` :
renommer `test_agency_admin_breadth_is_pinned_to_44_of_46` en `test_agency_admin_breadth_is_pinned_to_45_of_47`,
`assertCount(44, $granted, …)` → `assertCount(45, $granted, …)`, `assertCount(46, Capability::cases())`
→ `assertCount(47, Capability::cases())`, et ajouter au docblock (après le paragraphe du 2026-10-08) :

```php
     * **Décision du 2026-10-12 — TCK-633 lot F (ADR-0061 §5), 44/46 → 45/47.** Le cas ajouté est
     * `boost.spend` : dépenser les crédits de l'espace pour mettre un bien en avant. Accordé à
     * `agency_admin` (c'est lui qui tient le portefeuille), pas à l'agent système.
```

La même phrase va dans le bloc « TABLE DE VÉRITÉ PHASE 1 » de
`app/Services/Membership/MembershipCapabilityResolver.php` (hors territoire : même collision C4).
Test différé (C4) : `php artisan test tests/Unit/Services/Membership/MembershipCapabilityResolverTest.php`.

**Collision C9 (libellés de l'éditeur de rôles)** — `takussan-web/src/messages/{fr,en,wo}.json`,
`admin.roles.domains` après `"roles": …` : `"boost": "Mise en avant"` / `"Promotion"` / `"Yokk gis-gis"` ;
`admin.roles.capabilities` après le bloc `"roles": {…}` :
`"boost": { "spend": "Dépenser des crédits pour mettre un bien en avant" }` /
`{ "spend": "Spend credits to promote a listing" }` / `{ "spend": "Dépense kredi ngir yokk gis-gisu ab kër" }`.

**Étape 8.6 — signaler à la session les fichiers à commiter :** `Capability.php`, les deux policies,
le test ; collisions C4 et C9 (partie `admin.roles`).

---

## Tâche 9 — Catalogue initial, conversion des « featured » existants, seeders

**Fichiers :** créer `database/seeders/System/BoostProductSeeder.php`,
`database/seeders/System/OfferedFeaturedSeeder.php`, `app/Services/Boost/LegacyFeaturedConversion.php`,
la migration `700400`, `tests/Feature/Boost/BoostCatalogueTest.php` ; Edit `database/seeders/DatabaseSeeder.php`.

Relevé : la production ne lance **aucun** seeder (`docker/release.sh` : migrations,
`scout:sync-index-settings`, `membership:reconcile-system-roles`) et aucune migration du dépôt n'en
appelle — d'où une migration de données, qui est ici le seul moyen d'avoir un catalogue en
préproduction. Les `featured = true` existants (seeders : `Catalog/PropertySeeder.php:181`,
`Support/FilterCoverageSeeder.php:130,229`, `Support/EdgeCaseSeeder.php:242,270,568`) deviennent des
Vedettes **offertes** de 30 jours : `featured` étant désormais dérivé, un `true` sans boost serait un
état que plus rien ne remettrait à faux.

**Étape 9.1 — test (rouge).** `takussan-api/tests/Feature/Boost/BoostCatalogueTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Boost\LegacyFeaturedConversion;
use Database\Seeders\System\BoostProductSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** TCK-633 lot F (ADR-0061 §4) — le catalogue initial, idempotent, et la conversion des vedettes d'avant. */
class BoostCatalogueTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_catalogue_initial_est_celui_de_l_adr(): void
    {
        $offres = BoostProduct::query()->orderBy('sort_order')->get()
            ->map(fn (BoostProduct $p) => [$p->kind->value, $p->variant?->value, $p->duration_days, $p->price_credits])
            ->all();

        $this->assertSame([
            ['bump', null, 0, 5],
            ['featured', null, 7, 20],
            ['featured', null, 15, 35],
            ['featured', null, 30, 60],
            ['badge', 'urgent', 7, 10],
            ['badge', 'price_drop', 7, 10],
        ], $offres);
    }

    public function test_le_seeder_est_idempotent_et_n_ecrase_pas_un_prix_regle(): void
    {
        BoostProduct::query()->where('kind', 'bump')->update(['price_credits' => 8]);

        (new BoostProductSeeder)->run();
        (new BoostProductSeeder)->run();

        $this->assertSame(6, BoostProduct::query()->count());
        $this->assertSame(8, BoostProduct::query()->where('kind', 'bump')->value('price_credits'));
    }

    public function test_un_featured_d_avant_devient_une_vedette_offerte(): void
    {
        $agency = Agency::factory()->create();
        $vedette = Property::factory()->published()->create(['agency_id' => $agency->id, 'featured' => true]);
        $sansEspace = Property::factory()->published()->create(['agency_id' => null, 'featured' => true]);

        $this->assertSame(1, app(LegacyFeaturedConversion::class)->run());
        $this->assertSame(0, app(LegacyFeaturedConversion::class)->run(), 'idempotent');

        $boost = PropertyBoost::query()->where('property_id', $vedette->id)->sole();
        $this->assertSame(BoostKind::Featured, $boost->kind);
        $this->assertSame(BoostStatus::Active, $boost->status);
        $this->assertTrue($boost->offered);
        $this->assertSame(0, $boost->price_credits);
        $this->assertTrue($boost->ends_at->isSameDay(now()->addDays(30)));
        $this->assertTrue($vedette->fresh()->sponsored_until->isSameDay(now()->addDays(30)));
        $this->assertFalse((bool) $sansEspace->fresh()->featured, 'sans espace, pas de boost possible : la vedette tombe');
    }
}
```

Rouge : `Class "Database\Seeders\System\BoostProductSeeder" not found`.

**Étape 9.2 — `takussan-api/database/seeders/System/BoostProductSeeder.php`** :

```php
<?php

namespace Database\Seeders\System;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 lot F (ADR-0061 §4) — le catalogue initial. Idempotent : `insertOrIgnore` sur l'unicité
 * (genre, variante, durée) — une offre existante n'est jamais réécrite, un prix réglé par la console
 * survit au seeder.
 */
class BoostProductSeeder extends Seeder
{
    /** @var list<array{kind: string, variant: ?string, duration_days: int, price_credits: int, sort_order: int}> */
    public const CATALOGUE = [
        ['kind' => 'bump', 'variant' => null, 'duration_days' => 0, 'price_credits' => 5, 'sort_order' => 10],
        ['kind' => 'featured', 'variant' => null, 'duration_days' => 7, 'price_credits' => 20, 'sort_order' => 20],
        ['kind' => 'featured', 'variant' => null, 'duration_days' => 15, 'price_credits' => 35, 'sort_order' => 21],
        ['kind' => 'featured', 'variant' => null, 'duration_days' => 30, 'price_credits' => 60, 'sort_order' => 22],
        ['kind' => 'badge', 'variant' => 'urgent', 'duration_days' => 7, 'price_credits' => 10, 'sort_order' => 30],
        ['kind' => 'badge', 'variant' => 'price_drop', 'duration_days' => 7, 'price_credits' => 10, 'sort_order' => 31],
    ];

    public function run(): void
    {
        $now = now();
        DB::table('boost_products')->insertOrIgnore(array_map(
            fn (array $offre) => $offre + ['is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            self::CATALOGUE,
        ));
    }
}
```

**Étape 9.3 — `takussan-api/app/Services/Boost/LegacyFeaturedConversion.php`** (requêtes brutes
seulement : appelée par une migration, elle ne doit dépendre ni des observateurs ni de Scout) :

```php
<?php

namespace App\Services\Boost;

use Illuminate\Support\Facades\DB;

/**
 * TCK-633 lot F (ADR-0061 §5) — `featured` est désormais DÉRIVÉ des boosts. Un `featured = true`
 * hérité sans boost devient une Vedette offerte de 30 jours (prix 0, aucun mouvement) ; sans espace,
 * aucun boost n'est possible et la vedette tombe. Idempotent.
 */
final class LegacyFeaturedConversion
{
    public const DAYS = 30;

    public const REASON = 'ADR-0061 : mise en avant antérieure convertie en Vedette offerte';

    public function run(): int
    {
        $now = now();
        $count = 0;
        $productId = DB::table('boost_products')->where('kind', 'featured')->where('duration_days', self::DAYS)->value('id');

        DB::table('properties')
            ->where('featured', true)
            ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('property_boosts')
                ->whereColumn('property_boosts.property_id', 'properties.id')
                ->where('property_boosts.kind', 'featured')
                ->whereIn('property_boosts.status', ['active', 'paused']))
            ->orderBy('id')
            ->select(['id', 'agency_id'])
            ->chunkById(200, function ($properties) use ($now, $productId, &$count): void {
                foreach ($properties as $p) {
                    if ($p->agency_id === null) {
                        DB::table('properties')->where('id', $p->id)->update(['featured' => false, 'sponsored_until' => null]);

                        continue;
                    }
                    $endsAt = $now->copy()->addDays(self::DAYS);
                    DB::table('property_boosts')->insert([
                        'property_id' => $p->id, 'agency_id' => $p->agency_id, 'boost_product_id' => $productId,
                        'kind' => 'featured', 'variant' => null, 'price_credits' => 0, 'duration_days' => self::DAYS,
                        'starts_at' => $now, 'ends_at' => $endsAt, 'status' => 'active', 'offered' => true,
                        'offer_reason' => self::REASON, 'created_at' => $now, 'updated_at' => $now,
                    ]);
                    DB::table('properties')->where('id', $p->id)->update(['sponsored_until' => $endsAt]);
                    $count++;
                }
            });

        return $count;
    }
}
```

**Étape 9.4 — migration `takussan-api/database/migrations/2026_10_12_700400_seed_boost_catalogue_and_convert_featured.php`** :

```php
<?php

use App\Services\Boost\LegacyFeaturedConversion;
use Database\Seeders\System\BoostProductSeeder;
use Illuminate\Database\Migrations\Migration;

/**
 * TCK-633 lot F (ADR-0061 §4, §5) — migration de DONNÉES : la production ne lance aucun seeder.
 * `down()` ne fait rien : les tables qu'elle remplit sont supprimées par le `down()` de `700100`.
 */
return new class extends Migration
{
    public function up(): void
    {
        (new BoostProductSeeder)->run();
        app(LegacyFeaturedConversion::class)->run();
    }

    public function down(): void
    {
        // Données seulement : rien à défaire que `700100` ne défasse.
    }
};
```

**Étape 9.5 — `takussan-api/database/seeders/System/OfferedFeaturedSeeder.php`** (jeu de
démonstration : les seeders écrivent `featured` sans événements, et sans `ranked_at`) :

```php
<?php

namespace Database\Seeders\System;

use App\Services\Boost\LegacyFeaturedConversion;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/** TCK-633 lot F — après le jeu de démonstration : `ranked_at` rattrapé, vedettes converties en Vedettes offertes. */
class OfferedFeaturedSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('properties')->whereNull('ranked_at')->whereNotNull('published_at')->update(['ranked_at' => DB::raw('published_at')]);
        app(LegacyFeaturedConversion::class)->run();
    }
}
```

**Étape 9.6 — Edit `DatabaseSeeder.php`** (co-tenu D, F). (a) ancre `use Database\Seeders\System\PlanSeeder;`
→ remplacer par :

```php
use Database\Seeders\System\BoostProductSeeder;
use Database\Seeders\System\OfferedFeaturedSeeder;
use Database\Seeders\System\PlanSeeder;
```

(b) ancre `        $this->call(YearOfActivitySeeder::class);` → remplacer par :

```php
        $this->call(YearOfActivitySeeder::class);
        // TCK-633 lot F — le catalogue (déjà posé par la migration 700400, idempotent), puis les
        // vedettes du jeu de démonstration converties en Vedettes offertes.
        $this->call(BoostProductSeeder::class);
        $this->call(OfferedFeaturedSeeder::class);
```

**Étape 9.7 — vert** : `php artisan test tests/Feature/Boost/BoostCatalogueTest.php` → `3 passed`.
**Ablation** : remplacer `insertOrIgnore` par `insert` dans `BoostProductSeeder::run()` →
`test_le_seeder_est_idempotent…` rouge (`UniqueConstraintViolationException`) ; restaurer, `md5`.

**Étape 9.8 — signaler à la session les fichiers à commiter :** les deux seeders,
`LegacyFeaturedConversion.php`, la migration `700400`, `DatabaseSeeder.php`, le test.

---

## Tâche 10 — Achat : Remontée, Vedette, Badge (`BoostRulesTest`)

**Fichiers :** créer `app/Services/Boost/BoostPurchaseService.php`, `app/Services/Boost/BoostLifecycle.php`
(socle : `project()`, `writeProperty()` ; le reste en tâche 12), `tests/Feature/Boost/BoostRulesTest.php` ;
Edit `lang/{fr,en,wo}/errors.php`.

**Étape 10.1 — test (rouge).** `takussan-api/tests/Feature/Boost/BoostRulesTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\CreditMovement;
use App\Models\Enums\BoostBadge;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\User;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §5, AC14) — les règles d'achat : Remontée (jamais remboursée, une par
 * 24 h), Vedette (pas de cumul : prolonge), Badge (un seul actif, remplace sans remboursement) ;
 * bien public exigé ; solde suffisant exigé, montant manquant rendu.
 */
class BoostRulesTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    private User $buyer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-12 10:00:00'));
        $this->agency = Agency::factory()->create();
        $this->property = Property::factory()->published()->create(['agency_id' => $this->agency->id, 'published_at' => now()->subDays(5)]);
        $this->buyer = User::factory()->create();
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 500, now()->addDays(180));
    }

    public function test_une_remontee_remet_le_bien_en_tete_et_attend_24_h(): void
    {
        $boost = $this->acheter($this->offre('bump'));

        $this->assertSame(BoostStatus::Ended, $boost->status);
        $this->assertTrue($this->property->fresh()->ranked_at->equalTo(now()));
        $this->assertSame(495, $this->solde());

        $this->travel(23)->hours();
        $erreur = $this->refus(fn () => $this->acheter($this->offre('bump')));
        $this->assertSame('boost.bump_cooldown', $erreur->errorCode);
        $this->assertSame(Carbon::parse('2026-10-13 10:00:00')->toIso8601String(), $erreur->params['available_at']);
        $this->assertSame(495, $this->solde(), 'un refus ne débite rien');

        $this->travel(1)->hours();
        $this->acheter($this->offre('bump'));
        $this->assertSame(490, $this->solde());
    }

    public function test_une_vedette_se_prolonge_au_lieu_de_se_cumuler(): void
    {
        $premiere = $this->acheter($this->offre('featured', 7));
        $this->assertTrue((bool) $this->property->fresh()->featured);
        $this->assertTrue($this->property->fresh()->sponsored_until->equalTo(now()->addDays(7)));

        $this->travel(2)->days();
        $seconde = $this->acheter($this->offre('featured', 15));

        $this->assertSame($premiere->id, $seconde->id, 'une seule Vedette par bien');
        $this->assertSame(1, PropertyBoost::query()->where('property_id', $this->property->id)->where('kind', BoostKind::Featured)->count());
        $this->assertTrue($seconde->fresh()->ends_at->equalTo(Carbon::parse('2026-10-12 10:00:00')->addDays(22)));
        $this->assertSame(55, $seconde->fresh()->price_credits);
        $this->assertSame(22, $seconde->fresh()->duration_days);
        $this->assertSame(445, $this->solde());
        $this->assertSame(2, CreditMovement::query()->where('property_boost_id', $premiere->id)->count());
    }

    public function test_un_badge_remplace_le_precedent_sans_remboursement(): void
    {
        $urgent = $this->acheter($this->offre('badge', 7, 'urgent'));
        $baisse = $this->acheter($this->offre('badge', 7, 'price_drop'));

        $this->assertSame(BoostStatus::Ended, $urgent->fresh()->status);
        $this->assertSame(BoostStatus::Active, $baisse->fresh()->status);
        $this->assertSame(BoostBadge::PriceDrop, $this->property->fresh()->badge);
        $this->assertSame(480, $this->solde(), 'deux badges payés, aucun remboursé');
    }

    public function test_un_bien_non_public_ne_se_booste_pas(): void
    {
        $this->property->update(['visibility' => PropertyVisibility::Private]);

        $erreur = $this->refus(fn () => $this->acheter($this->offre('featured', 7)));

        $this->assertSame('boost.property_not_public', $erreur->errorCode);
        $this->assertSame(500, $this->solde());
        $this->assertSame(0, PropertyBoost::query()->count());
    }

    public function test_un_solde_insuffisant_rend_le_montant_manquant(): void
    {
        $pauvre = Agency::factory()->create();
        app(CreditLedger::class)->grant($pauvre, CreditLotOrigin::Welcome, 12, now()->addDays(30));
        $bien = Property::factory()->published()->create(['agency_id' => $pauvre->id]);

        $erreur = $this->refus(fn () => app(BoostPurchaseService::class)->purchase($bien, $this->offre('featured', 7), $this->buyer));

        $this->assertSame(422, $erreur->getStatusCode());
        $this->assertSame('credits.insufficient', $erreur->errorCode);
        $this->assertSame(['missing' => 8, 'balance' => 12], $erreur->params);
        $this->assertSame(0, PropertyBoost::query()->where('property_id', $bien->id)->count(), 'la transaction a tout annulé');
    }

    public function test_une_offre_inactive_ne_s_achete_pas(): void
    {
        $offre = $this->offre('featured', 30);
        $offre->update(['is_active' => false]);

        $this->assertSame('boost.product_inactive', $this->refus(fn () => $this->acheter($offre))->errorCode);
    }

    public function test_le_prix_est_fige_a_l_achat(): void
    {
        $offre = $this->offre('featured', 7);
        $boost = $this->acheter($offre);
        $offre->update(['price_credits' => 99]);

        $this->assertSame(20, $boost->fresh()->price_credits);
    }

    private function offre(string $kind, int $days = 0, ?string $variant = null): BoostProduct
    {
        return BoostProduct::query()->where('kind', $kind)->where('duration_days', $days)
            ->where('variant', $variant)->sole();
    }

    private function acheter(BoostProduct $offre): PropertyBoost
    {
        return app(BoostPurchaseService::class)->purchase($this->property->fresh(), $offre, $this->buyer);
    }

    private function refus(callable $appel): ApiError
    {
        try {
            $appel();
        } catch (ApiError $e) {
            return $e;
        }
        $this->fail('aucun refus');
    }

    private function solde(): int
    {
        return app(CreditLedger::class)->balance($this->agency);
    }
}
```

> `->where('variant', null)` produit `variant IS NULL` (Eloquent) — relu, c'est le comportement de
> `Builder::where()` avec une valeur nulle et l'opérateur implicite.

Rouge : `Class "App\Services\Boost\BoostPurchaseService" not found`.

**Étape 10.2 — `takussan-api/app/Services/Boost/BoostLifecycle.php`** (socle ; la tâche 12 complète
la classe — le fichier complet final y est donné) :

```php
<?php

namespace App\Services\Boost;

use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use Laravel\Scout\ModelObserver;

/**
 * TCK-633 lot F (ADR-0061 §5, §8) — le SEUL écrivain des projections d'un bien (`featured`,
 * `sponsored_until`, `badge`, `badge_until`) et du cycle de vie des boosts.
 */
final class BoostLifecycle
{
    /** Projette les boosts ACTIFS sur les colonnes du bien. */
    public function project(Property $property): void
    {
        if (! $property->exists) {
            return;
        }
        $actifs = PropertyBoost::query()
            ->where('property_id', $property->getKey())
            ->where('status', BoostStatus::Active)
            ->whereIn('kind', [BoostKind::Featured, BoostKind::Badge])
            ->get();
        $vedette = $actifs->first(fn (PropertyBoost $b) => $b->kind === BoostKind::Featured);
        $badge = $actifs->first(fn (PropertyBoost $b) => $b->kind === BoostKind::Badge);

        $this->writeProperty($property, [
            'featured' => $vedette !== null,
            'sponsored_until' => $vedette?->ends_at,
            'badge' => $badge?->variant,
            'badge_until' => $badge?->ends_at,
        ]);
    }

    /**
     * Écrit sans repasser par les observateurs — sinon `PropertyObserver::updated()` relancerait la
     * réconciliation pour sa propre écriture — puis tient l'index comme l'observateur de Scout l'aurait fait.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function writeProperty(Property $property, array $attributes): void
    {
        if (! $property->exists) {
            return;
        }
        $property->forceFill($attributes);
        if (! $property->isDirty()) {
            return;
        }
        $property->saveQuietly();

        if (ModelObserver::syncingDisabledFor(Property::class)) {
            return;
        }
        $property->shouldBeSearchable() ? $property->searchable() : $property->unsearchable();
    }
}
```

**Étape 10.3 — `takussan-api/app/Services/Boost/BoostPurchaseService.php`** :

```php
<?php

namespace App\Services\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditMovementType;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\User;
use App\Services\Credits\CreditLedger;
use App\Services\Credits\InsufficientCredits;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 lot F (ADR-0061 §5) — acheter (ou offrir) un boost. Prix et durée se figent dans la ligne
 * `property_boosts`. Tout se joue dans UNE transaction, sous le verrou de l'espace puis du bien :
 * deux achats simultanés sur le même bien se sérialisent (délai de Remontée, prolongation de Vedette).
 */
final class BoostPurchaseService
{
    public function __construct(
        private readonly CreditLedger $ledger,
        private readonly BoostSettings $settings,
        private readonly BoostLifecycle $lifecycle,
    ) {}

    public function purchase(Property $property, BoostProduct $product, User $buyer): PropertyBoost
    {
        abort_code_unless($product->is_active, 422, 'boost.product_inactive');
        $this->assertBoostable($property);

        try {
            return DB::transaction(function () use ($property, $product, $buyer): PropertyBoost {
                [$agency, $locked] = $this->lock($property);

                return match ($product->kind) {
                    BoostKind::Bump => $this->bump($locked, $agency, $product, $buyer),
                    BoostKind::Featured => $this->featured($locked, $agency, $product, $buyer, false, null),
                    BoostKind::Badge => $this->badge($locked, $agency, $product, $buyer),
                };
            });
        } catch (InsufficientCredits $e) {
            abort_code(422, 'credits.insufficient', ['missing' => $e->missing(), 'balance' => $e->balance]);
        }
    }

    /** ADR-0061 §5 — Vedette offerte par la plateforme : prix 0, auteur, motif, aucun mouvement. */
    public function offerFeatured(Property $property, BoostProduct $product, User $operator, string $reason): PropertyBoost
    {
        abort_code_unless($product->kind === BoostKind::Featured, 422, 'boost.offer_featured_only');
        $this->assertBoostable($property);

        return DB::transaction(function () use ($property, $product, $operator, $reason): PropertyBoost {
            [$agency, $locked] = $this->lock($property);

            return $this->featured($locked, $agency, $product, $operator, true, $reason);
        });
    }

    private function assertBoostable(Property $property): void
    {
        abort_code_if($property->agency_id === null, 422, 'boost.no_space');
        // Le prédicat public est COMPOSÉ, jamais recopié : `scopePublic()` fait foi.
        abort_code_unless(Property::query()->public()->whereKey($property->getKey())->exists(), 422, 'boost.property_not_public');
    }

    /** @return array{0: Agency, 1: Property} */
    private function lock(Property $property): array
    {
        $agency = Agency::query()->whereKey($property->agency_id)->lockForUpdate()->firstOrFail();
        $locked = Property::query()->whereKey($property->getKey())->lockForUpdate()->firstOrFail();

        return [$agency, $locked];
    }

    private function bump(Property $property, Agency $agency, BoostProduct $product, User $buyer): PropertyBoost
    {
        $cooldown = $this->settings->bumpCooldownHours();
        $last = PropertyBoost::query()
            ->where('property_id', $property->getKey())
            ->where('kind', BoostKind::Bump)
            ->orderByDesc('starts_at')
            ->orderByDesc('id')
            ->first();
        if ($last !== null && $last->starts_at->copy()->addHours($cooldown)->isFuture()) {
            abort_code(422, 'boost.bump_cooldown', ['available_at' => $last->starts_at->copy()->addHours($cooldown)->toIso8601String()]);
        }

        // Une Remontée est instantanée : sa ligne naît close, et n'est jamais remboursée.
        $boost = PropertyBoost::query()->create([
            'property_id' => $property->getKey(),
            'agency_id' => $agency->getKey(),
            'boost_product_id' => $product->getKey(),
            'kind' => BoostKind::Bump,
            'price_credits' => $product->price_credits,
            'duration_days' => 0,
            'starts_at' => now(),
            'ends_at' => now(),
            'ended_at' => now(),
            'status' => BoostStatus::Ended,
            'purchased_by_id' => $buyer->getKey(),
        ]);
        $this->debit($agency, $product->price_credits, $boost, $buyer);
        $this->lifecycle->writeProperty($property, ['ranked_at' => now()]);

        return $boost;
    }

    private function featured(Property $property, Agency $agency, BoostProduct $product, User $actor, bool $offered, ?string $reason): PropertyBoost
    {
        $price = $offered ? 0 : $product->price_credits;
        $current = PropertyBoost::query()
            ->where('property_id', $property->getKey())
            ->where('kind', BoostKind::Featured)
            ->whereIn('status', BoostStatus::live())
            ->lockForUpdate()
            ->first();

        if ($current !== null) {
            // ADR-0061 §5 : pas de cumul — on PROLONGE la Vedette en place.
            $seconds = $product->duration_days * 86400;
            $current->forceFill([
                'price_credits' => $current->price_credits + $price,
                'duration_days' => $current->duration_days + $product->duration_days,
                'ends_at' => $current->status === BoostStatus::Active ? $current->ends_at?->copy()->addSeconds($seconds) : null,
                'remaining_seconds' => $current->status === BoostStatus::Paused ? (int) $current->remaining_seconds + $seconds : null,
                'offered' => $current->offered && $offered,
            ])->save();
            $boost = $current;
        } else {
            $boost = PropertyBoost::query()->create([
                'property_id' => $property->getKey(),
                'agency_id' => $agency->getKey(),
                'boost_product_id' => $product->getKey(),
                'kind' => BoostKind::Featured,
                'price_credits' => $price,
                'duration_days' => $product->duration_days,
                'starts_at' => now(),
                'ends_at' => now()->addDays($product->duration_days),
                'status' => BoostStatus::Active,
                'offered' => $offered,
                'offer_reason' => $reason,
                'purchased_by_id' => $actor->getKey(),
            ]);
        }

        $this->debit($agency, $price, $boost, $actor);
        $this->lifecycle->project($property);

        return $boost;
    }

    private function badge(Property $property, Agency $agency, BoostProduct $product, User $buyer): PropertyBoost
    {
        // ADR-0061 §5 : un seul badge actif ; le nouveau remplace l'ancien, sans remboursement.
        PropertyBoost::query()
            ->where('property_id', $property->getKey())
            ->where('kind', BoostKind::Badge)
            ->whereIn('status', BoostStatus::live())
            ->update(['status' => BoostStatus::Ended->value, 'ended_at' => now(), 'remaining_seconds' => null, 'updated_at' => now()]);

        $boost = PropertyBoost::query()->create([
            'property_id' => $property->getKey(),
            'agency_id' => $agency->getKey(),
            'boost_product_id' => $product->getKey(),
            'kind' => BoostKind::Badge,
            'variant' => $product->variant,
            'price_credits' => $product->price_credits,
            'duration_days' => $product->duration_days,
            'starts_at' => now(),
            'ends_at' => now()->addDays($product->duration_days),
            'status' => BoostStatus::Active,
            'purchased_by_id' => $buyer->getKey(),
        ]);
        $this->debit($agency, $product->price_credits, $boost, $buyer);
        $this->lifecycle->project($property);

        return $boost;
    }

    private function debit(Agency $agency, int $price, PropertyBoost $boost, User $actor): void
    {
        if ($price > 0) {
            $this->ledger->spend($agency, $price, CreditMovementType::Spend, $boost, $actor);
        }
    }
}
```

**Étape 10.4 — Edit `lang/{fr,en,wo}/errors.php`** (co-tenu C, D, F). Dans chacun des trois fichiers :
(a) ancre `    'booking' => [` → insérer **avant** :

fr :
```php
    'boost' => [
        'bump_cooldown' => 'Ce bien a été remonté il y a moins de 24 heures. Nouvelle remontée possible à partir du :available_at.',
        'no_space' => 'Ce bien n’est rattaché à aucun espace : il ne peut pas être mis en avant.',
        'not_live' => 'Cette mise en avant est déjà terminée.',
        'offer_featured_only' => 'Seule une Vedette peut être offerte.',
        'product_inactive' => 'Cette offre n’est plus proposée.',
        'property_not_public' => 'Seul un bien publié et visible peut être mis en avant.',
    ],
```

en :
```php
    'boost' => [
        'bump_cooldown' => 'This listing was bumped less than 24 hours ago. Next bump available from :available_at.',
        'no_space' => 'This listing belongs to no workspace: it cannot be promoted.',
        'not_live' => 'This promotion has already ended.',
        'offer_featured_only' => 'Only a Featured promotion can be offered.',
        'product_inactive' => 'This offer is no longer available.',
        'property_not_public' => 'Only a published, visible listing can be promoted.',
    ],
```

wo :
```php
    'boost' => [
        'bump_cooldown' => 'Kër gii yékkati nañu ko des na 24 waxtu. Mën ngeen ko yékkati ci :available_at.',
        'no_space' => 'Kër gii bokkul ci benn bérab : mënuñu ko yokk gis-gis.',
        'not_live' => 'Yokk gis-gis gii jeex na.',
        'offer_featured_only' => 'Vedette rekk lañu mën a may.',
        'product_inactive' => 'Jaay gii amatul.',
        'property_not_public' => 'Kër gu ñu siiwal te ñu koy gis rekk lañu mën a yokk gis-gis.',
    ],
```

(b) ancre `    'conversation' => [` → insérer **avant** (le groupe `credits` se range entre `commission` et
`conversation` dans l'ordre alphabétique relevé l. 106-113) :

fr :
```php
    'credits' => [
        'insufficient' => 'Solde insuffisant : il vous manque :missing crédits (solde : :balance).',
        'no_space' => 'Aucun espace actif : sélectionnez un espace pour consulter ses crédits.',
    ],
```

en :
```php
    'credits' => [
        'insufficient' => 'Insufficient balance: you are missing :missing credits (balance: :balance).',
        'no_space' => 'No active workspace: select a workspace to see its credits.',
    ],
```

wo :
```php
    'credits' => [
        'insufficient' => 'Sa kredi doyul : des na la :missing kredi (sa kredi : :balance).',
        'no_space' => 'Amul bérab bu dox : tannal benn bérab ngir gis ay kredi am.',
    ],
```

> Si l'ordre de premier niveau relu diffère au moment de l'Edit (un autre lot a inséré un groupe),
> ancrer sur le groupe qui suit alphabétiquement `boost` / `credits` dans le fichier **tel qu'il est
> alors** ; `LangGroupParityTest` ne juge que la parité des clés entre les trois langues.

**Étape 10.5 — vert** : `php artisan test tests/Feature/Boost/BoostRulesTest.php` → `7 passed` ;
`php artisan test --filter=LangGroupParityTest` → vert.

**Étape 10.6 — ablations** : (1) dans `featured()`, remplacer `if ($current !== null) {` par
`if (false) {` → `test_une_vedette_se_prolonge…` rouge (deux lignes Vedette) ; (2) dans `bump()`,
retirer le bloc `if ($last !== null && …) { abort_code(…); }` → `test_une_remontee…` rouge ;
(3) dans `assertBoostable()`, retirer la ligne `abort_code_unless(Property::query()->public()…)` →
`test_un_bien_non_public…` rouge. Restaurer chaque fois par `cp`, `md5`.

**Étape 10.7 — signaler à la session les fichiers à commiter :** `BoostPurchaseService.php`,
`BoostLifecycle.php`, `lang/{fr,en,wo}/errors.php`, le test.

---

## Tâche 11 — `featured` n'est plus inscriptible par une requête (`FeaturedNotWritableTest`)

**Fichiers :** Edit `app/Http/Requests/UpdatePropertyRequest.php` (co-tenu D, F) ; créer
`tests/Feature/Boost/FeaturedNotWritableTest.php`.

**Étape 11.1 — test (rouge).** `takussan-api/tests/Feature/Boost/FeaturedNotWritableTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-633 lot F (ADR-0061 §5) — `featured` est DÉRIVÉ des boosts : plus aucune requête ne l'écrit,
 * pas même celle d'un super-admin (qui offre une Vedette par `POST /api/admin/properties/{p}/offered-boost`).
 */
class FeaturedNotWritableTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_le_super_admin_ne_l_ecrit_plus(): void
    {
        $property = Property::factory()->published()->create();
        $this->actingAsRole('super_admin');

        $this->patchJson("/api/properties/{$property->id}", ['featured' => true])
            ->assertStatus(422)->assertJsonValidationErrors('featured');
        $this->assertFalse((bool) $property->fresh()->featured);
    }

    public function test_l_admin_d_espace_non_plus(): void
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->apiPatch("/api/properties/{$property->id}", ['featured' => true])->assertStatus(422);
        $this->apiPatch("/api/properties/{$property->id}", ['featured' => false])->assertStatus(422);
        $this->assertFalse((bool) $property->fresh()->featured);
    }

    public function test_la_creation_l_ignore(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $id = $this->apiPost('/api/properties', [
            'title' => 'Studio à Ouakam', 'type' => 'apartment', 'contract_type' => 'rent', 'rent_period' => 'monthly',
            'price' => 150000, 'currency' => 'XOF', 'featured' => true,
        ])->json('data.id');

        if ($id !== null) {
            $this->assertFalse((bool) Property::query()->findOrFail($id)->featured);
        } else {
            // La création a refusé le corps pour une autre raison : on vérifie au moins qu'aucun bien vedette n'existe.
            $this->assertSame(0, Property::query()->where('featured', true)->count());
        }
    }
}
```

> `test_la_creation_l_ignore` ne dépend pas du détail des champs exigés par `StorePropertyRequest`
> (relu : `featured` n'y figure pas, donc `validated()` l'écarte) ; sa seconde branche garde la
> propriété même si le corps minimal change.

Rouge : `test_le_super_admin_ne_l_ecrit_plus` (200 au lieu de 422 : la règle actuelle l. 58 l'autorise au super-admin).

**Étape 11.2 — Edit `UpdatePropertyRequest.php`.** Ancre (l. 58) :

```php
            'featured' => ['sometimes', 'boolean', Rule::prohibitedIf(! $this->user()->isSuperAdmin())],
```

→ remplacer par :

```php
            // TCK-633 lot F (ADR-0061 §5) — dérivé des boosts, écrit par `BoostLifecycle` seul.
            'featured' => ['prohibited'],
```

Vérifier ensuite que `Rule` reste utilisé ailleurs dans le fichier (`grep -n "Rule::" app/Http/Requests/UpdatePropertyRequest.php`) ;
s'il ne l'est plus, retirer son `use` (Pint le signalerait sinon comme import inutilisé).

**Étape 11.3 — vert** : `php artisan test tests/Feature/Boost/FeaturedNotWritableTest.php` → `3 passed` ;
non-régression des tests qui lisent `featured` : `php artisan test tests/Feature/PublicPropertySearchFiltersTest.php`
et `php artisan test tests/Feature/Search/SavedSearchCriteriaVocabularyTest.php` → verts (le filtre
`featured=true` reste valide).

**Étape 11.4 — ablation** : restaurer l'ancienne règle (copie) → rouge ; `cp`, `md5`.

**Étape 11.5 — signaler à la session les fichiers à commiter :** `UpdatePropertyRequest.php`, le test.

---

## Tâche 12 — Cycle de vie : pause, reprise, remboursement, fin (`BoostPauseAndRefundTest`)

**Fichiers :** compléter `app/Services/Boost/BoostLifecycle.php` ; Edit `app/Observers/PropertyObserver.php`
(F seul) ; compléter `app/Observers/AgencyBoostObserver.php` ; créer
`tests/Feature/Boost/BoostPauseAndRefundTest.php`.

**Étape 12.1 — test (rouge).** `takussan-api/tests/Feature/Boost/BoostPauseAndRefundTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\CreditLot;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\User;
use App\Notifications\Boost\BoostEndedNotification;
use App\Notifications\Boost\BoostRefundedNotification;
use App\Services\Boost\BoostLifecycle;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §8, AC15) — dépublier met en pause, republier reprend sans perte ; loué,
 * vendu ou supprimé par l'annonceur rembourse les jours pleins restants ; la modération clôt sans
 * rien rendre ; une Remontée et un Badge ne sont jamais remboursés automatiquement.
 */
class BoostPauseAndRefundTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo(Carbon::parse('2026-10-12 10:00:00'));
        $this->agency = Agency::factory()->create();
        $this->admin = $this->actingAsRole('agency_admin', ['agency' => $this->agency]);
        $this->property = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 500, now()->addDays(180));
    }

    public function test_depublier_met_en_pause_republier_reprend_sans_perte(): void
    {
        $vedette = $this->vedette7j();
        $this->travel(2)->days();

        $this->property->update(['visibility' => PropertyVisibility::Private]);

        $vedette->refresh();
        $this->assertSame(BoostStatus::Paused, $vedette->status);
        $this->assertSame(5 * 86400, $vedette->remaining_seconds);
        $this->assertFalse((bool) $this->property->fresh()->featured);

        $this->travel(10)->days();
        $this->property->update(['visibility' => PropertyVisibility::Public]);

        $vedette->refresh();
        $this->assertSame(BoostStatus::Active, $vedette->status);
        $this->assertTrue($vedette->ends_at->equalTo(now()->addDays(5)), 'les dix jours de pause ne sont pas consommés');
        $this->assertTrue((bool) $this->property->fresh()->featured);
    }

    public function test_suspendre_l_espace_met_en_pause_le_reactiver_reprend(): void
    {
        $vedette = $this->vedette7j();

        $this->agency->update(['status' => AgencyStatus::Suspended]);
        $this->assertSame(BoostStatus::Paused, $vedette->fresh()->status);

        $this->agency->update(['status' => AgencyStatus::Active]);
        $this->assertSame(BoostStatus::Active, $vedette->fresh()->status);
    }

    public function test_louer_rembourse_les_jours_pleins_restants_au_prorata(): void
    {
        $vedette = $this->vedette7j();
        $badge = app(BoostPurchaseService::class)->purchase($this->property->fresh(), BoostProduct::query()->where('variant', 'urgent')->sole(), $this->admin);
        $this->travel(2)->days()->travel(3)->hours();

        $this->property->update(['status' => PropertyStatus::Rented]);

        // 4 j 21 h restants → 4 jours pleins → floor(20 × 4 / 7) = 11.
        $vedette->refresh();
        $this->assertSame(BoostStatus::Refunded, $vedette->status);
        $this->assertSame(11, $vedette->refunded_credits);
        $lot = CreditLot::query()->where('origin', CreditLotOrigin::Refund)->sole();
        $this->assertSame(11, $lot->initial_amount);
        $this->assertSame(BoostStatus::Ended, $badge->fresh()->status, 'un Badge n’est jamais remboursé automatiquement');
        $this->assertSame(500 - 20 - 10 + 11, app(CreditLedger::class)->balance($this->agency));
        $this->assertFalse((bool) $this->property->fresh()->featured);
        $this->assertNull($this->property->fresh()->badge);
        Notification::assertSentTo($this->admin, BoostRefundedNotification::class, fn ($n) => $n->credits === 11);
    }

    public function test_supprimer_par_l_annonceur_rembourse(): void
    {
        $vedette = $this->vedette7j();
        $this->travel(1)->days();

        $this->property->delete();

        $this->assertSame(BoostStatus::Refunded, $vedette->fresh()->status);
        $this->assertSame(intdiv(20 * 6, 7), $vedette->fresh()->refunded_credits);
    }

    public function test_la_moderation_clot_sans_rien_rendre(): void
    {
        $vedette = $this->vedette7j();

        // Ce qu'écrit `PropertyModerationService::hold()` (l. 251-264).
        $this->property->forceFill([
            'status' => PropertyStatus::Rejected, 'visibility' => PropertyVisibility::Private,
            'published_at' => null, 'platform_hold_at' => now(),
        ])->save();

        $this->assertSame(BoostStatus::Ended, $vedette->fresh()->status);
        $this->assertSame(0, CreditLot::query()->where('origin', CreditLotOrigin::Refund)->count());
        Notification::assertSentTo($this->admin, BoostEndedNotification::class);
    }

    public function test_reconcilier_deux_fois_ne_rembourse_qu_une_fois(): void
    {
        $vedette = $this->vedette7j();
        $this->property->update(['status' => PropertyStatus::Sold]);

        app(BoostLifecycle::class)->reconcile($this->property->fresh());

        $this->assertSame(1, CreditLot::query()->where('origin', CreditLotOrigin::Refund)->count());
        $this->assertSame(BoostStatus::Refunded, $vedette->fresh()->status);
    }

    private function vedette7j(): PropertyBoost
    {
        return app(BoostPurchaseService::class)->purchase(
            $this->property->fresh(),
            BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole(),
            $this->admin,
        );
    }
}
```

Rouge : la pause n'existe pas (`Failed asserting that two variables reference the same object` sur `Paused`).

**Étape 12.2 — `BoostLifecycle.php` complet** (remplace le socle de la tâche 10 ; `project()` et
`writeProperty()` inchangés) :

```php
<?php

namespace App\Services\Boost;

use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\User;
use App\Notifications\Boost\BoostEndedNotification;
use App\Notifications\Boost\BoostRefundedNotification;
use App\Services\Credits\CreditLedger;
use App\Services\Lead\ContactLeadService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Laravel\Scout\ModelObserver;

/**
 * TCK-633 lot F (ADR-0061 §5, §8, §9) — le SEUL écrivain des projections d'un bien (`featured`,
 * `sponsored_until`, `badge`, `badge_until`) et du cycle de vie des boosts. Chaque transition de
 * clôture se RÉCLAME par un `UPDATE … WHERE status IN (live)` : deux passages concurrents (observateur
 * et tick) n'en appliquent qu'un, et ne remboursent qu'une fois.
 */
final class BoostLifecycle
{
    private const DAY = 86400;

    public function __construct(private readonly CreditLedger $ledger) {}

    /** ADR-0061 §8 — rejoue les règles pour un bien. Idempotent. Rend le nombre de boosts touchés. */
    public function reconcile(Property $property, ?User $actor = null): int
    {
        if (! $property->exists) {
            return 0;
        }
        $boosts = PropertyBoost::query()
            ->where('property_id', $property->getKey())
            ->whereIn('status', BoostStatus::live())
            ->get();
        if ($boosts->isEmpty()) {
            return 0;
        }

        $touched = 0;
        if ($property->platform_hold_at !== null) {
            // Modération (verrou plateforme, signalement retenu) : fin, rien de remboursé.
            foreach ($boosts as $boost) {
                $touched += $this->end($boost) ? 1 : 0;
            }
        } elseif ($property->trashed() || in_array($property->status, [PropertyStatus::Rented, PropertyStatus::Sold], true)) {
            foreach ($boosts as $boost) {
                $this->closeWithRefund($boost, $actor, null, cancelled: false, anyKind: false);
                $touched++;
            }
        } else {
            $public = Property::query()->public()->whereKey($property->getKey())->exists();
            foreach ($boosts as $boost) {
                if (! $public && $boost->status === BoostStatus::Active) {
                    $this->pause($boost);
                    $touched++;
                } elseif ($public && $boost->status === BoostStatus::Paused) {
                    $this->resume($boost);
                    $touched++;
                }
            }
        }

        $this->project($property);

        return $touched;
    }

    /** ADR-0061 §9 — clôt les Vedettes et Badges échus. Idempotent. */
    public function endExpired(): int
    {
        $count = 0;
        $due = PropertyBoost::query()
            ->where('status', BoostStatus::Active)
            ->whereNotNull('ends_at')
            ->where('ends_at', '<=', now())
            ->whereIn('kind', [BoostKind::Featured, BoostKind::Badge])
            ->get();

        foreach ($due as $boost) {
            if (! $this->end($boost)) {
                continue;
            }
            $count++;
            $property = Property::withTrashed()->find($boost->property_id);
            if ($property !== null) {
                $this->project($property);
            }
        }

        return $count;
    }

    /** ADR-0061 §9 — filet de sécurité : rejoue `reconcile()` pour tout bien qui porte un boost vivant. */
    public function reconcileAll(): int
    {
        $touched = 0;
        Property::withTrashed()
            ->whereIn('id', PropertyBoost::query()->whereIn('status', BoostStatus::live())->select('property_id'))
            ->chunkById(100, function (Collection $properties) use (&$touched): void {
                foreach ($properties as $property) {
                    $touched += $this->reconcile($property);
                }
            });

        return $touched;
    }

    /** ADR-0061 §5, AC16 — annulation par la plateforme, avec ou sans remboursement. */
    public function cancel(PropertyBoost $boost, bool $refund, User $operator, string $reason): PropertyBoost
    {
        abort_code_unless(in_array($boost->status, BoostStatus::live(), true), 422, 'boost.not_live');

        DB::transaction(function () use ($boost, $refund, $operator, $reason): void {
            if ($refund) {
                $this->closeWithRefund($boost, $operator, $reason, cancelled: true, anyKind: true);
            } else {
                PropertyBoost::query()->whereKey($boost->getKey())->whereIn('status', $this->liveValues())->update([
                    'status' => BoostStatus::Cancelled->value, 'ended_at' => now(), 'remaining_seconds' => null,
                    'cancel_reason' => $reason, 'cancelled_by_id' => $operator->getKey(), 'updated_at' => now(),
                ]);
            }
            $property = Property::withTrashed()->find($boost->property_id);
            if ($property !== null) {
                $this->project($property);
            }
        });

        return $boost->fresh();
    }

    /** Jours PLEINS restants, au prorata du prix figé (ADR-0061 §8). */
    public function refundableCredits(PropertyBoost $boost): int
    {
        if ($boost->duration_days <= 0 || $boost->price_credits <= 0) {
            return 0;
        }
        $seconds = match ($boost->status) {
            BoostStatus::Active => max(0, ($boost->ends_at?->getTimestamp() ?? 0) - now()->getTimestamp()),
            BoostStatus::Paused => (int) $boost->remaining_seconds,
            default => 0,
        };
        $fullDays = min(intdiv($seconds, self::DAY), $boost->duration_days);

        return intdiv($boost->price_credits * $fullDays, $boost->duration_days);
    }

    public function project(Property $property): void
    {
        if (! $property->exists) {
            return;
        }
        $actifs = PropertyBoost::query()
            ->where('property_id', $property->getKey())
            ->where('status', BoostStatus::Active)
            ->whereIn('kind', [BoostKind::Featured, BoostKind::Badge])
            ->get();
        $vedette = $actifs->first(fn (PropertyBoost $b) => $b->kind === BoostKind::Featured);
        $badge = $actifs->first(fn (PropertyBoost $b) => $b->kind === BoostKind::Badge);

        $this->writeProperty($property, [
            'featured' => $vedette !== null,
            'sponsored_until' => $vedette?->ends_at,
            'badge' => $badge?->variant,
            'badge_until' => $badge?->ends_at,
        ]);
    }

    /** @param  array<string, mixed>  $attributes */
    public function writeProperty(Property $property, array $attributes): void
    {
        if (! $property->exists) {
            return;
        }
        $property->forceFill($attributes);
        if (! $property->isDirty()) {
            return;
        }
        $property->saveQuietly();

        if (ModelObserver::syncingDisabledFor(Property::class)) {
            return;
        }
        $property->shouldBeSearchable() ? $property->searchable() : $property->unsearchable();
    }

    private function pause(PropertyBoost $boost): void
    {
        $remaining = max(0, ($boost->ends_at?->getTimestamp() ?? 0) - now()->getTimestamp());
        $boost->forceFill([
            'status' => BoostStatus::Paused, 'remaining_seconds' => $remaining, 'paused_at' => now(), 'ends_at' => null,
        ])->save();
    }

    private function resume(PropertyBoost $boost): void
    {
        $boost->forceFill([
            'status' => BoostStatus::Active, 'ends_at' => now()->addSeconds((int) $boost->remaining_seconds),
            'remaining_seconds' => null, 'paused_at' => null,
        ])->save();
    }

    /** Clôt sans remboursement. Rend false si un autre passage l'avait déjà clos. */
    private function end(PropertyBoost $boost): bool
    {
        $claimed = PropertyBoost::query()->whereKey($boost->getKey())->whereIn('status', $this->liveValues())->update([
            'status' => BoostStatus::Ended->value, 'ended_at' => now(), 'remaining_seconds' => null, 'updated_at' => now(),
        ]);
        if ($claimed === 0) {
            return false;
        }
        if ($boost->kind !== BoostKind::Bump) {
            $this->notify($boost, new BoostEndedNotification($boost->property_id, $this->title($boost)));
        }

        return true;
    }

    /**
     * Clôt en remboursant les jours pleins restants. Automatique : Vedette seulement (`anyKind` faux) ;
     * annulation par la plateforme : tout genre (`anyKind` vrai).
     */
    private function closeWithRefund(PropertyBoost $boost, ?User $actor, ?string $reason, bool $cancelled, bool $anyKind): int
    {
        $amount = ($anyKind || $boost->kind === BoostKind::Featured) ? $this->refundableCredits($boost) : 0;
        $status = $amount > 0 ? BoostStatus::Refunded : ($cancelled ? BoostStatus::Cancelled : BoostStatus::Ended);

        $claimed = PropertyBoost::query()->whereKey($boost->getKey())->whereIn('status', $this->liveValues())->update([
            'status' => $status->value,
            'ended_at' => now(),
            'remaining_seconds' => null,
            'refunded_credits' => $amount,
            'cancel_reason' => $cancelled ? $reason : null,
            'cancelled_by_id' => $cancelled ? $actor?->getKey() : null,
            'updated_at' => now(),
        ]);
        if ($claimed === 0) {
            return 0;
        }

        $this->ledger->refund($boost, $amount, $actor, $reason);
        $this->notify($boost, $amount > 0
            ? new BoostRefundedNotification($boost->property_id, $this->title($boost), $amount)
            : new BoostEndedNotification($boost->property_id, $this->title($boost)));

        return $amount;
    }

    /** @return list<string> */
    private function liveValues(): array
    {
        return array_map(fn (BoostStatus $s) => $s->value, BoostStatus::live());
    }

    private function title(PropertyBoost $boost): string
    {
        return (string) Property::withTrashed()->whereKey($boost->property_id)->value('title');
    }

    /** Aux admins actifs de l'espace, et à l'acheteur s'il n'en est pas. */
    private function notify(PropertyBoost $boost, object $notification): void
    {
        $recipients = app(ContactLeadService::class)->agencyAdmins($boost->agency_id);
        if ($boost->purchased_by_id !== null && ! $boost->offered) {
            $buyer = User::query()->find($boost->purchased_by_id);
            if ($buyer !== null) {
                $recipients->push($buyer);
            }
        }
        foreach ($recipients->unique('id') as $user) {
            $user->notify($notification);
        }
    }
}
```

**Étape 12.3 — Edit `PropertyObserver.php`** (F seul). (a) ancre `use App\Services\Property\SimilarPropertiesService;`
→ remplacer par :

```php
use App\Models\User;
use App\Services\Boost\BoostLifecycle;
use App\Services\Property\SimilarPropertiesService;
```

(b) dans `updated()`, ancre (l. 178) :

```php
        app(SimilarPropertiesService::class)->invalidateForProperty($property);
    }

    public function created(Property $property): void
```

→ remplacer par :

```php
        // TCK-633 lot F (ADR-0061 §8) — sortir du public met les boosts en pause, y revenir les
        // reprend ; loué / vendu rembourse ; un verrou plateforme les clôt sans rien rendre.
        if ($property->wasChanged(['status', 'visibility', 'published_at', 'platform_hold_at', 'is_test', 'agency_id'])) {
            app(BoostLifecycle::class)->reconcile($property, $this->actor());
        }

        app(SimilarPropertiesService::class)->invalidateForProperty($property);
    }

    public function created(Property $property): void
```

(c) dans `deleted()`, ancre :

```php
            $property->agency()->decrement('properties_count');
        }

        app(SimilarPropertiesService::class)->invalidateForProperty($property);
    }
}
```

→ remplacer par :

```php
            $property->agency()->decrement('properties_count');
        }

        // TCK-633 lot F (ADR-0061 §8) — supprimé par l'annonceur : la Vedette est remboursée. Une
        // suppression de modération est précédée du verrou plateforme, qui l'a déjà close.
        app(BoostLifecycle::class)->reconcile($property, $this->actor());

        app(SimilarPropertiesService::class)->invalidateForProperty($property);
    }

    private function actor(): ?User
    {
        $user = auth()->user();

        return $user instanceof User ? $user : null;
    }
}
```

**Étape 12.4 — `AgencyBoostObserver.php` complet** :

```php
<?php

namespace App\Observers;

use App\Models\Agency;
use App\Models\Enums\BoostStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Boost\BoostLifecycle;

/**
 * TCK-633 lot F (ADR-0061 §8) — suspendre ou désactiver un espace retire ses biens du public
 * (ADR-0048) : leurs boosts se mettent en pause ; le réactiver les reprend. Écriture de MASSE du
 * statut (`Agency::query()->update(...)`) : aucun événement, c'est `boosts:tick` qui rattrape.
 */
class AgencyBoostObserver
{
    public function updated(Agency $agency): void
    {
        if (! $agency->wasChanged('status')) {
            return;
        }
        $lifecycle = app(BoostLifecycle::class);

        Property::withTrashed()
            ->whereIn('id', PropertyBoost::query()
                ->where('agency_id', $agency->getKey())
                ->whereIn('status', array_map(fn (BoostStatus $s) => $s->value, BoostStatus::live()))
                ->select('property_id'))
            ->each(fn (Property $property) => $lifecycle->reconcile($property));
    }
}
```

**Étape 12.5 — vert** : `php artisan test tests/Feature/Boost/BoostPauseAndRefundTest.php` → `6 passed` ;
non-régression `php artisan test tests/Feature/Boost/BoostRulesTest.php` → `7 passed` ; et, parce que
l'observateur touche toute écriture de bien, `php bin/impacted-tests.php --run`.

**Étape 12.6 — ablations** : (1) dans `closeWithRefund()`, remplacer `whereIn('status', $this->liveValues())`
par rien (`->whereKey($boost->getKey())->update(`) → `test_reconcilier_deux_fois…` rouge (deux lots
`refund`) ; (2) dans `PropertyObserver::updated()`, retirer l'appel `reconcile` →
`test_depublier…` rouge ; (3) dans `refundableCredits()`, remplacer `intdiv($seconds, self::DAY)` par
`(int) ceil($seconds / self::DAY)` → `test_louer…` rouge (12 au lieu de 11). Restaurer chaque fois.

**Étape 12.7 — signaler à la session les fichiers à commiter :** `BoostLifecycle.php`,
`PropertyObserver.php`, `AgencyBoostObserver.php`, le test.

---

## Tâche 13 — `boosts:tick` (`BoostsTickIdempotenceTest`)

**Fichiers :** créer `app/Services/Credits/CreditExpiryNotifier.php`, `app/Console/Commands/BoostsTick.php`,
`tests/Feature/Boost/BoostsTickIdempotenceTest.php`, `tests/Feature/Boost/BoostsTickScheduleTest.php`
(différé C2). **Collision C2.**

**Étape 13.1 — test (rouge).** `takussan-api/tests/Feature/Boost/BoostsTickIdempotenceTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\CreditMovement;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\CreditMovementType;
use App\Models\Property;
use App\Notifications\Boost\BoostEndedNotification;
use App\Notifications\Credits\CreditsExpiringNotification;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §9) — `boosts:tick` toutes les 5 minutes : fin des boosts échus,
 * réconciliation, expiration des lots, préavis une fois. Rejoué, il ne fait rien de plus.
 */
class BoostsTickIdempotenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_deux_ticks_valent_un_tick(): void
    {
        Notification::fake();
        $agency = Agency::factory()->create();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        $ledger = app(CreditLedger::class);
        $ledger->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $vedetteBien = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $masseBien = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $vedette = app(BoostPurchaseService::class)->purchase($vedetteBien, $this->vedette(7), $admin);
        // 15 jours : au 8e jour, elle n'est pas échue — c'est la réconciliation qui doit la mettre en pause.
        $masse = app(BoostPurchaseService::class)->purchase($masseBien, $this->vedette(15), $admin);
        // Octroyé APRÈS les achats : les deux Vedettes ont consommé le lot de bienvenue, celui-ci
        // reste plein, et c'est lui qui entre dans la fenêtre de préavis (expire au 10e jour).
        $echeant = $ledger->grant($agency, CreditLotOrigin::AdminGrant, 15, now()->addDays(10));

        // Écriture de MASSE : aucun observateur ne la voit, seul le tick la rattrape.
        DB::table('properties')->where('id', $masseBien->id)->update(['visibility' => 'private']);
        $this->travel(8)->days();

        $this->artisan('boosts:tick')->assertSuccessful();
        $etat = $this->etat();
        $this->artisan('boosts:tick')->assertSuccessful();

        $this->assertSame($etat, $this->etat(), 'le second tick n’a rien changé');
        $this->assertSame(BoostStatus::Ended, $vedette->fresh()->status);
        $this->assertFalse((bool) $vedetteBien->fresh()->featured);
        $this->assertSame(BoostStatus::Paused, $masse->fresh()->status);
        $this->assertNotNull($echeant->fresh()->expiry_notice_sent_at);
        Notification::assertSentToTimes($admin, BoostEndedNotification::class, 1);
        Notification::assertSentToTimes($admin, CreditsExpiringNotification::class, 1);

        $this->travel(3)->days();
        $this->artisan('boosts:tick')->assertSuccessful();
        $this->artisan('boosts:tick')->assertSuccessful();
        $this->assertSame(1, CreditMovement::query()->where('credit_lot_id', $echeant->id)->where('type', CreditMovementType::Expire)->count());
        $this->assertSame([], $ledger->invariantViolations());
    }

    /** @return array<string, mixed> */
    private function etat(): array
    {
        return [
            'boosts' => DB::table('property_boosts')->orderBy('id')->get(['id', 'status', 'ends_at', 'remaining_seconds'])->toArray(),
            'mouvements' => DB::table('credit_movements')->count(),
            'lots' => DB::table('credit_lots')->orderBy('id')->get(['id', 'remaining_amount', 'expiry_notice_sent_at'])->toArray(),
        ];
    }

    private function vedette(int $days): BoostProduct
    {
        return BoostProduct::query()->where('kind', 'featured')->where('duration_days', $days)->sole();
    }
}
```

> Le compte : bienvenue 100 (jour 30) − 20 − 35 = 45 ; lot de 15 octroyé ensuite (jour 10). Au jour 8,
> seul le lot de 15 est dans la fenêtre de 7 jours (le lot de bienvenue est à 22 jours) : un préavis.
> Au jour 8, la Vedette de 7 jours est échue (fin, une notification `BoostEnded`), celle de 15 jours
> ne l'est pas et seule la réconciliation la met en pause. Au jour 11, le lot de 15 expire : un
> mouvement `expire`, un seul malgré deux ticks.

Rouge : `The command "boosts:tick" does not exist.`

**Étape 13.2 — `takussan-api/app/Services/Credits/CreditExpiryNotifier.php`** :

```php
<?php

namespace App\Services\Credits;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Notifications\Credits\CreditsExpiringNotification;
use App\Services\Boost\BoostSettings;
use App\Services\Lead\ContactLeadService;

/** TCK-633 lot F (ADR-0061 §9) — un préavis par lot, réclamé atomiquement : deux ticks n'en envoient qu'un. */
final class CreditExpiryNotifier
{
    public function __construct(
        private readonly BoostSettings $settings,
        private readonly ContactLeadService $contacts,
    ) {}

    public function sendNotices(): int
    {
        $days = $this->settings->expiryNoticeDays();
        if ($days <= 0) {
            return 0;
        }
        $count = 0;
        $lots = CreditLot::query()
            ->whereNull('expiry_notice_sent_at')
            ->where('remaining_amount', '>', 0)
            ->whereNotNull('expires_at')
            ->where('expires_at', '>', now())
            ->where('expires_at', '<=', now()->addDays($days))
            ->get();

        foreach ($lots as $lot) {
            $claimed = CreditLot::query()->whereKey($lot->getKey())->whereNull('expiry_notice_sent_at')
                ->update(['expiry_notice_sent_at' => now(), 'updated_at' => now()]);
            if ($claimed === 0) {
                continue;
            }
            $agency = Agency::withTrashed()->find($lot->agency_id);
            foreach ($this->contacts->agencyAdmins($lot->agency_id) as $admin) {
                $admin->notify(new CreditsExpiringNotification($lot->remaining_amount, $lot->expires_at->toDateString(), (string) $agency?->name));
            }
            $count++;
        }

        return $count;
    }
}
```

**Étape 13.3 — `takussan-api/app/Console/Commands/BoostsTick.php`** :

```php
<?php

namespace App\Console\Commands;

use App\Services\Boost\BoostLifecycle;
use App\Services\Credits\CreditExpiryNotifier;
use App\Services\Credits\CreditLedger;
use Illuminate\Console\Command;

/**
 * TCK-633 lot F (ADR-0061 §9) — toutes les 5 minutes. Chaque étape est idempotente par
 * construction (transitions réclamées par `UPDATE … WHERE`, lots expirés soldés à zéro, préavis
 * marqué) : un tick rejoué, ou deux ticks qui se chevauchent malgré `withoutOverlapping()`, ne
 * produisent rien de plus.
 */
class BoostsTick extends Command
{
    protected $signature = 'boosts:tick';

    protected $description = 'Clôt les boosts échus, réconcilie, expire les lots de crédits et envoie les préavis (ADR-0061 §9).';

    public function handle(BoostLifecycle $lifecycle, CreditLedger $ledger, CreditExpiryNotifier $notifier): int
    {
        $ended = $lifecycle->endExpired();
        $reconciled = $lifecycle->reconcileAll();
        $expired = $ledger->expireDue();
        $notices = $notifier->sendNotices();

        $this->info("boosts:tick ended={$ended} reconciled={$reconciled} expired_lots={$expired} notices={$notices}");

        return self::SUCCESS;
    }
}
```

**Étape 13.4 — test de planification (différé C2).** `takussan-api/tests/Feature/Boost/BoostsTickScheduleTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use Illuminate\Console\Scheduling\Schedule;
use Tests\TestCase;

/** TCK-633 lot F (ADR-0061 §9) — `boosts:tick` est planifié toutes les 5 minutes, sans chevauchement. */
class BoostsTickScheduleTest extends TestCase
{
    public function test_le_tick_est_planifie(): void
    {
        $events = collect(app(Schedule::class)->events())
            ->filter(fn ($event) => str_contains((string) $event->command, 'boosts:tick'));

        $this->assertCount(1, $events);
        $this->assertSame('*/5 * * * *', $events->first()->expression);
        $this->assertTrue($events->first()->withoutOverlapping);
    }
}
```

**Collision C2** — `routes/console.php`, en fin de fichier (après l'entrée `webhooks:prune`) :

```php

// TCK-633 lot F (ADR-0061 §9) — fin des boosts échus, réconciliation (filet des écritures de masse),
// expiration et préavis des lots de crédits. Idempotent : chaque transition est réclamée par un
// `UPDATE … WHERE status IN (…)`, un lot expiré est soldé à zéro, un préavis est marqué.
Schedule::command('boosts:tick')->everyFiveMinutes()->withoutOverlapping();
```

**Étape 13.5 — vert** : `php artisan test tests/Feature/Boost/BoostsTickIdempotenceTest.php` → `1 passed` ;
`node ../scripts/check-command-prefixes.mjs` → vert. **Ablation** : dans `CreditExpiryNotifier`,
retirer `->whereNull('expiry_notice_sent_at')` des DEUX requêtes → `assertSentToTimes(…, 1)` rouge
(2) ; restaurer, `md5`.

**Étape 13.6 — signaler à la session les fichiers à commiter :** `CreditExpiryNotifier.php`,
`BoostsTick.php`, les deux tests ; collision C2.

---

## Tâche 14 — L'ordre organique devient `ranked_at` ; la rotation déterministe

**Fichiers :** créer `app/Services/Boost/SponsoredRotation.php`, `tests/Unit/Boost/SponsoredRotationPickTest.php`,
`tests/Feature/Boost/RankedOrderTest.php` ; Edit `app/Models/Property.php` (`toSearchableArray()`),
`config/scout.php`, `app/Http/Controllers/Public/PublicPropertyController.php` (`index()`),
`app/Services/Property/HomepageDiscoveryService.php`, `app/Services/Search/PropertySearchService.php`
(`buildSort()`). **Collision C6.**

**Étape 14.1 — tests (rouges).** `takussan-api/tests/Unit/Boost/SponsoredRotationPickTest.php` :

```php
<?php

namespace Tests\Unit\Boost;

use App\Services\Boost\SponsoredRotation;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §7) — la rotation est DÉTERMINISTE : même graine, même tirage (la page reste
 * cacheable dans l'heure) ; la page p prend la tranche p en bouclant (chaque vedette passe à son tour).
 */
class SponsoredRotationPickTest extends TestCase
{
    public function test_la_graine_ignore_la_page_et_l_ordre_des_cles_mais_pas_l_heure(): void
    {
        $at = Carbon::parse('2026-10-12 10:15:00', 'UTC');

        $a = SponsoredRotation::seed(['contract_type' => 'rent', 'city' => 'Dakar', 'page' => 1, 'per_page' => 20], $at);
        $b = SponsoredRotation::seed(['city' => 'Dakar', 'contract_type' => 'rent', 'page' => 4], $at->copy()->addMinutes(40));

        $this->assertSame($a, $b);
        $this->assertNotSame($a, SponsoredRotation::seed(['city' => 'Dakar', 'contract_type' => 'rent'], $at->copy()->addHour()));
        $this->assertNotSame($a, SponsoredRotation::seed(['city' => 'Thiès', 'contract_type' => 'rent'], $at));
        $this->assertSame(
            SponsoredRotation::seed(['cities' => ['Dakar', 'Thiès'], 'q' => ''], $at),
            SponsoredRotation::seed(['cities' => ['Thiès', 'Dakar']], $at),
            'les valeurs vides tombent, les listes sont triées',
        );
    }

    public function test_meme_graine_meme_tirage(): void
    {
        $ids = range(1, 20);

        $this->assertSame(
            SponsoredRotation::pick($ids, 'graine', 1, 3),
            SponsoredRotation::pick(array_reverse($ids), 'graine', 1, 3),
            'l’ordre d’arrivée du vivier ne compte pas',
        );
        $this->assertNotSame(SponsoredRotation::pick($ids, 'graine', 1, 20), SponsoredRotation::pick($ids, 'autre', 1, 20));
    }

    public function test_les_pages_successives_font_passer_chaque_vedette(): void
    {
        $ids = [11, 22, 33, 44, 55];
        $vus = [];
        foreach ([1, 2, 3] as $page) {
            $tranche = SponsoredRotation::pick($ids, 'g', $page, 2);
            $this->assertCount(2, $tranche);
            $this->assertCount(2, array_unique($tranche));
            $vus = [...$vus, ...$tranche];
        }

        $this->assertEqualsCanonicalizing($ids, array_values(array_unique($vus)));
    }

    public function test_bornes(): void
    {
        $this->assertSame([], SponsoredRotation::pick([], 'g', 1, 3));
        $this->assertSame([], SponsoredRotation::pick([1, 2], 'g', 1, 0));
        $this->assertCount(2, SponsoredRotation::pick([1, 2], 'g', 1, 5), 'jamais deux fois le même bien sur une page');
    }
}
```

`takussan-api/tests/Feature/Boost/RankedOrderTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\User;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §7) — les résultats organiques ne lisent plus `featured` : la liste
 * publique et les rangées de l'accueil suivent `ranked_at`, qu'une Remontée remet à maintenant.
 */
class RankedOrderTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_liste_publique_suit_ranked_at_et_ignore_featured(): void
    {
        $agency = Agency::factory()->create();
        $ancienneVedette = Property::factory()->published()->create(['agency_id' => $agency->id, 'published_at' => now()->subDays(9), 'featured' => true]);
        $recent = Property::factory()->published()->create(['agency_id' => $agency->id, 'published_at' => now()->subDay()]);
        $ancien = Property::factory()->published()->create(['agency_id' => $agency->id, 'published_at' => now()->subDays(5)]);

        $this->assertSame([$recent->id, $ancien->id, $ancienneVedette->id], $this->ids());

        app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 50, now()->addDays(30));
        app(BoostPurchaseService::class)->purchase($ancien->fresh(), BoostProduct::query()->where('kind', 'bump')->sole(), User::factory()->create());

        $this->assertSame([$ancien->id, $recent->id, $ancienneVedette->id], $this->ids(), 'la Remontée remet le bien en tête');
    }

    public function test_la_rangee_vedette_de_l_accueil_tourne_parmi_les_vedettes_et_reste_stable_dans_l_heure(): void
    {
        $vedettes = Property::factory()->count(6)->published()->create(['featured' => true])->pluck('id')->all();
        Property::factory()->count(3)->published()->create();

        $premier = array_column($this->getJson('/api/public/properties/discovery?per_row=2')->assertOk()->json('data.featured.items'), 'id');
        $second = array_column($this->getJson('/api/public/properties/discovery?per_row=2')->json('data.featured.items'), 'id');

        $this->assertCount(2, $premier);
        $this->assertSame($premier, $second);
        $this->assertSame([], array_diff($premier, $vedettes));
    }

    /** @return list<int> */
    private function ids(): array
    {
        return array_column($this->getJson('/api/public/properties')->assertOk()->json('data'), 'id');
    }
}
```

Rouges : `Class "App\Services\Boost\SponsoredRotation" not found` ; `test_la_liste_publique…` (la
vedette ancienne sort en tête).

**Étape 14.2 — `takussan-api/app/Services/Boost/SponsoredRotation.php`** :

```php
<?php

namespace App\Services\Boost;

use Carbon\CarbonInterface;

/**
 * TCK-633 lot F (ADR-0061 §7) — la rotation des emplacements « Sponsorisé ». Pure : aucune lecture,
 * aucune écriture. La graine est faite des filtres NORMALISÉS (sans `page` ni `per_page`, sans
 * valeur vide, clés et listes triées) et de l'heure UTC : deux visiteurs voient la même chose dans
 * la même heure. Le vivier est mélangé par un hachage de (graine, id), et la page p en prend la
 * tranche p, en bouclant.
 */
final class SponsoredRotation
{
    /** Le vivier ne dépasse pas ce nombre de vedettes (dans l'ordre organique). */
    public const POOL_CAP = 200;

    /** @param  array<string, mixed>  $params */
    public static function seed(array $params, ?CarbonInterface $at = null): string
    {
        unset($params['page'], $params['per_page']);

        return hash('sha256', json_encode(self::normalize($params), JSON_UNESCAPED_UNICODE)
            .'|'.($at ?? now())->copy()->utc()->format('Y-m-d-H'));
    }

    /**
     * @param  list<int>  $ids
     * @return list<int>
     */
    public static function pick(array $ids, string $seed, int $page, int $slots): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if ($slots <= 0 || $ids === []) {
            return [];
        }
        usort($ids, fn (int $a, int $b) => strcmp(hash('sha256', $seed.':'.$a), hash('sha256', $seed.':'.$b)) ?: $a <=> $b);

        $count = count($ids);
        $take = min($slots, $count);
        $start = ((max(1, $page) - 1) * $slots) % $count;
        $picked = [];
        for ($i = 0; $i < $take; $i++) {
            $picked[] = $ids[($start + $i) % $count];
        }

        return $picked;
    }

    private static function normalize(mixed $value): mixed
    {
        if (! is_array($value)) {
            return is_string($value) ? trim($value) : $value;
        }
        $clean = [];
        foreach ($value as $key => $item) {
            $item = self::normalize($item);
            if ($item === null || $item === '' || $item === []) {
                continue;
            }
            $clean[$key] = $item;
        }
        if (array_is_list($clean)) {
            sort($clean);

            return $clean;
        }
        ksort($clean);

        return $clean;
    }
}
```

**Étape 14.3 — Edit `Property.php`, `toSearchableArray()`.** Ancre :

```php
            'published_at' => $this->published_at?->timestamp,
            'created_at' => $this->created_at?->timestamp,
```

→ remplacer par :

```php
            'published_at' => $this->published_at?->timestamp,
            // TCK-633 lot F (ADR-0061 §7) — l'ordre organique ; repli sur la publication pour un
            // document indexé avant le rattrapage de la migration 700300.
            'ranked_at' => ($this->ranked_at ?? $this->published_at)?->timestamp,
            'created_at' => $this->created_at?->timestamp,
```

> Ce diff de `Property.php` entre dans l'empreinte `.search-shape` que compare `docker/release.sh` :
> le déploiement réimporte l'index. Rien à faire de plus ; ne pas le contourner.

**Étape 14.4 — Edit `config/scout.php`.** (a) ancre `                    'tags', '_geo',\n                ],` (fin de
`filterableAttributes` des biens) → remplacer par :

```php
                    'tags', '_geo',
                    // TCK-633 lot F (ADR-0061 §7) — `id` : les places réservées s'excluent des
                    // résultats organiques par `NOT id IN [...]`.
                    'id',
                ],
```

(b) ancre `                'sortableAttributes' => ['price', 'created_at', 'published_at', 'featured', '_geo'],` →
remplacer par :

```php
                // TCK-633 lot F (ADR-0061 §7) — `ranked_at` : l'ordre organique sans mot. `featured`
                // reste triable pour les appelants existants, mais plus aucun tri par défaut ne le lit.
                'sortableAttributes' => ['price', 'created_at', 'published_at', 'featured', 'ranked_at', '_geo'],
```

**Étape 14.5 — Edit `PropertySearchService::buildSort()`.** Ancre :

```php
            default => $term === '' ? ['featured:desc', 'published_at:desc'] : [],
```

→ remplacer par :

```php
            // TCK-633 lot F (ADR-0061 §7) — sans mot, l'ordre organique est `ranked_at` (qu'une
            // Remontée remet à maintenant) ; `featured` ne trie plus rien.
            default => $term === '' ? ['ranked_at:desc'] : [],
```

**Étape 14.6 — Edit `PublicPropertyController::index()`.** Ancre :

```php
            $query->orderByDesc('featured')->orderByDesc('published_at');
```

→ remplacer par :

```php
            // TCK-633 lot F (ADR-0061 §7) — l'ordre organique ne lit plus `featured`.
            $query->orderByRaw('ranked_at DESC NULLS LAST')->orderByDesc('id');
```

**Étape 14.7 — Edit `HomepageDiscoveryService`** (F seul). (a) ancre `use App\Models\Property;` →
remplacer par :

```php
use App\Models\Property;
use App\Services\Boost\SponsoredRotation;
```

(b) ancre :

```php
        $featuredCandidates = $this->ranked(
            $this->baseQuery()->where('featured', true)
        )->limit($poolSize)->pluck('id')->all();
```

→ remplacer par :

```php
        // TCK-633 lot F (ADR-0061 §7) — la rangée vedette TOURNE parmi toutes les vedettes (plafond
        // du vivier), pas parmi les plus récentes : sinon une vedette ancienne n'y passerait jamais.
        $featuredCandidates = $this->ranked(
            $this->baseQuery()->where('featured', true)
        )->limit(SponsoredRotation::POOL_CAP)->pluck('id')->all();
```

(c) ancre `        $featuredIds = array_slice($featuredCandidates, 0, $perRow);` → remplacer par :

```php
        $featuredIds = SponsoredRotation::pick($featuredCandidates, SponsoredRotation::seed(['surface' => 'homepage.featured']), 1, $perRow);
```

(d) dans `ranked()`, ancre :

```php
        return $query
            ->orderByDesc('featured')
            ->orderByDesc('published_at')
            ->orderByDesc('id');
```

→ remplacer par :

```php
        // TCK-633 lot F (ADR-0061 §7) — `ranked_at`, plus `featured` : la mise en avant passe par
        // la rotation de la rangée vedette, jamais par l'ordre des autres rangées.
        return $query
            ->orderByRaw('ranked_at DESC NULLS LAST')
            ->orderByDesc('id');
```

(e) dans le commentaire de `ranked()`, ancre (l. 217) :

```php
        // `featured DESC, published_at DESC` matches the public index and the
```

→ remplacer par :

```php
        // `ranked_at DESC` (TCK-633 lot F) matches the public index and the
```

**Étape 14.8 — vert** : `php artisan test tests/Unit/Boost/SponsoredRotationPickTest.php` → `4 passed` ;
`php artisan test tests/Feature/Boost/RankedOrderTest.php` → `2 passed` ;
`php artisan test tests/Feature/Public/HomepageDiscoveryTest.php` → vert ;
`php artisan test tests/Feature/Search/PropertyGeoSearchTest.php` → vert (son tri `distance` est explicite).

**Étape 14.9 — ablations** : (1) remettre `->orderByDesc('featured')` en tête de `index()` →
`test_la_liste_publique…` rouge ; (2) dans `pick()`, remplacer le `usort(...)` par `sort($ids)` →
`test_meme_graine_meme_tirage` rouge (`assertNotSame` de deux graines). Restaurer, `md5`.

**Collision C6** — `tests/Feature/Public/PropertyListTest.php`, la méthode
`test_featured_properties_appear_first` (l. 38-47) affirme la règle révoquée par ADR-0061 §7. La
remplacer par :

```php
    /** TCK-633 lot F (ADR-0061 §7) — `featured` ne trie plus la liste : `ranked_at` seul. */
    public function test_the_list_follows_ranked_at_not_featured(): void
    {
        $old = Property::factory()->published()->featured()->create(['published_at' => now()->subDays(9)]);
        $recent = Property::factory()->published()->create(['featured' => false, 'published_at' => now()->subDay()]);

        $response = $this->getJson('/api/public/properties');

        $response->assertOk();
        $this->assertSame([$recent->id, $old->id], array_column($response->json('data'), 'id'));
    }
```

Test différé (C6) : `php artisan test tests/Feature/Public/PropertyListTest.php`.

**Étape 14.10 — signaler à la session les fichiers à commiter :** `SponsoredRotation.php`, les deux
tests, `Property.php`, `config/scout.php`, `PublicPropertyController.php`, `HomepageDiscoveryService.php`,
`PropertySearchService.php` ; collision C6.

---

## Tâche 15 — Recherche : emplacements « Sponsorisé » et places réservées

**Fichiers :** Edit `app/Services/Search/PropertySearchService.php` ; créer
`tests/Feature/Boost/SponsoredRotationTest.php`, `tests/Feature/Boost/ReservedTopResultsTest.php`.

**Contrat de réponse** (`GET /api/public/properties/search`) — ajouté, rien de retiré :

- `sponsored` : liste (0 à N) de biens au format de `data`, **hors** `meta` et hors `total`, chacun
  avec `placement: "sponsored"` ; un bien sponsorisé garde aussi sa place organique.
- chaque élément de `data` porte `placement` : `"reserved"` (place réservée, page 1 seulement) ou `null`.
- Une place réservée compte dans `meta.total` et n'apparaît plus ailleurs, ni en page 1 ni après.

**Étape 15.1 — tests (rouges).** `takussan-api/tests/Feature/Boost/ReservedTopResultsTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Models\Enums\ContractType;
use App\Models\Property;
use App\Services\Admin\PlatformSettingService;
use App\Services\Search\PropertySearchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §7, AC13) — en PREMIÈRE page seulement, les X premières places vont aux
 * vedettes qui satisfont la recherche, dans l'ordre organique ; elles comptent dans `total` et ne
 * reparaissent pas plus bas, ni dans les pages suivantes. X = 0 est inerte.
 *
 * Corpus (ordre `ranked_at` décroissant) : o1, o2, f1, o3, o4, f2, o5, o6, f3 — f = vedette.
 */
class ReservedTopResultsTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @var array<string, int> */
    private array $id = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-12 10:00:00'));
        $corpus = [
            'o1' => [1, false, ContractType::Rent], 'o2' => [2, false, ContractType::Rent], 'f1' => [2.5, true, ContractType::Sale],
            'o3' => [3, false, ContractType::Rent], 'o4' => [4, false, ContractType::Rent], 'f2' => [4.5, true, ContractType::Rent],
            'o5' => [5, false, ContractType::Rent], 'o6' => [6, false, ContractType::Rent], 'f3' => [10, true, ContractType::Rent],
        ];
        foreach ($corpus as $nom => [$jours, $vedette, $contrat]) {
            $this->id[$nom] = Property::factory()->published()->create([
                'published_at' => now()->subHours((int) ($jours * 24)),
                'featured' => $vedette,
                'contract_type' => $contrat,
            ])->id;
        }
        $this->indexProperties();
    }

    public function test_les_deux_premieres_places_vont_aux_vedettes_et_ne_reparaissent_pas(): void
    {
        $this->regler(slots: 0, reserved: 2);

        $p1 = $this->chercher(1);
        $this->assertSame([$this->id['f1'], $this->id['f2'], $this->id['o1'], $this->id['o2']], array_column($p1['data'], 'id'));
        $this->assertSame(['reserved', 'reserved', null, null], array_column($p1['data'], 'placement'));
        $this->assertSame(9, $p1['meta']['total']);
        $this->assertSame(3, $p1['meta']['last_page']);

        $p2 = $this->chercher(2);
        $p3 = $this->chercher(3);
        $this->assertSame([$this->id['o3'], $this->id['o4'], $this->id['o5'], $this->id['o6']], array_column($p2['data'], 'id'));
        $this->assertSame([$this->id['f3']], array_column($p3['data'], 'id'));

        $tous = [...array_column($p1['data'], 'id'), ...array_column($p2['data'], 'id'), ...array_column($p3['data'], 'id')];
        $this->assertCount(9, array_unique($tous), 'aucun doublon, aucun absent');
    }

    public function test_x_egal_zero_est_inerte(): void
    {
        $this->regler(slots: 0, reserved: 0);

        $p1 = $this->chercher(1);

        $this->assertSame([$this->id['o1'], $this->id['o2'], $this->id['f1'], $this->id['o3']], array_column($p1['data'], 'id'));
        $this->assertSame([null, null, null, null], array_column($p1['data'], 'placement'));
        $this->assertSame([], $p1['sponsored']);
    }

    public function test_seules_les_vedettes_qui_satisfont_les_filtres_prennent_une_place(): void
    {
        $this->regler(slots: 0, reserved: 2);

        $p1 = $this->chercher(1, ['contract_type' => 'rent']);

        $this->assertSame([$this->id['f2'], $this->id['f3']], array_slice(array_column($p1['data'], 'id'), 0, 2));
        $this->assertNotContains($this->id['f1'], array_column($p1['data'], 'id'));
        $this->assertSame(8, $p1['meta']['total']);
    }

    public function test_un_bien_deja_servi_en_emplacement_ne_prend_pas_de_place_reservee(): void
    {
        $this->regler(slots: 1, reserved: 2);

        $p1 = $this->chercher(1);
        $sponsorise = array_column($p1['sponsored'], 'id');
        $reserves = array_column(array_filter($p1['data'], fn (array $b) => $b['placement'] === 'reserved'), 'id');

        $this->assertCount(1, $sponsorise);
        $this->assertSame([], array_intersect($sponsorise, $reserves));
        $vedettes = [$this->id['f1'], $this->id['f2'], $this->id['f3']];
        $this->assertSame(array_slice(array_values(array_diff($vedettes, $sponsorise)), 0, 2), array_values($reserves));
        $this->assertSame(9, $p1['meta']['total'], 'l’emplacement est hors total');
    }

    private function regler(int $slots, int $reserved): void
    {
        app(PlatformSettingService::class)->bulkUpdate([
            'boost.sponsored_slots_per_page' => $slots,
            'boost.reserved_top_results' => $reserved,
        ], $this->actingAsRole('super_admin'));
    }

    /**
     * @param  array<string, mixed>  $filtres
     * @return array<string, mixed>
     */
    private function chercher(int $page, array $filtres = []): array
    {
        return app(PropertySearchService::class)->search($filtres + ['page' => $page, 'per_page' => 4]);
    }
}
```

`takussan-api/tests/Feature/Boost/SponsoredRotationTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Models\Enums\ContractType;
use App\Models\Property;
use App\Services\Admin\PlatformSettingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §7, AC12) — en tête de chaque page, N emplacements tirés parmi les vedettes
 * qui satisfont les MÊMES filtres, hors `total` ; la même heure rend le même tirage ; les pages
 * successives font passer chaque vedette ; un bien sponsorisé garde sa place organique.
 */
class SponsoredRotationTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @var list<int> */
    private array $vedettesLocation = [];

    private int $vedetteVente;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-12 10:00:00'));
        foreach (range(1, 5) as $i) {
            $this->vedettesLocation[] = Property::factory()->published()->create([
                'featured' => true, 'contract_type' => ContractType::Rent, 'published_at' => now()->subDays($i),
            ])->id;
        }
        $this->vedetteVente = Property::factory()->published()->create(['featured' => true, 'contract_type' => ContractType::Sale])->id;
        Property::factory()->count(3)->published()->create(['contract_type' => ContractType::Rent, 'published_at' => now()->subDays(8)]);
        $this->indexProperties();

        app(PlatformSettingService::class)->bulkUpdate([
            'boost.sponsored_slots_per_page' => 2,
            'boost.reserved_top_results' => 0,
        ], $this->actingAsRole('super_admin'));
    }

    public function test_les_emplacements_sortent_hors_pagination_parmi_les_vedettes_filtrees(): void
    {
        $reponse = $this->getJson('/api/public/properties/search?contract_type=rent&per_page=3')->assertOk();

        $sponsorises = array_column($reponse->json('sponsored'), 'id');
        $this->assertCount(2, $sponsorises);
        $this->assertSame([], array_diff($sponsorises, $this->vedettesLocation));
        $this->assertNotContains($this->vedetteVente, $sponsorises);
        $this->assertSame(['sponsored', 'sponsored'], array_column($reponse->json('sponsored'), 'placement'));
        $this->assertSame(8, $reponse->json('meta.total'), 'hors total');
        $this->assertCount(3, $reponse->json('data'));
    }

    public function test_meme_heure_meme_tirage_et_chaque_vedette_passe_a_son_tour(): void
    {
        $tirage = fn (int $page) => array_column($this->getJson("/api/public/properties/search?contract_type=rent&per_page=3&page={$page}")->json('sponsored'), 'id');

        $this->assertSame($tirage(1), $tirage(1));
        $this->travel(30)->minutes();
        $this->assertSame($tirage(1), $tirage(1), 'la même heure');

        $vus = array_unique([...$tirage(1), ...$tirage(2), ...$tirage(3)]);
        $this->assertEqualsCanonicalizing($this->vedettesLocation, array_values($vus));
    }

    public function test_un_bien_sponsorise_garde_sa_place_organique(): void
    {
        $reponse = $this->getJson('/api/public/properties/search?contract_type=rent&per_page=40')->assertOk();

        $organiques = array_column($reponse->json('data'), 'id');
        foreach (array_column($reponse->json('sponsored'), 'id') as $id) {
            $this->assertContains($id, $organiques);
        }
        $this->assertCount(8, $organiques);
    }

    public function test_n_egal_zero_ne_sert_aucun_emplacement(): void
    {
        app(PlatformSettingService::class)->bulkUpdate(['boost.sponsored_slots_per_page' => 0], $this->actingAsRole('super_admin'));

        $this->getJson('/api/public/properties/search?contract_type=rent')->assertOk()->assertJsonPath('sponsored', []);
    }
}
```

Rouges : clé `sponsored` absente (`Undefined array key "sponsored"`) ; ordre de page 1 sans places réservées.

**Étape 15.2 — Edit `PropertySearchService.php`.** (a) imports — ancre `use App\Models\Property;` →
remplacer par :

```php
use App\Models\Property;
use App\Services\Boost\BoostSettings;
use App\Services\Boost\SponsoredRotation;
```

(b) ancre :

```php
        return [
            'data' => $this->hydrate($result['hits'] ?? []),
            'facets' => $this->mapFacets($result['facetDistribution'] ?? []),
```

→ remplacer par :

```php
        // TCK-633 lot F (ADR-0061 §7) — emplacements « Sponsorisé » et places réservées. Rien en
        // recherche ÉLARGIE : le vivier suit le régime strict, qui vient d'y rendre zéro.
        [$data, $sponsored] = $search['strategy'] === self::STRATEGY_STRICT
            ? $this->placements($term, $filter, $sort, $page, $perPage, $params, $result)
            : [$this->withPlacement($this->hydrate($result['hits'] ?? []), null), []];

        return [
            'data' => $data,
            'sponsored' => $sponsored,
            'facets' => $this->mapFacets($result['facetDistribution'] ?? []),
```

(c) ancre (début de `hydrate()`) :

```php
    private function hydrate(array $hits): array
    {
```

→ insérer **avant** :

```php
    /**
     * TCK-633 lot F (ADR-0061 §7). Trois lectures au plus : la requête nominale (déjà faite : elle
     * donne `total`, `facets`, `last_page`, et les places réservées y comptent puisqu'elles en sont
     * issues), le VIVIER (mêmes filtres + `featured = true`, identifiants seuls, ordre organique),
     * et — seulement quand des places réservées existent — la page organique qui les exclut.
     *
     * Les places réservées se calculent sur la page 1 À CHAQUE PAGE : c'est ce qui permet aux pages
     * suivantes de ne pas les répéter, et de décaler leur fenêtre de |R|.
     *
     * @param  array<int, string|array<int, string>>  $filter
     * @param  list<string>  $sort
     * @param  array<string, mixed>  $params
     * @param  array<string, mixed>  $nominal
     * @return array{0: list<array<string, mixed>>, 1: list<array<string, mixed>>}
     */
    private function placements(string $term, array $filter, array $sort, int $page, int $perPage, array $params, array $nominal): array
    {
        $settings = app(BoostSettings::class);
        $slots = $settings->sponsoredSlotsPerPage();
        $reservedMax = min($settings->reservedTopResults(), $perPage);
        $organic = fn (): array => $this->withPlacement($this->hydrate($nominal['hits'] ?? []), null);

        if (($slots === 0 && $reservedMax === 0) || (int) ($nominal['totalHits'] ?? 0) === 0) {
            return [$organic(), []];
        }

        $pool = $this->featuredPool($term, $filter, $sort);
        if ($pool === []) {
            return [$organic(), []];
        }

        $seed = SponsoredRotation::seed($params);
        $sponsoredIds = SponsoredRotation::pick($pool, $seed, $page, $slots);
        $servedOnFirstPage = $page === 1 ? $sponsoredIds : SponsoredRotation::pick($pool, $seed, 1, $slots);
        $reserved = $reservedMax > 0
            ? array_slice(array_values(array_diff($pool, $servedOnFirstPage)), 0, $reservedMax)
            : [];

        $sponsored = $this->withPlacement($this->hydrateIds($sponsoredIds), 'sponsored');

        if ($reserved === []) {
            return [$organic(), $sponsored];
        }

        $offset = $page === 1 ? 0 : ($page - 1) * $perPage - count($reserved);
        $limit = $page === 1 ? $perPage - count($reserved) : $perPage;
        $rest = $limit > 0 ? $this->organicExcluding($term, $filter, $sort, $reserved, $offset, $limit) : [];

        $data = $page === 1
            ? [...$this->withPlacement($this->hydrateIds($reserved), 'reserved'), ...$this->withPlacement($this->hydrate($rest), null)]
            : $this->withPlacement($this->hydrate($rest), null);

        return [$data, $sponsored];
    }

    /**
     * Les vedettes qui satisfont la recherche, dans l'ordre organique, identifiants seuls.
     *
     * @param  array<int, string|array<int, string>>  $filter
     * @param  list<string>  $sort
     * @return list<int>
     */
    private function featuredPool(string $term, array $filter, array $sort): array
    {
        /** @var array<string, mixed> $raw */
        $raw = Property::search($term, function ($index, string $query) use ($filter, $sort) {
            $searchParams = [
                'filter' => [...$filter, 'featured = true'],
                'attributesToRetrieve' => ['id'],
                'offset' => 0,
                'limit' => SponsoredRotation::POOL_CAP,
                'matchingStrategy' => self::STRATEGY_STRICT,
            ];
            if ($sort !== []) {
                $searchParams['sort'] = $sort;
            }

            return $index->search($query, $searchParams);
        })->raw();

        return array_map(static fn (array $hit): int => (int) $hit['id'], $raw['hits'] ?? []);
    }

    /**
     * La fenêtre organique privée des places réservées.
     *
     * @param  array<int, string|array<int, string>>  $filter
     * @param  list<string>  $sort
     * @param  list<int>  $excluded
     * @return array<int, array<string, mixed>>
     */
    private function organicExcluding(string $term, array $filter, array $sort, array $excluded, int $offset, int $limit): array
    {
        /** @var array<string, mixed> $raw */
        $raw = Property::search($term, function ($index, string $query) use ($filter, $sort, $excluded, $offset, $limit) {
            $searchParams = [
                'filter' => [...$filter, 'NOT id IN ['.implode(', ', $excluded).']'],
                'attributesToRetrieve' => ['id'],
                'offset' => max(0, $offset),
                'limit' => $limit,
                'matchingStrategy' => self::STRATEGY_STRICT,
            ];
            if ($sort !== []) {
                $searchParams['sort'] = $sort;
            }

            return $index->search($query, $searchParams);
        })->raw();

        return $raw['hits'] ?? [];
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, mixed>
     */
    private function hydrateIds(array $ids): array
    {
        return $this->hydrate(array_map(static fn (int $id): array => ['id' => $id], $ids));
    }

    /**
     * @param  array<int, mixed>  $rows
     * @return list<array<string, mixed>>
     */
    private function withPlacement(array $rows, ?string $placement): array
    {
        return array_values(array_map(static fn (array $row): array => $row + ['placement' => $placement], $rows));
    }

```

> `hydrate()` réapplique `scopePublic()` : une vedette d'un espace suspendu (que le filtre moteur ne
> voit pas, `publicFilter()` ne portant pas le statut d'agence) disparaît à l'hydratation, comme
> aujourd'hui pour les résultats organiques — l'emplacement rend alors moins de N biens. Accepté
> (écart E8).

**Étape 15.3 — vert** : `php artisan test tests/Feature/Boost/ReservedTopResultsTest.php` → `4 passed` ;
`php artisan test tests/Feature/Boost/SponsoredRotationTest.php` → `4 passed`.
Non-régression de la recherche :
`php artisan test tests/Feature/Search tests/Feature/PublicPropertySearchFiltersTest.php`. Un test
**hors F** qui rougirait parce que des vedettes de son corpus prennent désormais les deux premières
places (défaut X = 2) **n'est pas édité** : le consigner dans `collisions` du rapport avec la
correction (dans son `setUp`, `app(PlatformSettingService::class)->bulkUpdate(['boost.reserved_top_results' => 0, 'boost.sponsored_slots_per_page' => 0], $this->actingAsRole('super_admin'))`).

**Étape 15.4 — ablations** (les deux jouées, restaurées par `cp`, `md5`) :
(1) dans `placements()`, remplacer `$offset = $page === 1 ? 0 : ($page - 1) * $perPage - count($reserved);`
par `$offset = ($page - 1) * $perPage;` → `test_les_deux_premieres_places…` rouge (o3, o4 manquent en
page 2) ; (2) remplacer `array_diff($pool, $servedOnFirstPage)` par `$pool` →
`test_un_bien_deja_servi…` rouge.

**Étape 15.5 — signaler à la session les fichiers à commiter :** `PropertySearchService.php`, les deux tests.

---

## Tâche 16 — Mesure : impressions et clics (`BoostStatsTest`)

**Fichiers :** créer `app/Services/Boost/BoostStatsRecorder.php`, `tests/Feature/Boost/BoostStatsTest.php`,
`tests/Feature/Boost/SponsoredImpressionsTest.php` ; Edit `PropertySearchService.php`,
`HomepageDiscoveryService.php`, `PublicPropertyController.php` (`view()`), `BoostsTick.php`. **Collision C7.**

**Étape 16.1 — test (rouge).** `takussan-api/tests/Feature/Boost/BoostStatsTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Boost\BoostStatsRecorder;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §10) — impressions et clics comptés en cache par boost et par heure, versés
 * par `boosts:tick` dans `property_boost_daily_stats`, une fois. Un clic = une vue de la fiche arrivée
 * par `src=sponsored`, une par IP et par heure.
 */
class BoostStatsTest extends TestCase
{
    use RefreshDatabase;

    private Property $property;

    private PropertyBoost $boost;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-12 10:20:00'));
        $agency = Agency::factory()->create();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $this->property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $this->boost = app(BoostPurchaseService::class)->purchase(
            $this->property, BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole(), $admin,
        );
    }

    public function test_les_compteurs_se_versent_une_fois_par_le_tick(): void
    {
        $recorder = app(BoostStatsRecorder::class);
        $recorder->impressions([$this->property->id, $this->property->id, 999999]);
        $recorder->click($this->property, '10.0.0.1');
        $recorder->click($this->property, '10.0.0.1');
        $recorder->click($this->property, '10.0.0.2');

        $this->artisan('boosts:tick')->assertSuccessful();
        $this->assertSame(0, DB::table('property_boost_daily_stats')->count(), 'l’heure en cours n’est pas versée');

        $this->travel(1)->hours();
        $this->artisan('boosts:tick')->assertSuccessful();
        $this->artisan('boosts:tick')->assertSuccessful();

        $ligne = DB::table('property_boost_daily_stats')->where('property_boost_id', $this->boost->id)->sole();
        $this->assertSame('2026-10-12', Carbon::parse($ligne->date)->toDateString());
        $this->assertSame(2, (int) $ligne->impressions);
        $this->assertSame(2, (int) $ligne->clicks, 'une par IP et par heure');
    }

    public function test_deux_heures_du_meme_jour_s_additionnent(): void
    {
        $recorder = app(BoostStatsRecorder::class);
        $recorder->impressions([$this->property->id]);
        $this->travel(1)->hours();
        $recorder->impressions([$this->property->id]);
        $this->travel(1)->hours();

        $this->artisan('boosts:tick')->assertSuccessful();

        $this->assertSame(2, (int) DB::table('property_boost_daily_stats')->value('impressions'));
    }

    public function test_une_vue_arrivee_par_un_emplacement_compte_un_clic(): void
    {
        $this->postJson("/api/public/properties/{$this->property->slug}/view?src=sponsored")->assertStatus(204);
        $this->postJson("/api/public/properties/{$this->property->slug}/view")->assertStatus(204);
        $this->travel(1)->hours();

        $this->artisan('boosts:tick')->assertSuccessful();

        $this->assertSame(1, (int) DB::table('property_boost_daily_stats')->value('clicks'));
    }
}
```

Rouge : `Class "App\Services\Boost\BoostStatsRecorder" not found`.

**Étape 16.2 — `takussan-api/app/Services/Boost/BoostStatsRecorder.php`** :

```php
<?php

namespace App\Services\Boost;

use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;

/**
 * TCK-633 lot F (ADR-0061 §10) — compteurs d'impressions et de clics, en cache par boost et par
 * HEURE UTC (incrément atomique du magasin), versés par `boosts:tick` dans
 * `property_boost_daily_stats`. Seules les heures COMPLÈTES se versent ; chaque clé versée est
 * retirée (`pull`) : un tick rejoué n'ajoute rien.
 */
final class BoostStatsRecorder
{
    public const TTL_HOURS = 48;

    public const LAST_FLUSHED_KEY = 'boost-stats:last-flushed-hour';

    /** @param  list<int>  $propertyIds  biens servis dans un emplacement « Sponsorisé » */
    public function impressions(array $propertyIds): void
    {
        $counts = array_count_values(array_map('intval', $propertyIds));
        foreach ($this->liveFeaturedBoosts(array_keys($counts)) as $propertyId => $boostId) {
            $this->add($boostId, 'impressions', $counts[$propertyId]);
        }
    }

    public function click(Property $property, string $ip): void
    {
        if (RateLimiter::hit('boost-click:'.$property->getKey().':'.$ip, 3600) > 1) {
            return;
        }
        foreach ($this->liveFeaturedBoosts([(int) $property->getKey()]) as $boostId) {
            $this->add($boostId, 'clicks', 1);
        }
    }

    public static function key(int $boostId, CarbonInterface $hour, string $metric): string
    {
        return 'boost-stats:'.$boostId.':'.$hour->copy()->utc()->format('Y-m-d-H').':'.$metric;
    }

    /** Verse les heures complètes non encore versées. Rend le nombre de lignes touchées. */
    public function flush(): int
    {
        $current = now()->utc()->startOfHour();
        $last = Cache::get(self::LAST_FLUSHED_KEY);
        $hour = is_string($last)
            ? Carbon::createFromFormat('Y-m-d-H', $last, 'UTC')->startOfHour()->addHour()
            : $current->copy()->subHours(self::TTL_HOURS);
        $touched = 0;

        for (; $hour->lt($current); $hour->addHour()) {
            $end = $hour->copy()->addHour();
            $boostIds = PropertyBoost::query()
                ->where('kind', BoostKind::Featured)
                ->where('starts_at', '<', $end)
                ->where(fn ($q) => $q->whereNull('ended_at')->orWhere('ended_at', '>=', $hour))
                ->pluck('id');

            foreach ($boostIds as $boostId) {
                $impressions = (int) Cache::pull(self::key($boostId, $hour, 'impressions'), 0);
                $clicks = (int) Cache::pull(self::key($boostId, $hour, 'clicks'), 0);
                if ($impressions === 0 && $clicks === 0) {
                    continue;
                }
                DB::table('property_boost_daily_stats')->upsert(
                    [[
                        'property_boost_id' => $boostId, 'date' => $hour->toDateString(),
                        'impressions' => $impressions, 'clicks' => $clicks,
                        'created_at' => now(), 'updated_at' => now(),
                    ]],
                    ['property_boost_id', 'date'],
                    [
                        'impressions' => DB::raw('property_boost_daily_stats.impressions + excluded.impressions'),
                        'clicks' => DB::raw('property_boost_daily_stats.clicks + excluded.clicks'),
                        'updated_at' => DB::raw('excluded.updated_at'),
                    ],
                );
                $touched++;
            }
            Cache::forever(self::LAST_FLUSHED_KEY, $hour->format('Y-m-d-H'));
        }

        return $touched;
    }

    private function add(int $boostId, string $metric, int $by): void
    {
        $key = self::key($boostId, now(), $metric);
        Cache::add($key, 0, now()->addHours(self::TTL_HOURS));
        Cache::increment($key, $by);
    }

    /**
     * @param  list<int>  $propertyIds
     * @return array<int, int> property_id => boost_id
     */
    private function liveFeaturedBoosts(array $propertyIds): array
    {
        if ($propertyIds === []) {
            return [];
        }

        return PropertyBoost::query()
            ->whereIn('property_id', $propertyIds)
            ->where('kind', BoostKind::Featured)
            ->where('status', BoostStatus::Active)
            ->pluck('id', 'property_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}
```

**Étape 16.3 — branchements.**

(a) `BoostsTick.php` — ancre `    public function handle(BoostLifecycle $lifecycle, CreditLedger $ledger, CreditExpiryNotifier $notifier): int`
et le corps → remplacer la méthode entière par :

```php
    public function handle(BoostLifecycle $lifecycle, CreditLedger $ledger, CreditExpiryNotifier $notifier, BoostStatsRecorder $stats): int
    {
        $ended = $lifecycle->endExpired();
        $reconciled = $lifecycle->reconcileAll();
        $expired = $ledger->expireDue();
        $notices = $notifier->sendNotices();
        $flushed = $stats->flush();

        $this->info("boosts:tick ended={$ended} reconciled={$reconciled} expired_lots={$expired} notices={$notices} stats_rows={$flushed}");

        return self::SUCCESS;
    }
```

et ajouter `use App\Services\Boost\BoostStatsRecorder;` après `use App\Services\Boost\BoostLifecycle;`.

(b) `PropertySearchService::placements()` — ancre
`        $sponsored = $this->withPlacement($this->hydrateIds($sponsoredIds), 'sponsored');` → remplacer par :

```php
        $sponsored = $this->withPlacement($this->hydrateIds($sponsoredIds), 'sponsored');
        // ADR-0061 §10 — une impression par bien réellement servi (hydraté, donc public).
        app(BoostStatsRecorder::class)->impressions(array_column($sponsored, 'id'));
```

et ajouter `use App\Services\Boost\BoostStatsRecorder;` avant `use App\Services\Boost\SponsoredRotation;`.

(c) `HomepageDiscoveryService::discover()` — ancre
`        $properties = $this->hydrate([...$nearIds, ...$rentIds, ...$latestIds, ...$featuredIds]);` →
remplacer par :

```php
        $properties = $this->hydrate([...$nearIds, ...$rentIds, ...$latestIds, ...$featuredIds]);
        // TCK-633 lot F (ADR-0061 §10) — la rangée vedette est un emplacement : ses biens servis comptent.
        app(BoostStatsRecorder::class)->impressions(array_values(array_filter($featuredIds, fn (int $id) => $properties->has($id))));
```

et ajouter `use App\Services\Boost\BoostStatsRecorder;` avant `use App\Services\Boost\SponsoredRotation;`.

(d) `PublicPropertyController::view()` — ancre :

```php
        if ($property !== null) {
            $compteur->record($property, (string) $request->ip());
        }
```

→ remplacer par :

```php
        if ($property !== null) {
            $compteur->record($property, (string) $request->ip());
            // TCK-633 lot F (ADR-0061 §10) — un clic d'emplacement : une vue arrivée par `src=sponsored`.
            if ($request->query('src') === 'sponsored') {
                app(BoostStatsRecorder::class)->click($property, (string) $request->ip());
            }
        }
```

et, ancre `use App\Services\Booking\PropertyAvailabilityService;` → remplacer par :

```php
use App\Services\Booking\PropertyAvailabilityService;
use App\Services\Boost\BoostStatsRecorder;
```

**Étape 16.4 — test Meilisearch des impressions.** `takussan-api/tests/Feature/Boost/SponsoredImpressionsTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Services\Admin\PlatformSettingService;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Boost\BoostStatsRecorder;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/** TCK-633 lot F (ADR-0061 §10) — un emplacement servi par la recherche compte une impression. */
class SponsoredImpressionsTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_la_recherche_compte_les_emplacements_servis(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $boost = app(BoostPurchaseService::class)->purchase($property, BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole(), $admin);
        Property::factory()->count(2)->published()->create();
        $this->indexProperties();
        app(PlatformSettingService::class)->bulkUpdate(['boost.sponsored_slots_per_page' => 1, 'boost.reserved_top_results' => 0], $this->actingAsRole('super_admin'));

        $this->getJson('/api/public/properties/search')->assertOk()->assertJsonPath('sponsored.0.id', $property->id);
        $this->getJson('/api/public/properties/search')->assertOk();

        $this->assertSame(2, (int) Cache::get(BoostStatsRecorder::key($boost->id, now(), 'impressions')));
    }
}
```

**Étape 16.5 — vert** : `php artisan test tests/Feature/Boost/BoostStatsTest.php` → `3 passed` ;
`php artisan test tests/Feature/Boost/SponsoredImpressionsTest.php` → `1 passed` ;
`php artisan test tests/Feature/Boost/BoostsTickIdempotenceTest.php` → vert ;
`php artisan test tests/Feature/Public/PublicPropertyViewCounterTest.php` → vert.

**Étape 16.6 — ablations** : (1) dans `flush()`, remplacer `Cache::pull(` par `Cache::get(` (les deux)
→ `test_les_compteurs_se_versent_une_fois…` rouge (4 au lieu de 2) ; (2) dans `click()`, retirer le
garde `RateLimiter::hit(...) > 1` → même test rouge (3 clics). Restaurer, `md5`.

**Collision C7** — `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/CompteurDeVue.tsx` :
lire l'arrivée par emplacement (posée par `EmplacementSponsorise`, tâche 22) et l'ajouter à l'URL.
(a) ajouter l'import `import { consommerArriveeSponsorisee } from '@/components/boost/arrivee-sponsorisee';`
après `import { urlApiPublique } from '@/lib/api';` ; (b) remplacer

```tsx
    fetch(urlApiPublique(`/public/properties/${encodeURIComponent(slug)}/view`), {
```

par

```tsx
    // TCK-633 lot F (ADR-0061 §10) — une vue arrivée par un emplacement « Sponsorisé » est un clic.
    const source = consommerArriveeSponsorisee(slug) ? '?src=sponsored' : '';
    fetch(urlApiPublique(`/public/properties/${encodeURIComponent(slug)}/view${source}`), {
```

Test différé (C7) : `npx vitest run "src/app/[locale]/(public)/properties/[slug]/components/__tests__/CompteurDeVue.test.tsx"`.

**Étape 16.7 — signaler à la session les fichiers à commiter :** `BoostStatsRecorder.php`,
`BoostsTick.php`, `PropertySearchService.php`, `HomepageDiscoveryService.php`,
`PublicPropertyController.php`, les deux tests ; collision C7.

---

## Tâche 17 — API annonceur : solde, catalogue, booster un bien

**Fichiers :** créer `routes/api/credits.php`, `app/Http/Controllers/Api/Credits/{CreditController,BoostProductController,PropertyBoostController}.php`,
`app/Http/Requests/Credits/StorePropertyBoostRequest.php`,
`app/Http/Resources/Credits/{CreditLotResource,CreditMovementResource,BoostProductResource,PropertyBoostResource}.php`,
`tests/Feature/Boost/CreditsApiTest.php`, `tests/Feature/Boost/PropertyBoostApiTest.php`,
`tests/Feature/Boost/PropertyResourceBadgeTest.php` (différé C3). **Collision C3.**

Routes (toutes `auth:sanctum`, chargées par le `glob` de `routes/api.php`) :

| Méthode | Chemin | Autorisation | Réponse |
|---|---|---|---|
| GET | `/api/credits?per_page=` | `CreditLotPolicy::viewAny` sur l'espace actif | `{data: {balance, lots[]}, movements[], meta}` |
| GET | `/api/boost-products` | authentifié | `{data: [offres actives]}` |
| GET | `/api/properties/{property}/boosts` | `PropertyBoostPolicy::viewAny` | `{data: [boosts du bien, récents d'abord]}` |
| POST | `/api/properties/{property}/boosts` `{product_id}` | `PropertyBoostPolicy::create` (FormRequest) | 201 `{data: boost, balance}` ; 422 `credits.insufficient` `{missing, balance}` |

**Étape 17.1 — tests (rouges).** `takussan-api/tests/Feature/Boost/CreditsApiTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\Enums\CreditLotOrigin;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/** TCK-633 lot F (ADR-0061 §1) — le solde de l'espace actif, ses lots et son journal. */
class CreditsApiTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_l_admin_d_espace_lit_solde_lots_et_mouvements(): void
    {
        $agency = Agency::factory()->create();
        $ledger = app(CreditLedger::class);
        $ledger->grant($agency, CreditLotOrigin::Welcome, 500, now()->addDays(180));
        $ledger->grant($agency, CreditLotOrigin::AdminGrant, 40, now()->addDays(10));
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->apiGet('/api/credits?per_page=1')
            ->assertOk()
            ->assertJsonPath('data.balance', 540)
            ->assertJsonCount(2, 'data.lots')
            ->assertJsonPath('data.lots.0.origin', 'admin_grant')
            ->assertJsonPath('data.lots.0.remaining_amount', 40)
            ->assertJsonCount(1, 'movements')
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('meta.last_page', 2);
    }

    public function test_l_agent_n_y_a_pas_acces(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);

        $this->apiGet('/api/credits')->assertForbidden();
    }

    public function test_sans_espace_actif_le_refus_est_nomme(): void
    {
        $this->apiActingAsRole('customer');

        $this->apiGet('/api/credits')->assertStatus(422)->assertJsonPath('code', 'credits.no_space');
    }
}
```

`takussan-api/tests/Feature/Boost/PropertyBoostApiTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/** TCK-633 lot F (ADR-0061 §5, AC14) — booster un bien depuis l'espace annonceur. */
class PropertyBoostApiTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->property = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
    }

    public function test_le_catalogue_ne_montre_que_les_offres_actives(): void
    {
        BoostProduct::query()->where('kind', 'bump')->update(['is_active' => false]);
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);

        $kinds = array_column($this->apiGet('/api/boost-products')->assertOk()->json('data'), 'kind');

        $this->assertNotContains('bump', $kinds);
        $this->assertCount(5, $kinds);
    }

    public function test_l_admin_booste_et_le_solde_baisse(): void
    {
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        $offre = BoostProduct::query()->where('kind', 'featured')->where('duration_days', 15)->sole();

        $this->apiPost("/api/properties/{$this->property->id}/boosts", ['product_id' => $offre->id])
            ->assertCreated()
            ->assertJsonPath('data.kind', 'featured')
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.price_credits', 35)
            ->assertJsonPath('balance', 65);

        $this->apiGet("/api/properties/{$this->property->id}/boosts")->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_un_solde_insuffisant_rend_le_montant_manquant_sans_rien_acheter(): void
    {
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 12, now()->addDays(30));
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        $offre = BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole();

        $this->apiPost("/api/properties/{$this->property->id}/boosts", ['product_id' => $offre->id])
            ->assertStatus(422)
            ->assertJsonPath('code', 'credits.insufficient')
            ->assertJsonPath('params.missing', 8)
            ->assertJsonPath('params.balance', 12);
    }

    public function test_l_agent_sans_la_capacite_est_refuse(): void
    {
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $agent = $this->apiActingAsRole('agent', ['agency' => $this->agency]);
        $this->property->update(['user_id' => $agent->id]);

        $this->apiPost("/api/properties/{$this->property->id}/boosts", ['product_id' => BoostProduct::query()->value('id')])
            ->assertForbidden();
    }

    public function test_l_offre_doit_exister(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);

        $this->apiPost("/api/properties/{$this->property->id}/boosts", ['product_id' => 999999])
            ->assertStatus(422)->assertJsonValidationErrors('product_id');
    }
}
```

Rouges : 404 sur `/api/credits`.

**Étape 17.2 — `takussan-api/routes/api/credits.php`** :

```php
<?php

use App\Http\Controllers\Api\Credits\BoostProductController;
use App\Http\Controllers\Api\Credits\CreditController;
use App\Http\Controllers\Api\Credits\PropertyBoostController;
use Illuminate\Support\Facades\Route;

// TCK-633 lot F (ADR-0061) — le portefeuille de l'espace et la mise en avant d'un bien.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('credits', [CreditController::class, 'show'])->name('credits.show');
    Route::get('boost-products', [BoostProductController::class, 'index'])->name('boost-products.index');
    Route::get('properties/{property}/boosts', [PropertyBoostController::class, 'index'])->name('properties.boosts.index');
    Route::post('properties/{property}/boosts', [PropertyBoostController::class, 'store'])->name('properties.boosts.store');
});
```

**Étape 17.3 — ressources** (`takussan-api/app/Http/Resources/Credits/`) :

`CreditLotResource.php` :

```php
<?php

namespace App\Http\Resources\Credits;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/** TCK-633 lot F (ADR-0061 §2) — un lot de crédits. */
class CreditLotResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'origin' => $this->origin?->value,
            'initial_amount' => $this->initial_amount,
            'remaining_amount' => $this->remaining_amount,
            'expires_at' => $this->iso($this->expires_at),
            'reason' => $this->reason,
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
```

`CreditMovementResource.php` :

```php
<?php

namespace App\Http\Resources\Credits;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/** TCK-633 lot F (ADR-0061 §2) — une ligne du journal, jamais réécrite. */
class CreditMovementResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type?->value,
            'amount' => $this->amount,
            'credit_lot_id' => $this->credit_lot_id,
            'property_boost_id' => $this->property_boost_id,
            'actor_id' => $this->actor_id,
            'reason' => $this->reason,
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
```

`BoostProductResource.php` :

```php
<?php

namespace App\Http\Resources\Credits;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/** TCK-633 lot F (ADR-0061 §4) — une offre du catalogue. */
class BoostProductResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind?->value,
            'variant' => $this->variant?->value,
            'duration_days' => $this->duration_days,
            'price_credits' => $this->price_credits,
            'is_active' => (bool) $this->is_active,
            'sort_order' => $this->sort_order,
        ];
    }
}
```

`PropertyBoostResource.php` :

```php
<?php

namespace App\Http\Resources\Credits;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/** TCK-633 lot F (ADR-0061 §5) — un boost, prix et durée figés. */
class PropertyBoostResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'property_id' => $this->property_id,
            'agency_id' => $this->agency_id,
            'kind' => $this->kind?->value,
            'variant' => $this->variant?->value,
            'status' => $this->status?->value,
            'price_credits' => $this->price_credits,
            'duration_days' => $this->duration_days,
            'starts_at' => $this->iso($this->starts_at),
            'ends_at' => $this->iso($this->ends_at),
            'ended_at' => $this->iso($this->ended_at),
            'remaining_seconds' => $this->remaining_seconds,
            'offered' => (bool) $this->offered,
            'offer_reason' => $this->offer_reason,
            'refunded_credits' => $this->refunded_credits,
            'cancel_reason' => $this->cancel_reason,
            'property' => $this->whenLoaded('property', fn () => $this->property ? [
                'id' => $this->property->id, 'title' => $this->property->title, 'slug' => $this->property->slug,
            ] : null),
            'agency' => $this->whenLoaded('agency', fn () => $this->agency ? [
                'id' => $this->agency->id, 'name' => $this->agency->name,
            ] : null),
        ];
    }
}
```

**Étape 17.4 — `takussan-api/app/Http/Requests/Credits/StorePropertyBoostRequest.php`** :

```php
<?php

namespace App\Http\Requests\Credits;

use App\Http\Requests\BaseFormRequest;
use App\Models\Property;
use App\Models\PropertyBoost;

/** TCK-633 lot F (ADR-0061 §5) — booster un bien : la règle vit dans `PropertyBoostPolicy::create`. */
class StorePropertyBoostRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $property = $this->route('property');

        return $property instanceof Property
            && $this->user()?->can('create', [PropertyBoost::class, $property]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'product_id' => ['required', 'integer', 'exists:boost_products,id'],
        ];
    }
}
```

**Étape 17.5 — contrôleurs** (`takussan-api/app/Http/Controllers/Api/Credits/`).

`CreditController.php` :

```php
<?php

namespace App\Http\Controllers\Api\Credits;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Credits\CreditLotResource;
use App\Http\Resources\Credits\CreditMovementResource;
use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\CreditMovement;
use App\Services\Credits\CreditLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-633 lot F (ADR-0061 §1) — le portefeuille de l'espace ACTIF : solde, lots vivants dans
 * l'ordre de consommation, journal paginé. Forme fixe (pas de `fields[...]`) : l'écran lit tout.
 */
class CreditController extends Controller
{
    public function show(Request $request, CreditLedger $ledger): JsonResponse
    {
        $agencyId = $request->activeProfile()?->agency_id ?? $request->user()->agency_id;
        abort_code_if($agencyId === null, 422, 'credits.no_space');
        $agency = Agency::query()->findOrFail($agencyId);
        $this->authorize('viewAny', [CreditLot::class, $agency]);

        $lots = CreditLot::query()->where('agency_id', $agency->getKey())->spendable()->inConsumptionOrder()->get();
        $movements = CreditMovement::query()
            ->where('agency_id', $agency->getKey())
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(min(100, max(1, (int) $request->input('per_page', 20))));

        return $this->json([
            'data' => [
                'balance' => $ledger->balance($agency),
                'lots' => CreditLotResource::collection($lots)->resolve(),
            ],
            'movements' => CreditMovementResource::collection($movements->items())->resolve(),
            'meta' => $this->paginationMeta($movements),
        ]);
    }
}
```

`BoostProductController.php` :

```php
<?php

namespace App\Http\Controllers\Api\Credits;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Credits\BoostProductResource;
use App\Models\BoostProduct;
use Illuminate\Http\JsonResponse;

/** TCK-633 lot F (ADR-0061 §4) — les offres en vente. Lecture seule : les prix ne sont pas un secret. */
class BoostProductController extends Controller
{
    public function index(): JsonResponse
    {
        $products = BoostProduct::query()->where('is_active', true)->orderBy('sort_order')->orderBy('id')->get();

        return $this->json(['data' => BoostProductResource::collection($products)->resolve()]);
    }
}
```

`PropertyBoostController.php` :

```php
<?php

namespace App\Http\Controllers\Api\Credits;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Credits\StorePropertyBoostRequest;
use App\Http\Resources\Credits\PropertyBoostResource;
use App\Models\BoostProduct;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Http\JsonResponse;

/** TCK-633 lot F (ADR-0061 §5) — les boosts d'un bien, et l'achat d'un boost. */
class PropertyBoostController extends Controller
{
    public function index(Property $property): JsonResponse
    {
        $this->authorize('viewAny', [PropertyBoost::class, $property]);

        $boosts = PropertyBoost::query()
            ->where('property_id', $property->getKey())
            ->orderByDesc('starts_at')
            ->orderByDesc('id')
            ->limit(50)
            ->get();

        return $this->json(['data' => PropertyBoostResource::collection($boosts)->resolve()]);
    }

    public function store(StorePropertyBoostRequest $request, Property $property, BoostPurchaseService $purchases, CreditLedger $ledger): JsonResponse
    {
        $product = BoostProduct::query()->findOrFail($request->integer('product_id'));
        $boost = $purchases->purchase($property, $product, $request->user());

        return $this->json([
            'data' => PropertyBoostResource::make($boost->fresh())->resolve(),
            'balance' => $ledger->balance((int) $property->agency_id),
        ], 201);
    }
}
```

**Étape 17.6 — vert** : `php artisan test tests/Feature/Boost/CreditsApiTest.php tests/Feature/Boost/PropertyBoostApiTest.php`
→ `8 passed` ; gardes `node ../scripts/check-controller-authorization.mjs`,
`node ../scripts/check-resources-extend-base.mjs`, `node ../scripts/check-resource-date-format.mjs`,
`node ../scripts/check-pagination-envelope.mjs`, `node ../scripts/check-agency-scope-clause.mjs` → verts.

**Étape 17.7 — ablation** : dans `PropertyBoostPolicy::create`, retirer
`&& $user->canActAt(Capability::BoostSpend, $property->agency)` → `test_l_agent_sans_la_capacite_est_refuse`
rouge (si l'agent gère le bien) ; restaurer, `md5`.

**Collision C3** — `takussan-api/app/Http/Resources/PropertyResource.php`, ancre (l. 122) :

```php
            'featured' => $this->whenHas('featured', fn ($valeur) => (bool) $valeur),
```

→ remplacer par :

```php
            'featured' => $this->whenHas('featured', fn ($valeur) => (bool) $valeur),
            // TCK-633 lot F (ADR-0061 §5) — le badge acheté (« Urgent », « Baisse de prix »), projeté
            // par `BoostLifecycle` ; nul sans badge actif.
            'badge' => $this->whenHas('badge', fn ($valeur) => $valeur?->value),
            'badge_until' => $this->whenHas('badge_until', fn ($valeur) => $this->iso($valeur)),
```

Test différé (C3) — `takussan-api/tests/Feature/Boost/PropertyResourceBadgeTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Models\Enums\BoostBadge;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** TCK-633 lot F (ADR-0061 §5) — la fiche publique et la liste exposent le badge actif. */
class PropertyResourceBadgeTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_badge_est_expose(): void
    {
        $property = Property::factory()->published()->create();
        $property->forceFill(['badge' => BoostBadge::Urgent, 'badge_until' => now()->addDays(3)])->saveQuietly();

        $this->getJson("/api/public/properties/{$property->slug}")
            ->assertOk()
            ->assertJsonPath('data.badge', 'urgent');
        $this->getJson('/api/public/properties')
            ->assertOk()
            ->assertJsonPath('data.0.badge', 'urgent');
    }
}
```

Lancé par la session après C3 : `php artisan test tests/Feature/Boost/PropertyResourceBadgeTest.php` → `1 passed`.

**Étape 17.8 — signaler à la session les fichiers à commiter :** `routes/api/credits.php`, les trois
contrôleurs, la requête, les quatre ressources, les trois tests ; collision C3.

---

## Tâche 18 — API super-admin : catalogue, portefeuilles, ajustements, boosts, statistiques

**Fichiers :** créer `routes/api/admin-credits.php`,
`app/Http/Controllers/Api/Admin/{AdminBoostProductController,AdminCreditWalletController,AdminBoostController,AdminBoostStatsController}.php`,
`app/Http/Requests/Api/Admin/{StoreBoostProductRequest,UpdateBoostProductRequest,AdjustCreditWalletRequest,CancelBoostRequest,OfferBoostRequest,BoostStatsRequest}.php`,
`app/Http/Resources/Credits/CreditWalletResource.php`, `tests/Feature/Boost/AdminCreditsApiTest.php`,
`tests/Feature/Boost/AdminCreditsStepUpTest.php` (différé C1). **Collision C1.**

Chaque écriture : `super_admin` (groupe `super-admin` sans geste ⇒ réservé au `super_admin`,
`PlatformRoutesDefaultDenyTest`), second facteur **récent** (C1), **motif** obligatoire, **journal**
(`activity('Credits')` / `activity('Boost')`, évènements `super_admin_*`).

| Méthode | Chemin (`/api/admin/…`) | Action |
|---|---|---|
| GET | `boost-products` | catalogue complet (inactives comprises) |
| POST | `boost-products` | créer une offre (genre, variante, durée, prix) |
| PATCH | `boost-products/{boostProduct}` | prix, activation, ordre (genre/variante/durée immuables) |
| GET | `credit-wallets?search=&page=` | espaces qui ont des lots, avec solde |
| GET | `credit-wallets/{agency}?page=` | solde, tous les lots, journal paginé |
| POST | `credit-wallets/{agency}/adjustments` `{amount, reason}` | crédit (lot `admin_grant`) ou débit (`admin_debit`) |
| GET | `boosts?filter[status]=&filter[kind]=&filter[agency_id]=` | boosts paginés |
| POST | `boosts/{boost}/cancel` `{refund, reason}` | annulation, avec ou sans remboursement |
| POST | `properties/{property}/offered-boost` `{product_id, reason}` | Vedette offerte |
| GET | `boost-stats?from=&to=` | impressions, clics, taux de clic par jour |

**Étape 18.1 — tests (rouges).** `takussan-api/tests/Feature/Boost/AdminCreditsApiTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Models\Activity;
use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\CreditLot;
use App\Models\CreditMovement;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\User;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §4, §5, §10 ; AC16) — la console : catalogue, portefeuilles, ajustements
 * motivés et journalisés, annulation avec ou sans remboursement, Vedette offerte, statistiques.
 */
class AdminCreditsApiTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create(['name' => 'Agence Teranga']);
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
    }

    public function test_seul_le_super_admin_entre(): void
    {
        $this->actingAsRole('agency_admin', ['agency' => $this->agency]);

        $this->getJson('/api/admin/credit-wallets')->assertForbidden();
        $this->postJson("/api/admin/credit-wallets/{$this->agency->id}/adjustments", ['amount' => 10, 'reason' => 'Geste commercial'])->assertForbidden();
    }

    public function test_le_catalogue_se_regle_et_se_journalise(): void
    {
        $this->actingAsRole('super_admin');
        $bump = BoostProduct::query()->where('kind', 'bump')->sole();

        $this->getJson('/api/admin/boost-products')->assertOk()->assertJsonCount(6, 'data');
        $this->patchJson("/api/admin/boost-products/{$bump->id}", ['price_credits' => 8, 'is_active' => false])
            ->assertOk()->assertJsonPath('data.price_credits', 8)->assertJsonPath('data.is_active', false);
        $this->postJson('/api/admin/boost-products', ['kind' => 'featured', 'duration_days' => 60, 'price_credits' => 100])
            ->assertCreated()->assertJsonPath('data.duration_days', 60);
        $this->postJson('/api/admin/boost-products', ['kind' => 'badge', 'duration_days' => 7, 'price_credits' => 10])
            ->assertStatus(422)->assertJsonValidationErrors('variant');
        $this->postJson('/api/admin/boost-products', ['kind' => 'featured', 'duration_days' => 7, 'price_credits' => 1])
            ->assertStatus(422)->assertJsonValidationErrors('duration_days');

        $this->assertTrue(Activity::query()->where('event', 'super_admin_boost_product_updated')->exists());
        $this->assertTrue(Activity::query()->where('event', 'super_admin_boost_product_created')->exists());
    }

    public function test_un_ajustement_exige_un_motif_et_se_journalise(): void
    {
        $this->actingAsRole('super_admin');
        $url = "/api/admin/credit-wallets/{$this->agency->id}/adjustments";

        $this->postJson($url, ['amount' => 50])->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->postJson($url, ['amount' => 0, 'reason' => 'Geste commercial'])->assertStatus(422)->assertJsonValidationErrors('amount');

        $this->postJson($url, ['amount' => 50, 'reason' => 'Geste commercial'])->assertOk()->assertJsonPath('data.balance', 150);
        $this->postJson($url, ['amount' => -30, 'reason' => 'Correction d’erreur'])->assertOk()->assertJsonPath('data.balance', 120);
        $this->postJson($url, ['amount' => -1000, 'reason' => 'Correction d’erreur'])
            ->assertStatus(422)->assertJsonPath('code', 'credits.insufficient');

        $this->assertSame(1, CreditLot::query()->where('origin', CreditLotOrigin::AdminGrant)->count());
        $this->assertSame(2, Activity::query()->where('event', 'super_admin_credits_adjusted')->count());
        $this->assertSame([], app(CreditLedger::class)->invariantViolations());

        $this->getJson("/api/admin/credit-wallets/{$this->agency->id}")
            ->assertOk()->assertJsonPath('data.balance', 120)->assertJsonPath('data.agency.name', 'Agence Teranga');
        $this->getJson('/api/admin/credit-wallets?search=teranga')
            ->assertOk()->assertJsonPath('data.0.id', $this->agency->id)->assertJsonPath('data.0.balance', 120);
    }

    public function test_annuler_avec_ou_sans_remboursement(): void
    {
        $operateur = $this->actingAsRole('super_admin');
        [$rembourse, $sec] = $this->deuxVedettes();

        $this->postJson("/api/admin/boosts/{$rembourse->id}/cancel", ['refund' => true])->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->postJson("/api/admin/boosts/{$rembourse->id}/cancel", ['refund' => true, 'reason' => 'Annonce en double'])
            ->assertOk()->assertJsonPath('data.status', 'refunded');
        $this->postJson("/api/admin/boosts/{$sec->id}/cancel", ['refund' => false, 'reason' => 'Contenu trompeur'])
            ->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->postJson("/api/admin/boosts/{$sec->id}/cancel", ['refund' => false, 'reason' => 'Contenu trompeur'])
            ->assertStatus(422)->assertJsonPath('code', 'boost.not_live');

        $this->assertSame(1, CreditLot::query()->where('origin', CreditLotOrigin::Refund)->count());
        $this->assertSame($operateur->id, PropertyBoost::query()->find($sec->id)->cancelled_by_id);
        $this->assertSame(2, Activity::query()->where('event', 'super_admin_boost_cancelled')->count());
        $this->getJson('/api/admin/boosts?filter[status]=cancelled')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_une_vedette_offerte_ne_coute_rien_et_porte_son_motif(): void
    {
        $this->actingAsRole('super_admin');
        $property = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
        $offre = BoostProduct::query()->where('kind', 'featured')->where('duration_days', 15)->sole();

        $this->postJson("/api/admin/properties/{$property->id}/offered-boost", ['product_id' => $offre->id, 'reason' => 'Lancement de l’agence'])
            ->assertCreated()->assertJsonPath('data.offered', true)->assertJsonPath('data.price_credits', 0)
            ->assertJsonPath('data.offer_reason', 'Lancement de l’agence');

        $this->assertSame(1, CreditMovement::query()->count(), 'seul l’octroi de bienvenue');
        $this->assertTrue((bool) $property->fresh()->featured);
        $this->assertTrue(Activity::query()->where('event', 'super_admin_boost_offered')->exists());
    }

    public function test_les_statistiques_rendent_le_taux_de_clic(): void
    {
        $this->actingAsRole('super_admin');
        [$vedette] = $this->deuxVedettes();
        DB::table('property_boost_daily_stats')->insert([
            ['property_boost_id' => $vedette->id, 'date' => now()->toDateString(), 'impressions' => 200, 'clicks' => 10, 'created_at' => now(), 'updated_at' => now()],
            ['property_boost_id' => $vedette->id, 'date' => now()->subDay()->toDateString(), 'impressions' => 100, 'clicks' => 5, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->getJson('/api/admin/boost-stats?from='.now()->subDays(6)->toDateString().'&to='.now()->toDateString())
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('totals.impressions', 300)
            ->assertJsonPath('totals.clicks', 15)
            ->assertJsonPath('totals.ctr', 0.05);
    }

    /**
     * Un acheteur quelconque : `purchase()` n'autorise pas (c'est le rôle de la FormRequest), et
     * `purchased_by_id` n'est lu que pour notifier.
     *
     * @return array{0: PropertyBoost, 1: PropertyBoost}
     */
    private function deuxVedettes(): array
    {
        $offre = BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole();
        $achat = fn () => app(BoostPurchaseService::class)->purchase(
            Property::factory()->published()->create(['agency_id' => $this->agency->id]), $offre, User::factory()->create(),
        );

        return [$achat(), $achat()];
    }
}
```

Rouges : 404 sur `/api/admin/credit-wallets`.

**Étape 18.2 — `takussan-api/routes/api/admin-credits.php`** :

```php
<?php

use App\Http\Controllers\Api\Admin\AdminBoostController;
use App\Http\Controllers\Api\Admin\AdminBoostProductController;
use App\Http\Controllers\Api\Admin\AdminBoostStatsController;
use App\Http\Controllers\Api\Admin\AdminCreditWalletController;
use Illuminate\Support\Facades\Route;

/*
| TCK-633 lot F (ADR-0061) — la console des crédits et de la mise en avant. Aucun geste
| (`platform-can:`) déclaré : ces routes restent au seul `super_admin` (`PlatformRoutesDefaultDenyTest`).
| Les écritures sont sous second facteur récent (`ProtectedActions::STEP_UP`).
*/
Route::middleware(['auth:sanctum', 'super-admin'])->prefix('admin')->group(function () {
    Route::get('boost-products', [AdminBoostProductController::class, 'index'])->name('admin.boost-products.index');
    Route::post('boost-products', [AdminBoostProductController::class, 'store'])->name('admin.boost-products.store');
    Route::patch('boost-products/{boostProduct}', [AdminBoostProductController::class, 'update'])->name('admin.boost-products.update');

    Route::get('credit-wallets', [AdminCreditWalletController::class, 'index'])->name('admin.credit-wallets.index');
    Route::get('credit-wallets/{agency}', [AdminCreditWalletController::class, 'show'])->name('admin.credit-wallets.show');
    Route::post('credit-wallets/{agency}/adjustments', [AdminCreditWalletController::class, 'adjust'])->name('admin.credit-wallets.adjust');

    Route::get('boosts', [AdminBoostController::class, 'index'])->name('admin.boosts.index');
    Route::post('boosts/{boost}/cancel', [AdminBoostController::class, 'cancel'])->name('admin.boosts.cancel');
    Route::post('properties/{property}/offered-boost', [AdminBoostController::class, 'offer'])->name('admin.boosts.offer');

    Route::get('boost-stats', [AdminBoostStatsController::class, 'index'])->name('admin.boost-stats.index');
});
```

**Étape 18.3 — requêtes** (`takussan-api/app/Http/Requests/Api/Admin/`), toutes
`authorize(): $this->user()?->isSuperAdmin() === true`.

`StoreBoostProductRequest.php` :

```php
<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\BoostBadge;
use App\Models\Enums\BoostKind;
use Illuminate\Validation\Rule;

/** TCK-633 lot F (ADR-0061 §4) — une offre : genre, variante (badge seulement), durée, prix en crédits. */
class StoreBoostProductRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $bump = $this->input('kind') === BoostKind::Bump->value;
        $variant = $this->input('variant');

        return [
            'kind' => ['required', Rule::enum(BoostKind::class)],
            'variant' => [
                Rule::requiredIf($this->input('kind') === BoostKind::Badge->value),
                Rule::prohibitedIf($this->input('kind') !== BoostKind::Badge->value),
                'nullable', Rule::enum(BoostBadge::class),
            ],
            // (genre, variante, durée) est l'identité d'une offre : unique, comme la contrainte
            // `boost_products_offer_unique` (NULLS NOT DISTINCT) qui la garde en base.
            'duration_days' => [
                'required', 'integer', $bump ? 'in:0' : 'between:1,365',
                Rule::unique('boost_products')
                    ->where('kind', (string) $this->input('kind'))
                    ->where(fn ($q) => $variant === null ? $q->whereNull('variant') : $q->where('variant', $variant)),
            ],
            'price_credits' => ['required', 'integer', 'min:0', 'max:100000'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:1000'],
        ];
    }
}
```

`UpdateBoostProductRequest.php` :

```php
<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 lot F (ADR-0061 §4) — genre, variante et durée sont l'identité de l'offre : immuables. */
class UpdateBoostProductRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'kind' => ['prohibited'],
            'variant' => ['prohibited'],
            'duration_days' => ['prohibited'],
            'price_credits' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:1000'],
        ];
    }
}
```

`AdjustCreditWalletRequest.php` :

```php
<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 lot F (ADR-0061 §2) — créditer (> 0) ou débiter (< 0) un espace, toujours motivé. */
class AdjustCreditWalletRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'amount' => ['required', 'integer', 'between:-100000,100000', 'not_in:0'],
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ];
    }
}
```

`CancelBoostRequest.php` :

```php
<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 lot F (ADR-0061 §5, AC16) — annuler un boost, en disant pourquoi et s'il est remboursé. */
class CancelBoostRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'refund' => ['required', 'boolean'],
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ];
    }
}
```

`OfferBoostRequest.php` :

```php
<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 lot F (ADR-0061 §5) — offrir une Vedette : l'offre (sa durée), et le motif. */
class OfferBoostRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'product_id' => ['required', 'integer', 'exists:boost_products,id'],
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ];
    }
}
```

`BoostStatsRequest.php` :

```php
<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use Illuminate\Support\Carbon;

/** TCK-633 lot F (ADR-0061 §10) — une fenêtre de dates, 92 jours au plus. */
class BoostStatsRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from', 'before_or_equal:'.now()->addDay()->toDateString()],
        ];
    }

    protected function passedValidation(): void
    {
        if (Carbon::parse($this->input('from'))->diffInDays(Carbon::parse($this->input('to'))) > 92) {
            abort_code(422, 'boost.stats_window_too_wide');
        }
    }
}
```

**Edit `lang/{fr,en,wo}/errors.php`** — dans le groupe `boost` posé en tâche 10, ancre
`        'property_not_public' => …,` (la dernière ligne du groupe, propre à chaque langue) → ajouter
**après** :

- fr : `        'stats_window_too_wide' => 'La période ne peut pas dépasser 92 jours.',`
- en : `        'stats_window_too_wide' => 'The period cannot exceed 92 days.',`
- wo : `        'stats_window_too_wide' => 'Diir bi mënul ëpp 92 fan.',`

**Étape 18.4 — `takussan-api/app/Http/Resources/Credits/CreditWalletResource.php`** :

```php
<?php

namespace App\Http\Resources\Credits;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/** TCK-633 lot F (ADR-0061 §1) — un espace vu par son portefeuille (solde posé par le contrôleur). */
class CreditWalletResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'status' => $this->status?->value,
            'balance' => (int) ($this->credit_balance ?? 0),
            'next_expiry_at' => $this->iso($this->credit_next_expiry_at ? Carbon::parse($this->credit_next_expiry_at) : null),
        ];
    }
}
```

**Étape 18.5 — contrôleurs** (`takussan-api/app/Http/Controllers/Api/Admin/`).

`AdminBoostProductController.php` :

```php
<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StoreBoostProductRequest;
use App\Http\Requests\Api\Admin\UpdateBoostProductRequest;
use App\Http\Resources\Credits\BoostProductResource;
use App\Models\BoostProduct;
use Illuminate\Http\JsonResponse;

/** TCK-633 lot F (ADR-0061 §4) — le catalogue, réglé sans redéploiement ; chaque écriture journalisée. */
class AdminBoostProductController extends Controller
{
    public function index(): JsonResponse
    {
        $products = BoostProduct::query()->orderBy('sort_order')->orderBy('id')->get();

        return $this->json(['data' => BoostProductResource::collection($products)->resolve()]);
    }

    public function store(StoreBoostProductRequest $request): JsonResponse
    {
        $product = BoostProduct::query()->create($request->validated() + ['is_active' => true, 'sort_order' => 100]);

        activity('Boost')
            ->performedOn($product)
            ->causedBy($request->user())
            ->withProperties(['product' => BoostProductResource::make($product)->resolve()])
            ->event('super_admin_boost_product_created')
            ->log('Offre de mise en avant créée');

        return $this->json(['data' => BoostProductResource::make($product)->resolve()], 201);
    }

    public function update(UpdateBoostProductRequest $request, BoostProduct $boostProduct): JsonResponse
    {
        $before = BoostProductResource::make($boostProduct)->resolve();
        $boostProduct->update($request->validated());

        activity('Boost')
            ->performedOn($boostProduct)
            ->causedBy($request->user())
            ->withProperties(['before' => $before, 'after' => BoostProductResource::make($boostProduct)->resolve()])
            ->event('super_admin_boost_product_updated')
            ->log('Offre de mise en avant modifiée');

        return $this->json(['data' => BoostProductResource::make($boostProduct)->resolve()]);
    }
}
```

> `BoostProduct::$fillable` (tâche 2) porte `kind, variant, duration_days, price_credits, is_active,
> sort_order` : vérifié au moment d'écrire ; `validated() + [défauts]` laisse la valeur envoyée gagner.

`AdminCreditWalletController.php` :

```php
<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\AdjustCreditWalletRequest;
use App\Http\Resources\Credits\CreditLotResource;
use App\Http\Resources\Credits\CreditMovementResource;
use App\Http\Resources\Credits\CreditWalletResource;
use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\CreditMovement;
use App\Services\Boost\BoostSettings;
use App\Services\Credits\CreditLedger;
use App\Services\Credits\InsufficientCredits;
use App\Support\CaseInsensitive;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** TCK-633 lot F (ADR-0061 §1, §2) — les portefeuilles des espaces, et leurs ajustements motivés. */
class AdminCreditWalletController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));
        $paginator = Agency::query()
            ->whereIn('id', CreditLot::query()->select('agency_id'))
            ->when($search !== '', fn ($q) => $q->whereRaw(CaseInsensitive::sql('name').' LIKE ?', ['%'.CaseInsensitive::fold($search).'%']))
            ->orderBy('name')
            ->paginate(min(100, max(1, (int) $request->input('per_page', 25))));

        $agencies = collect($paginator->items());
        $soldes = CreditLot::query()
            ->whereIn('agency_id', $agencies->pluck('id'))
            ->spendable()
            ->groupBy('agency_id')
            ->select('agency_id', DB::raw('SUM(remaining_amount) AS balance'), DB::raw('MIN(expires_at) AS next_expiry_at'))
            ->get()
            ->keyBy('agency_id');
        $agencies->each(fn (Agency $agency) => $agency->setAttribute('credit_balance', (int) ($soldes[$agency->id]->balance ?? 0))
            ->setAttribute('credit_next_expiry_at', $soldes[$agency->id]->next_expiry_at ?? null));

        return $this->paginated($paginator, CreditWalletResource::collection($agencies)->resolve());
    }

    public function show(Request $request, Agency $agency, CreditLedger $ledger): JsonResponse
    {
        $lots = CreditLot::query()->where('agency_id', $agency->getKey())->orderByDesc('created_at')->orderByDesc('id')->get();
        $movements = CreditMovement::query()
            ->where('agency_id', $agency->getKey())
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(min(100, max(1, (int) $request->input('per_page', 25))));

        return $this->json([
            'data' => [
                'agency' => ['id' => $agency->id, 'name' => $agency->name, 'status' => $agency->status?->value],
                'balance' => $ledger->balance($agency),
                'lots' => CreditLotResource::collection($lots)->resolve(),
            ],
            'movements' => CreditMovementResource::collection($movements->items())->resolve(),
            'meta' => $this->paginationMeta($movements),
        ]);
    }

    public function adjust(AdjustCreditWalletRequest $request, Agency $agency, CreditLedger $ledger, BoostSettings $settings): JsonResponse
    {
        $amount = $request->integer('amount');
        $reason = (string) $request->validated('reason');

        try {
            // Un crédit manuel suit la validité de l'offre de bienvenue (écart E6).
            $lot = $ledger->adminAdjust($agency, $amount, $request->user(), $reason, $settings->welcomeValidityDays());
        } catch (InsufficientCredits $e) {
            abort_code(422, 'credits.insufficient', ['missing' => $e->missing(), 'balance' => $e->balance]);
        }

        activity('Credits')
            ->performedOn($agency)
            ->causedBy($request->user())
            ->withProperties(['agency_id' => $agency->id, 'amount' => $amount, 'reason' => $reason, 'lot_id' => $lot?->id])
            ->event('super_admin_credits_adjusted')
            ->log('Portefeuille de crédits ajusté');

        return $this->json(['data' => [
            'balance' => $ledger->balance($agency),
            'lot' => $lot ? CreditLotResource::make($lot)->resolve() : null,
        ]]);
    }
}
```

`AdminBoostController.php` :

```php
<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\CancelBoostRequest;
use App\Http\Requests\Api\Admin\OfferBoostRequest;
use App\Http\Resources\Credits\PropertyBoostResource;
use App\Models\BoostProduct;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Boost\BoostLifecycle;
use App\Services\Boost\BoostPurchaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** TCK-633 lot F (ADR-0061 §5, AC16) — les boosts du parc : lecture, annulation, Vedette offerte. */
class AdminBoostController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filtres = (array) $request->input('filter', []);
        $paginator = PropertyBoost::query()
            ->with(['property:id,title,slug', 'agency:id,name'])
            ->when(BoostStatus::tryFrom((string) ($filtres['status'] ?? '')), fn ($q, BoostStatus $s) => $q->where('status', $s))
            ->when(BoostKind::tryFrom((string) ($filtres['kind'] ?? '')), fn ($q, BoostKind $k) => $q->where('kind', $k))
            ->when(isset($filtres['agency_id']) && ctype_digit((string) $filtres['agency_id']), fn ($q) => $q->where('agency_id', (int) $filtres['agency_id']))
            ->orderByDesc('starts_at')
            ->orderByDesc('id')
            ->paginate(min(100, max(1, (int) $request->input('per_page', 25))));

        return $this->paginated($paginator, PropertyBoostResource::collection($paginator->items())->resolve());
    }

    public function cancel(CancelBoostRequest $request, PropertyBoost $boost, BoostLifecycle $lifecycle): JsonResponse
    {
        $reason = (string) $request->validated('reason');
        $refund = $request->boolean('refund');
        $result = $lifecycle->cancel($boost, $refund, $request->user(), $reason);

        activity('Boost')
            ->performedOn($result)
            ->causedBy($request->user())
            ->withProperties(['boost_id' => $result->id, 'refund' => $refund, 'refunded_credits' => $result->refunded_credits, 'reason' => $reason])
            ->event('super_admin_boost_cancelled')
            ->log('Mise en avant annulée');

        return $this->json(['data' => PropertyBoostResource::make($result)->resolve()]);
    }

    public function offer(OfferBoostRequest $request, Property $property, BoostPurchaseService $purchases): JsonResponse
    {
        $product = BoostProduct::query()->findOrFail($request->integer('product_id'));
        $reason = (string) $request->validated('reason');
        $boost = $purchases->offerFeatured($property, $product, $request->user(), $reason);

        activity('Boost')
            ->performedOn($boost)
            ->causedBy($request->user())
            ->withProperties(['boost_id' => $boost->id, 'property_id' => $property->id, 'duration_days' => $product->duration_days, 'reason' => $reason])
            ->event('super_admin_boost_offered')
            ->log('Vedette offerte');

        return $this->json(['data' => PropertyBoostResource::make($boost->fresh())->resolve()], 201);
    }
}
```

`AdminBoostStatsController.php` :

```php
<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\BoostStatsRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/** TCK-633 lot F (ADR-0061 §10) — impressions, clics et taux de clic des emplacements, par jour. */
class AdminBoostStatsController extends Controller
{
    public function index(BoostStatsRequest $request): JsonResponse
    {
        $rows = DB::table('property_boost_daily_stats')
            ->whereBetween('date', [$request->input('from'), $request->input('to')])
            ->groupBy('date')
            ->orderBy('date')
            ->select('date', DB::raw('SUM(impressions) AS impressions'), DB::raw('SUM(clicks) AS clicks'))
            ->get()
            ->map(fn ($r) => [
                'date' => substr((string) $r->date, 0, 10),
                'impressions' => (int) $r->impressions,
                'clicks' => (int) $r->clicks,
                'ctr' => (int) $r->impressions > 0 ? round((int) $r->clicks / (int) $r->impressions, 4) : 0.0,
            ])
            ->values();

        $impressions = (int) $rows->sum('impressions');
        $clicks = (int) $rows->sum('clicks');

        return $this->json([
            'data' => $rows->all(),
            'totals' => [
                'impressions' => $impressions,
                'clicks' => $clicks,
                'ctr' => $impressions > 0 ? round($clicks / $impressions, 4) : 0.0,
            ],
        ]);
    }
}
```

**Étape 18.6 — vert** : `php artisan test tests/Feature/Boost/AdminCreditsApiTest.php` → `6 passed` ;
`php artisan test --filter=PlatformRoutesDefaultDenyTest` → vert ;
`php artisan test --filter=ProtectedActionsCoverageTest` → **rouge attendu jusqu'à C1** si la garde
exige que toute écriture de `/api/admin/*` soit listée : le consigner, ne pas éditer.
Gardes : `check-controller-authorization`, `check-pagination-envelope`, `check-resources-extend-base`,
`check-resource-date-format` → verts.

**Étape 18.7 — ablation** : dans `AdjustCreditWalletRequest::rules()`, retirer `'reason'` →
`test_un_ajustement_exige_un_motif…` rouge ; restaurer, `md5`.

**Collision C1** — `takussan-api/app/Support/Security/ProtectedActions.php`. (a) imports, en ordre
alphabétique parmi les `use App\Http\Controllers\Api\Admin\…` :

```php
use App\Http\Controllers\Api\Admin\AdminBoostController;
use App\Http\Controllers\Api\Admin\AdminBoostProductController;
use App\Http\Controllers\Api\Admin\AdminCreditWalletController;
```

(b) dans `STEP_UP`, ancre :

```php
        WebhookLogController::class.'@replay',
```

→ remplacer par :

```php
        WebhookLogController::class.'@replay',

        // TCK-633 lot F (ADR-0061) — créer ou débiter des crédits, annuler ou offrir un boost, régler
        // le catalogue : de la valeur qui bouge. Un jeton volé ne les tient plus sans le TOTP.
        AdminCreditWalletController::class.'@adjust',
        AdminBoostController::class.'@cancel',
        AdminBoostController::class.'@offer',
        AdminBoostProductController::class.'@store',
        AdminBoostProductController::class.'@update',
```

Test différé (C1) — `takussan-api/tests/Feature/Boost/AdminCreditsStepUpTest.php` :

```php
<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\User;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** TCK-633 lot F — chaque écriture de la console des crédits exige un second facteur RÉCENT. */
class AdminCreditsStepUpTest extends TestCase
{
    use RefreshDatabase;

    public function test_sans_step_up_aucune_ecriture_ne_passe(): void
    {
        $agency = Agency::factory()->create();
        app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $vedette = BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole();

        $stale = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP']);
        $this->materializeRoleProfile($stale, 'super_admin');
        $boost = app(BoostPurchaseService::class)->purchase($property, $vedette, $stale);
        $this->actingAs($stale);

        $ecritures = [
            ["/api/admin/boosts/{$boost->id}/cancel", 'post', ['refund' => false, 'reason' => 'Contenu trompeur']],
            ["/api/admin/credit-wallets/{$agency->id}/adjustments", 'post', ['amount' => 10, 'reason' => 'Geste commercial']],
            ["/api/admin/properties/{$property->id}/offered-boost", 'post', ['product_id' => $vedette->id, 'reason' => 'Lancement']],
            ['/api/admin/boost-products', 'post', ['kind' => 'featured', 'duration_days' => 45, 'price_credits' => 80]],
            ["/api/admin/boost-products/{$vedette->id}", 'patch', ['price_credits' => 25]],
        ];
        foreach ($ecritures as [$url, $verbe, $corps]) {
            $this->json($verbe, $url, $corps)->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');
        }

        $this->assertSame(80, app(CreditLedger::class)->balance($agency), 'seul l’achat préalable a débité');
        $this->assertSame(20, $vedette->fresh()->price_credits);
        $this->assertSame('active', $boost->fresh()->status->value);
    }
}
```

Lancé par la session après C1 : `php artisan test tests/Feature/Boost/AdminCreditsStepUpTest.php` → `1 passed`.

**Étape 18.8 — signaler à la session les fichiers à commiter :** `routes/api/admin-credits.php`, les
quatre contrôleurs, les six requêtes, `CreditWalletResource.php`, `lang/{fr,en,wo}/errors.php`, les
deux tests ; collision C1.

---

## Tâche 19 — Front annonceur : types, requêtes, libellés `boost` et `credits`

**Fichiers :** créer `takussan-web/src/components/boost/types.ts`, `takussan-web/src/components/boost/api.ts` ;
Edit `takussan-web/src/messages/{fr,en,wo}.json` (espaces F : `boost`, `credits`).

Règles front rappelées : `useApiQuery` / `useApiMutation` **écrivent `/api`** (le piège du préfixe) ;
un identifiant dans un chemin passe par `cheminApi` ; aucun type partagé (`types/property.ts`,
`types/search.ts`) n'est édité — les champs neufs (`badge`, `placement`, `sponsored`) se lisent
par `components/boost/lecture-recherche.ts` (tâche 22).

**Étape 19.1 — `takussan-web/src/components/boost/types.ts`** :

```ts
import type { PaginationMeta } from '@/types/api';

/** TCK-633 lot F (ADR-0061) — les formes de l'API des crédits et du boost, propres au lot. */
export type BoostKind = 'bump' | 'featured' | 'badge';
export type BoostVariant = 'urgent' | 'price_drop';
export type BoostStatus = 'active' | 'paused' | 'ended' | 'cancelled' | 'refunded';
export type CreditLotOrigin = 'welcome' | 'admin_grant' | 'refund' | 'purchase';
export type CreditMovementType = 'grant' | 'spend' | 'refund' | 'expire' | 'admin_debit';
export type BoostPlacement = 'sponsored' | 'reserved' | null;

export interface BoostProduct {
  readonly id: number;
  readonly kind: BoostKind;
  readonly variant: BoostVariant | null;
  readonly duration_days: number;
  readonly price_credits: number;
  readonly is_active: boolean;
  readonly sort_order: number;
}

export interface CreditLot {
  readonly id: number;
  readonly origin: CreditLotOrigin;
  readonly initial_amount: number;
  readonly remaining_amount: number;
  readonly expires_at: string | null;
  readonly reason: string | null;
  readonly created_at: string;
}

export interface CreditMovement {
  readonly id: number;
  readonly type: CreditMovementType;
  readonly amount: number;
  readonly credit_lot_id: number;
  readonly property_boost_id: number | null;
  readonly actor_id: number | null;
  readonly reason: string | null;
  readonly created_at: string;
}

export interface PropertyBoost {
  readonly id: number;
  readonly property_id: number;
  readonly agency_id: number;
  readonly kind: BoostKind;
  readonly variant: BoostVariant | null;
  readonly status: BoostStatus;
  readonly price_credits: number;
  readonly duration_days: number;
  readonly starts_at: string;
  readonly ends_at: string | null;
  readonly ended_at: string | null;
  readonly remaining_seconds: number | null;
  readonly offered: boolean;
  readonly offer_reason: string | null;
  readonly refunded_credits: number | null;
  readonly cancel_reason: string | null;
  readonly property?: { readonly id: number; readonly title: string; readonly slug: string } | null;
  readonly agency?: { readonly id: number; readonly name: string } | null;
}

export interface CreditsResponse {
  readonly data: { readonly balance: number; readonly lots: readonly CreditLot[] };
  readonly movements: readonly CreditMovement[];
  readonly meta: PaginationMeta;
}

export interface BuyBoostResponse {
  readonly data: PropertyBoost;
  readonly balance: number;
}

/** Le corps d'un refus `credits.insufficient` (ADR-0032 : code + paramètres bruts). */
export function manqueDeCredits(erreur: unknown): { readonly missing: number; readonly balance: number } | null {
  const data = (erreur as { data?: { code?: unknown; params?: { missing?: unknown; balance?: unknown } } } | null)?.data;
  if (data?.code !== 'credits.insufficient') return null;
  return { missing: Number(data.params?.missing ?? 0), balance: Number(data.params?.balance ?? 0) };
}
```

**Étape 19.2 — `takussan-web/src/components/boost/api.ts`** :

```ts
'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';
import type { BoostProduct, BuyBoostResponse, CreditsResponse } from './types';

/** TCK-633 lot F — les clés de cache : un achat invalide le solde et l'historique. */
export const CLE_CREDITS = ['credits'] as const;
export const CLE_OFFRES = ['boost-products'] as const;

/** `enabled` : le dialogue ne tire rien tant qu'il n'est pas ouvert. */
export function useCredits(enabled = true, page = 1) {
  return useApiQuery<CreditsResponse>([...CLE_CREDITS, page], '/api/credits', {
    enabled,
    params: { page, per_page: 20 },
  });
}

export function useBoostProducts(enabled = true) {
  return useApiQuery<{ readonly data: readonly BoostProduct[] }>([...CLE_OFFRES], '/api/boost-products', {
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBuyBoost(propertyId: number) {
  return useApiMutation<BuyBoostResponse, { readonly product_id: number }>(
    { path: cheminApi`/api/properties/${propertyId}/boosts`, method: 'POST' },
    { invalidate: [[...CLE_CREDITS], ['properties']] },
  );
}
```

**Étape 19.3 — libellés.** Dans **chacun** des trois dictionnaires, ancre la ligne de premier niveau
`  "commissions": {` (unique, indentation de deux espaces) → insérer **avant** le bloc de la langue.

fr :

```json
  "boost": {
    "button": "Booster",
    "menuItem": "Booster ce bien",
    "kinds": {
      "bump": "Remontée — le bien repasse en tête des résultats",
      "featured": "Vedette {days} jours",
      "badge": {
        "urgent": "Badge « Urgent » {days} jours",
        "price_drop": "Badge « Baisse de prix » {days} jours"
      }
    },
    "dialog": {
      "title": "Mettre en avant",
      "description": "Choisissez une mise en avant pour « {title} ».",
      "loading": "Chargement des offres…",
      "loadError": "Impossible de charger les offres ou le solde.",
      "retry": "Réessayer",
      "balance": "Solde de l’espace : {count, plural, =0 {aucun crédit} one {# crédit} other {# crédits}}",
      "price": "{count, plural, =0 {offert} one {# crédit} other {# crédits}}",
      "missing": "Il vous manque {count, plural, one {# crédit} other {# crédits}} pour cette offre.",
      "noPurchase": "L’achat de crédits arrive bientôt. En attendant, choisissez une offre couverte par votre solde.",
      "cancel": "Annuler",
      "confirm": "Confirmer",
      "done": "C’est fait : la mise en avant est active.",
      "failed": "La mise en avant n’a pas pu être enregistrée."
    },
    "marks": {
      "featured": "En vedette",
      "urgent": "Urgent",
      "priceDrop": "Baisse de prix"
    }
  },
  "credits": {
    "metaTitle": "Crédits",
    "title": "Crédits de l’espace",
    "subtitle": "Les crédits de votre espace paient la mise en avant de vos biens.",
    "balance": "Solde",
    "balanceValue": "{count, plural, =0 {Aucun crédit} one {# crédit} other {# crédits}}",
    "lots": {
      "title": "Crédits disponibles",
      "empty": "Aucun crédit disponible pour le moment.",
      "expires": "Expire le {date}",
      "noExpiry": "Sans expiration",
      "remaining": "{remaining} sur {initial}"
    },
    "origins": {
      "welcome": "Offre de bienvenue",
      "admin_grant": "Crédits offerts par Takussan",
      "refund": "Remboursement",
      "purchase": "Achat"
    },
    "movements": {
      "title": "Historique",
      "caption": "Historique des crédits de l’espace",
      "empty": "Aucun mouvement pour le moment.",
      "colDate": "Date",
      "colType": "Opération",
      "colAmount": "Crédits",
      "colReason": "Motif"
    },
    "types": {
      "grant": "Octroi",
      "spend": "Mise en avant",
      "refund": "Remboursement",
      "expire": "Expiration",
      "admin_debit": "Débit par Takussan"
    },
    "loadError": "Impossible de charger les crédits.",
    "retry": "Réessayer"
  },
```

en :

```json
  "boost": {
    "button": "Promote",
    "menuItem": "Promote this listing",
    "kinds": {
      "bump": "Bump — the listing goes back to the top of results",
      "featured": "Featured {days} days",
      "badge": {
        "urgent": "“Urgent” badge {days} days",
        "price_drop": "“Price drop” badge {days} days"
      }
    },
    "dialog": {
      "title": "Promote",
      "description": "Choose a promotion for “{title}”.",
      "loading": "Loading offers…",
      "loadError": "Could not load the offers or the balance.",
      "retry": "Retry",
      "balance": "Workspace balance: {count, plural, =0 {no credits} one {# credit} other {# credits}}",
      "price": "{count, plural, =0 {free} one {# credit} other {# credits}}",
      "missing": "You are missing {count, plural, one {# credit} other {# credits}} for this offer.",
      "noPurchase": "Buying credits is coming soon. Meanwhile, choose an offer your balance covers.",
      "cancel": "Cancel",
      "confirm": "Confirm",
      "done": "Done: the promotion is live.",
      "failed": "The promotion could not be saved."
    },
    "marks": {
      "featured": "Featured",
      "urgent": "Urgent",
      "priceDrop": "Price drop"
    }
  },
  "credits": {
    "metaTitle": "Credits",
    "title": "Workspace credits",
    "subtitle": "Your workspace credits pay for promoting your listings.",
    "balance": "Balance",
    "balanceValue": "{count, plural, =0 {No credits} one {# credit} other {# credits}}",
    "lots": {
      "title": "Available credits",
      "empty": "No credits available yet.",
      "expires": "Expires on {date}",
      "noExpiry": "No expiry",
      "remaining": "{remaining} of {initial}"
    },
    "origins": {
      "welcome": "Welcome offer",
      "admin_grant": "Credits offered by Takussan",
      "refund": "Refund",
      "purchase": "Purchase"
    },
    "movements": {
      "title": "History",
      "caption": "Workspace credit history",
      "empty": "No activity yet.",
      "colDate": "Date",
      "colType": "Operation",
      "colAmount": "Credits",
      "colReason": "Reason"
    },
    "types": {
      "grant": "Grant",
      "spend": "Promotion",
      "refund": "Refund",
      "expire": "Expiry",
      "admin_debit": "Debit by Takussan"
    },
    "loadError": "Could not load the credits.",
    "retry": "Retry"
  },
```

wo :

```json
  "boost": {
    "button": "Yokk gis-gis",
    "menuItem": "Yokk gis-gisu kër gii",
    "kinds": {
      "bump": "Yékkati — kër gi dellu ci kaw ci li ñu wut",
      "featured": "Vedette {days} fan",
      "badge": {
        "urgent": "Màndarga « Gaaw » {days} fan",
        "price_drop": "Màndarga « Njëg wàcc na » {days} fan"
      }
    },
    "dialog": {
      "title": "Yokk gis-gis",
      "description": "Tannal ab yokk gis-gis ngir « {title} ».",
      "loading": "Ñu ngi yeb jaay yi…",
      "loadError": "Mënuñu yeb jaay yi walla kredi yi.",
      "retry": "Jéemaat",
      "balance": "Kredi bérab bi : {count, plural, =0 {benn kredi amul} one {# kredi} other {# kredi}}",
      "price": "{count, plural, =0 {may} one {# kredi} other {# kredi}}",
      "missing": "Des na la {count, plural, one {# kredi} other {# kredi}} ngir jaay bii.",
      "noPurchase": "Jënd kredi dina ñëw ci kanam. Léegi, tannal jaay bu sa kredi doy.",
      "cancel": "Neenal",
      "confirm": "Dëggal",
      "done": "Def nañu ko : yokk gis-gis bi dox na.",
      "failed": "Mënuñu denc yokk gis-gis bi."
    },
    "marks": {
      "featured": "Vedette",
      "urgent": "Gaaw",
      "priceDrop": "Njëg wàcc na"
    }
  },
  "credits": {
    "metaTitle": "Kredi",
    "title": "Kredi bérab bi",
    "subtitle": "Kredi sa bérab ñooy fey yokk gis-gisu say kër.",
    "balance": "Li des",
    "balanceValue": "{count, plural, =0 {Benn kredi amul} one {# kredi} other {# kredi}}",
    "lots": {
      "title": "Kredi yi am",
      "empty": "Amagul kredi.",
      "expires": "Dina jeex ci {date}",
      "noExpiry": "Du jeex",
      "remaining": "{remaining} ci {initial}"
    },
    "origins": {
      "welcome": "Mayu dalal",
      "admin_grant": "Kredi yu Takussan may",
      "refund": "Delloo",
      "purchase": "Jënd"
    },
    "movements": {
      "title": "Li xew",
      "caption": "Li xew ci kredi bérab bi",
      "empty": "Dara xewagul.",
      "colDate": "Bés",
      "colType": "Jëf",
      "colAmount": "Kredi",
      "colReason": "Lu tax"
    },
    "types": {
      "grant": "May",
      "spend": "Yokk gis-gis",
      "refund": "Delloo",
      "expire": "Jeex",
      "admin_debit": "Takussan wàññi na"
    },
    "loadError": "Mënuñu yeb kredi yi.",
    "retry": "Jéemaat"
  },
```

**Étape 19.4 — vérification** : `node -e "for (const l of ['fr','en','wo']) JSON.parse(require('fs').readFileSync('src/messages/'+l+'.json','utf8'))"`
(depuis `takussan-web/`) → aucune sortie ; `npm run check:i18n` → vert (parité des trois langues) ;
`npx tsc --noEmit` → vert.

**Étape 19.5 — signaler à la session les fichiers à commiter :** `types.ts`, `api.ts`, les trois dictionnaires.

---

## Tâche 20 — Bouton « Booster » et son dialogue

**Fichiers :** créer `takussan-web/src/components/boost/BoostDialog.tsx`, `BoostButton.tsx`,
`takussan-web/src/components/boost/__tests__/BoostDialog.test.tsx` ; Edit
`components/property-dashboard/PropertyHeaderActions.tsx`, `PropertyRowActions.tsx`. **Collision C12.**

Comportement (ADR-0061 §5, AC14) : le dialogue montre le **solde**, les offres actives et leur
prix ; une offre au-dessus du solde affiche **le montant manquant** et désactive « Confirmer » ;
**aucun bouton d'achat de crédits** (phase 2, §11). Rien n'est demandé au réseau tant que le
dialogue n'est pas ouvert. Le bouton n'existe que pour qui détient `boost.spend` et pour un bien public.

**Étape 20.1 — test (rouge).** `takussan-web/src/components/boost/__tests__/BoostDialog.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { useBoostProducts, useBuyBoost, useCredits } from '@/components/boost/api';
import { BoostDialog } from '../BoostDialog';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/components/boost/api', () => ({
  useCredits: vi.fn(),
  useBoostProducts: vi.fn(),
  useBuyBoost: vi.fn(),
}));

const OFFRES = [
  { id: 1, kind: 'bump', variant: null, duration_days: 0, price_credits: 5, is_active: true, sort_order: 10 },
  { id: 2, kind: 'featured', variant: null, duration_days: 7, price_credits: 20, is_active: true, sort_order: 20 },
] as const;

const mutate = vi.fn();

function etat(balance: number) {
  vi.mocked(useCredits).mockReturnValue({ data: { data: { balance, lots: [] }, movements: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } }, isLoading: false, isError: false, refetch: vi.fn() } as never);
  vi.mocked(useBoostProducts).mockReturnValue({ data: { data: OFFRES }, isLoading: false, isError: false, refetch: vi.fn() } as never);
  vi.mocked(useBuyBoost).mockReturnValue({ mutate, isPending: false, error: null, reset: vi.fn() } as never);
}

function ouvrir() {
  render(withIntl(<BoostDialog propertyId={47} propertyTitle="Studio à Ouakam" open onOpenChange={vi.fn()} />));
}

describe('BoostDialog (TCK-633 lot F)', () => {
  beforeEach(() => mutate.mockReset());

  it('montre le solde, les offres et leur prix', () => {
    etat(12);
    ouvrir();

    expect(screen.getByText('Solde de l’espace : 12 crédits')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vedette 7 jours/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remontée/ })).toBeInTheDocument();
  });

  it('une offre au-dessus du solde dit ce qui manque et ne se confirme pas — sans bouton d’achat', async () => {
    etat(12);
    const user = userEvent.setup();
    ouvrir();

    await user.click(screen.getByRole('button', { name: /Vedette 7 jours/ }));

    expect(screen.getByText('Il vous manque 8 crédits pour cette offre.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /acheter/i })).toBeNull();
  });

  it('une offre couverte se confirme', async () => {
    etat(100);
    const user = userEvent.setup();
    ouvrir();

    await user.click(screen.getByRole('button', { name: /Vedette 7 jours/ }));
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(mutate).toHaveBeenCalledWith({ product_id: 2 }, expect.anything());
  });

  it('fermé, il ne demande rien au réseau', () => {
    etat(100);
    render(withIntl(<BoostDialog propertyId={47} propertyTitle="Studio" open={false} onOpenChange={vi.fn()} />));

    expect(vi.mocked(useCredits)).toHaveBeenCalledWith(false);
    expect(vi.mocked(useBoostProducts)).toHaveBeenCalledWith(false);
  });
});
```

Rouge : `Failed to resolve import "../BoostDialog"`.

**Étape 20.2 — `takussan-web/src/components/boost/BoostDialog.tsx`** :

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { cn } from '@/lib/utils';
import { useBoostProducts, useBuyBoost, useCredits } from './api';
import { manqueDeCredits, type BoostProduct } from './types';

export interface BoostDialogProps {
  readonly propertyId: number;
  readonly propertyTitle: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * TCK-633 lot F (ADR-0061 §5, AC14) — choisir une mise en avant. Le solde et le montant manquant
 * sont dits AVANT la confirmation ; il n'y a pas de bouton d'achat de crédits (phase 2, §11).
 */
export function BoostDialog({ propertyId, propertyTitle, open, onOpenChange }: BoostDialogProps) {
  const t = useTranslations('boost');
  const router = useRouter();
  const messageErreur = useMessageErreurApi();
  const credits = useCredits(open);
  const offres = useBoostProducts(open);
  const achat = useBuyBoost(propertyId);
  const [choix, setChoix] = useState<number | null>(null);
  const [fait, setFait] = useState(false);

  const solde = credits.data?.data.balance ?? 0;
  const liste = offres.data?.data ?? [];
  const offre = liste.find((p) => p.id === choix) ?? null;
  const manque = offre ? Math.max(0, offre.price_credits - solde) : 0;
  const refusSolde = manqueDeCredits(achat.error);

  const libelle = (p: BoostProduct) =>
    p.kind === 'bump'
      ? t('kinds.bump')
      : p.kind === 'featured'
        ? t('kinds.featured', { days: p.duration_days })
        : t(`kinds.badge.${p.variant ?? 'urgent'}`, { days: p.duration_days });

  const fermer = (ouvert: boolean) => {
    if (!ouvert) {
      setChoix(null);
      setFait(false);
      achat.reset();
    }
    onOpenChange(ouvert);
  };

  const confirmer = () => {
    if (!offre || manque > 0) return;
    achat.mutate(
      { product_id: offre.id },
      {
        onSuccess: () => {
          setFait(true);
          router.refresh();
        },
      },
    );
  };

  const chargement = credits.isLoading || offres.isLoading;
  const echec = credits.isError || offres.isError;

  return (
    <Dialog open={open} onOpenChange={fermer}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('dialog.title')}</DialogTitle>
          <DialogDescription>{t('dialog.description', { title: propertyTitle })}</DialogDescription>
        </DialogHeader>

        {chargement ? (
          <p className="text-sm text-muted-foreground">{t('dialog.loading')}</p>
        ) : echec ? (
          <ErrorState
            message={t('dialog.loadError')}
            onRetry={() => {
              void credits.refetch();
              void offres.refetch();
            }}
            retryLabel={t('dialog.retry')}
          />
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-medium text-foreground tabular-nums">{t('dialog.balance', { count: solde })}</p>
            <ul className="space-y-2">
              {liste.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={choix === p.id}
                    onClick={() => setChoix(p.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                      choix === p.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
                    )}
                  >
                    <span className="text-foreground">{libelle(p)}</span>
                    <span className="shrink-0 font-medium tabular-nums text-foreground">{t('dialog.price', { count: p.price_credits })}</span>
                  </button>
                </li>
              ))}
            </ul>
            {manque > 0 ? (
              <div role="alert" className="space-y-1 text-sm">
                <p className="font-medium text-destructive">{t('dialog.missing', { count: manque })}</p>
                <p className="text-muted-foreground">{t('dialog.noPurchase')}</p>
              </div>
            ) : null}
            {refusSolde ? (
              <p role="alert" className="text-sm font-medium text-destructive">{t('dialog.missing', { count: refusSolde.missing })}</p>
            ) : achat.error ? (
              <p role="alert" className="text-sm text-destructive">{messageErreur(achat.error, t('dialog.failed'))}</p>
            ) : null}
            {fait ? (
              <p role="status" className="text-sm text-success">{t('dialog.done')}</p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => fermer(false)} disabled={achat.isPending}>
            {t('dialog.cancel')}
          </Button>
          <Button onClick={confirmer} disabled={!offre || manque > 0 || achat.isPending || fait}>
            {achat.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {t('dialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Étape 20.3 — `takussan-web/src/components/boost/BoostButton.tsx`** :

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Rocket } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCan } from '@/hooks/useCan';
import { BoostDialog } from './BoostDialog';

export interface BoostButtonProps {
  readonly propertyId: number;
  readonly propertyTitle: string;
  /** Seul un bien publié et visible se booste (l'API le refuse sinon : `boost.property_not_public`). */
  readonly isPublic: boolean;
}

/**
 * TCK-633 lot F (ADR-0061 §5) — « Booster » : présent pour qui détient `boost.spend`, sur un bien
 * public. Le dialogue n'est MONTÉ qu'ouvert : fermé, il ne demande rien au réseau.
 */
export function BoostButton({ propertyId, propertyTitle, isPublic }: BoostButtonProps) {
  const t = useTranslations('boost');
  const { can } = useCan('boost.spend');
  const [ouvert, setOuvert] = useState(false);

  if (!can || !isPublic) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Rocket aria-hidden="true" />
        {t('button')}
      </Button>
      {ouvert ? (
        <BoostDialog propertyId={propertyId} propertyTitle={propertyTitle} open={ouvert} onOpenChange={setOuvert} />
      ) : null}
    </>
  );
}
```

**Étape 20.4 — Edit `PropertyHeaderActions.tsx`.** (a) ancre
`import { AddDocumentButton } from '@/components/documents/AddDocumentButton';` → remplacer par :

```tsx
import { AddDocumentButton } from '@/components/documents/AddDocumentButton';
import { BoostButton } from '@/components/boost/BoostButton';
```

(b) ancre :

```tsx
      <div className="flex shrink-0 items-center gap-2">
        <AddDocumentButton
```

→ remplacer par :

```tsx
      <div className="flex shrink-0 items-center gap-2">
        {/* TCK-633 lot F — « Booster », pour un bien public et qui détient `boost.spend`. */}
        <BoostButton propertyId={property.id} propertyTitle={property.title} isPublic={Boolean(canViewPublic)} />
        <AddDocumentButton
```

**Étape 20.5 — Edit `PropertyRowActions.tsx`.** (a) ancre
`import { Archive, Copy, Loader2, MoreHorizontal } from 'lucide-react';` → remplacer par :

```tsx
import { Archive, Copy, Loader2, MoreHorizontal, Rocket } from 'lucide-react';
```

(b) ancre `import type { PropertyListItem } from '@/types/property';` → remplacer par :

```tsx
import type { PropertyListItem } from '@/types/property';
import { BoostDialog } from '@/components/boost/BoostDialog';
import { useCan } from '@/hooks/useCan';
```

(c) ancre `  const { canPublish, canDelete } = useGestesDuBien();` (dans `PropertyRowActions`) → remplacer par :

```tsx
  const { canPublish, canDelete } = useGestesDuBien();
  // TCK-633 lot F — « Booster » : capacité `boost.spend`, bien public ; le dialogue vit HORS du menu.
  const { can: canBoost } = useCan('boost.spend');
  const [boostOpen, setBoostOpen] = useState(false);
```

(d) ancre :

```tsx
          <DropdownMenuItem onClick={duplicate} disabled={pending}>
            <Copy className="size-4" aria-hidden="true" />
            {t('duplicate')}
          </DropdownMenuItem>
```

→ remplacer par :

```tsx
          <DropdownMenuItem onClick={duplicate} disabled={pending}>
            <Copy className="size-4" aria-hidden="true" />
            {t('duplicate')}
          </DropdownMenuItem>
          {canBoost && isPublic ? (
            <DropdownMenuItem onClick={() => setBoostOpen(true)} disabled={pending}>
              <Rocket className="size-4" aria-hidden="true" />
              {tBoost('menuItem')}
            </DropdownMenuItem>
          ) : null}
```

(e) ancre `  const t = useTranslations('property.dashboard.actions');` (unique dans le fichier) → remplacer par :

```tsx
  const t = useTranslations('property.dashboard.actions');
  const tBoost = useTranslations('boost');
```

(f) ancre (fin du composant) :

```tsx
      </Dialog>
    </div>
  );
}
```

→ remplacer par :

```tsx
      </Dialog>

      {boostOpen ? (
        <BoostDialog propertyId={property.id} propertyTitle={property.title} open={boostOpen} onOpenChange={setBoostOpen} />
      ) : null}
    </div>
  );
}
```

> Ancres (c) et (e) : relu le 2026-10-12, chacune n'apparaît qu'une fois dans le fichier (296 l.).

**Étape 20.6 — vert** (depuis `takussan-web/`) : `npx vitest run src/components/boost/__tests__/BoostDialog.test.tsx`
→ `4 passed` ; non-régression `npx vitest run src/components/property-dashboard` → vert (les tests qui
moquent `useCan` rendent `boost.spend` absent : ni bouton ni entrée de menu, et aucun `QueryClient`
n'est requis puisque le dialogue n'est pas monté) ; `npx tsc --noEmit`, `npm run lint` → verts.

**Étape 20.7 — ablation** : dans `BoostDialog.tsx`, retirer `|| manque > 0` de `disabled` du bouton
« Confirmer » → le second test rougit ; restaurer, `md5`.

**Collision C12** — l'écran de succès de publication du lot C : y poser
`<BoostButton propertyId={property.id} propertyTitle={property.title} isPublic />` à côté de l'appel
à voir l'annonce. Le fichier n'existe pas au 2026-10-12 : la session l'ajoute après la fusion du lot C.

**Étape 20.8 — signaler à la session les fichiers à commiter :** `BoostDialog.tsx`, `BoostButton.tsx`,
le test, `PropertyHeaderActions.tsx`, `PropertyRowActions.tsx` ; collision C12.

---

## Tâche 21 — Page « Crédits » de l'espace

**Fichiers :** créer `takussan-web/src/components/boost/CreditsPanel.tsx`,
`takussan-web/src/app/(dashboard)/app/credits/page.tsx`,
`takussan-web/src/components/boost/__tests__/CreditsPanel.test.tsx` ; Edit
`takussan-web/src/components/layout/AppSidebar.tsx`. **Collision C9 (`nav.sidebar.credits`).**

**Étape 21.1 — test (rouge).** `takussan-web/src/components/boost/__tests__/CreditsPanel.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { useCredits } from '@/components/boost/api';
import { CreditsPanel } from '../CreditsPanel';

vi.mock('@/components/boost/api', () => ({ useCredits: vi.fn() }));

describe('CreditsPanel (TCK-633 lot F)', () => {
  it('montre le solde, les lots avec leur expiration et l’historique', () => {
    vi.mocked(useCredits).mockReturnValue({
      data: {
        data: {
          balance: 540,
          lots: [
            { id: 2, origin: 'admin_grant', initial_amount: 40, remaining_amount: 40, expires_at: '2026-10-22T10:00:00+00:00', reason: null, created_at: '2026-10-12T10:00:00+00:00' },
            { id: 1, origin: 'welcome', initial_amount: 500, remaining_amount: 500, expires_at: null, reason: null, created_at: '2026-10-12T10:00:00+00:00' },
          ],
        },
        movements: [
          { id: 9, type: 'spend', amount: -20, credit_lot_id: 1, property_boost_id: 3, actor_id: 4, reason: null, created_at: '2026-10-12T11:00:00+00:00' },
        ],
        meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    render(withIntl(<CreditsPanel />));

    expect(screen.getByText('540 crédits')).toBeInTheDocument();
    expect(screen.getByText('Crédits offerts par Takussan')).toBeInTheDocument();
    expect(screen.getByText('Sans expiration')).toBeInTheDocument();
    expect(screen.getByText('Mise en avant')).toBeInTheDocument();
    expect(screen.getByText('-20')).toBeInTheDocument();
  });

  it('dit l’échec de chargement', () => {
    vi.mocked(useCredits).mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() } as never);

    render(withIntl(<CreditsPanel />));

    expect(screen.getByText('Impossible de charger les crédits.')).toBeInTheDocument();
  });
});
```

**Étape 21.2 — `takussan-web/src/components/boost/CreditsPanel.tsx`** :

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { DataState, DataTable, Pagination, type DataTableColumn } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useCredits } from './api';
import type { CreditMovement } from './types';

/** TCK-633 lot F (ADR-0061 §1, §2) — le solde de l'espace, ses lots vivants et son historique. */
export function CreditsPanel() {
  const t = useTranslations('credits');
  const f = useFormatteurs();
  const [page, setPage] = useState(1);
  const credits = useCredits(true, page);
  const donnees = credits.data;

  const colonnes: DataTableColumn<CreditMovement>[] = [
    { id: 'date', header: t('movements.colDate'), cell: (m) => f.dateTime(m.created_at) },
    { id: 'type', header: t('movements.colType'), cell: (m) => t(`types.${m.type}`) },
    { id: 'amount', header: t('movements.colAmount'), align: 'end', cell: (m) => <span className="tabular-nums">{m.amount > 0 ? `+${m.amount}` : String(m.amount)}</span> },
    { id: 'reason', header: t('movements.colReason'), cell: (m) => m.reason ?? '—' },
  ];

  return (
    <DataState
      loading={credits.isLoading}
      error={credits.isError ? t('loadError') : null}
      onRetry={() => void credits.refetch()}
      retryLabel={t('retry')}
    >
      <div className="space-y-8">
        <section aria-labelledby="credits-solde" className="rounded-xl border border-border bg-card p-6">
          <h2 id="credits-solde" className="text-sm font-medium text-muted-foreground">{t('balance')}</h2>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-foreground">
            {t('balanceValue', { count: donnees?.data.balance ?? 0 })}
          </p>
        </section>

        <section aria-labelledby="credits-lots" className="space-y-3">
          <h2 id="credits-lots" className="font-display text-xl font-semibold text-foreground">{t('lots.title')}</h2>
          {donnees && donnees.data.lots.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {donnees.data.lots.map((lot) => (
                <li key={lot.id} className="rounded-lg border border-border bg-card p-4">
                  <p className="font-medium text-foreground">{t(`origins.${lot.origin}`)}</p>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {t('lots.remaining', { remaining: lot.remaining_amount, initial: lot.initial_amount })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {lot.expires_at ? t('lots.expires', { date: f.date(lot.expires_at) }) : t('lots.noExpiry')}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t('lots.empty')} />
          )}
        </section>

        <section aria-labelledby="credits-historique" className="space-y-3">
          <h2 id="credits-historique" className="font-display text-xl font-semibold text-foreground">{t('movements.title')}</h2>
          {donnees && donnees.movements.length > 0 ? (
            <>
              <DataTable caption={t('movements.caption')} columns={colonnes} rows={donnees.movements} rowKey={(m) => m.id} />
              <Pagination page={donnees.meta.current_page} lastPage={donnees.meta.last_page} onChange={setPage} />
            </>
          ) : (
            <EmptyState title={t('movements.empty')} />
          )}
        </section>
      </div>
    </DataState>
  );
}
```

**Étape 21.3 — `takussan-web/src/app/(dashboard)/app/credits/page.tsx`** :

```tsx
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/console';
import { CreditsPanel } from '@/components/boost/CreditsPanel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('credits');
  return { title: t('metaTitle') };
}

/** TCK-633 lot F (ADR-0061 §1) — le portefeuille de crédits de l'espace actif. L'API tranche l'accès (403). */
export default async function Page() {
  const t = await getTranslations('credits');
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <CreditsPanel />
    </div>
  );
}
```

**Étape 21.4 — Edit `AppSidebar.tsx`.** (a) ancre `  UserRound,\n} from 'lucide-react';` → remplacer par :

```tsx
  UserRound,
  Coins,
} from 'lucide-react';
```

(b) ancre :

```tsx
  if (roles.includes('agency_admin') || isAdmin(roles)) {
    items.push({ href: '/app/overview/agency', labelKey: 'agencyView', icon: BarChart3, section: 'manage' });
  }
```

→ remplacer par :

```tsx
  if (roles.includes('agency_admin') || isAdmin(roles)) {
    items.push({ href: '/app/overview/agency', labelKey: 'agencyView', icon: BarChart3, section: 'manage' });
  }

  // TCK-633 lot F (ADR-0061 §1) — le portefeuille de crédits de l'espace. Le rôle approche
  // `boost.spend` (accordée à l'admin d'espace) ; la page et l'API tranchent (403 sinon).
  if (roles.includes('agency_admin') || isAdmin(roles)) {
    items.push({ href: '/app/credits', labelKey: 'credits', icon: Coins, section: 'manage' });
  }
```

**Collision C9 (partie `nav.sidebar`)** — `takussan-web/src/messages/{fr,en,wo}.json`,
`nav.sidebar` : ajouter `"credits": "Crédits"` / `"credits": "Credits"` / `"credits": "Kredi"`.

**Étape 21.5 — vert** : `npx vitest run src/components/boost/__tests__/CreditsPanel.test.tsx` → `2 passed`
(après C9 pour le menu ; le panneau n'en dépend pas) ; `npx vitest run src/components/layout` → vert
**après C9** (différé) ; `npx tsc --noEmit` → vert.

**Étape 21.6 — ablation** : dans `CreditsPanel`, remplacer `t('lots.noExpiry')` par `''` → premier test
rouge ; restaurer, `md5`.

**Étape 21.7 — signaler à la session les fichiers à commiter :** `CreditsPanel.tsx`, la page, le test,
`AppSidebar.tsx` ; collision C9 (`nav.sidebar.credits`).

---

## Tâche 22 — Front public : emplacements, places réservées, marques

**Fichiers :** créer `takussan-web/src/components/boost/{EmplacementSponsorise.tsx,MarquesDeBoost.tsx,lecture-recherche.ts,arrivee-sponsorisee.ts}`,
`takussan-web/src/components/boost/__tests__/{EmplacementSponsorise.test.tsx,MarquesDeBoost.test.tsx}` ; Edit
`components/property/PropertiesDiscoveryPage.tsx`, `app/[locale]/(public)/properties/[slug]/components/PropertyHeader.tsx`,
`messages/{fr,en,wo}.json` (`search.sponsored`).

**Étape 22.1 — tests (rouges).** `takussan-web/src/components/boost/__tests__/EmplacementSponsorise.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PropertyListItem } from '@/types/property';
import { consommerArriveeSponsorisee } from '../arrivee-sponsorisee';
import { EmplacementsSponsorises } from '../EmplacementSponsorise';

vi.mock('@/components/property/PropertyCard', () => ({
  PropertyCard: ({ property }: { property: PropertyListItem }) => <a href={`/properties/${property.slug}`}>{property.title}</a>,
}));

const BIEN = { id: 5, slug: 'villa-saly', title: 'Villa à Saly' } as unknown as PropertyListItem;

describe('EmplacementsSponsorises (TCK-633 lot F, ADR-0061 §7)', () => {
  beforeEach(() => sessionStorage.clear());

  it('marque chaque emplacement « Sponsorisé » et rien quand la liste est vide', () => {
    const { container, rerender } = render(withIntl(<EmplacementsSponsorises biens={[BIEN]} />));
    expect(screen.getByText('Sponsorisé')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Annonces sponsorisées' })).toBeInTheDocument();

    rerender(withIntl(<EmplacementsSponsorises biens={[]} />));
    expect(container).toBeEmptyDOMElement();
  });

  it('un clic sur le lien note l’arrivée par emplacement, consommée une fois', async () => {
    const user = userEvent.setup();
    render(withIntl(<EmplacementsSponsorises biens={[BIEN]} />));

    await user.click(screen.getByRole('link', { name: 'Villa à Saly' }));

    expect(consommerArriveeSponsorisee('villa-saly')).toBe(true);
    expect(consommerArriveeSponsorisee('villa-saly')).toBe(false);
  });
});
```

> jsdom suit le `href` d'un `<a>` sans recharger ; le clic déclenche bien `onClickCapture`.

`takussan-web/src/components/boost/__tests__/MarquesDeBoost.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { withIntl } from '@/test/intl';
import { MarquesDeBoost } from '../MarquesDeBoost';

describe('MarquesDeBoost (TCK-633 lot F)', () => {
  it('dit « En vedette » et le badge acheté', () => {
    render(withIntl(<MarquesDeBoost featured badge="price_drop" />));

    expect(screen.getByText('En vedette')).toBeInTheDocument();
    expect(screen.getByText('Baisse de prix')).toBeInTheDocument();
  });

  it('ne rend rien sans marque, et ignore un badge inconnu', () => {
    const { container } = render(withIntl(<MarquesDeBoost featured={false} badge="autre" />));

    expect(container).toBeEmptyDOMElement();
  });
});
```

**Étape 22.2 — `takussan-web/src/components/boost/arrivee-sponsorisee.ts`** :

```ts
/**
 * TCK-633 lot F (ADR-0061 §10) — un clic d'emplacement est une vue de fiche arrivée par un lien
 * sponsorisé. Le lien de la carte n'est pas touché (une carte sert partout) : l'emplacement note
 * le slug ici, et le compteur de vue de la fiche le CONSOMME une fois. Stockage de session, lu et
 * écrit sous `try` : un navigateur qui le refuse perd un clic, rien d'autre.
 */
const CLE = 'takussan:arrivee-sponsorisee';

export function marquerArriveeSponsorisee(slug: string): void {
  try {
    sessionStorage.setItem(CLE, slug);
  } catch {
    // Stockage refusé (navigation privée, quota) : un clic non compté n'est pas une panne.
  }
}

export function consommerArriveeSponsorisee(slug: string): boolean {
  try {
    if (sessionStorage.getItem(CLE) !== slug) return false;
    sessionStorage.removeItem(CLE);
    return true;
  } catch {
    return false;
  }
}
```

**Étape 22.3 — `takussan-web/src/components/boost/lecture-recherche.ts`** :

```ts
import type { PropertyListItem } from '@/types/property';
import type { BoostPlacement, BoostVariant } from './types';

/**
 * TCK-633 lot F (ADR-0061 §7) — lire les champs neufs de la recherche sans éditer les types
 * partagés : `sponsored` (racine de la réponse), `placement` et `badge` (chaque bien).
 */
export function lireEmplacements(resultat: unknown): PropertyListItem[] {
  const brut = (resultat as { sponsored?: unknown } | null | undefined)?.sponsored;
  return Array.isArray(brut) ? (brut as PropertyListItem[]) : [];
}

export function placementDe(bien: PropertyListItem): BoostPlacement {
  const valeur = (bien as { placement?: unknown }).placement;
  return valeur === 'reserved' || valeur === 'sponsored' ? valeur : null;
}

export function badgeDe(bien: unknown): BoostVariant | null {
  const valeur = (bien as { badge?: unknown } | null)?.badge;
  return valeur === 'urgent' || valeur === 'price_drop' ? valeur : null;
}
```

**Étape 22.4 — `takussan-web/src/components/boost/MarquesDeBoost.tsx`** :

```tsx
'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface MarquesDeBoostProps {
  readonly featured?: boolean;
  readonly badge?: unknown;
  readonly className?: string;
}

/**
 * TCK-633 lot F (ADR-0061 §5, §7) — « En vedette » (l'accent des badges featured, pas le primaire
 * des CTA : `docs/design-guidelines.md`) et le badge acheté. Un résultat payé ne se présente jamais
 * comme un résultat organique.
 */
export function MarquesDeBoost({ featured = false, badge, className }: MarquesDeBoostProps) {
  const t = useTranslations('boost.marks');
  const variante = badge === 'urgent' || badge === 'price_drop' ? badge : null;
  if (!featured && variante === null) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {featured ? <Badge variant="default" className="bg-accent text-accent-foreground">{t('featured')}</Badge> : null}
      {variante ? <Badge variant="secondary">{t(variante === 'urgent' ? 'urgent' : 'priceDrop')}</Badge> : null}
    </div>
  );
}
```

**Étape 22.5 — `takussan-web/src/components/boost/EmplacementSponsorise.tsx`** :

```tsx
'use client';

import { useTranslations } from 'next-intl';

import { PropertyCard } from '@/components/property/PropertyCard';
import type { PropertyListItem } from '@/types/property';
import { marquerArriveeSponsorisee } from './arrivee-sponsorisee';

export interface EmplacementsSponsorisesProps {
  readonly biens: readonly PropertyListItem[];
  readonly sizes?: string;
}

/**
 * TCK-633 lot F (ADR-0061 §7) — les emplacements « Sponsorisé » en tête de page, HORS de la grille
 * paginée. Une pastille neutre (pas l'accent : « Sponsorisé » informe, il ne vante pas).
 */
export function EmplacementsSponsorises({ biens, sizes }: EmplacementsSponsorisesProps) {
  const t = useTranslations('search.sponsored');
  if (biens.length === 0) return null;

  return (
    <section aria-label={t('label')} className="mb-8">
      <ul className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-3">
        {biens.map((bien, i) => (
          <li
            key={bien.id}
            className="flex flex-col gap-2"
            onClickCapture={(event) => {
              if ((event.target as HTMLElement).closest('a')) marquerArriveeSponsorisee(bien.slug);
            }}
          >
            <span className="inline-flex w-fit rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {t('chip')}
            </span>
            <PropertyCard property={bien} index={i} sizes={sizes} />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

**Étape 22.6 — Edit `PropertiesDiscoveryPage.tsx`.** (a) ancre
`import { CARD_SIZES_SEARCH_GRID } from '@/components/property/card-image-sizes';` → remplacer par :

```tsx
import { CARD_SIZES_SEARCH_GRID } from '@/components/property/card-image-sizes';
import { EmplacementsSponsorises } from '@/components/boost/EmplacementSponsorise';
import { MarquesDeBoost } from '@/components/boost/MarquesDeBoost';
import { badgeDe, lireEmplacements, placementDe } from '@/components/boost/lecture-recherche';
```

(b) ancre :

```tsx
  const properties = data?.data ?? [];
  const meta = data?.meta;
```

→ remplacer par :

```tsx
  const properties = data?.data ?? [];
  const meta = data?.meta;
  // TCK-633 lot F (ADR-0061 §7) — hors pagination, hors `total`.
  const sponsorises = lireEmplacements(data);
```

(c) ancre :

```tsx
                {/* TCK-557 — la pagination ramène la vue ICI, sous la `nav` fixe (cf. `NavbarSpacer`). */}
```

→ remplacer par :

```tsx
                {!error ? <EmplacementsSponsorises biens={sponsorises} sizes={CARD_SIZES_SEARCH_GRID} /> : null}

                {/* TCK-557 — la pagination ramène la vue ICI, sous la `nav` fixe (cf. `NavbarSpacer`). */}
```

(d) ancre :

```tsx
                    properties.map((property, i) => (
                      <PropertyCard
                        key={property.id}
                        property={property}
                        index={i}
                        priority={i < 4}
                        sizes={CARD_SIZES_SEARCH_GRID}
                        transactionFiltree={filters.contract_type}
                      />
                    ))
```

→ remplacer par :

```tsx
                    properties.map((property, i) => {
                      const carte = (
                        <PropertyCard
                          key={property.id}
                          property={property}
                          index={i}
                          priority={i < 4}
                          sizes={CARD_SIZES_SEARCH_GRID}
                          transactionFiltree={filters.contract_type}
                        />
                      );
                      // TCK-633 lot F (ADR-0061 §7) — une place réservée porte « En vedette » ; un
                      // badge acheté se dit aussi. Sinon, la carte nue, comme avant.
                      const reservee = placementDe(property) === 'reserved';
                      const badge = badgeDe(property);
                      if (!reservee && badge === null) return carte;
                      return (
                        <div key={property.id} className="flex flex-col gap-2">
                          <MarquesDeBoost featured={reservee} badge={badge} />
                          {carte}
                        </div>
                      );
                    })
```

**Étape 22.7 — Edit `PropertyHeader.tsx`.** (a) ancre
`import { porteUnBadgeNeuf } from '@/components/property/cards/NewBuildChip';` → remplacer par :

```tsx
import { porteUnBadgeNeuf } from '@/components/property/cards/NewBuildChip';
import { MarquesDeBoost } from '@/components/boost/MarquesDeBoost';
```

(b) ancre :

```tsx
            {/* « Mis en avant » parle l'accent des badges featured (design-guidelines), pas le primaire des CTA. */}
            {property.featured && (
              <Badge variant="default" className="bg-accent text-accent-foreground">{t('featured')}</Badge>
            )}
```

→ remplacer par :

```tsx
            {/* TCK-633 lot F — « En vedette » et le badge acheté (« Urgent », « Baisse de prix »). */}
            <MarquesDeBoost featured={Boolean(property.featured)} badge={(property as { badge?: unknown }).badge} className="contents" />
```

> `className="contents"` : les marques s'insèrent dans la rangée de badges existante sans conteneur visible.
> La clé `property.detail.featured` n'est plus lue ici ; elle n'est pas supprimée (hors espace F).

**Étape 22.8 — libellés `search.sponsored`.** Dans chaque dictionnaire, ancre la ligne `  "search": {`
(premier niveau, unique) → remplacer par la même ligne suivie de :

fr :
```json
    "sponsored": {
      "label": "Annonces sponsorisées",
      "chip": "Sponsorisé"
    },
```
en :
```json
    "sponsored": {
      "label": "Sponsored listings",
      "chip": "Sponsored"
    },
```
wo :
```json
    "sponsored": {
      "label": "Kër yu ñu fey ngir gis-gis",
      "chip": "Ñu fey ko"
    },
```

**Étape 22.9 — vert** : `npx vitest run src/components/boost/__tests__/EmplacementSponsorise.test.tsx src/components/boost/__tests__/MarquesDeBoost.test.tsx`
→ `4 passed` ; non-régression `npx vitest run src/components/property "src/app/[locale]/(public)/properties"` → vert ;
`npx tsc --noEmit`, `npm run lint`, `npm run check:i18n` → verts.

**Étape 22.10 — ablation** : retirer `onClickCapture` de `EmplacementSponsorise.tsx` → second test rouge ;
restaurer, `md5`.

**Étape 22.11 — signaler à la session les fichiers à commiter :** les quatre fichiers neufs, les deux
tests, `PropertiesDiscoveryPage.tsx`, `PropertyHeader.tsx`, les trois dictionnaires.

---

## Tâche 23 — Console super-admin : portefeuilles, boosts, catalogue, statistiques

**Fichiers :** créer `takussan-web/src/components/boost/admin/{api.ts,AdminCreditWallets.tsx,AdminCreditWalletDetail.tsx,AdminBoosts.tsx,AdminBoostCatalogue.tsx,AdminBoostStats.tsx,BoostsNav.tsx}`,
`takussan-web/src/components/boost/admin/__tests__/{AdminCreditWalletDetail.test.tsx,AdminBoosts.test.tsx}`,
les pages `takussan-web/src/app/(super-admin)/super-admin/{credits/page.tsx,credits/[agencyId]/page.tsx,boosts/page.tsx,boosts/catalogue/page.tsx,boosts/stats/page.tsx}` ;
Edit `takussan-web/src/components/layout/SuperAdminSidebar.tsx`, `messages/{fr,en,wo}.json`
(`superAdmin.credits`, `superAdmin.boosts`). **Collisions C8, C9.**

Les écritures passent par le relais `/api/super-admin/*` → `/api/admin/*` et par
`avecGardeDoubleFacteur(appel, useGardeDoubleFacteur())` : un refus `two_factor_step_up_required` ouvre
la garde de la console, puis rejoue (TCK-589).

**Étape 23.1 — tests (rouges).** `takussan-web/src/components/boost/admin/__tests__/AdminCreditWalletDetail.test.tsx` :

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { adjustCreditWallet, fetchCreditWallet } from '@/components/boost/admin/api';
import { AdminCreditWalletDetail } from '../AdminCreditWalletDetail';

vi.mock('@/components/boost/admin/api', () => ({
  fetchCreditWallet: vi.fn(),
  adjustCreditWallet: vi.fn(),
}));

function rendre(noeud: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{noeud}</QueryClientProvider>));
}

describe('AdminCreditWalletDetail (TCK-633 lot F, AC16)', () => {
  it('n’ajuste pas sans motif, puis envoie montant et motif', async () => {
    vi.mocked(fetchCreditWallet).mockResolvedValue({
      data: { agency: { id: 7, name: 'Agence Teranga', status: 'active' }, balance: 120, lots: [] },
      movements: [],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 0 },
    });
    vi.mocked(adjustCreditWallet).mockResolvedValue({ data: { balance: 170, lot: null } });
    const user = userEvent.setup();
    rendre(<AdminCreditWalletDetail agencyId={7} />);

    expect(await screen.findByText('Solde : 120 crédits')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Montant (crédits)'), '50');
    const enregistrer = screen.getByRole('button', { name: 'Enregistrer l’ajustement' });
    expect(enregistrer).toBeDisabled();

    await user.type(screen.getByLabelText('Motif'), 'Geste commercial');
    await user.click(enregistrer);

    await waitFor(() => expect(adjustCreditWallet).toHaveBeenCalledWith(7, { amount: 50, reason: 'Geste commercial' }));
    expect(await screen.findByText('Ajustement enregistré.')).toBeInTheDocument();
  });
});
```

`takussan-web/src/components/boost/admin/__tests__/AdminBoosts.test.tsx` :

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { cancelBoost, fetchAdminBoosts, fetchBoostProducts, offerBoost } from '@/components/boost/admin/api';
import { AdminBoosts } from '../AdminBoosts';

vi.mock('@/components/boost/admin/api', () => ({
  fetchAdminBoosts: vi.fn(),
  fetchBoostProducts: vi.fn(),
  cancelBoost: vi.fn(),
  offerBoost: vi.fn(),
}));

function rendre(noeud: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{noeud}</QueryClientProvider>));
}

const BOOST = {
  id: 31, property_id: 4, agency_id: 7, kind: 'featured', variant: null, status: 'active', price_credits: 20,
  duration_days: 7, starts_at: '2026-10-12T10:00:00+00:00', ends_at: '2026-10-19T10:00:00+00:00', ended_at: null,
  remaining_seconds: null, offered: false, offer_reason: null, refunded_credits: null, cancel_reason: null,
  property: { id: 4, title: 'Villa à Saly', slug: 'villa-saly' }, agency: { id: 7, name: 'Agence Teranga' },
} as const;

describe('AdminBoosts (TCK-633 lot F, AC16)', () => {
  it('annule avec remboursement et motif', async () => {
    vi.mocked(fetchAdminBoosts).mockResolvedValue({ data: [BOOST], meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 } });
    vi.mocked(fetchBoostProducts).mockResolvedValue({ data: [] });
    vi.mocked(cancelBoost).mockResolvedValue({ data: { ...BOOST, status: 'refunded' } });
    vi.mocked(offerBoost).mockResolvedValue({ data: BOOST });
    const user = userEvent.setup();
    rendre(<AdminBoosts />);

    await user.click(await screen.findByRole('button', { name: 'Annuler' }));
    await user.click(screen.getByLabelText('Rembourser les jours pleins restants'));
    await user.type(screen.getByLabelText('Motif de l’annulation'), 'Annonce en double');
    await user.click(screen.getByRole('button', { name: 'Confirmer l’annulation' }));

    await waitFor(() => expect(cancelBoost).toHaveBeenCalledWith(31, { refund: true, reason: 'Annonce en double' }));
  });
});
```

Rouges : `Failed to resolve import "../AdminCreditWalletDetail"`.

**Étape 23.2 — `takussan-web/src/components/boost/admin/api.ts`** :

```ts
import { ApiError } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import type { PaginationMeta } from '@/types/api';
import type { BoostKind, BoostProduct, BoostStatus, BoostVariant, CreditLot, CreditMovement, PropertyBoost } from '../types';

/** TCK-633 lot F — la console des crédits et de la mise en avant, par le relais `/api/super-admin/*`. */
export interface CreditWallet {
  readonly id: number;
  readonly name: string;
  readonly status: string | null;
  readonly balance: number;
  readonly next_expiry_at: string | null;
}

export interface CreditWalletDetail {
  readonly data: {
    readonly agency: { readonly id: number; readonly name: string; readonly status: string | null };
    readonly balance: number;
    readonly lots: readonly CreditLot[];
  };
  readonly movements: readonly CreditMovement[];
  readonly meta: PaginationMeta;
}

export interface BoostStatsRow {
  readonly date: string;
  readonly impressions: number;
  readonly clicks: number;
  readonly ctr: number;
}

export interface BoostStatsResponse {
  readonly data: readonly BoostStatsRow[];
  readonly totals: { readonly impressions: number; readonly clicks: number; readonly ctr: number };
}

export interface NewBoostProduct {
  readonly kind: BoostKind;
  readonly variant?: BoostVariant | null;
  readonly duration_days: number;
  readonly price_credits: number;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return res.json() as Promise<T>;
}

function lire<T>(url: string): Promise<T> {
  return fetch(url, { credentials: 'include' }).then((res) => jsonOrThrow<T>(res));
}

function ecrire<T>(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
  return fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  }).then((res) => jsonOrThrow<T>(res));
}

export function fetchBoostProducts(): Promise<{ readonly data: readonly BoostProduct[] }> {
  return lire('/api/super-admin/boost-products');
}

export function createBoostProduct(body: NewBoostProduct): Promise<{ readonly data: BoostProduct }> {
  return ecrire('/api/super-admin/boost-products', 'POST', body);
}

export function updateBoostProduct(
  id: number,
  body: { readonly price_credits?: number; readonly is_active?: boolean },
): Promise<{ readonly data: BoostProduct }> {
  return ecrire(cheminApi`/api/super-admin/boost-products/${id}`, 'PATCH', body);
}

export function fetchCreditWallets(params: { readonly search?: string; readonly page?: number }): Promise<{ readonly data: readonly CreditWallet[]; readonly meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  qs.set('page', String(params.page ?? 1));
  return lire(cheminApi`/api/super-admin/credit-wallets${qs}`);
}

export function fetchCreditWallet(agencyId: number, page = 1): Promise<CreditWalletDetail> {
  return lire(cheminApi`/api/super-admin/credit-wallets/${agencyId}${new URLSearchParams({ page: String(page) })}`);
}

export function adjustCreditWallet(
  agencyId: number,
  body: { readonly amount: number; readonly reason: string },
): Promise<{ readonly data: { readonly balance: number; readonly lot: CreditLot | null } }> {
  return ecrire(cheminApi`/api/super-admin/credit-wallets/${agencyId}/adjustments`, 'POST', body);
}

export function fetchAdminBoosts(params: { readonly status?: BoostStatus | ''; readonly page?: number }): Promise<{ readonly data: readonly PropertyBoost[]; readonly meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('filter[status]', params.status);
  qs.set('page', String(params.page ?? 1));
  return lire(cheminApi`/api/super-admin/boosts${qs}`);
}

export function cancelBoost(id: number, body: { readonly refund: boolean; readonly reason: string }): Promise<{ readonly data: PropertyBoost }> {
  return ecrire(cheminApi`/api/super-admin/boosts/${id}/cancel`, 'POST', body);
}

export function offerBoost(propertyId: number, body: { readonly product_id: number; readonly reason: string }): Promise<{ readonly data: PropertyBoost }> {
  return ecrire(cheminApi`/api/super-admin/properties/${propertyId}/offered-boost`, 'POST', body);
}

export function fetchBoostStats(params: { readonly from: string; readonly to: string }): Promise<BoostStatsResponse> {
  return lire(cheminApi`/api/super-admin/boost-stats${new URLSearchParams(params)}`);
}
```

**Étape 23.3 — `takussan-web/src/components/boost/admin/BoostsNav.tsx`** (les trois écrans de la mise en avant) :

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ONGLETS = [
  { href: '/super-admin/boosts', cle: 'boosts' },
  { href: '/super-admin/boosts/catalogue', cle: 'catalogue' },
  { href: '/super-admin/boosts/stats', cle: 'stats' },
] as const;

/** TCK-633 lot F — boosts du parc, catalogue, statistiques : une entrée de menu, trois écrans. */
export function BoostsNav() {
  const t = useTranslations('superAdmin.boosts.tabs');
  const chemin = usePathname();

  return (
    <nav aria-label={t('label')} className="flex flex-wrap gap-2">
      {ONGLETS.map((onglet) => (
        <Link
          key={onglet.href}
          href={onglet.href}
          aria-current={chemin === onglet.href ? 'page' : undefined}
          className={cn(buttonVariants({ variant: chemin === onglet.href ? 'default' : 'outline', size: 'sm' }))}
        >
          {t(onglet.cle)}
        </Link>
      ))}
    </nav>
  );
}
```

**Étape 23.4 — `takussan-web/src/components/boost/admin/AdminCreditWallets.tsx`** :

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { DataState, DataTable, Pagination, type DataTableColumn } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { fetchCreditWallets, type CreditWallet } from './api';

/** TCK-633 lot F (ADR-0061 §1) — les espaces qui ont des crédits, et leur solde. */
export function AdminCreditWallets() {
  const t = useTranslations('superAdmin.credits');
  const f = useFormatteurs();
  const [saisie, setSaisie] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const wallets = useQuery({
    queryKey: ['super-admin', 'credit-wallets', search, page],
    queryFn: () => fetchCreditWallets({ search, page }),
  });

  const colonnes: DataTableColumn<CreditWallet>[] = [
    { id: 'agency', header: t('colAgency'), className: 'font-medium text-foreground', cell: (w) => w.name },
    { id: 'balance', header: t('colBalance'), align: 'end', cell: (w) => <span className="tabular-nums">{w.balance}</span> },
    { id: 'expiry', header: t('colNextExpiry'), cell: (w) => (w.next_expiry_at ? f.date(w.next_expiry_at) : '—') },
    {
      id: 'open',
      header: t('open'),
      headerSrOnly: true,
      align: 'end',
      cell: (w) => (
        <Link href={`/super-admin/credits/${w.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {t('open')}
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(saisie.trim());
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="credit-wallets-search">{t('search')}</Label>
          <Input id="credit-wallets-search" value={saisie} onChange={(e) => setSaisie(e.target.value)} />
        </div>
        <Button type="submit" variant="outline">{t('searchSubmit')}</Button>
      </form>
      <DataState
        loading={wallets.isLoading}
        error={wallets.isError ? t('loadError') : null}
        onRetry={() => void wallets.refetch()}
        retryLabel={t('retry')}
        isEmpty={(wallets.data?.data.length ?? 0) === 0}
        emptyState={<EmptyState title={t('empty')} />}
      >
        <DataTable caption={t('caption')} columns={colonnes} rows={wallets.data?.data ?? []} rowKey={(w) => w.id} />
        <Pagination page={wallets.data?.meta.current_page ?? 1} lastPage={wallets.data?.meta.last_page ?? 1} onChange={setPage} />
      </DataState>
    </div>
  );
}
```

**Étape 23.5 — `takussan-web/src/components/boost/admin/AdminCreditWalletDetail.tsx`** :

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { DataState, DataTable, Pagination, type DataTableColumn } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { CreditLot, CreditMovement } from '../types';
import { adjustCreditWallet, fetchCreditWallet } from './api';

/** TCK-633 lot F (ADR-0061 §2, AC16) — un portefeuille : lots, journal, ajustement motivé. */
export function AdminCreditWalletDetail({ agencyId }: { readonly agencyId: number }) {
  const t = useTranslations('superAdmin.credits.detail');
  const tListe = useTranslations('superAdmin.credits');
  const tCredits = useTranslations('credits');
  const f = useFormatteurs();
  const garde = useGardeDoubleFacteur();
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [retour, setRetour] = useState<{ readonly ok: boolean; readonly texte: string } | null>(null);

  const wallet = useQuery({
    queryKey: ['super-admin', 'credit-wallets', agencyId, page],
    queryFn: () => fetchCreditWallet(agencyId, page),
  });
  const ajuster = useMutation({
    mutationFn: (body: { amount: number; reason: string }) => avecGardeDoubleFacteur(() => adjustCreditWallet(agencyId, body), garde),
    onSuccess: () => {
      setMontant('');
      setMotif('');
      setRetour({ ok: true, texte: t('adjustDone') });
      return queryClient.invalidateQueries({ queryKey: ['super-admin', 'credit-wallets'] });
    },
    onError: (err) => setRetour({ ok: false, texte: messageErreur(err, t('adjustFailed')) }),
  });

  const valeur = Number(montant);
  const valide = Number.isInteger(valeur) && valeur !== 0 && motif.trim().length >= 5;

  const colLots: DataTableColumn<CreditLot>[] = [
    { id: 'origin', header: t('colOrigin'), cell: (l) => tCredits(`origins.${l.origin}`) },
    { id: 'remaining', header: t('colRemaining'), align: 'end', cell: (l) => <span className="tabular-nums">{l.remaining_amount} / {l.initial_amount}</span> },
    { id: 'expires', header: t('colExpires'), cell: (l) => (l.expires_at ? f.date(l.expires_at) : t('noExpiry')) },
    { id: 'reason', header: t('colReason'), cell: (l) => l.reason ?? '—' },
  ];
  const colMouvements: DataTableColumn<CreditMovement>[] = [
    { id: 'date', header: t('colDate'), cell: (m) => f.dateTime(m.created_at) },
    { id: 'type', header: t('colType'), cell: (m) => tCredits(`types.${m.type}`) },
    { id: 'amount', header: t('colAmount'), align: 'end', cell: (m) => <span className="tabular-nums">{m.amount > 0 ? `+${m.amount}` : String(m.amount)}</span> },
    { id: 'reason', header: t('colReason'), cell: (m) => m.reason ?? '—' },
  ];
  const donnees = wallet.data;

  return (
    <DataState
      loading={wallet.isLoading}
      error={wallet.isError ? tListe('loadError') : null}
      onRetry={() => void wallet.refetch()}
      retryLabel={tListe('retry')}
    >
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">{donnees?.data.agency.name}</h2>
            <p className="text-sm tabular-nums text-muted-foreground">{t('balance', { count: donnees?.data.balance ?? 0 })}</p>
          </div>
          <Link href="/super-admin/credits" className={buttonVariants({ variant: 'outline', size: 'sm' })}>{t('back')}</Link>
        </div>

        <section aria-labelledby="ajustement" className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h3 id="ajustement" className="font-medium text-foreground">{t('adjustTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('adjustHelp')}</p>
          <form
            className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (valide) ajuster.mutate({ amount: valeur, reason: motif.trim() });
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="ajustement-montant">{t('amount')}</Label>
              <Input id="ajustement-montant" inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ajustement-motif">{t('reason')}</Label>
              <Textarea id="ajustement-motif" rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} />
            </div>
            <Button type="submit" disabled={!valide || ajuster.isPending}>{t('adjustSubmit')}</Button>
          </form>
          {retour ? (
            <p role={retour.ok ? 'status' : 'alert'} className={retour.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>{retour.texte}</p>
          ) : null}
        </section>

        <section aria-labelledby="lots" className="space-y-3">
          <h3 id="lots" className="font-medium text-foreground">{t('lotsTitle')}</h3>
          {donnees && donnees.data.lots.length > 0 ? (
            <DataTable caption={t('lotsCaption')} columns={colLots} rows={donnees.data.lots} rowKey={(l) => l.id} />
          ) : (
            <EmptyState title={t('lotsEmpty')} />
          )}
        </section>

        <section aria-labelledby="journal" className="space-y-3">
          <h3 id="journal" className="font-medium text-foreground">{t('movementsTitle')}</h3>
          {donnees && donnees.movements.length > 0 ? (
            <>
              <DataTable caption={t('movementsCaption')} columns={colMouvements} rows={donnees.movements} rowKey={(m) => m.id} />
              <Pagination page={donnees.meta.current_page} lastPage={donnees.meta.last_page} onChange={setPage} />
            </>
          ) : (
            <EmptyState title={t('movementsEmpty')} />
          )}
        </section>
      </div>
    </DataState>
  );
}
```

**Étape 23.6 — `takussan-web/src/components/boost/admin/AdminBoosts.tsx`** :

```tsx
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { DataState, DataTable, Pagination, type DataTableColumn } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { BoostStatus, PropertyBoost } from '../types';
import { cancelBoost, fetchAdminBoosts, fetchBoostProducts, offerBoost } from './api';

const STATUTS: readonly (BoostStatus | '')[] = ['', 'active', 'paused', 'ended', 'cancelled', 'refunded'];
const VIVANTS: ReadonlySet<BoostStatus> = new Set(['active', 'paused']);

/** TCK-633 lot F (ADR-0061 §5, AC16) — les boosts du parc ; annuler (avec ou sans remboursement), offrir. */
export function AdminBoosts() {
  const t = useTranslations('superAdmin.boosts');
  const f = useFormatteurs();
  const garde = useGardeDoubleFacteur();
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [statut, setStatut] = useState<BoostStatus | ''>('');
  const [page, setPage] = useState(1);
  const [cible, setCible] = useState<PropertyBoost | null>(null);
  const [rembourser, setRembourser] = useState(false);
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [offre, setOffre] = useState({ bien: '', produit: 0, motif: '' });
  const [retourOffre, setRetourOffre] = useState<{ readonly ok: boolean; readonly texte: string } | null>(null);

  const boosts = useQuery({ queryKey: ['super-admin', 'boosts', statut, page], queryFn: () => fetchAdminBoosts({ status: statut, page }) });
  const produits = useQuery({ queryKey: ['super-admin', 'boost-products'], queryFn: fetchBoostProducts });
  const vedettes = (produits.data?.data ?? []).filter((p) => p.kind === 'featured' && p.is_active);

  const annuler = useMutation({
    mutationFn: (v: { id: number; refund: boolean; reason: string }) =>
      avecGardeDoubleFacteur(() => cancelBoost(v.id, { refund: v.refund, reason: v.reason }), garde),
    onSuccess: () => {
      setCible(null);
      return queryClient.invalidateQueries({ queryKey: ['super-admin', 'boosts'] });
    },
    onError: (err) => setErreur(messageErreur(err, t('cancel.failed'))),
  });
  const offrir = useMutation({
    mutationFn: (v: { propertyId: number; product_id: number; reason: string }) =>
      avecGardeDoubleFacteur(() => offerBoost(v.propertyId, { product_id: v.product_id, reason: v.reason }), garde),
    onSuccess: () => {
      setOffre({ bien: '', produit: 0, motif: '' });
      setRetourOffre({ ok: true, texte: t('offer.done') });
      return queryClient.invalidateQueries({ queryKey: ['super-admin', 'boosts'] });
    },
    onError: (err) => setRetourOffre({ ok: false, texte: messageErreur(err, t('offer.failed')) }),
  });

  const ouvrir = (boost: PropertyBoost) => {
    setCible(boost);
    setRembourser(false);
    setMotif('');
    setErreur(null);
  };

  const colonnes: DataTableColumn<PropertyBoost>[] = [
    { id: 'property', header: t('colProperty'), className: 'font-medium text-foreground', cell: (b) => b.property?.title ?? `#${b.property_id}` },
    { id: 'agency', header: t('colAgency'), cell: (b) => b.agency?.name ?? `#${b.agency_id}` },
    { id: 'kind', header: t('colKind'), cell: (b) => `${t(`kinds.${b.kind}`)}${b.offered ? ` (${t('offered')})` : ''}` },
    { id: 'status', header: t('colStatus'), cell: (b) => t(`statuses.${b.status}`) },
    { id: 'end', header: t('colEnd'), cell: (b) => (b.ends_at ? f.dateTime(b.ends_at) : '—') },
    { id: 'price', header: t('colPrice'), align: 'end', cell: (b) => <span className="tabular-nums">{b.price_credits}</span> },
    {
      id: 'actions',
      header: t('colActions'),
      headerSrOnly: true,
      align: 'end',
      cell: (b) => (VIVANTS.has(b.status) ? <Button size="sm" variant="outline" onClick={() => ouvrir(b)}>{t('cancel.open')}</Button> : null),
    },
  ];

  const bienOffert = Number(offre.bien);
  const offreValide = Number.isInteger(bienOffert) && bienOffert > 0 && offre.produit > 0 && offre.motif.trim().length >= 5;

  return (
    <div className="space-y-8">
      <div role="group" aria-label={t('statusFilter')} className="flex flex-wrap gap-2">
        {STATUTS.map((s) => (
          <Button
            key={s || 'all'}
            type="button"
            size="sm"
            variant={s === statut ? 'default' : 'outline'}
            aria-pressed={s === statut}
            onClick={() => {
              setStatut(s);
              setPage(1);
            }}
          >
            {t(`statuses.${s || 'all'}`)}
          </Button>
        ))}
      </div>

      <DataState
        loading={boosts.isLoading}
        error={boosts.isError ? t('loadError') : null}
        onRetry={() => void boosts.refetch()}
        retryLabel={t('retry')}
        isEmpty={(boosts.data?.data.length ?? 0) === 0}
        emptyState={<EmptyState title={t('empty')} />}
      >
        <DataTable caption={t('caption')} columns={colonnes} rows={boosts.data?.data ?? []} rowKey={(b) => b.id} />
        <Pagination page={boosts.data?.meta.current_page ?? 1} lastPage={boosts.data?.meta.last_page ?? 1} onChange={setPage} />
      </DataState>

      <section aria-labelledby="offrir" className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 id="offrir" className="font-medium text-foreground">{t('offer.title')}</h2>
        <form
          className="grid gap-3 sm:grid-cols-[10rem_1fr] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (offreValide) offrir.mutate({ propertyId: bienOffert, product_id: offre.produit, reason: offre.motif.trim() });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="offre-bien">{t('offer.property')}</Label>
            <Input id="offre-bien" inputMode="numeric" value={offre.bien} onChange={(e) => setOffre({ ...offre, bien: e.target.value })} />
          </div>
          <div role="group" aria-label={t('offer.product')} className="flex flex-wrap gap-2">
            {vedettes.map((p) => (
              <Button
                key={p.id}
                type="button"
                size="sm"
                variant={offre.produit === p.id ? 'default' : 'outline'}
                aria-pressed={offre.produit === p.id}
                onClick={() => setOffre({ ...offre, produit: p.id })}
              >
                {t('offer.days', { count: p.duration_days })}
              </Button>
            ))}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="offre-motif">{t('offer.reason')}</Label>
            <Textarea id="offre-motif" rows={2} value={offre.motif} onChange={(e) => setOffre({ ...offre, motif: e.target.value })} />
          </div>
          <div>
            <Button type="submit" disabled={!offreValide || offrir.isPending}>{t('offer.submit')}</Button>
          </div>
        </form>
        {retourOffre ? (
          <p role={retourOffre.ok ? 'status' : 'alert'} className={retourOffre.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>{retourOffre.texte}</p>
        ) : null}
      </section>

      <Dialog open={cible !== null} onOpenChange={(ouvert) => (ouvert ? null : setCible(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cancel.title')}</DialogTitle>
            <DialogDescription>{cible?.property?.title ?? ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input id="annulation-remboursement" type="checkbox" className="size-4 accent-primary" checked={rembourser} onChange={(e) => setRembourser(e.target.checked)} />
              <Label htmlFor="annulation-remboursement">{t('cancel.refund')}</Label>
            </div>
            <div className="space-y-1">
              <Label htmlFor="annulation-motif">{t('cancel.reason')}</Label>
              <Textarea id="annulation-motif" rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} />
            </div>
            {erreur ? <p role="alert" className="text-sm text-destructive">{erreur}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCible(null)}>{t('cancel.back')}</Button>
            <Button
              variant="destructive"
              disabled={motif.trim().length < 5 || annuler.isPending}
              onClick={() => cible && annuler.mutate({ id: cible.id, refund: rembourser, reason: motif.trim() })}
            >
              {t('cancel.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

**Étape 23.7 — `takussan-web/src/components/boost/admin/AdminBoostCatalogue.tsx`** :

```tsx
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { DataState, DataTable, type DataTableColumn } from '@/components/console';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import type { BoostKind, BoostProduct, BoostVariant } from '../types';
import { createBoostProduct, fetchBoostProducts, updateBoostProduct } from './api';

const GENRES: readonly BoostKind[] = ['bump', 'featured', 'badge'];
const VARIANTES: readonly BoostVariant[] = ['urgent', 'price_drop'];

/** TCK-633 lot F (ADR-0061 §4) — le catalogue : prix, activation, nouvelle offre. Sans redéploiement. */
export function AdminBoostCatalogue() {
  const t = useTranslations('superAdmin.boosts');
  const garde = useGardeDoubleFacteur();
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [prix, setPrix] = useState<Record<number, string>>({});
  const [retour, setRetour] = useState<{ readonly ok: boolean; readonly texte: string } | null>(null);
  const [nouvelle, setNouvelle] = useState<{ kind: BoostKind; variant: BoostVariant; duration: string; price: string }>({
    kind: 'featured', variant: 'urgent', duration: '', price: '',
  });

  const produits = useQuery({ queryKey: ['super-admin', 'boost-products'], queryFn: fetchBoostProducts });
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['super-admin', 'boost-products'] });
  const echec = (err: unknown) => setRetour({ ok: false, texte: messageErreur(err, t('catalogue.failed')) });

  const modifier = useMutation({
    mutationFn: (v: { id: number; price_credits?: number; is_active?: boolean }) =>
      avecGardeDoubleFacteur(() => updateBoostProduct(v.id, { price_credits: v.price_credits, is_active: v.is_active }), garde),
    onSuccess: () => {
      setRetour({ ok: true, texte: t('catalogue.saved') });
      return rafraichir();
    },
    onError: echec,
  });
  const creer = useMutation({
    mutationFn: () =>
      avecGardeDoubleFacteur(
        () =>
          createBoostProduct({
            kind: nouvelle.kind,
            variant: nouvelle.kind === 'badge' ? nouvelle.variant : null,
            duration_days: nouvelle.kind === 'bump' ? 0 : Number(nouvelle.duration),
            price_credits: Number(nouvelle.price),
          }),
        garde,
      ),
    onSuccess: () => {
      setNouvelle({ kind: 'featured', variant: 'urgent', duration: '', price: '' });
      setRetour({ ok: true, texte: t('catalogue.saved') });
      return rafraichir();
    },
    onError: echec,
  });

  const libelle = (p: BoostProduct) => (p.kind === 'badge' && p.variant ? `${t('kinds.badge')} — ${t(`variants.${p.variant}`)}` : t(`kinds.${p.kind}`));
  const colonnes: DataTableColumn<BoostProduct>[] = [
    { id: 'kind', header: t('catalogue.colKind'), className: 'font-medium text-foreground', cell: libelle },
    { id: 'duration', header: t('catalogue.colDuration'), cell: (p) => t('catalogue.days', { count: p.duration_days }) },
    {
      id: 'price',
      header: t('catalogue.colPrice'),
      cell: (p) => (
        <Input
          aria-label={`${t('catalogue.colPrice')} — ${libelle(p)}`}
          inputMode="numeric"
          className="w-24"
          value={prix[p.id] ?? String(p.price_credits)}
          onChange={(e) => setPrix({ ...prix, [p.id]: e.target.value })}
        />
      ),
    },
    {
      id: 'active',
      header: t('catalogue.colActive'),
      cell: (p) => (
        <input
          type="checkbox"
          className="size-4 accent-primary"
          aria-label={`${t('catalogue.colActive')} — ${libelle(p)}`}
          checked={p.is_active}
          onChange={(e) => modifier.mutate({ id: p.id, is_active: e.target.checked })}
        />
      ),
    },
    {
      id: 'save',
      header: t('catalogue.save'),
      headerSrOnly: true,
      align: 'end',
      cell: (p) => (
        <Button
          size="sm"
          variant="outline"
          disabled={prix[p.id] === undefined || !/^\d+$/.test(prix[p.id] ?? '') || modifier.isPending}
          onClick={() => modifier.mutate({ id: p.id, price_credits: Number(prix[p.id]) })}
        >
          {t('catalogue.save')}
        </Button>
      ),
    },
  ];

  const creationValide = /^\d+$/.test(nouvelle.price) && (nouvelle.kind === 'bump' || /^[1-9]\d*$/.test(nouvelle.duration));

  return (
    <div className="space-y-8">
      {retour ? (
        <p role={retour.ok ? 'status' : 'alert'} className={retour.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>{retour.texte}</p>
      ) : null}
      <DataState loading={produits.isLoading} error={produits.isError ? t('loadError') : null} onRetry={() => void produits.refetch()} retryLabel={t('retry')}>
        <DataTable caption={t('catalogue.caption')} columns={colonnes} rows={produits.data?.data ?? []} rowKey={(p) => p.id} />
      </DataState>

      <section aria-labelledby="nouvelle-offre" className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 id="nouvelle-offre" className="font-medium text-foreground">{t('catalogue.createTitle')}</h2>
        <div role="group" aria-label={t('catalogue.kind')} className="flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <Button key={g} type="button" size="sm" variant={nouvelle.kind === g ? 'default' : 'outline'} aria-pressed={nouvelle.kind === g} onClick={() => setNouvelle({ ...nouvelle, kind: g })}>
              {t(`kinds.${g}`)}
            </Button>
          ))}
        </div>
        {nouvelle.kind === 'badge' ? (
          <div role="group" aria-label={t('catalogue.variant')} className="flex flex-wrap gap-2">
            {VARIANTES.map((v) => (
              <Button key={v} type="button" size="sm" variant={nouvelle.variant === v ? 'default' : 'outline'} aria-pressed={nouvelle.variant === v} onClick={() => setNouvelle({ ...nouvelle, variant: v })}>
                {t(`variants.${v}`)}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          {nouvelle.kind !== 'bump' ? (
            <div className="space-y-1">
              <Label htmlFor="offre-duree">{t('catalogue.duration')}</Label>
              <Input id="offre-duree" inputMode="numeric" value={nouvelle.duration} onChange={(e) => setNouvelle({ ...nouvelle, duration: e.target.value })} />
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="offre-prix">{t('catalogue.price')}</Label>
            <Input id="offre-prix" inputMode="numeric" value={nouvelle.price} onChange={(e) => setNouvelle({ ...nouvelle, price: e.target.value })} />
          </div>
          <div>
            <Button type="button" disabled={!creationValide || creer.isPending} onClick={() => creer.mutate()}>{t('catalogue.create')}</Button>
          </div>
        </div>
      </section>
    </div>
  );
}
```

**Étape 23.8 — `takussan-web/src/components/boost/admin/AdminBoostStats.tsx`** :

```tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { DataState, DataTable, type DataTableColumn } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { fetchBoostStats, type BoostStatsRow } from './api';

function jour(decalage: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + decalage);
  return d.toISOString().slice(0, 10);
}

/** TCK-633 lot F (ADR-0061 §10) — impressions, clics et taux de clic des emplacements. */
export function AdminBoostStats() {
  const t = useTranslations('superAdmin.boosts.stats');
  const tBoosts = useTranslations('superAdmin.boosts');
  const f = useFormatteurs();
  const [saisie, setSaisie] = useState({ from: jour(-29), to: jour(0) });
  const [fenetre, setFenetre] = useState(saisie);
  const stats = useQuery({ queryKey: ['super-admin', 'boost-stats', fenetre], queryFn: () => fetchBoostStats(fenetre) });
  const pourcent = (x: number) => f.nombre(x, { style: 'percent', maximumFractionDigits: 2 });

  const colonnes: DataTableColumn<BoostStatsRow>[] = [
    { id: 'date', header: t('colDate'), cell: (r) => f.date(r.date) },
    { id: 'impressions', header: t('impressions'), align: 'end', cell: (r) => <span className="tabular-nums">{f.nombre(r.impressions)}</span> },
    { id: 'clicks', header: t('clicks'), align: 'end', cell: (r) => <span className="tabular-nums">{f.nombre(r.clicks)}</span> },
    { id: 'ctr', header: t('ctr'), align: 'end', cell: (r) => <span className="tabular-nums">{pourcent(r.ctr)}</span> },
  ];
  const totaux = stats.data?.totals;

  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setFenetre(saisie);
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="stats-du">{t('from')}</Label>
          <Input id="stats-du" type="date" value={saisie.from} onChange={(e) => setSaisie({ ...saisie, from: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="stats-au">{t('to')}</Label>
          <Input id="stats-au" type="date" value={saisie.to} onChange={(e) => setSaisie({ ...saisie, to: e.target.value })} />
        </div>
        <Button type="submit" variant="outline">{t('apply')}</Button>
      </form>

      <DataState
        loading={stats.isLoading}
        error={stats.isError ? t('loadError') : null}
        onRetry={() => void stats.refetch()}
        retryLabel={tBoosts('retry')}
        isEmpty={(stats.data?.data.length ?? 0) === 0}
        emptyState={<EmptyState title={t('empty')} />}
      >
        {totaux ? (
          <dl className="grid gap-3 sm:grid-cols-3">
            {([['impressions', f.nombre(totaux.impressions)], ['clicks', f.nombre(totaux.clicks)], ['ctr', pourcent(totaux.ctr)]] as const).map(([cle, valeur]) => (
              <div key={cle} className="rounded-xl border border-border bg-card p-4">
                <dt className="text-sm text-muted-foreground">{t(cle)}</dt>
                <dd className="font-display text-2xl font-semibold tabular-nums text-foreground">{valeur}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <DataTable caption={t('caption')} columns={colonnes} rows={stats.data?.data ?? []} rowKey={(r) => r.date} />
      </DataState>
    </div>
  );
}
```

**Étape 23.9 — pages** (`takussan-web/src/app/(super-admin)/super-admin/`).

`credits/page.tsx` :

```tsx
'use client';

import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/console';
import { AdminCreditWallets } from '@/components/boost/admin/AdminCreditWallets';

/** TCK-633 lot F (ADR-0061 §1) — les portefeuilles de crédits des espaces. */
export default function SuperAdminCreditsPage() {
  const t = useTranslations('superAdmin.credits');
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <AdminCreditWallets />
    </div>
  );
}
```

`credits/[agencyId]/page.tsx` :

```tsx
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/console';
import { AdminCreditWalletDetail } from '@/components/boost/admin/AdminCreditWalletDetail';

type Params = Promise<{ agencyId: string }>;

/** TCK-633 lot F (ADR-0061 §2) — le portefeuille d'un espace : lots, journal, ajustement. */
export default async function Page({ params }: { params: Params }) {
  const { agencyId } = await params;
  const id = Number(agencyId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const t = await getTranslations('superAdmin.credits');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <AdminCreditWalletDetail agencyId={id} />
    </div>
  );
}
```

`boosts/page.tsx`, `boosts/catalogue/page.tsx`, `boosts/stats/page.tsx` — même gabarit, le composant
changeant (`AdminBoosts`, `AdminBoostCatalogue`, `AdminBoostStats`). `boosts/page.tsx` :

```tsx
'use client';

import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/console';
import { AdminBoosts } from '@/components/boost/admin/AdminBoosts';
import { BoostsNav } from '@/components/boost/admin/BoostsNav';

/** TCK-633 lot F (ADR-0061 §5) — les boosts du parc. */
export default function SuperAdminBoostsPage() {
  const t = useTranslations('superAdmin.boosts');
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} actions={<BoostsNav />} />
      <AdminBoosts />
    </div>
  );
}
```

`boosts/catalogue/page.tsx` :

```tsx
'use client';

import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/console';
import { AdminBoostCatalogue } from '@/components/boost/admin/AdminBoostCatalogue';
import { BoostsNav } from '@/components/boost/admin/BoostsNav';

/** TCK-633 lot F (ADR-0061 §4) — le catalogue des offres. */
export default function SuperAdminBoostCataloguePage() {
  const t = useTranslations('superAdmin.boosts');
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} actions={<BoostsNav />} />
      <AdminBoostCatalogue />
    </div>
  );
}
```

`boosts/stats/page.tsx` :

```tsx
'use client';

import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/console';
import { AdminBoostStats } from '@/components/boost/admin/AdminBoostStats';
import { BoostsNav } from '@/components/boost/admin/BoostsNav';

/** TCK-633 lot F (ADR-0061 §10) — impressions, clics, taux de clic. */
export default function SuperAdminBoostStatsPage() {
  const t = useTranslations('superAdmin.boosts');
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} actions={<BoostsNav />} />
      <AdminBoostStats />
    </div>
  );
}
```

**Étape 23.10 — Edit `SuperAdminSidebar.tsx`.** (a) ancre `  Building2,` (dans l'import `lucide-react`) →
remplacer par :

```tsx
  Building2,
  Coins,
```

et ancre `  PlugZap,` → remplacer par :

```tsx
  PlugZap,
  Rocket,
```

(b) ancre :

```tsx
      { href: '/super-admin/payments', labelKey: 'payments', icon: Wallet },
    ],
  },
```

→ remplacer par :

```tsx
      { href: '/super-admin/payments', labelKey: 'payments', icon: Wallet },
      // TCK-633 lot F (ADR-0061) — portefeuilles de crédits, et la mise en avant (boosts, catalogue,
      // statistiques). Sans geste déclaré : `super_admin` seul, comme les routes.
      { href: '/super-admin/credits', labelKey: 'credits', icon: Coins },
      { href: '/super-admin/boosts', labelKey: 'boosts', icon: Rocket },
    ],
  },
```

**Étape 23.11 — libellés `superAdmin.credits` et `superAdmin.boosts`.** Dans chaque dictionnaire, ancre la
ligne de premier niveau `  "superAdmin": {` → la remplacer par elle-même suivie du bloc de la langue.

fr :

```json
    "boosts": {
      "title": "Mise en avant",
      "subtitle": "Boosts du parc, catalogue des offres et mesure des emplacements.",
      "tabs": { "label": "Écrans de la mise en avant", "boosts": "Boosts", "catalogue": "Catalogue", "stats": "Statistiques" },
      "statusFilter": "Filtrer par statut",
      "statuses": { "all": "Tous", "active": "Actifs", "paused": "En pause", "ended": "Terminés", "cancelled": "Annulés", "refunded": "Remboursés" },
      "kinds": { "bump": "Remontée", "featured": "Vedette", "badge": "Badge" },
      "variants": { "urgent": "Urgent", "price_drop": "Baisse de prix" },
      "caption": "Boosts du parc",
      "colProperty": "Bien",
      "colAgency": "Espace",
      "colKind": "Genre",
      "colStatus": "Statut",
      "colEnd": "Fin",
      "colPrice": "Prix",
      "colActions": "Actions",
      "offered": "offert",
      "empty": "Aucun boost pour ce filtre.",
      "loadError": "Impossible de charger la mise en avant.",
      "retry": "Réessayer",
      "cancel": {
        "open": "Annuler",
        "title": "Annuler ce boost",
        "refund": "Rembourser les jours pleins restants",
        "reason": "Motif de l’annulation",
        "back": "Retour",
        "submit": "Confirmer l’annulation",
        "failed": "L’annulation n’a pas pu être enregistrée."
      },
      "offer": {
        "title": "Offrir une Vedette",
        "property": "Numéro du bien",
        "product": "Durée de la Vedette",
        "days": "{count, plural, one {# jour} other {# jours}}",
        "reason": "Motif",
        "submit": "Offrir",
        "done": "Vedette offerte.",
        "failed": "La Vedette n’a pas pu être offerte."
      },
      "catalogue": {
        "caption": "Offres de mise en avant",
        "colKind": "Offre",
        "colDuration": "Durée",
        "colPrice": "Prix (crédits)",
        "colActive": "Active",
        "days": "{count, plural, =0 {instantanée} one {# jour} other {# jours}}",
        "save": "Enregistrer",
        "saved": "Offre enregistrée.",
        "failed": "L’offre n’a pas pu être enregistrée.",
        "createTitle": "Nouvelle offre",
        "kind": "Genre",
        "variant": "Variante",
        "duration": "Durée (jours)",
        "price": "Prix (crédits)",
        "create": "Créer l’offre"
      },
      "stats": {
        "from": "Du",
        "to": "Au",
        "apply": "Afficher",
        "impressions": "Impressions",
        "clicks": "Clics",
        "ctr": "Taux de clic",
        "caption": "Mesure des emplacements par jour",
        "colDate": "Jour",
        "empty": "Aucune donnée sur la période.",
        "loadError": "Impossible de charger les statistiques."
      }
    },
    "credits": {
      "title": "Crédits des espaces",
      "subtitle": "Soldes, lots et ajustements motivés et journalisés.",
      "search": "Rechercher un espace",
      "searchSubmit": "Rechercher",
      "caption": "Portefeuilles de crédits",
      "colAgency": "Espace",
      "colBalance": "Solde",
      "colNextExpiry": "Prochaine expiration",
      "open": "Ouvrir",
      "empty": "Aucun espace n’a encore de crédits.",
      "loadError": "Impossible de charger les portefeuilles.",
      "retry": "Réessayer",
      "detail": {
        "back": "Tous les portefeuilles",
        "balance": "Solde : {count, plural, =0 {aucun crédit} one {# crédit} other {# crédits}}",
        "adjustTitle": "Ajuster le solde",
        "adjustHelp": "Un montant positif crédite l’espace (lot offert, validité de l’offre de bienvenue) ; un montant négatif le débite. Le motif est journalisé.",
        "amount": "Montant (crédits)",
        "reason": "Motif",
        "adjustSubmit": "Enregistrer l’ajustement",
        "adjustDone": "Ajustement enregistré.",
        "adjustFailed": "L’ajustement n’a pas pu être enregistré.",
        "lotsTitle": "Lots",
        "lotsCaption": "Lots de crédits de l’espace",
        "lotsEmpty": "Aucun lot.",
        "colOrigin": "Origine",
        "colRemaining": "Restant / initial",
        "colExpires": "Expiration",
        "noExpiry": "Sans expiration",
        "movementsTitle": "Journal",
        "movementsCaption": "Mouvements de crédits de l’espace",
        "movementsEmpty": "Aucun mouvement.",
        "colDate": "Date",
        "colType": "Opération",
        "colAmount": "Crédits",
        "colReason": "Motif"
      }
    },
```

en :

```json
    "boosts": {
      "title": "Promotion",
      "subtitle": "Platform boosts, the offer catalogue and slot measurement.",
      "tabs": { "label": "Promotion screens", "boosts": "Boosts", "catalogue": "Catalogue", "stats": "Statistics" },
      "statusFilter": "Filter by status",
      "statuses": { "all": "All", "active": "Active", "paused": "Paused", "ended": "Ended", "cancelled": "Cancelled", "refunded": "Refunded" },
      "kinds": { "bump": "Bump", "featured": "Featured", "badge": "Badge" },
      "variants": { "urgent": "Urgent", "price_drop": "Price drop" },
      "caption": "Platform boosts",
      "colProperty": "Listing",
      "colAgency": "Workspace",
      "colKind": "Kind",
      "colStatus": "Status",
      "colEnd": "Ends",
      "colPrice": "Price",
      "colActions": "Actions",
      "offered": "offered",
      "empty": "No boost for this filter.",
      "loadError": "Could not load promotions.",
      "retry": "Retry",
      "cancel": {
        "open": "Cancel",
        "title": "Cancel this boost",
        "refund": "Refund the remaining full days",
        "reason": "Cancellation reason",
        "back": "Back",
        "submit": "Confirm cancellation",
        "failed": "The cancellation could not be saved."
      },
      "offer": {
        "title": "Offer a Featured promotion",
        "property": "Listing number",
        "product": "Featured duration",
        "days": "{count, plural, one {# day} other {# days}}",
        "reason": "Reason",
        "submit": "Offer",
        "done": "Featured promotion offered.",
        "failed": "The Featured promotion could not be offered."
      },
      "catalogue": {
        "caption": "Promotion offers",
        "colKind": "Offer",
        "colDuration": "Duration",
        "colPrice": "Price (credits)",
        "colActive": "Active",
        "days": "{count, plural, =0 {instant} one {# day} other {# days}}",
        "save": "Save",
        "saved": "Offer saved.",
        "failed": "The offer could not be saved.",
        "createTitle": "New offer",
        "kind": "Kind",
        "variant": "Variant",
        "duration": "Duration (days)",
        "price": "Price (credits)",
        "create": "Create offer"
      },
      "stats": {
        "from": "From",
        "to": "To",
        "apply": "Show",
        "impressions": "Impressions",
        "clicks": "Clicks",
        "ctr": "Click-through rate",
        "caption": "Slot measurement per day",
        "colDate": "Day",
        "empty": "No data for this period.",
        "loadError": "Could not load statistics."
      }
    },
    "credits": {
      "title": "Workspace credits",
      "subtitle": "Balances, lots, and justified, logged adjustments.",
      "search": "Search a workspace",
      "searchSubmit": "Search",
      "caption": "Credit wallets",
      "colAgency": "Workspace",
      "colBalance": "Balance",
      "colNextExpiry": "Next expiry",
      "open": "Open",
      "empty": "No workspace has credits yet.",
      "loadError": "Could not load wallets.",
      "retry": "Retry",
      "detail": {
        "back": "All wallets",
        "balance": "Balance: {count, plural, =0 {no credits} one {# credit} other {# credits}}",
        "adjustTitle": "Adjust the balance",
        "adjustHelp": "A positive amount credits the workspace (offered lot, welcome-offer validity); a negative amount debits it. The reason is logged.",
        "amount": "Amount (credits)",
        "reason": "Reason",
        "adjustSubmit": "Save adjustment",
        "adjustDone": "Adjustment saved.",
        "adjustFailed": "The adjustment could not be saved.",
        "lotsTitle": "Lots",
        "lotsCaption": "Workspace credit lots",
        "lotsEmpty": "No lot.",
        "colOrigin": "Origin",
        "colRemaining": "Remaining / initial",
        "colExpires": "Expiry",
        "noExpiry": "No expiry",
        "movementsTitle": "Log",
        "movementsCaption": "Workspace credit movements",
        "movementsEmpty": "No movement.",
        "colDate": "Date",
        "colType": "Operation",
        "colAmount": "Credits",
        "colReason": "Reason"
      }
    },
```

wo :

```json
    "boosts": {
      "title": "Yokk gis-gis",
      "subtitle": "Yokk gis-gisu kër yi, jaay yi ak natt bérab yi.",
      "tabs": { "label": "Xët yu yokk gis-gis", "boosts": "Yokk gis-gis", "catalogue": "Jaay yi", "stats": "Natt" },
      "statusFilter": "Tànn ci anam",
      "statuses": { "all": "Yépp", "active": "Yi dox", "paused": "Yi taxaw", "ended": "Yi jeex", "cancelled": "Yi ñu neenal", "refunded": "Yi ñu delloo" },
      "kinds": { "bump": "Yékkati", "featured": "Vedette", "badge": "Màndarga" },
      "variants": { "urgent": "Gaaw", "price_drop": "Njëg wàcc na" },
      "caption": "Yokk gis-gisu kër yi",
      "colProperty": "Kër",
      "colAgency": "Bérab",
      "colKind": "Xeet",
      "colStatus": "Anam",
      "colEnd": "Jeex",
      "colPrice": "Njëg",
      "colActions": "Jëf",
      "offered": "may",
      "empty": "Amul yokk gis-gis ci tànn bii.",
      "loadError": "Mënuñu yeb yokk gis-gis yi.",
      "retry": "Jéemaat",
      "cancel": {
        "open": "Neenal",
        "title": "Neenal yokk gis-gis bii",
        "refund": "Delloo fan yu mat yi des",
        "reason": "Lu tax ñu neenal",
        "back": "Dellu",
        "submit": "Dëggal neenal gi",
        "failed": "Mënuñu denc neenal gi."
      },
      "offer": {
        "title": "May Vedette",
        "property": "Nimeróo kër gi",
        "product": "Diiru Vedette bi",
        "days": "{count, plural, one {# fan} other {# fan}}",
        "reason": "Lu tax",
        "submit": "May",
        "done": "Vedette bi may nañu ko.",
        "failed": "Mënuñu may Vedette bi."
      },
      "catalogue": {
        "caption": "Jaayu yokk gis-gis",
        "colKind": "Jaay",
        "colDuration": "Diir",
        "colPrice": "Njëg (kredi)",
        "colActive": "Dox",
        "days": "{count, plural, =0 {ci saa si} one {# fan} other {# fan}}",
        "save": "Denc",
        "saved": "Jaay bi denc nañu ko.",
        "failed": "Mënuñu denc jaay bi.",
        "createTitle": "Jaay bu bees",
        "kind": "Xeet",
        "variant": "Melo",
        "duration": "Diir (fan)",
        "price": "Njëg (kredi)",
        "create": "Sos jaay bi"
      },
      "stats": {
        "from": "Ci",
        "to": "Ba",
        "apply": "Wone",
        "impressions": "Gis",
        "clicks": "Bës",
        "ctr": "Dayob bës",
        "caption": "Natt bérab yi bés bu nekk",
        "colDate": "Bés",
        "empty": "Amul dara ci diir bii.",
        "loadError": "Mënuñu yeb natt yi."
      }
    },
    "credits": {
      "title": "Kredi bérab yi",
      "subtitle": "Li des, lot yi ak soppi yu am lu tax te ñu bind.",
      "search": "Wut benn bérab",
      "searchSubmit": "Wut",
      "caption": "Kredi bérab yi",
      "colAgency": "Bérab",
      "colBalance": "Li des",
      "colNextExpiry": "Jeex gu jiitu",
      "open": "Ubbi",
      "empty": "Benn bérab amagul kredi.",
      "loadError": "Mënuñu yeb kredi yi.",
      "retry": "Jéemaat",
      "detail": {
        "back": "Kredi yépp",
        "balance": "Li des : {count, plural, =0 {benn kredi amul} one {# kredi} other {# kredi}}",
        "adjustTitle": "Soppi li des",
        "adjustHelp": "Limu bu ëpp tus dina yokk kredi bérab bi ; limu bu wàcc tus dina ko wàññi. Lu tax dañu koy bind.",
        "amount": "Lim (kredi)",
        "reason": "Lu tax",
        "adjustSubmit": "Denc soppi bi",
        "adjustDone": "Soppi bi denc nañu ko.",
        "adjustFailed": "Mënuñu denc soppi bi.",
        "lotsTitle": "Lot yi",
        "lotsCaption": "Lotu kredi bérab bi",
        "lotsEmpty": "Amul lot.",
        "colOrigin": "Fu mu jóge",
        "colRemaining": "Li des / li njëkk",
        "colExpires": "Jeex",
        "noExpiry": "Du jeex",
        "movementsTitle": "Téere",
        "movementsCaption": "Yëngu-yënguy kredi bérab bi",
        "movementsEmpty": "Amul yëngu-yëngu.",
        "colDate": "Bés",
        "colType": "Jëf",
        "colAmount": "Kredi",
        "colReason": "Lu tax"
      }
    },
```

> Le libellé « Motif » du formulaire d'ajustement est `superAdmin.credits.detail.reason` (le test le
> cherche par `getByLabelText('Motif')`) ; celui de l'annulation est `superAdmin.boosts.cancel.reason`
> (« Motif de l’annulation »), distinct pour que les deux formulaires se distinguent au lecteur d'écran.

**Collision C8** — (a) `takussan-web/src/types/super-admin.ts:510` :
`export type PlatformSettingCategory = 'currency' | 'limits';` → `export type PlatformSettingCategory = 'currency' | 'limits' | 'boost';` ;
(b) `takussan-web/src/components/admin/super/platform-settings.tsx:28` :
`export const categoryOrder: PlatformSettingCategory[] = ['currency', 'limits'];` →
`export const categoryOrder: PlatformSettingCategory[] = ['currency', 'limits', 'boost'];`.

**Collision C9 (console)** — `takussan-web/src/messages/{fr,en,wo}.json` :

- `nav.superAdmin.items` : `"credits": "Crédits"` / `"Credits"` / `"Kredi"` ; `"boosts": "Mise en avant"` / `"Promotion"` / `"Yokk gis-gis"`.
- `superAdmin.platformSettings.categories` : `"boost": "Crédits et mise en avant"` / `"Credits and promotion"` / `"Kredi ak yokk gis-gis"`.
- `superAdmin.platformSettings.keys` : ajouter (fr ; en et wo dans le même ordre) :

```json
      "credits": {
        "welcome_amount": { "label": "Crédits de bienvenue", "description": "Crédits offerts à un espace, une fois par numéro de téléphone vérifié." },
        "welcome_validity_days": { "label": "Validité des crédits offerts", "description": "En jours. S’applique aux octrois futurs et aux crédits offerts par la console." },
        "expiry_notice_days": { "label": "Préavis d’expiration", "description": "En jours avant l’expiration d’un lot. 0 désactive le préavis." }
      },
      "boost": {
        "bump_cooldown_hours": { "label": "Délai entre deux remontées", "description": "En heures, pour un même bien." },
        "sponsored_slots_per_page": { "label": "Emplacements « Sponsorisé » par page", "description": "De 0 à 10. 0 désactive les emplacements." },
        "reserved_top_results": { "label": "Places réservées en tête de la première page", "description": "De 0 à 10. 0 désactive les places réservées." }
      }
```

en :

```json
      "credits": {
        "welcome_amount": { "label": "Welcome credits", "description": "Credits offered to a workspace, once per verified phone number." },
        "welcome_validity_days": { "label": "Offered credits validity", "description": "In days. Applies to future grants and to credits offered from the console." },
        "expiry_notice_days": { "label": "Expiry notice", "description": "In days before a lot expires. 0 disables the notice." }
      },
      "boost": {
        "bump_cooldown_hours": { "label": "Delay between two bumps", "description": "In hours, for the same listing." },
        "sponsored_slots_per_page": { "label": "“Sponsored” slots per page", "description": "From 0 to 10. 0 disables the slots." },
        "reserved_top_results": { "label": "Reserved places at the top of the first page", "description": "From 0 to 10. 0 disables reserved places." }
      }
```

wo :

```json
      "credits": {
        "welcome_amount": { "label": "Kredi dalal", "description": "Kredi yu ñuy may benn bérab, benn yoon ci nimeróo telefon bu ñu dëggal." },
        "welcome_validity_days": { "label": "Diiru kredi yu ñu may", "description": "Ci fan. Mu ngi jëm ci may yi ñëwaagul ak kredi yu konsol bi may." },
        "expiry_notice_days": { "label": "Yégle jeex", "description": "Ci fan balaa lot bi di jeex. 0 dafay dindi yégle bi." }
      },
      "boost": {
        "bump_cooldown_hours": { "label": "Diir ci diggante ñaari yékkati", "description": "Ci waxtu, ci kër gu ni mel." },
        "sponsored_slots_per_page": { "label": "Bérab yu « Ñu fey ko » ci xët wu nekk", "description": "Ci 0 ba 10. 0 dafay dindi bérab yi." },
        "reserved_top_results": { "label": "Bérab yu ñu denc ci kaw xët wu njëkk", "description": "Ci 0 ba 10. 0 dafay dindi bérab yu ñu denc." }
      }
```

**Étape 23.12 — vert** (depuis `takussan-web/`) : `npx vitest run src/components/boost/admin` → `2 passed` ;
`npx tsc --noEmit`, `npm run lint`, `npm run check:i18n` → verts ; `node ../scripts/check-super-admin-tokens.mjs`,
`node ../scripts/check-feedback-states.mjs` → verts ; `npx vitest run src/components/layout` → vert
**après C9** (différé).

**Étape 23.13 — ablation** : dans `AdminCreditWalletDetail`, remplacer `&& motif.trim().length >= 5` par
rien → le test rougit (bouton actif sans motif) ; restaurer, `md5`.

**Étape 23.14 — signaler à la session les fichiers à commiter :** les sept fichiers de
`components/boost/admin/`, les deux tests, les cinq pages, `SuperAdminSidebar.tsx`, les trois
dictionnaires ; collisions C8, C9.

---

## Tâche 24 — Vérification finale du lot et rapport

**Fichiers :** créer `docs/plans/rapports/tck-633-lot-f.json` (outil Write). Aucun autre fichier.
Rien ici ne lance la suite entière : c'est la session qui la lance, une fois, après les collisions.

**Étape 24.1 — Pint, sur les seuls fichiers PHP du lot** (depuis `takussan-api/` ; chemins de la
carte des fichiers) :

```bash
./vendor/bin/pint --test \
  database/migrations/2026_10_12_700100_create_boost_tables.php \
  database/migrations/2026_10_12_700200_create_credit_ledger_tables.php \
  database/migrations/2026_10_12_700300_add_boost_columns_to_properties.php \
  database/migrations/2026_10_12_700400_seed_boost_catalogue_and_convert_featured.php \
  app/Models/Enums/BoostKind.php app/Models/Enums/BoostStatus.php app/Models/Enums/BoostBadge.php \
  app/Models/Enums/CreditLotOrigin.php app/Models/Enums/CreditMovementType.php app/Models/Enums/Capability.php \
  app/Models/CreditLot.php app/Models/CreditMovement.php app/Models/CreditWelcomeGrant.php \
  app/Models/BoostProduct.php app/Models/PropertyBoost.php app/Models/PropertyBoostDailyStat.php \
  app/Models/Property.php app/Models/Agency.php app/Support/PhoneFingerprint.php \
  app/Services/Credits app/Services/Boost app/Observers/AgencyBoostObserver.php app/Observers/PropertyObserver.php \
  app/Policies/CreditLotPolicy.php app/Policies/PropertyBoostPolicy.php \
  app/Notifications/Credits app/Notifications/Boost lang/fr/credits.php lang/en/credits.php lang/wo/credits.php \
  lang/fr/errors.php lang/en/errors.php lang/wo/errors.php \
  app/Console/Commands/BoostsTick.php routes/api/credits.php routes/api/admin-credits.php \
  app/Http/Controllers/Api/Credits app/Http/Controllers/Api/Admin/AdminBoostProductController.php \
  app/Http/Controllers/Api/Admin/AdminCreditWalletController.php app/Http/Controllers/Api/Admin/AdminBoostController.php \
  app/Http/Controllers/Api/Admin/AdminBoostStatsController.php app/Http/Controllers/Public/PublicPropertyController.php \
  app/Http/Requests/Credits/StorePropertyBoostRequest.php app/Http/Requests/UpdatePropertyRequest.php \
  app/Http/Requests/Api/Admin/StoreBoostProductRequest.php app/Http/Requests/Api/Admin/UpdateBoostProductRequest.php \
  app/Http/Requests/Api/Admin/AdjustCreditWalletRequest.php app/Http/Requests/Api/Admin/CancelBoostRequest.php \
  app/Http/Requests/Api/Admin/OfferBoostRequest.php app/Http/Requests/Api/Admin/BoostStatsRequest.php \
  app/Http/Resources/Credits app/Services/Search/PropertySearchService.php \
  app/Services/Property/HomepageDiscoveryService.php app/Domain/Settings/EditablePlatformSettings.php \
  config/scout.php database/seeders/System/BoostProductSeeder.php database/seeders/System/OfferedFeaturedSeeder.php \
  database/seeders/DatabaseSeeder.php tests/Feature/Credits tests/Feature/Boost tests/Unit/Boost \
  tests/Feature/Notifications/CreditsNotificationsTest.php tests/Unit/Support/PhoneFingerprintTest.php
```

Attendu : `PASS`. Si des fichiers sont listés : la même commande sans `--test`, puis avec `--test`
→ `PASS`. `app/Listeners/Credits` n'est ajouté que si la pré-condition de la tâche 7 était remplie.

**Étape 24.2 — classes PHP du lot, une par une** (aucune n'excède 2 minutes ; la suite entière est
interdite) :

```bash
cd takussan-api && for t in \
  tests/Feature/Credits/CreditSchemaTest.php tests/Feature/Boost/BoostModelsTest.php \
  tests/Feature/Boost/BoostSettingsTest.php tests/Feature/Credits/CreditLedgerInvariantTest.php \
  tests/Feature/Credits/CreditConsumptionOrderTest.php tests/Unit/Support/PhoneFingerprintTest.php \
  tests/Feature/Credits/CreditConcurrentSpendTest.php tests/Feature/Notifications/CreditsNotificationsTest.php \
  tests/Feature/Credits/WelcomeCreditOncePerPhoneTest.php tests/Feature/Boost/BoostSpendCapabilityTest.php \
  tests/Feature/Boost/BoostCatalogueTest.php tests/Feature/Boost/BoostRulesTest.php \
  tests/Feature/Boost/FeaturedNotWritableTest.php tests/Feature/Boost/BoostPauseAndRefundTest.php \
  tests/Feature/Boost/BoostsTickIdempotenceTest.php tests/Unit/Boost/SponsoredRotationPickTest.php \
  tests/Feature/Boost/RankedOrderTest.php tests/Feature/Boost/ReservedTopResultsTest.php \
  tests/Feature/Boost/SponsoredRotationTest.php tests/Feature/Boost/BoostStatsTest.php \
  tests/Feature/Boost/SponsoredImpressionsTest.php tests/Feature/Boost/CreditsApiTest.php \
  tests/Feature/Boost/PropertyBoostApiTest.php tests/Feature/Boost/AdminCreditsApiTest.php; \
do php artisan test "$t" > /dev/null 2>&1 && echo "✓ $t" || echo "✗ $t"; done
```

Attendu : 24 lignes `✓`. Tests **différés**, lancés par la session après la collision qui les
débloque, jamais par l'agent : `AdminCreditsStepUpTest` (C1), `BoostsTickScheduleTest` (C2),
`PropertyResourceBadgeTest` (C3), `MembershipCapabilityResolverTest` (C4),
`PlatformSettingsCatalogueTest` (C5), `PropertyListTest` (C6), `CompteurDeVue.test.tsx` (C7),
`WelcomeCreditListenersTest` (événements du lot C, tâche 7).

**Étape 24.3 — non-régression hors lot** : `php bin/impacted-tests.php --run` (depuis `takussan-api/`).
Attendu : vert, **sauf** les classes ci-dessus marquées différées et, tant que `reserved_top_results`
vaut 2 par défaut, les classes de recherche publique hors F qui affirment l'ordre exact de la première
page. Chaque rouge est recopié dans le rapport (`tests.hors_lot`) avec sa cause : *place réservée*
(le bien vedette du jeu de données remonte) ou *autre*. Un rouge *autre* rend le verdict `rouge`.
Contre-preuve d'une cause *place réservée* : copier la classe dans le scratchpad
(`${TMPDIR:-/tmp}/tck633f/`), y ajouter en fin de `setUp()`
`app(\App\Services\Admin\PlatformSettingService::class)->bulkUpdate(['boost.reserved_top_results' => 0], \App\Models\User::factory()->create());`,
la poser à la place de l'originale, la relancer, puis restaurer l'originale par `cp` et vérifier
`md5 -q` identique. Vert avec le réglage à 0 ⇒ cause confirmée ; la correction revient à la session
(écart E19).

**Étape 24.4 — front** (depuis `takussan-web/`) :

```bash
npx vitest run src/components/boost
npx tsc --noEmit
npm run lint
npm run check:i18n
```

Attendu : `6 passed` fichiers (BoostDialog, CreditsPanel, EmplacementSponsorise, MarquesDeBoost,
AdminBoosts, AdminCreditWalletDetail) ; `tsc` sans sortie ; ESLint `0 errors` ; `check:i18n` vert
**sauf** les clés des collisions C9 (`nav.sidebar.credits`, `nav.superAdmin.items.credits`,
`nav.superAdmin.items.boosts`, `admin.roles.domains.boost`, `admin.roles.capabilities.boost.spend`,
`superAdmin.platformSettings.categories.boost`, `superAdmin.platformSettings.keys.credits.*`,
`superAdmin.platformSettings.keys.boost.*`) — chacune recopiée dans le rapport. `npm run
check:i18n-namespaces` rouge sur `credits` et `boost` tant que C10 n'est pas appliquée : attendu.

**Étape 24.5 — gardes du dépôt** (depuis la racine) :

```bash
for g in scripts/check-*.mjs; do node "$g" > /dev/null 2>&1 || echo "✗ $g"; done
node docs/backlog/gen-index.mjs --check
node docs/gen-features-by-actor.mjs --check
```

Attendu : seule `✗ scripts/check-models-spec.mjs` (C13 : `docs/models-spec.md` est écrit à l'étape
d'intégration, règle 5 du plan maître). Toute autre garde rouge : la lire (`node <garde>`), corriger
dans le territoire F, relancer. Si la correction exige un fichier hors territoire : nouvelle entrée
`collisions` dans le rapport, avec le changement exact.

**Étape 24.6 — inventaire des fichiers du lot.** La liste du rapport se prend à la source, jamais de
mémoire :

```bash
git status --porcelain --untracked-files=all | grep -E 'credit|Credit|boost|Boost|ranked|Sponsored|sponsoris|Sponsoris|Emplacement|arrivee-sponsorisee|lecture-recherche|Marques' 
```

Puis ajouter les fichiers co-tenus édités par F (Edit), tels que les deux tableaux « co-tenus » de
la carte des fichiers les nomment : `Property.php`, `Agency.php`, `Capability.php`,
`UpdatePropertyRequest.php`, `PublicPropertyController.php`, `PropertySearchService.php`,
`HomepageDiscoveryService.php`, `PropertyObserver.php`, `EditablePlatformSettings.php`,
`config/scout.php`, `lang/{fr,en,wo}/errors.php`, `DatabaseSeeder.php` ; `PropertyHeaderActions.tsx`,
`PropertyRowActions.tsx`, `PropertiesDiscoveryPage.tsx`, `PropertyHeader.tsx`, `AppSidebar.tsx`,
`SuperAdminSidebar.tsx`, `messages/{fr,en,wo}.json`. ⚠ `git status` voit aussi les fichiers des lots
B, D, E qui tournent en parallèle : ne recopier que ceux que la carte et les tâches 1 à 23 nomment.

**Étape 24.7 — rapport `docs/plans/rapports/tck-633-lot-f.json`.** Le verdict vient des étapes 24.1 à
24.5 : `"vert"` si toutes ont rendu la sortie attendue (rouges attendus compris), `"rouge"` sinon,
avec la sortie fautive dans `tests`. Contenu (les champs `fichiers.crees` / `fichiers.edites`
reprennent l'inventaire de l'étape 24.6 ; les autres sont fixes) :

```json
{
  "verdict": "vert",
  "fichiers": {
    "crees": [
      "takussan-api/database/migrations/2026_10_12_700100_create_boost_tables.php",
      "takussan-api/database/migrations/2026_10_12_700200_create_credit_ledger_tables.php",
      "takussan-api/database/migrations/2026_10_12_700300_add_boost_columns_to_properties.php",
      "takussan-api/database/migrations/2026_10_12_700400_seed_boost_catalogue_and_convert_featured.php",
      "takussan-api/app/Models/Enums/BoostKind.php",
      "takussan-api/app/Models/Enums/BoostStatus.php",
      "takussan-api/app/Models/Enums/BoostBadge.php",
      "takussan-api/app/Models/Enums/CreditLotOrigin.php",
      "takussan-api/app/Models/Enums/CreditMovementType.php",
      "takussan-api/app/Models/CreditLot.php",
      "takussan-api/app/Models/CreditMovement.php",
      "takussan-api/app/Models/CreditWelcomeGrant.php",
      "takussan-api/app/Models/BoostProduct.php",
      "takussan-api/app/Models/PropertyBoost.php",
      "takussan-api/app/Models/PropertyBoostDailyStat.php",
      "takussan-api/app/Support/PhoneFingerprint.php",
      "takussan-api/app/Services/Credits/CreditLedger.php",
      "takussan-api/app/Services/Credits/InsufficientCredits.php",
      "takussan-api/app/Services/Credits/WelcomeCreditService.php",
      "takussan-api/app/Services/Credits/CreditExpiryNotifier.php",
      "takussan-api/app/Services/Boost/BoostSettings.php",
      "takussan-api/app/Services/Boost/BoostPurchaseService.php",
      "takussan-api/app/Services/Boost/BoostLifecycle.php",
      "takussan-api/app/Services/Boost/SponsoredRotation.php",
      "takussan-api/app/Services/Boost/BoostStatsRecorder.php",
      "takussan-api/app/Services/Boost/LegacyFeaturedConversion.php",
      "takussan-api/app/Observers/AgencyBoostObserver.php",
      "takussan-api/app/Policies/CreditLotPolicy.php",
      "takussan-api/app/Policies/PropertyBoostPolicy.php",
      "takussan-api/app/Notifications/Credits/CreditsGrantedNotification.php",
      "takussan-api/app/Notifications/Credits/CreditsExpiringNotification.php",
      "takussan-api/app/Notifications/Boost/BoostEndedNotification.php",
      "takussan-api/app/Notifications/Boost/BoostRefundedNotification.php",
      "takussan-api/lang/fr/credits.php",
      "takussan-api/lang/en/credits.php",
      "takussan-api/lang/wo/credits.php",
      "takussan-api/app/Console/Commands/BoostsTick.php",
      "takussan-api/routes/api/credits.php",
      "takussan-api/routes/api/admin-credits.php",
      "takussan-api/app/Http/Controllers/Api/Credits/CreditController.php",
      "takussan-api/app/Http/Controllers/Api/Credits/BoostProductController.php",
      "takussan-api/app/Http/Controllers/Api/Credits/PropertyBoostController.php",
      "takussan-api/app/Http/Controllers/Api/Admin/AdminBoostProductController.php",
      "takussan-api/app/Http/Controllers/Api/Admin/AdminCreditWalletController.php",
      "takussan-api/app/Http/Controllers/Api/Admin/AdminBoostController.php",
      "takussan-api/app/Http/Controllers/Api/Admin/AdminBoostStatsController.php",
      "takussan-api/app/Http/Requests/Credits/StorePropertyBoostRequest.php",
      "takussan-api/app/Http/Requests/Api/Admin/StoreBoostProductRequest.php",
      "takussan-api/app/Http/Requests/Api/Admin/UpdateBoostProductRequest.php",
      "takussan-api/app/Http/Requests/Api/Admin/AdjustCreditWalletRequest.php",
      "takussan-api/app/Http/Requests/Api/Admin/CancelBoostRequest.php",
      "takussan-api/app/Http/Requests/Api/Admin/OfferBoostRequest.php",
      "takussan-api/app/Http/Requests/Api/Admin/BoostStatsRequest.php",
      "takussan-api/app/Http/Resources/Credits/CreditLotResource.php",
      "takussan-api/app/Http/Resources/Credits/CreditMovementResource.php",
      "takussan-api/app/Http/Resources/Credits/BoostProductResource.php",
      "takussan-api/app/Http/Resources/Credits/PropertyBoostResource.php",
      "takussan-api/app/Http/Resources/Credits/CreditWalletResource.php",
      "takussan-api/database/seeders/System/BoostProductSeeder.php",
      "takussan-api/database/seeders/System/OfferedFeaturedSeeder.php",
      "takussan-api/tests/Feature/Credits/CreditSchemaTest.php",
      "takussan-api/tests/Feature/Credits/CreditLedgerInvariantTest.php",
      "takussan-api/tests/Feature/Credits/CreditConsumptionOrderTest.php",
      "takussan-api/tests/Feature/Credits/CreditConcurrentSpendTest.php",
      "takussan-api/tests/Feature/Credits/WelcomeCreditOncePerPhoneTest.php",
      "takussan-api/tests/Feature/Boost/BoostModelsTest.php",
      "takussan-api/tests/Feature/Boost/BoostSettingsTest.php",
      "takussan-api/tests/Feature/Boost/BoostSpendCapabilityTest.php",
      "takussan-api/tests/Feature/Boost/BoostCatalogueTest.php",
      "takussan-api/tests/Feature/Boost/BoostRulesTest.php",
      "takussan-api/tests/Feature/Boost/FeaturedNotWritableTest.php",
      "takussan-api/tests/Feature/Boost/BoostPauseAndRefundTest.php",
      "takussan-api/tests/Feature/Boost/BoostsTickIdempotenceTest.php",
      "takussan-api/tests/Feature/Boost/BoostsTickScheduleTest.php",
      "takussan-api/tests/Feature/Boost/RankedOrderTest.php",
      "takussan-api/tests/Feature/Boost/ReservedTopResultsTest.php",
      "takussan-api/tests/Feature/Boost/SponsoredRotationTest.php",
      "takussan-api/tests/Feature/Boost/BoostStatsTest.php",
      "takussan-api/tests/Feature/Boost/SponsoredImpressionsTest.php",
      "takussan-api/tests/Feature/Boost/CreditsApiTest.php",
      "takussan-api/tests/Feature/Boost/PropertyBoostApiTest.php",
      "takussan-api/tests/Feature/Boost/PropertyResourceBadgeTest.php",
      "takussan-api/tests/Feature/Boost/AdminCreditsApiTest.php",
      "takussan-api/tests/Feature/Boost/AdminCreditsStepUpTest.php",
      "takussan-api/tests/Feature/Notifications/CreditsNotificationsTest.php",
      "takussan-api/tests/Unit/Boost/SponsoredRotationPickTest.php",
      "takussan-api/tests/Unit/Support/PhoneFingerprintTest.php",
      "takussan-web/src/components/boost/types.ts",
      "takussan-web/src/components/boost/api.ts",
      "takussan-web/src/components/boost/BoostButton.tsx",
      "takussan-web/src/components/boost/BoostDialog.tsx",
      "takussan-web/src/components/boost/CreditsPanel.tsx",
      "takussan-web/src/components/boost/EmplacementSponsorise.tsx",
      "takussan-web/src/components/boost/MarquesDeBoost.tsx",
      "takussan-web/src/components/boost/lecture-recherche.ts",
      "takussan-web/src/components/boost/arrivee-sponsorisee.ts",
      "takussan-web/src/components/boost/admin/api.ts",
      "takussan-web/src/components/boost/admin/AdminCreditWallets.tsx",
      "takussan-web/src/components/boost/admin/AdminCreditWalletDetail.tsx",
      "takussan-web/src/components/boost/admin/AdminBoosts.tsx",
      "takussan-web/src/components/boost/admin/AdminBoostCatalogue.tsx",
      "takussan-web/src/components/boost/admin/AdminBoostStats.tsx",
      "takussan-web/src/components/boost/admin/BoostsNav.tsx",
      "takussan-web/src/components/boost/__tests__/BoostDialog.test.tsx",
      "takussan-web/src/components/boost/__tests__/CreditsPanel.test.tsx",
      "takussan-web/src/components/boost/__tests__/EmplacementSponsorise.test.tsx",
      "takussan-web/src/components/boost/__tests__/MarquesDeBoost.test.tsx",
      "takussan-web/src/components/boost/admin/__tests__/AdminBoosts.test.tsx",
      "takussan-web/src/components/boost/admin/__tests__/AdminCreditWalletDetail.test.tsx",
      "takussan-web/src/app/(dashboard)/app/credits/page.tsx",
      "takussan-web/src/app/(super-admin)/super-admin/credits/page.tsx",
      "takussan-web/src/app/(super-admin)/super-admin/credits/[agencyId]/page.tsx",
      "takussan-web/src/app/(super-admin)/super-admin/boosts/page.tsx",
      "takussan-web/src/app/(super-admin)/super-admin/boosts/catalogue/page.tsx",
      "takussan-web/src/app/(super-admin)/super-admin/boosts/stats/page.tsx",
      "docs/plans/rapports/tck-633-lot-f.json"
    ],
    "edites": [
      "takussan-api/app/Models/Property.php",
      "takussan-api/app/Models/Agency.php",
      "takussan-api/app/Models/Enums/Capability.php",
      "takussan-api/app/Http/Requests/UpdatePropertyRequest.php",
      "takussan-api/app/Http/Controllers/Public/PublicPropertyController.php",
      "takussan-api/app/Services/Search/PropertySearchService.php",
      "takussan-api/app/Services/Property/HomepageDiscoveryService.php",
      "takussan-api/app/Observers/PropertyObserver.php",
      "takussan-api/app/Domain/Settings/EditablePlatformSettings.php",
      "takussan-api/config/scout.php",
      "takussan-api/lang/fr/errors.php",
      "takussan-api/lang/en/errors.php",
      "takussan-api/lang/wo/errors.php",
      "takussan-api/database/seeders/DatabaseSeeder.php",
      "takussan-web/src/components/property-dashboard/PropertyHeaderActions.tsx",
      "takussan-web/src/components/property-dashboard/PropertyRowActions.tsx",
      "takussan-web/src/components/property/PropertiesDiscoveryPage.tsx",
      "takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyHeader.tsx",
      "takussan-web/src/components/layout/AppSidebar.tsx",
      "takussan-web/src/components/layout/SuperAdminSidebar.tsx",
      "takussan-web/src/messages/fr.json",
      "takussan-web/src/messages/en.json",
      "takussan-web/src/messages/wo.json"
    ],
    "conditionnels_lot_c": [
      "takussan-api/app/Listeners/Credits/GrantWelcomeCreditsOnPhoneVerified.php",
      "takussan-api/app/Listeners/Credits/GrantWelcomeCreditsOnSpaceCreated.php",
      "takussan-api/tests/Feature/Credits/WelcomeCreditListenersTest.php"
    ]
  },
  "tests": {
    "lances_verts": [
      "CreditSchemaTest", "BoostModelsTest", "BoostSettingsTest", "CreditLedgerInvariantTest",
      "CreditConsumptionOrderTest", "PhoneFingerprintTest", "CreditConcurrentSpendTest",
      "CreditsNotificationsTest", "WelcomeCreditOncePerPhoneTest", "BoostSpendCapabilityTest",
      "BoostCatalogueTest", "BoostRulesTest", "FeaturedNotWritableTest", "BoostPauseAndRefundTest",
      "BoostsTickIdempotenceTest", "SponsoredRotationPickTest", "RankedOrderTest",
      "ReservedTopResultsTest", "SponsoredRotationTest", "BoostStatsTest", "SponsoredImpressionsTest",
      "CreditsApiTest", "PropertyBoostApiTest", "AdminCreditsApiTest",
      "BoostDialog.test.tsx", "CreditsPanel.test.tsx", "EmplacementSponsorise.test.tsx",
      "MarquesDeBoost.test.tsx", "AdminBoosts.test.tsx", "AdminCreditWalletDetail.test.tsx"
    ],
    "differes": {
      "AdminCreditsStepUpTest": "C1", "BoostsTickScheduleTest": "C2", "PropertyResourceBadgeTest": "C3",
      "MembershipCapabilityResolverTest": "C4", "PlatformSettingsCatalogueTest": "C5",
      "PropertyListTest": "C6", "CompteurDeVue.test.tsx": "C7",
      "WelcomeCreditListenersTest": "événements PhoneVerified / SpaceCreated du lot C"
    },
    "hors_lot": []
  },
  "ablations": [
    "T1 trigger d'insertion seule retiré de la migration 700200 → CreditSchemaTest::test_un_mouvement_ne_se_modifie_ni_ne_se_supprime rouge ; restauré par cp, md5 identique",
    "T2 hook replicating retiré de Property → BoostModelsTest (filtre copie) rouge ; restauré, md5 identique",
    "T3 max:10 → max:100 sur boost.sponsored_slots_per_page → test de bornes rouge ; restauré, md5 identique",
    "T4 ordre expires_at inversé, restant non décrémenté (étape 4.6) → CreditConsumptionOrderTest / CreditLedgerInvariantTest rouges ; restaurés, md5 identiques",
    "T5 verrou de la ligne agencies déplacé après la lecture des lots, puis retiré → CreditConcurrentSpendTest rouge ; tearDown vidé → test de nettoyage rouge ; restaurés, md5 identiques",
    "T6 'credits' retiré de BoostRefundedNotification::toAppNotification → CreditsNotificationsTest rouge ; restauré",
    "T7 garde if ($inserted === 0) retirée, puis PhoneFingerprint remplacé par sha256 brut → WelcomeCreditOncePerPhoneTest rouge ; restaurés",
    "T8 CreditLotPolicy::viewAny → true → BoostSpendCapabilityTest rouge ; restauré",
    "T9 insertOrIgnore → insert dans BoostProductSeeder → BoostCatalogueTest rouge ; restauré",
    "T10 prolongation de Vedette, délai de Remontée et garde de bien public retirés tour à tour → BoostRulesTest rouge ; restaurés",
    "T11 ancienne règle featured remise dans UpdatePropertyRequest → FeaturedNotWritableTest rouge ; restaurée",
    "T12 filtre de statut de closeWithRefund, appel reconcile de PropertyObserver et intdiv du prorata retirés tour à tour → BoostPauseAndRefundTest rouge ; restaurés",
    "T13 whereNull(expiry_notice_sent_at) retiré des deux requêtes → BoostsTickIdempotenceTest rouge ; restauré",
    "T14 orderByDesc(featured) remis en tête de index(), usort → sort dans pick() → RankedOrderTest / SponsoredRotationPickTest rouges ; restaurés",
    "T15 décalage des places réservées et exclusion des biens déjà servis retirés tour à tour → ReservedTopResultsTest / SponsoredRotationTest rouges ; restaurés",
    "T16 Cache::pull → Cache::get dans flush(), garde RateLimiter de click() retirée → BoostStatsTest rouge ; restaurés",
    "T17 capacité BoostSpend retirée de PropertyBoostPolicy::create → PropertyBoostApiTest rouge ; restaurée",
    "T18 règle reason retirée d'AdjustCreditWalletRequest → AdminCreditsApiTest rouge ; restaurée",
    "T20 || manque > 0 retiré du bouton Confirmer → BoostDialog.test rouge ; restauré",
    "T21 libellé lots.noExpiry vidé → CreditsPanel.test rouge ; restauré",
    "T22 onClickCapture retiré d'EmplacementSponsorise → EmplacementSponsorise.test rouge ; restauré",
    "T23 garde du motif (≥ 5 caractères) retirée → AdminCreditWalletDetail.test rouge ; restaurée"
  ],
  "ecarts_au_ticket": [
    "E1 — Notifications sans code ADR-0032.",
    "E2 — `is_sponsored` n'est pas une colonne.",
    "E3 — La rangée vedette de l'accueil couvre tout le catalogue.",
    "E4 — Aucun emplacement en recherche élargie.",
    "E5 — Coût par page.",
    "E6 — Validité d'un ajustement positif.",
    "E7 — Un remboursement peut hériter d'une expiration passée.",
    "E8 — Vedette d'un espace suspendu.",
    "E9 — Prolongation offerte + payée.",
    "E10 — Événements du lot C absents.",
    "E11 — `SpaceCreated` hors onboarding.",
    "E12 — Écran de succès inexistant.",
    "E13 — Impressions sous-comptées sous cache.",
    "E14 — Menu « Crédits » par rôle.",
    "E15 — Seeders en `database/seeders/System/`.",
    "E16 — `check-models-spec` rouge jusqu'à C13.",
    "E17 — `boost.spend` hors familles de `ProtectedActions` côté agence.",
    "E18 — Réponse `credits` de forme fixe.",
    "E19 — Places réservées à 2 par défaut.",
    "E20 — Statistiques admin bornées à 92 jours, `property.detail.featured` plus lu."
  ],
  "collisions": [
    {"id": "C1", "fichier": "takussan-api/app/Support/Security/ProtectedActions.php", "changement": "5 entrées STEP_UP (tâche 18, bloc « Collision C1 »)", "debloque": "AdminCreditsStepUpTest"},
    {"id": "C2", "fichier": "takussan-api/routes/console.php", "changement": "Schedule::command('boosts:tick')->everyFiveMinutes()->withoutOverlapping(); (tâche 13)", "debloque": "BoostsTickScheduleTest"},
    {"id": "C3", "fichier": "takussan-api/app/Http/Resources/PropertyResource.php", "changement": "badge, badge_until (tâche 17, bloc « Collision C3 »)", "debloque": "PropertyResourceBadgeTest"},
    {"id": "C4", "fichier": "takussan-api/tests/Unit/Services/Membership/MembershipCapabilityResolverTest.php", "changement": "44/46 → 45/47 (tâche 8)", "debloque": "MembershipCapabilityResolverTest"},
    {"id": "C5", "fichier": "takussan-api/tests/Feature/Admin/Platform/PlatformSettingsCatalogueTest.php", "changement": "liste des 9 clés (tâche 3)", "debloque": "PlatformSettingsCatalogueTest"},
    {"id": "C6", "fichier": "takussan-api/tests/Feature/Public/PropertyListTest.php", "changement": "ordre organique ranked_at (tâche 14)", "debloque": "PropertyListTest"},
    {"id": "C7", "fichier": "takussan-web/src/app/[locale]/(public)/properties/[slug]/components/CompteurDeVue.tsx", "changement": "consommerArriveeSponsorisee + ?src=sponsored (tâche 16)", "debloque": "CompteurDeVue.test.tsx"},
    {"id": "C8", "fichier": "takussan-web/src/types/super-admin.ts:510 ; takussan-web/src/components/admin/super/platform-settings.tsx:28", "changement": "catégorie boost (tâche 23)", "debloque": "réglages visibles dans la console"},
    {"id": "C9", "fichier": "takussan-web/src/messages/{fr,en,wo}.json (hors espaces F)", "changement": "nav.sidebar.credits, nav.superAdmin.items.{credits,boosts}, admin.roles.domains.boost, admin.roles.capabilities.boost.spend, superAdmin.platformSettings.categories.boost, superAdmin.platformSettings.keys.{credits,boost}.* (tâches 8, 21, 23)", "debloque": "npm run check:i18n ; tests de src/components/layout"},
    {"id": "C10", "fichier": "takussan-web/src/i18n/namespaces.json", "changement": "cd takussan-web && node scripts/check-i18n-namespaces.mjs --update, après fusion de tous les lots", "debloque": "npm run check:i18n-namespaces"},
    {"id": "C11", "fichier": "takussan-api/app/Domain/Notifications/NotificationTarget.php", "changement": "'credits' => '/app/credits', (tâche 6)", "debloque": "lien des notifications de crédits"},
    {"id": "C12", "fichier": "écran de succès de publication (lot C)", "changement": "<BoostButton propertyId={…} isPublic /> (tâche 20)", "debloque": "Booster depuis l'écran de succès"},
    {"id": "C13", "fichier": "docs/models-spec.md", "changement": "6 modèles neufs + 4 colonnes de properties (étape 3 du plan maître)", "debloque": "scripts/check-models-spec.mjs"}
  ]
}
```

Avant d'écrire : comparer `fichiers.crees` et `fichiers.edites` à l'inventaire de l'étape 24.6 —
un fichier de la liste absent du disque, ou un fichier F du disque absent de la liste, se corrige
dans le rapport (et se dit dans `ecarts_au_ticket`). `conditionnels_lot_c` passe dans `crees` si la
pré-condition de la tâche 7 était remplie, et reste à part sinon. `verdict` vaut `"rouge"` si une
étape de 24.1 à 24.5 n'a pas rendu sa sortie attendue ; la sortie fautive va alors dans
`tests.hors_lot` ou en tête de `ecarts_au_ticket`.

**Étape 24.8 — signaler à la session les fichiers à commiter :** `docs/plans/rapports/tck-633-lot-f.json`,
plus la liste complète de l'étape 24.6. **Message final : une ligne.**

---

## Écarts relevés

Écarts entre le ticket / l'ADR-0061 / le plan maître et ce que le code permet ou ce que ce plan
livre. Chacun est recopié dans `ecarts_au_ticket` du rapport.

- **E1 — Notifications sans code ADR-0032.** Les notifications de crédits et de boost (tâche 6)
  passent par le canal `AppDatabaseChannel` existant, qui stocke un type et des paramètres, pas un
  code d'erreur : la règle « codes + paramètres » d'ADR-0032 s'applique aux erreurs de l'API
  (`errors.php`, groupes `boost` et `credits`), pas à la cloche.
- **E2 — `is_sponsored` n'est pas une colonne.** Le ticket parle d'un drapeau « sponsorisé » ; le lot
  le porte par `properties.featured` (seul écrivain : `BoostLifecycle`) + `sponsored_until`. L'index
  Meilisearch reste filtré sur `featured`, aucune colonne en double.
- **E3 — La rangée vedette de l'accueil couvre tout le catalogue.** `HomepageDiscoveryService` tourne
  sur les vedettes de tout le parc, sans zone : aucune géographie n'est connue de l'accueil (le
  référentiel est le lot D).
- **E4 — Aucun emplacement en recherche élargie.** Quand la recherche publique élargit (rayon ou
  critères relâchés), les emplacements « Sponsorisé » et les places réservées ne sont pas servis :
  une vedette hors des critères demandés ne s'impose pas.
- **E5 — Coût par page.** Le vivier sponsorisé et le nombre de places réservées sont recalculés à
  chaque page ; une page peut coûter jusqu'à **3 requêtes Meilisearch** (vivier, organique
  d'exclusion, organique). Mesure à prendre en préproduction avant d'envisager un cache.
- **E6 — Validité d'un ajustement positif.** Un crédit manuel de la console prend la validité de
  l'offre de bienvenue (`credits.welcome_validity_days`) : l'ADR ne fixe pas de validité propre aux
  octrois manuels.
- **E7 — Un remboursement peut hériter d'une expiration passée.** Le lot de remboursement reprend
  l'expiration du lot consommé (ADR-0061 §2 : on rend ce qu'on a pris) ; si ce lot est déjà expiré,
  les crédits rendus expirent au tick suivant. Comportement voulu, mais visible.
- **E8 — Vedette d'un espace suspendu.** Elle est filtrée à l'hydratation (tâche 15) : la page peut
  alors porter **moins** de N emplacements que le réglage. Les filtrer dans Meilisearch exigerait
  d'indexer le statut de l'espace (hors territoire).
- **E9 — Prolongation offerte + payée.** Une Vedette offerte prolongée par un achat garde
  `offered = true` seulement si les deux le sont (ET logique) ; le remboursement au prorata porte sur
  le **cumul** payé, jamais sur la part offerte.
- **E10 — Événements du lot C absents.** `PhoneVerified` et `SpaceCreated` n'existent pas au
  2026-10-12 : les écouteurs de l'offre de bienvenue et leur test sont **différés** (tâche 7) ; la
  session les crée après fusion de C.
- **E11 — `SpaceCreated` hors onboarding.** `AgencyController.php:59` et
  `AgencyProvisioningService.php:49` créent aussi des espaces ; si C ne les couvre pas, l'offre
  n'arrive qu'à la vérification du numéro (rattrapage correct, pas « à la naissance »).
- **E12 — Écran de succès inexistant.** Le bouton Booster de l'écran de succès dépend du lot C
  (collision C12) ; jusque-là il vit dans l'en-tête du bien et le menu de ligne.
- **E13 — Impressions sous-comptées sous cache.** Les réponses publiques de découverte portent
  `s-maxage=300` : une page servie par le CDN n'atteint pas l'API et ne compte pas ses impressions.
  Les clics, eux, passent toujours par la vue du bien.
- **E14 — Menu « Crédits » par rôle.** L'entrée de la barre latérale suit `agency_admin || isAdmin`,
  comme ses voisines ; la capacité `boost.spend` garde les écritures, pas l'affichage du menu.
- **E15 — Seeders en `database/seeders/System/`.** Le plan maître nomme `BoostProductSeeder` sans
  chemin ; il est rangé avec les seeders de référentiel système, appelé par la migration `700400`
  (une migration qui appelle un seeder et un service : catalogue présent en production sans
  `db:seed`).
- **E16 — `check-models-spec` rouge jusqu'à C13.** Règle 5 du plan maître : `docs/models-spec.md` est
  écrit à l'intégration seulement.
- **E17 — `boost.spend` hors familles de `ProtectedActions` côté agence.** Acheter un boost ne
  demande pas de preuve récente du second facteur (aucun argent réel en phase 1) ; seules les
  écritures super-admin sont en step-up (C1). `ProtectedActionsCoverageTest` peut rougir tant que C1
  n'est pas appliquée.
- **E18 — Réponse `credits` de forme fixe.** `GET /api/credits` rend un objet composé (solde, lots,
  journal paginé) : pas de sparse fieldsets, faute de ressource unique à restreindre.
- **E19 — Places réservées à 2 par défaut.** Le défaut ADR-0061 §7 change la première page de toute
  recherche qui contient une vedette : des tests de recherche hors F peuvent rougir (étape 24.3) ; la
  session les corrige ou fixe le réglage à 0 dans leur `setUp()`.
- **E20 — Statistiques admin bornées à 92 jours, `property.detail.featured` plus lu.** La fenêtre des
  statistiques est plafonnée (`boost.stats_window_too_wide`) ; la clé i18n
  `property.detail.featured` n'est plus lue par la fiche (remplacée par `boost.*`) — sa suppression
  revient au propriétaire de l'espace `property`, pas à F.
