<?php

namespace Tests\Feature\Lease;

use App\Models\Customer;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2643 — le bail créé porte sa pénalité de retard, son indemnité de départ anticipé et son
 * plafond de révision DÈS le POST, sans PATCH ultérieur (AC3). Les bornes sont celles
 * d'`UpdateLeaseRequest` : une valeur que la modification refuserait, la création la refuse.
 */
class StoreLeaseWithLateFeeTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: array<string, mixed>} */
    private function corps(): array
    {
        $bailleur = User::factory()->create();
        $bien = Property::factory()->create(['user_id' => $bailleur->id]);
        $locataire = Customer::factory()->create(['added_by_id' => $bailleur->id]);

        return [$bailleur, [
            'property_id' => $bien->id,
            'tenant_id' => $locataire->id,
            'type' => 'residential_rent',
            'start_date' => now()->toDateString(),
            'monthly_rent' => 670000,
            'deposit_amount' => 1340000,
            'currency' => 'XOF',
        ]];
    }

    public function test_les_quatre_termes_s_ecrivent_des_la_creation(): void
    {
        [$bailleur, $corps] = $this->corps();
        Sanctum::actingAs($bailleur);

        $this->postJson('/api/leases', $corps + [
            'late_fee_percent' => 5,
            'late_fee_grace_days' => 5,
            'early_termination_penalty_months' => 3,
            'rent_review_max_pct' => 10,
        ])->assertCreated()
            ->assertJsonPath('data.late_fee_percent', 5)
            ->assertJsonPath('data.late_fee_grace_days', 5);

        $bail = Lease::query()->sole();
        $this->assertEquals(5.0, (float) $bail->late_fee_percent);
        $this->assertSame(5, (int) $bail->late_fee_grace_days);
        $this->assertSame(3, (int) $bail->early_termination_penalty_months);
        $this->assertEquals(10.0, (float) $bail->rent_review_max_pct);
    }

    public function test_sans_eux_le_bail_nait_comme_avant(): void
    {
        [$bailleur, $corps] = $this->corps();
        Sanctum::actingAs($bailleur);

        $this->postJson('/api/leases', $corps)->assertCreated();

        $bail = Lease::query()->sole();
        $this->assertNull($bail->late_fee_percent);
        $this->assertNull($bail->early_termination_penalty_months);
    }

    /** @return array<string, array{string, mixed}> */
    public static function horsBornes(): array
    {
        return [
            'pénalité à 60 %' => ['late_fee_percent', 60],
            'grâce de 31 jours' => ['late_fee_grace_days', 31],
            'grâce fractionnaire' => ['late_fee_grace_days', 2.5],
            'indemnité de 13 mois' => ['early_termination_penalty_months', 13],
            'révision à 101 %' => ['rent_review_max_pct', 101],
        ];
    }

    #[DataProvider('horsBornes')]
    public function test_une_valeur_hors_des_bornes_de_la_modification_est_refusee(string $champ, mixed $valeur): void
    {
        [$bailleur, $corps] = $this->corps();
        Sanctum::actingAs($bailleur);

        $this->postJson('/api/leases', $corps + [$champ => $valeur])
            ->assertUnprocessable()
            ->assertJsonValidationErrors($champ);

        $this->assertSame(0, Lease::query()->count());
    }
}
