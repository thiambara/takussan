<?php

namespace Tests\Feature\Api\Me;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\PlatformPayout;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 (AC11, AC18 côté API) — ce que la plateforme reverse à l'agence se lit avec
 * `agency.update_billing`. Avant : tout profil de l'agence le lisait, bailleur compris.
 */
class MePlatformPayoutAccessTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_ac11_owner_and_agent_profiles_get_403_the_admin_200(): void
    {
        $agency = Agency::factory()->create();
        $mine = PlatformPayout::factory()->create(['agency_id' => $agency->id]);

        Sanctum::actingAs(User::factory()->withOwnerProfile($agency)->create());
        $this->getJson('/api/me/payouts')->assertForbidden();

        Sanctum::actingAs($this->agencyAgent($agency));
        $this->getJson('/api/me/payouts')->assertForbidden();

        Sanctum::actingAs($this->agencyAdmin($agency));
        $this->getJson('/api/me/payouts')->assertOk()->assertJsonPath('data.0.id', $mine->id);
    }

    public function test_the_capability_is_read_not_the_role(): void
    {
        $agency = Agency::factory()->create();
        PlatformPayout::factory()->create(['agency_id' => $agency->id]);

        Sanctum::actingAs($this->adminWithout($agency, Capability::AgencyUpdateBilling));
        $this->getJson('/api/me/payouts')->assertForbidden();

        Sanctum::actingAs($this->agentWith($agency, Capability::AgencyUpdateBilling));
        $this->getJson('/api/me/payouts')->assertOk();
    }

    public function test_ac18_the_admin_of_an_individual_agency_reads_its_platform_payouts(): void
    {
        $host = Agency::factory()->individual()->create();
        $payout = PlatformPayout::factory()->create(['agency_id' => $host->id]);

        Sanctum::actingAs($this->agencyAdmin($host));
        $this->getJson('/api/me/payouts')->assertOk()->assertJsonPath('data.0.id', $payout->id);
    }

    // ─── P141.03 (TCK-1419) ─────────────────────────────────────

    public function test_l_agence_lit_ce_que_couvre_un_reversement(): void
    {
        $agency = Agency::factory()->create();
        $payout = PlatformPayout::factory()->create(['agency_id' => $agency->id, 'currency' => 'XOF']);
        $lease = Lease::factory()->create(['agency_id' => $agency->id, 'currency' => 'XOF']);
        foreach ([150_000, 100_000] as $amount) {
            LeasePayment::factory()->create([
                'lease_id' => $lease->id,
                'amount' => $amount,
                'currency' => 'XOF',
                'status' => PaymentStatus::Paid,
                'paid_at' => '2026-04-10 10:00:00',
                'platform_fee_pct_at_payment' => 5,
                'platform_payout_id' => $payout->id,
            ]);
        }

        Sanctum::actingAs($this->agencyAdmin($agency));
        $this->getJson("/api/me/payouts/{$payout->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $payout->id)
            ->assertJsonPath('data.breakdown.lease.count', 2)
            ->assertJsonPath('data.breakdown.lease.gross', 250000)
            ->assertJsonPath('data.breakdown.lease.fees', 12500)
            ->assertJsonPath('data.breakdown.booking.count', 0);
    }

    public function test_un_reversement_se_lit_sous_la_meme_garde_et_dans_sa_seule_agence(): void
    {
        $agency = Agency::factory()->create();
        $mine = PlatformPayout::factory()->create(['agency_id' => $agency->id]);
        $theirs = PlatformPayout::factory()->create(['agency_id' => Agency::factory()->create()->id]);

        Sanctum::actingAs($this->agencyAgent($agency));
        $this->getJson("/api/me/payouts/{$mine->id}")->assertForbidden();

        Sanctum::actingAs($this->agencyAdmin($agency));
        $this->getJson("/api/me/payouts/{$theirs->id}")->assertNotFound();
    }
}
