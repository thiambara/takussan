<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Payout;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PayoutTest extends TestCase
{
    use RefreshDatabase;

    public function test_agency_user_can_create_payout(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create(['agency_id' => $agency->id]);
        $landlord = User::factory()->create(['agency_id' => $agency->id]);

        Sanctum::actingAs($agent);

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'gross_amount' => 1000000,
            'commission_amount' => 100000,
            'fees_amount' => 5000,
        ])->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.gross_amount', 1000000)
            ->assertJsonPath('data.commission_amount', 100000)
            ->assertJsonPath('data.net_amount', 895000);
    }

    public function test_scheduled_payout_gets_scheduled_status(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create(['agency_id' => $agency->id]);
        $landlord = User::factory()->create(['agency_id' => $agency->id]);

        Sanctum::actingAs($agent);

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'gross_amount' => 500000,
            'scheduled_at' => now()->addDays(5)->toISOString(),
        ])->assertCreated()
            ->assertJsonPath('data.status', 'scheduled');
    }

    public function test_non_agency_user_cannot_create_payout(): void
    {
        $user = User::factory()->create(['agency_id' => null]);
        $landlord = User::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'gross_amount' => 100000,
        ])->assertForbidden();
    }

    public function test_agency_user_cannot_create_payout_for_foreign_landlord(): void
    {
        $agency1 = Agency::factory()->create();
        $agency2 = Agency::factory()->create();
        $agent = User::factory()->create(['agency_id' => $agency1->id]);
        $landlord = User::factory()->create(['agency_id' => $agency2->id]);

        Sanctum::actingAs($agent);

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'gross_amount' => 100000,
        ])->assertForbidden();
    }

    public function test_negative_net_amount_returns_422(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create(['agency_id' => $agency->id]);
        $landlord = User::factory()->create(['agency_id' => $agency->id]);

        Sanctum::actingAs($agent);

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'gross_amount' => 100000,
            'commission_amount' => 200000,
        ])->assertStatus(422);
    }

    public function test_landlord_can_view_own_payout(): void
    {
        $landlord = User::factory()->create();
        $payout = Payout::factory()->create(['landlord_id' => $landlord->id]);

        Sanctum::actingAs($landlord);

        $this->getJson("/api/payouts/{$payout->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $payout->id);
    }

    public function test_landlord_cannot_manage_own_payout(): void
    {
        $landlord = User::factory()->create();
        $payout = Payout::factory()->create(['landlord_id' => $landlord->id]);

        Sanctum::actingAs($landlord);

        $this->postJson("/api/payouts/{$payout->id}/mark-processed")
            ->assertForbidden();
    }

    public function test_issuer_can_mark_processed(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create(['agency_id' => $agency->id]);
        $payout = Payout::factory()->create([
            'issued_by_id' => $agent->id,
            'agency_id' => $agency->id,
        ]);

        Sanctum::actingAs($agent);

        $this->postJson("/api/payouts/{$payout->id}/mark-processed", [
            'transaction_id' => 'TX-123',
        ])->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.transaction_id', 'TX-123');
    }

    public function test_cannot_mark_processed_if_completed(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create(['agency_id' => $agency->id]);
        $payout = Payout::factory()->completed()->create([
            'issued_by_id' => $agent->id,
            'agency_id' => $agency->id,
        ]);

        Sanctum::actingAs($agent);

        $this->postJson("/api/payouts/{$payout->id}/mark-processed")
            ->assertStatus(422);
    }

    public function test_issuer_can_mark_failed(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create(['agency_id' => $agency->id]);
        $payout = Payout::factory()->create([
            'issued_by_id' => $agent->id,
            'agency_id' => $agency->id,
        ]);

        Sanctum::actingAs($agent);

        $this->postJson("/api/payouts/{$payout->id}/mark-failed", [
            'failed_reason' => 'Bank rejected',
        ])->assertOk()
            ->assertJsonPath('data.status', 'failed')
            ->assertJsonPath('data.failed_reason', 'Bank rejected');
    }

    public function test_cannot_cancel_completed_payout(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create(['agency_id' => $agency->id]);
        $payout = Payout::factory()->completed()->create([
            'issued_by_id' => $agent->id,
            'agency_id' => $agency->id,
        ]);

        Sanctum::actingAs($agent);

        $this->postJson("/api/payouts/{$payout->id}/cancel")
            ->assertStatus(422);
    }

    public function test_list_is_scoped_to_landlord(): void
    {
        $landlord = User::factory()->create();
        Payout::factory()->count(3)->create(['landlord_id' => $landlord->id]);
        Payout::factory()->count(2)->create();

        Sanctum::actingAs($landlord);

        $this->getJson('/api/payouts')
            ->assertOk()
            ->assertJsonPath('meta.total', 3);
    }
}
