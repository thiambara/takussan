<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\Currency;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-084 — multi-currency: updating the agency-level currency.
 *
 * Covers AC1, AC2, AC3 and AC10 (existing rows must NOT be retroactively
 * recomputed when the agency switches currency).
 */
class AgencyCurrencyUpdateTest extends TestCase
{
    use RefreshDatabase;

    public function test_show_endpoint_exposes_default_currency(): void
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        Sanctum::actingAs($admin);

        $this->getJson("/api/agencies/{$agency->id}")
            ->assertOk()
            ->assertJsonPath('data.currency', 'XOF');
    }

    public function test_primary_admin_can_change_currency(): void
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create([
            'primary_admin_id' => $admin->id,
            'currency' => Currency::XOF,
        ]);

        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['currency' => 'EUR'])
            ->assertOk()
            ->assertJsonPath('data.currency', 'EUR');

        $this->assertSame('EUR', $agency->refresh()->currency->value);
    }

    public function test_non_admin_member_cannot_change_currency(): void
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);
        $member = User::factory()->create(['agency_id' => $agency->id]);

        Sanctum::actingAs($member);

        $this->patchJson("/api/agencies/{$agency->id}", ['currency' => 'USD'])
            ->assertForbidden();

        $this->assertSame('XOF', $agency->refresh()->currency->value);
    }

    public function test_invalid_currency_is_rejected(): void
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['currency' => 'JPY'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('currency');
    }

    public function test_changing_currency_does_not_alter_existing_leases_or_payments(): void
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create([
            'primary_admin_id' => $admin->id,
            'currency' => Currency::XOF,
        ]);

        // Seed a lease + payment in XOF *before* the currency switch.
        $lease = Lease::factory()->create([
            'agency_id' => $agency->id,
            'currency' => Currency::XOF,
            'monthly_rent' => 250_000,
        ]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'currency' => Currency::XOF,
            'amount' => 250_000,
        ]);

        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['currency' => 'EUR'])
            ->assertOk();

        // Existing rows keep their original currency + amount.
        $this->assertSame('XOF', $lease->refresh()->currency->value);
        $this->assertEquals(250_000, (float) $lease->monthly_rent);
        $this->assertSame('XOF', $payment->refresh()->currency->value);
        $this->assertEquals(250_000, (float) $payment->amount);
    }

    public function test_existing_agencies_have_xof_default_after_migration(): void
    {
        // The migration sets the default at the column level — newly created
        // rows that omit `currency` get XOF without us having to specify it.
        $admin = User::factory()->create();
        $agency = Agency::factory()->create([
            'primary_admin_id' => $admin->id,
        ]);

        $this->assertSame('XOF', $agency->refresh()->currency->value);
    }
}
