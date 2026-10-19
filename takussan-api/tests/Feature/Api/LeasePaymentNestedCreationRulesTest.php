<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * P46.05 (TCK-958) — ce que la création imbriquée d'une ligne de bail refuse, et la capacité qui
 * écrit l'échéancier.
 */
class LeasePaymentNestedCreationRulesTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private function activeLease(?Agency $agency = null, ?User $landlord = null): Lease
    {
        return Lease::factory()->create(array_filter([
            'agency_id' => $agency?->id,
            'landlord_id' => $landlord?->id,
            'status' => LeaseStatus::Active->value,
            'start_date' => now()->startOfMonth(),
            'end_date' => now()->startOfMonth()->addMonths(3),
            'monthly_rent' => 100000,
        ], fn ($v) => $v !== null));
    }

    /** @return array<string, mixed> */
    private function line(array $overrides = []): array
    {
        return array_merge([
            'amount' => 50000,
            'payment_type' => 'charges',
            'period_start' => '2026-01-01',
            'period_end' => '2026-01-31',
        ], $overrides);
    }

    /**
     * Une caution rendue ne se crée pas à la main : rattachée à aucun reversement, `mark-paid` la
     * refuse, et elle restait `pending` pour toujours.
     */
    public function test_a_deposit_refund_line_is_refused(): void
    {
        $landlord = User::factory()->create();
        $lease = $this->activeLease(landlord: $landlord);
        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/payments", $this->line(['payment_type' => 'deposit_refund']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('payment_type');

        $this->assertSame(0, $lease->payments()->count());
    }

    public function test_a_zero_amount_is_refused(): void
    {
        $landlord = User::factory()->create();
        $lease = $this->activeLease(landlord: $landlord);
        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/payments", $this->line(['amount' => 0]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('amount');

        $this->assertSame(0, $lease->payments()->count());
    }

    public function test_the_other_line_types_are_still_accepted(): void
    {
        $landlord = User::factory()->create();
        $lease = $this->activeLease(landlord: $landlord);
        Sanctum::actingAs($landlord);

        foreach (['rent', 'charges', 'deposit', 'regularization', 'penalty'] as $type) {
            $this->postJson("/api/leases/{$lease->id}/payments", $this->line(['payment_type' => $type]))
                ->assertCreated();
        }
    }

    /** Écrire l'échéancier, c'est écrire des échéances de loyer : `payments.record`, comme la création. */
    public function test_generate_schedule_requires_payments_record(): void
    {
        $agency = Agency::factory()->create();
        $lease = $this->activeLease(agency: $agency);

        Sanctum::actingAs($this->agentWithout($agency, Capability::PaymentsRecord));
        $this->postJson("/api/leases/{$lease->id}/payments/generate-schedule")->assertForbidden();
        $this->assertSame(0, $lease->payments()->count());

        Sanctum::actingAs($this->agencyAgent($agency));
        $created = $this->postJson("/api/leases/{$lease->id}/payments/generate-schedule")
            ->assertOk()
            ->json('data.payments_created');
        $this->assertGreaterThan(0, $created);
    }
}
