<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Notifications\Payouts\PayoutAwaitingApprovalNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 (AC6, AC6a, AC7) — les quatre yeux d'agence : un réglage que l'agence active, puis trois
 * gestes que trois mains distinctes tiennent — préparer, approuver, payer. Deux profils, deux
 * agences ou une seconde requête ne font pas une seconde personne.
 */
class PayoutApprovalTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    /** Un reversement d'un net donné : un loyer au taux 0, la commission ne le réduit pas. */
    private function createPayout(Agency $agency, User $landlord, int $net): int
    {
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), $net);

        return $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
        ])->assertCreated()->json('data.id');
    }

    private function pay(int $id, array $body = []): TestResponse
    {
        return $this->postJson("/api/payouts/{$id}/mark-processed", $body + [
            'payment_method' => 'check',
            'transaction_id' => 'CHQ-0042',
        ]);
    }

    public function test_ac6a_a_new_agency_has_no_threshold_and_its_issuer_pays_alone(): void
    {
        $agency = $this->moneyAgency();
        $this->assertNull($agency->fresh()->payout_approval_threshold);
        $landlord = $this->landlordOf($agency);
        $issuer = $this->agencyAdmin($agency);
        $this->agencyAdmin($agency);
        Sanctum::actingAs($issuer);

        $id = $this->createPayout($agency, $landlord, 150_000);
        $this->assertSame(PayoutStatus::Pending, Payout::find($id)->status);

        $this->pay($id)->assertOk()->assertJsonPath('data.processed_by_id', $issuer->id);

        // Le seuil posé, le même reversement préparé à nouveau attend une seconde main.
        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => 100_000])->assertOk();
        $again = $this->createPayout($agency, $landlord, 150_000);
        $this->assertSame(PayoutStatus::AwaitingApproval, Payout::find($again)->status);
        $this->pay($again)->assertStatus(422);
    }

    public function test_ac6a_an_agency_existing_before_the_migration_has_no_threshold(): void
    {
        // La colonne n'a pas de défaut et la migration ne remplit rien : une agence existante lit
        // `null` comme une agence neuve. Un défaut `0` mettrait TOUT reversement en attente.
        $this->assertNull(DB::selectOne(
            "select column_default from information_schema.columns where table_name = 'agencies' and column_name = 'payout_approval_threshold'"
        )->column_default);

        $id = DB::table('agencies')->insertGetId([
            'name' => 'Agence d’avant', 'slug' => 'agence-d-avant', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->assertNull(Agency::find($id)->payout_approval_threshold);
    }

    public function test_ac6_four_eyes_issuer_approver_and_payer_are_three_distinct_gestures(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $agency->forceFill(['payout_approval_threshold' => 100_000])->save();
        $landlord = $this->landlordOf($agency);
        $issuer = $this->agencyAdmin($agency);
        $approver = $this->agencyAdmin($agency);

        Sanctum::actingAs($issuer);
        $id = $this->createPayout($agency, $landlord, 150_000);
        $this->assertSame(PayoutStatus::AwaitingApproval, Payout::find($id)->status);
        Notification::assertSentTo($approver, PayoutAwaitingApprovalNotification::class);
        Notification::assertNotSentTo($issuer, PayoutAwaitingApprovalNotification::class);

        $this->pay($id)->assertStatus(422);
        $this->postJson("/api/payouts/{$id}/approve")->assertForbidden();
        $this->assertSame(PayoutStatus::AwaitingApproval, Payout::find($id)->status);

        Sanctum::actingAs($approver);
        $this->postJson("/api/payouts/{$id}/approve")->assertOk()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.approved_by_id', $approver->id);
        // L'approbation ne se rejoue pas.
        $this->postJson("/api/payouts/{$id}/approve")->assertStatus(422);
        $this->pay($id)->assertForbidden();

        Sanctum::actingAs($issuer);
        $this->pay($id, ['transaction_id' => null])->assertStatus(422);
        $this->pay($id)->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.processed_by_id', $issuer->id);

        // Sous le seuil : directement `pending`.
        $small = $this->createPayout($agency, $landlord, 50_000);
        $this->assertSame(PayoutStatus::Pending, Payout::find($small)->status);
    }

    public function test_ac6_the_issuer_does_not_approve_under_a_second_profile_in_another_agency(): void
    {
        // Deux profils ne font pas deux personnes : le préparateur qui est AUSSI admin d'une autre
        // agence n'approuve pas davantage (la règle compare les utilisateurs).
        $agency = $this->moneyAgency();
        $agency->forceFill(['payout_approval_threshold' => 100_000])->save();
        $landlord = $this->landlordOf($agency);
        $issuer = $this->agencyAdmin($agency);
        $this->agencyAdmin($agency);
        $here = AgencyAdminProfile::query()->where('user_id', $issuer->id)->firstOrFail();
        $elsewhere = AgencyAdminProfile::factory()->create(['user_id' => $issuer->id, 'agency_id' => $this->moneyAgency()->id]);
        Sanctum::actingAs($issuer);

        $id = $this->withHeaders(['X-Profile-Id' => "agency_admin:{$here->id}"])
            ->createPayout($agency, $landlord, 150_000);

        foreach ([$here, $elsewhere] as $profile) {
            $this->withHeaders(['X-Profile-Id' => "agency_admin:{$profile->id}"])
                ->postJson("/api/payouts/{$id}/approve")->assertForbidden();
        }
        $this->assertSame(PayoutStatus::AwaitingApproval, Payout::find($id)->status);
    }

    public function test_ac6_a_super_admin_issuer_does_not_approve_its_own_payout(): void
    {
        // `Gate::before` laisse le super-admin passer toute policy ; la séparation des tâches, non.
        $agency = $this->moneyAgency();
        $agency->forceFill(['payout_approval_threshold' => 100_000])->save();
        $landlord = $this->landlordOf($agency);
        $this->actingAsRole('super_admin');

        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 150_000);
        $id = $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'agency_id' => $agency->id,
            'lease_payment_ids' => [$rent->id],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/payouts/{$id}/approve")->assertForbidden();
    }

    public function test_an_amount_changed_after_approval_is_not_paid(): void
    {
        $agency = $this->moneyAgency();
        $agency->forceFill(['payout_approval_threshold' => 100_000])->save();
        $landlord = $this->landlordOf($agency);
        $issuer = $this->agencyAdmin($agency);
        $approver = $this->agencyAdmin($agency);
        Sanctum::actingAs($issuer);
        $id = $this->createPayout($agency, $landlord, 150_000);
        Sanctum::actingAs($approver);
        $this->postJson("/api/payouts/{$id}/approve")->assertOk();

        Payout::find($id)->forceFill(['net_amount' => 900_000])->saveQuietly();

        Sanctum::actingAs($issuer);
        $this->pay($id)->assertStatus(422);
        $this->assertSame(PayoutStatus::Pending, Payout::find($id)->status);
    }

    public function test_an_agent_without_payouts_approve_cannot_approve(): void
    {
        $agency = $this->moneyAgency();
        $agency->forceFill(['payout_approval_threshold' => 100_000])->save();
        $landlord = $this->landlordOf($agency);
        Sanctum::actingAs($this->agencyAdmin($agency));
        $id = $this->createPayout($agency, $landlord, 150_000);

        Sanctum::actingAs($this->agencyAgent($agency));
        $this->postJson("/api/payouts/{$id}/approve")->assertForbidden();

        // Un admin d'une AUTRE agence non plus.
        Sanctum::actingAs($this->agencyAdmin($this->moneyAgency()));
        $this->postJson("/api/payouts/{$id}/approve")->assertForbidden();
    }

    public function test_ac7_an_admin_who_is_the_landlord_cannot_approve_its_own_payout(): void
    {
        $agency = $this->moneyAgency();
        $agency->forceFill(['payout_approval_threshold' => 100_000])->save();
        $landlordAdmin = $this->agencyAdmin($agency);
        OwnerProfile::factory()->create(['user_id' => $landlordAdmin->id, 'agency_id' => $agency->id]);
        Sanctum::actingAs($this->agencyAdmin($agency));
        $id = $this->createPayout($agency, $landlordAdmin, 150_000);

        Sanctum::actingAs($landlordAdmin);
        $this->assertTrue($landlordAdmin->canActAt(Capability::PayoutsApprove, $agency));
        $this->postJson("/api/payouts/{$id}/approve")->assertForbidden();
        $this->assertSame(PayoutStatus::AwaitingApproval, Payout::find($id)->status);
    }
}
