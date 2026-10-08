<?php

namespace Tests\Feature\Services;

use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\Setting;
use App\Models\User;
use App\Services\Lease\LeaseRenewalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-596 (AC19, §4A) — un renouvellement qui naît `active` produit son échéancier, sans clic.
 * `LeaseRenewalService` n'émettait rien : le bail renouvelé restait sans échéance, donc sans
 * relance ni pénalité, tant que personne ne cliquait « générer l'échéancier ».
 */
class LeaseRenewalScheduleTest extends TestCase
{
    use RefreshDatabase;

    private function parent(): Lease
    {
        $landlord = User::factory()->create();

        $parent = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'property_id' => Property::factory()->create(['user_id' => $landlord->id])->id,
            'tenant_id' => Customer::factory()->create()->id,
            'start_date' => '2025-11-01',
            'end_date' => '2026-10-31',
            'monthly_rent' => 250_000,
            'payment_frequency' => PaymentFrequency::Monthly,
            'payment_day' => 1,
        ]);
        $parent->payments()->create([
            'reference_number' => 'LP-PARENT-1',
            'payer_id' => $parent->tenant_id,
            'payment_type' => 'rent',
            'amount' => 250_000,
            'currency' => 'XOF',
            'status' => PaymentStatus::Paid,
            'due_date' => '2025-11-01',
            'period_start' => '2025-11-01',
            'period_end' => '2025-11-30',
        ]);

        return $parent;
    }

    private function renew(Lease $parent): Lease
    {
        return app(LeaseRenewalService::class)->renew($parent, [
            'start_date' => '2026-11-01',
            'end_date' => '2027-10-31',
        ]);
    }

    public function test_an_active_renewal_gets_twelve_pending_monthly_payments(): void
    {
        $parent = $this->parent();

        $child = $this->renew($parent);

        $this->assertSame(LeaseStatus::Active, $child->status);
        $payments = $child->payments()->orderBy('due_date')->get();
        $this->assertCount(12, $payments);
        $this->assertTrue($payments->every(fn ($p) => $p->status === PaymentStatus::Pending));
        $this->assertTrue($payments->every(fn ($p) => (float) $p->amount === 250000.0));
        $this->assertSame('2026-11-01', $payments->first()->due_date->toDateString());
        $this->assertSame('2027-10-01', $payments->last()->due_date->toDateString());
        $this->assertSame(1, $parent->payments()->count(), 'le parent garde les siennes, rien de plus');
    }

    public function test_a_renewal_waiting_for_signature_gets_no_schedule(): void
    {
        Setting::query()->create(['key' => 'lease.require_signature', 'value' => true]);
        $parent = $this->parent();

        $child = $this->renew($parent);

        $this->assertSame(LeaseStatus::PendingSignature, $child->status);
        $this->assertSame(0, $child->payments()->count());
    }
}
