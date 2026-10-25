<?php

namespace Tests\Feature\Database\Seeders;

use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use Database\Seeders\Activity\BookingSeeder;
use Database\Seeders\Catalog\PropertySeeder;
use Database\Seeders\Core\AgencySeeder;
use Database\Seeders\Core\UserSeeder;
use Database\Seeders\Crm\CustomerSeeder;
use Database\Seeders\Support\EdgeCaseSeeder;
use Database\Seeders\Support\FilterCoverageSeeder;
use Database\Seeders\Support\PostProcessingSeeder;
use Database\Seeders\Support\ReferentialIntegrityChecker;
use Database\Seeders\Support\SeedingConfig;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\System\GeoReferentialSeeder;
use Database\Seeders\YearOfActivitySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use ReflectionClassConstant;
use RuntimeException;
use Tests\TestCase;

/**
 * TCK-2376 — le jeu semé tient ses invariants à la SOURCE, et le vérificateur ne répare rien.
 *
 * Mesuré le 2026-10-25 sur un seed par défaut : 66 % des loyers encaissés venaient des baux que
 * l'ancien `ReferentialIntegrityChecker` fabriquait pour les biens « loués » sans bail — dont 40
 * biens À VENDRE au loyer moyen de 53,6 M XOF —, 273 factures `paid` couvraient un loyer impayé, et
 * 80 réservations étaient `completed` avant leur début. Un vérificateur qui « répare » ferait passer
 * le premier test sans corriger la cause : le second l'interdit.
 */
class SeedingInvariantsTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_jeu_seme_par_le_pipeline_tient_tous_ses_invariants(): void
    {
        $this->semer(new SeedingConfig(
            agencies: 1,
            propertiesPerAgency: 40,
            customersPerAgency: 20,
            bookingsPerAgency: 25,
            leasesPerAgency: 15,
            maintenanceRequestsPerAgency: 2,
            conversationsPerAgency: 2,
            documentsPerAgency: 2,
            includeDemoUsers: false,
        ));

        // NON-VACUITÉ : chaque invariant porte sur une population présente. Sans biens à vendre, sans
        // factures payées, sans réservation terminée, un zéro ne prouverait rien.
        $this->assertGreaterThan(0, Property::query()->where('contract_type', ContractType::Sale)->count());
        $this->assertGreaterThan(0, Property::query()->where('status', PropertyStatus::Rented)->count());
        $this->assertGreaterThan(0, Lease::query()->where('status', LeaseStatus::Active)->count());
        $this->assertGreaterThan(0, Invoice::query()->where('status', InvoiceStatus::Paid)->count());
        $this->assertGreaterThan(0, Invoice::query()->where('status', InvoiceStatus::Overdue)->count());
        $this->assertGreaterThan(0, Booking::query()->where('status', BookingStatus::Completed)->count());

        $this->assertSame(
            array_fill_keys(array_keys((new ReferentialIntegrityChecker)->violations()), 0),
            (new ReferentialIntegrityChecker)->violations(),
        );
    }

    /**
     * Une réservation n'est terminée qu'une fois commencée. Le défaut ne touche que celles créées dans
     * la dernière semaine, soit 1 à 2 % d'un tirage sur 13 mois : il faut un VOLUME pour qu'il se
     * montre. À 800 réservations par agence, l'ancien tirage en sortait une vingtaine par agence.
     */
    public function test_aucune_reservation_n_est_terminee_avant_son_debut(): void
    {
        $context = new SeedingContext(new SeedingConfig(agencies: 1, propertiesPerAgency: 5, customersPerAgency: 5, bookingsPerAgency: 800, includeDemoUsers: false));
        app()->instance(SeedingContext::class, $context);
        foreach ([GeoReferentialSeeder::class, AgencySeeder::class, UserSeeder::class, PropertySeeder::class, CustomerSeeder::class, BookingSeeder::class] as $classe) {
            app()->call([app($classe), 'run']);
        }

        $this->assertGreaterThan(0, Booking::query()->where('start_date', '>', now()->toDateString())->count(), 'Aucune réservation à venir : le cas n\'est pas exercé.');
        $this->assertSame(0, (new ReferentialIntegrityChecker)->violations()['reservation_terminee_avant_son_debut']);
    }

    public function test_le_jeu_par_defaut_ne_contient_aucune_fixture_de_cas_limite_ni_de_couverture(): void
    {
        $this->semer(new SeedingConfig(
            agencies: 1,
            propertiesPerAgency: 10,
            customersPerAgency: 5,
            bookingsPerAgency: 3,
            leasesPerAgency: 3,
            maintenanceRequestsPerAgency: 1,
            conversationsPerAgency: 1,
            documentsPerAgency: 1,
            includeDemoUsers: false,
        ));

        $this->assertSame(0, Property::query()->where('reference_number', 'like', 'PR-EC-%')->orWhere('reference_number', 'like', 'PR-FC-%')->count());
        $this->assertSame(0, Lease::query()->where('reference_number', 'like', 'LS-EC-%')->orWhere('reference_number', 'like', 'LS-FC-%')->count());
        $this->assertSame(0, Booking::query()->where('reference_number', 'like', 'BK-EC-%')->count());
    }

    public function test_les_fixtures_sont_eteintes_par_defaut_et_se_demandent_par_l_environnement(): void
    {
        // Le défaut du CODE, pas celui de la machine : un `.env` local peut poser ces clés.
        $defaut = $this->avecEnvironnement(['SEED_EDGE_CASES' => null, 'SEED_FILTER_COVERAGE' => null], SeedingConfig::fromEnv(...));
        $this->assertFalse($defaut->includeEdgeCases);
        $this->assertFalse($defaut->includeFilterCoverage);

        $demande = $this->avecEnvironnement(['SEED_EDGE_CASES' => 'true', 'SEED_FILTER_COVERAGE' => 'true'], SeedingConfig::fromEnv(...));
        $this->assertTrue($demande->includeEdgeCases);
        $this->assertTrue($demande->includeFilterCoverage);
    }

    public function test_le_verificateur_juge_le_jeu_realiste_avant_les_fixtures(): void
    {
        $pipeline = (new ReflectionClassConstant(YearOfActivitySeeder::class, 'PIPELINE'))->getValue();
        $verification = array_search(PostProcessingSeeder::class, $pipeline, true);

        $this->assertIsInt($verification);
        $this->assertLessThan(array_search(FilterCoverageSeeder::class, $pipeline, true), $verification);
        $this->assertLessThan(array_search(EdgeCaseSeeder::class, $pipeline, true), $verification);
    }

    public function test_un_invariant_viole_fait_echouer_le_seeding_sans_qu_aucune_ligne_soit_ecrite(): void
    {
        $aVendre = Property::factory()->create([
            'contract_type' => ContractType::Sale,
            'type' => PropertyType::Apartment,
            'status' => PropertyStatus::Rented,
            'price' => 90_000_000,
        ]);
        Lease::factory()->create(['property_id' => $aVendre->id, 'status' => LeaseStatus::Draft]);

        $avant = [Lease::query()->count(), LeasePayment::query()->count(), Booking::query()->count(), Property::query()->where('status', PropertyStatus::Rented)->count()];

        app()->instance(SeedingContext::class, new SeedingContext(new SeedingConfig(ensureReferentialIntegrity: true)));

        try {
            app(PostProcessingSeeder::class)->run();
            $this->fail('Le vérificateur aurait dû faire échouer le seeding.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('bail_de_location_sur_un_bien_a_vendre : 1', $e->getMessage());
            $this->assertStringContainsString('bien_loue_sans_bail_actif : 1', $e->getMessage());
        }

        $this->assertSame(
            $avant,
            [Lease::query()->count(), LeasePayment::query()->count(), Booking::query()->count(), Property::query()->where('status', PropertyStatus::Rented)->count()],
            'Le vérificateur a écrit en base : il « répare » au lieu de juger.',
        );
    }

    private function semer(SeedingConfig $config): void
    {
        app()->instance(SeedingConfig::class, $config);
        // Le seeder réindexe le moteur que la configuration déclare : la suite en déclare un, et ce
        // test ne juge pas l'index (SeedingReindexTest le fait).
        config(['scout.driver' => null]);

        $this->seed(YearOfActivitySeeder::class);
    }

    /**
     * Exécute `$fn` sous ces variables d'environnement (`null` = absente), puis restaure les trois
     * sources que lit `env()` : `$_SERVER`, `$_ENV` et `getenv()`.
     *
     * @template T
     *
     * @param  array<string, ?string>  $variables
     * @param  \Closure(): T  $fn
     * @return T
     */
    private function avecEnvironnement(array $variables, \Closure $fn): mixed
    {
        $avant = [];
        foreach ($variables as $nom => $valeur) {
            $avant[$nom] = [$_SERVER[$nom] ?? null, $_ENV[$nom] ?? null, getenv($nom)];
            if ($valeur === null) {
                unset($_SERVER[$nom], $_ENV[$nom]);
                putenv($nom);
            } else {
                $_SERVER[$nom] = $_ENV[$nom] = $valeur;
                putenv("{$nom}={$valeur}");
            }
        }

        try {
            return $fn();
        } finally {
            foreach ($avant as $nom => [$server, $env, $getenv]) {
                unset($_SERVER[$nom], $_ENV[$nom]);
                putenv($nom);
                if ($server !== null) {
                    $_SERVER[$nom] = $server;
                }
                if ($env !== null) {
                    $_ENV[$nom] = $env;
                }
                if ($getenv !== false) {
                    putenv("{$nom}={$getenv}");
                }
            }
        }
    }
}
