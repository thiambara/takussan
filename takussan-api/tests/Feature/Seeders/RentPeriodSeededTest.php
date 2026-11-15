<?php

namespace Tests\Feature\Seeders;

use App\Models\Enums\ContractType;
use App\Models\Property;
use Database\Seeders\Catalog\PropertySeeder;
use Database\Seeders\Core\AgencySeeder;
use Database\Seeders\Core\UserSeeder;
use Database\Seeders\Support\EdgeCaseSeeder;
use Database\Seeders\Support\FilterCoverageSeeder;
use Database\Seeders\Support\ReferentialIntegrityChecker;
use Database\Seeders\Support\SeedingConfig;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\System\TagSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2703 — AC2 : les seeders écrivent sous `withoutEvents()`, donc sans l'invariant du modèle ;
 * ils posent la période d'une location par la même règle ({@see Property::avecPeriodeParDefaut()}).
 * Sans elle, 381 biens en location sur 451 de la base de démo n'avaient pas de période et sortaient
 * de l'occupation et des filtres « au mois ».
 */
class RentPeriodSeededTest extends TestCase
{
    use RefreshDatabase;

    public function test_ac2_no_seeded_rental_lacks_its_period(): void
    {
        app()->instance(SeedingContext::class, new SeedingContext(new SeedingConfig(
            agencies: 1,
            propertiesPerAgency: 30,
            includeEdgeCases: true,
            ensureReferentialIntegrity: false,
            includeFilterCoverage: true,
            includeDemoUsers: false,
            downloadMedia: false,
        )));
        config(['scout.driver' => null]);

        foreach ([TagSeeder::class, AgencySeeder::class, UserSeeder::class, PropertySeeder::class, FilterCoverageSeeder::class, EdgeCaseSeeder::class] as $classe) {
            app($classe)->run();
        }

        foreach (['PR-FC-%', 'PR-EC-%'] as $prefixe) {
            $this->assertGreaterThan(0, Property::query()->where('contract_type', ContractType::Rent)->where('reference_number', 'like', $prefixe)->count(), "non-vacuité {$prefixe}");
        }
        $this->assertGreaterThan(0, Property::query()->where('contract_type', ContractType::Rent)->where('reference_number', 'not like', 'PR-%-%')->count(), 'non-vacuité catalogue');
        $this->assertSame(0, Property::query()->where('contract_type', ContractType::Rent)->whereNull('rent_period')->count());
        $this->assertSame(0, (new ReferentialIntegrityChecker)->violations()['bien_en_location_sans_periode']);
        $this->assertGreaterThan(0, Property::query()->where('contract_type', ContractType::Sale)->whereNull('rent_period')->count(), 'une vente garde NULL');
    }

    public function test_the_checker_names_a_rental_without_period(): void
    {
        Property::withoutEvents(fn () => Property::factory()->create(['contract_type' => ContractType::Rent, 'rent_period' => null]));
        Property::withoutEvents(fn () => Property::factory()->create(['contract_type' => ContractType::Sale, 'rent_period' => null]));

        $this->assertSame(1, (new ReferentialIntegrityChecker)->violations()['bien_en_location_sans_periode']);
    }
}
