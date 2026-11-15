<?php

namespace Tests\Feature\Database;

use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-2703 — AC1 : les biens en location sans période reçoivent celle du modèle (`monthly`), et
 * rien d'autre ne bouge. Les lignes sont écrites hors du modèle, comme les seeders les écrivaient.
 */
class BackfillRentPeriodMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = 'migrations/2026_11_11_110000_backfill_rent_period_of_rentals.php';

    public function test_ac1_a_rental_without_period_becomes_monthly_and_nothing_else_moves(): void
    {
        $sansPeriode = $this->brut(ContractType::Rent, null);
        $supprime = $this->brut(ContractType::Rent, null);
        Property::withoutEvents(fn () => $supprime->delete());
        $vente = $this->brut(ContractType::Sale, null);
        $journaliere = $this->brut(ContractType::Rent, RentPeriod::Daily);
        $annuelle = $this->brut(ContractType::Rent, RentPeriod::Yearly);
        $misAJourAvant = DB::table('properties')->where('id', $sansPeriode->id)->value('updated_at');

        $migration = require database_path(self::MIGRATION);
        $migration->up();

        $this->assertSame('monthly', $this->periode($sansPeriode));
        $this->assertSame('monthly', $this->periode($supprime), 'un bien supprimé est réparé aussi : il se restaure');
        $this->assertNull($this->periode($vente));
        $this->assertSame('daily', $this->periode($journaliere));
        $this->assertSame('yearly', $this->periode($annuelle));
        $this->assertSame($misAJourAvant, DB::table('properties')->where('id', $sansPeriode->id)->value('updated_at'));
        $this->assertSame(0, DB::table('properties')->where('contract_type', 'rent')->whereNull('rent_period')->count());

        $avant = DB::table('properties')->orderBy('id')->get(['id', 'rent_period', 'updated_at'])->toArray();
        $migration->up();
        $this->assertEquals($avant, DB::table('properties')->orderBy('id')->get(['id', 'rent_period', 'updated_at'])->toArray(), 'rejouée, elle ne change rien');

        $migration->down();
        $this->assertSame('monthly', $this->periode($sansPeriode), 'le retour ne fait rien : il ne sait pas lesquels étaient nuls');
    }

    private function brut(ContractType $contract, ?RentPeriod $period): Property
    {
        return Property::withoutEvents(fn () => Property::factory()->create([
            'contract_type' => $contract,
            'rent_period' => $period,
            'updated_at' => '2026-01-02 03:04:05',
        ]));
    }

    private function periode(Property $property): ?string
    {
        return DB::table('properties')->where('id', $property->id)->value('rent_period');
    }
}
