<?php

namespace Tests\Feature\Api;

use App\Domain\Notifications\NotificationCode;
use App\Models\AppNotification;
use App\Models\Enums\Capability;
use App\Models\NotificationPreference;
use App\Models\PayoutMethod;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 (AC16) — une destination de paiement : chiffrée en base, masquée à l'agence, claire au
 * titulaire, vérifiée avant de servir, dé-vérifiée et signalée au titulaire quand elle change.
 */
class PayoutMethodTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const NUMBER = '+221 77 123 45 67';

    public function test_ac16_the_raw_columns_are_encrypted_and_no_activity_holds_the_number(): void
    {
        Notification::fake();
        $landlord = $this->landlordOf($this->moneyAgency());
        Sanctum::actingAs($landlord);

        $id = $this->postJson('/api/me/payout-methods', [
            'kind' => 'wave', 'account_identifier' => self::NUMBER, 'account_holder_name' => 'Awa Diop',
        ])->assertCreated()
            ->assertJsonPath('data.account_identifier', self::NUMBER)
            ->assertJsonPath('data.masked_identifier', '•••• 4567')
            ->assertJsonPath('data.verified', false)
            ->json('data.id');
        $this->patchJson("/api/me/payout-methods/{$id}", ['account_holder_name' => 'Awa N. Diop'])->assertOk();

        $raw = DB::table('payout_methods')->where('id', $id)->first();
        $this->assertNotSame(self::NUMBER, $raw->account_identifier);
        $this->assertStringNotContainsString('1234567', $raw->account_identifier);
        $this->assertNotSame('Awa N. Diop', $raw->account_holder_name);
        $this->assertSame(self::NUMBER, PayoutMethod::find($id)->account_identifier);

        foreach (Activity::all() as $activity) {
            $this->assertStringNotContainsString('1234567', json_encode($activity->toArray()));
            $this->assertStringNotContainsString('123 45 67', json_encode($activity->toArray()));
        }
    }

    public function test_ac16_the_agency_reads_the_masked_form_the_holder_the_clear_one(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $method = PayoutMethod::factory()->create(['user_id' => $landlord->id, 'account_identifier' => self::NUMBER, 'masked_identifier' => PayoutMethod::mask(self::NUMBER)]);

        Sanctum::actingAs($this->agencyAgent($agency));
        $row = $this->getJson("/api/payout-methods?filter[user_id]={$landlord->id}")->assertOk()->json('data.0');
        $this->assertSame('•••• 4567', $row['masked_identifier']);
        $this->assertArrayNotHasKey('account_identifier', $row);
        $this->assertArrayNotHasKey('account_holder_name', $row);

        // Une autre agence ne lit rien.
        Sanctum::actingAs($this->agencyAgent($this->moneyAgency()));
        $this->getJson("/api/payout-methods?filter[user_id]={$landlord->id}")->assertForbidden();

        Sanctum::actingAs($landlord);
        $this->getJson('/api/me/payout-methods')->assertOk()
            ->assertJsonPath('data.0.id', $method->id)
            ->assertJsonPath('data.0.account_identifier', self::NUMBER);
    }

    public function test_ac16_paying_by_wave_to_an_unverified_destination_is_refused(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $method = PayoutMethod::factory()->create(['user_id' => $landlord->id]);
        $agent = $this->agencyAgent($agency);
        Sanctum::actingAs($agent);
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord), 100_000);
        $id = $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id, 'lease_payment_ids' => [$rent->id], 'payout_method_id' => $method->id,
        ])->assertCreated()->json('data.id');
        $body = ['payment_method' => 'wave', 'transaction_id' => 'WAVE-1', 'payout_method_id' => $method->id];

        $this->postJson("/api/payouts/{$id}/mark-processed", $body)
            ->assertStatus(422)
            ->assertJsonPath('code', 'payout.unverified_destination');

        // Vérifiée par l'agence, elle sert ; la destination masquée est recopiée sur le reversement.
        $this->postJson("/api/payout-methods/{$method->id}/verify")->assertOk()->assertJsonPath('data.verified', true);
        $this->postJson("/api/payouts/{$id}/mark-processed", $body)->assertOk()
            ->assertJsonPath('data.destination_masked', $method->masked_identifier);
    }

    public function test_ac16_a_destination_of_another_holder_is_not_a_destination(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $foreign = PayoutMethod::factory()->verified()->create();
        Sanctum::actingAs($this->agencyAgent($agency));
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord), 100_000);
        $id = $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$rent->id]])
            ->assertCreated()->json('data.id');

        $this->postJson("/api/payouts/{$id}/mark-processed", [
            'payment_method' => 'wave', 'transaction_id' => 'WAVE-1', 'payout_method_id' => $foreign->id,
        ])->assertStatus(422);
    }

    /** ADR-0039 §6 — l'avis de changement de destination n'a pas d'interrupteur : couper tous les e-mails ne le coupe pas. */
    public function test_ac16_the_destination_change_notice_ignores_email_preferences(): void
    {
        Notification::fake();
        $landlord = $this->landlordOf($this->moneyAgency());
        foreach (PreferenceResolver::EVENTS as $event) {
            NotificationPreference::query()->updateOrCreate(
                ['user_id' => $landlord->id, 'event_type' => $event, 'channel' => PreferenceResolver::CHANNEL_EMAIL],
                ['enabled' => false],
            );
        }
        Sanctum::actingAs($landlord);

        $this->postJson('/api/me/payout-methods', [
            'kind' => 'wave', 'account_identifier' => '+221 77 123 45 67', 'account_holder_name' => 'Awa Ndiaye',
        ])->assertCreated();

        Notification::assertSentTo($landlord, CodedNotification::class, function ($n, array $channels): bool {
            return $n->code === NotificationCode::PayoutMethodAdded && in_array('mail', $channels, true);
        });
        $row = AppNotification::query()->where('user_id', $landlord->id)->where('code', 'payout_method.added')->sole();
        $this->assertStringContainsString('4567', $row->body);
        $this->assertStringNotContainsString('123 45', $row->body);
    }

    public function test_ac16_modifying_a_destination_unverifies_it_and_notifies_the_holder(): void
    {
        Notification::fake();
        $landlord = $this->landlordOf($this->moneyAgency());
        $method = PayoutMethod::factory()->verified()->create(['user_id' => $landlord->id]);
        Sanctum::actingAs($landlord);

        $this->patchJson("/api/me/payout-methods/{$method->id}", ['account_identifier' => '+221 78 000 11 22'])
            ->assertOk()
            ->assertJsonPath('data.verified', false)
            ->assertJsonPath('data.masked_identifier', '•••• 1122');

        Notification::assertSentTo($landlord, CodedNotification::class, function ($n, array $channels): bool {
            return $n->code === NotificationCode::PayoutMethodUpdated && in_array('mail', $channels, true);
        });

        $this->deleteJson("/api/me/payout-methods/{$method->id}")->assertNoContent();
        Notification::assertSentTo($landlord, CodedNotification::class, fn ($n): bool => $n->code === NotificationCode::PayoutMethodRemoved);
    }

    public function test_adding_a_destination_notifies_and_only_a_verified_phone_verifies_itself(): void
    {
        Notification::fake();
        $holder = User::factory()->create(['phone' => '+221771234567', 'phone_verified_at' => now()]);
        Sanctum::actingAs($holder);

        $this->postJson('/api/me/payout-methods', ['kind' => 'orange_money', 'account_identifier' => self::NUMBER])
            ->assertCreated()->assertJsonPath('data.verified', true);
        $this->postJson('/api/me/payout-methods', ['kind' => 'wave', 'account_identifier' => '+221 70 999 88 77'])
            ->assertCreated()->assertJsonPath('data.verified', false);
        Notification::assertSentToTimes($holder, CodedNotification::class, 2);

        $unverifiedPhone = User::factory()->create(['phone' => '+221771234567', 'phone_verified_at' => null]);
        Sanctum::actingAs($unverifiedPhone);
        $this->postJson('/api/me/payout-methods', ['kind' => 'wave', 'account_identifier' => self::NUMBER])
            ->assertCreated()->assertJsonPath('data.verified', false);
    }

    public function test_nobody_but_the_holder_modifies_and_nobody_verifies_its_own(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $method = PayoutMethod::factory()->create(['user_id' => $landlord->id]);

        Sanctum::actingAs($this->agencyAgent($agency));
        $this->patchJson("/api/me/payout-methods/{$method->id}", ['account_identifier' => '+221 78 000 11 22'])->assertForbidden();
        $this->deleteJson("/api/me/payout-methods/{$method->id}")->assertForbidden();

        Sanctum::actingAs($landlord);
        $this->postJson("/api/payout-methods/{$method->id}/verify")->assertForbidden();

        // Un agent d'une autre agence, ou sans `payouts.create`, ne vérifie pas.
        Sanctum::actingAs($this->agencyAgent($this->moneyAgency()));
        $this->postJson("/api/payout-methods/{$method->id}/verify")->assertForbidden();
        Sanctum::actingAs($this->agentWithout($agency, Capability::PayoutsCreate));
        $this->postJson("/api/payout-methods/{$method->id}/verify")->assertForbidden();

        $this->assertNull($method->fresh()->verified_at);
    }
}
