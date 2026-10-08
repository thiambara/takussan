<?php

namespace Tests\Feature\Notifications;

use App\Events\Lease\LeasePaymentLateFeeApplied;
use App\Http\Resources\LeasePaymentResource;
use App\Models\Customer;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Notifications\LeasePaymentLateFeeNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

class LeasePaymentLateFeeNotificationTest extends TestCase
{
    use LeaseDueFixture;
    use RefreshDatabase;

    public function test_event_triggers_notification_to_tenant_user(): void
    {
        Notification::fake();

        [$payment, $tenantUser] = $this->scaffold();

        event(new LeasePaymentLateFeeApplied($payment, 5000.0, 5.0, 100_000.0));

        Notification::assertSentTo($tenantUser, LeasePaymentLateFeeNotification::class);
    }

    public function test_via_respects_email_preference_off(): void
    {
        [$payment, $tenantUser] = $this->scaffold();

        NotificationPreference::updateOrCreate(
            [
                'user_id' => $tenantUser->id,
                'event_type' => LeasePaymentLateFeeNotification::EVENT_TYPE,
                'channel' => 'email',
            ],
            ['enabled' => false],
        );

        $notification = new LeasePaymentLateFeeNotification($payment, 5000.0, 5.0, 100_000.0);
        $channels = $notification->via($tenantUser);

        $this->assertContains('database', $channels);
        $this->assertNotContains('mail', $channels);
    }

    public function test_via_includes_email_by_default(): void
    {
        [$payment, $tenantUser] = $this->scaffold();

        $channels = (new LeasePaymentLateFeeNotification($payment, 5000.0, 5.0, 100_000.0))->via($tenantUser);

        $this->assertContains('database', $channels);
        $this->assertContains('mail', $channels);
    }

    /**
     * TCK-593 (AC10) — notification = écran. Réglage désactivé : la notification dit « à régler
     * auprès de votre agence » et porte le même `late_fee_payable_online` que la ressource.
     */
    public function test_la_penalite_a_regler_a_l_agence_quand_le_reglage_est_desactive(): void
    {
        $this->assertNotificationMatchesResource(['late_fee_online_collection' => false], false, 'à régler auprès de votre agence');
    }

    /** AC10 — réglage activé : « ajoutée au montant de votre paiement en ligne ». */
    public function test_la_penalite_ajoutee_au_paiement_en_ligne_quand_le_reglage_est_active(): void
    {
        $this->assertNotificationMatchesResource(['late_fee_online_collection' => true], true, 'ajoutée au montant de votre paiement en ligne');
    }

    private function assertNotificationMatchesResource(array $settings, bool $expected, string $phrase): void
    {
        app()->setLocale('fr');
        Notification::fake();
        $ctx = $this->leaseDue($settings);

        event(new LeasePaymentLateFeeApplied($ctx['payment'], 7500.0, 5.0, 150_000.0));

        $resource = LeasePaymentResource::make($ctx['payment']->fresh())->toArray(Request::create('/'));
        $this->assertSame($expected, $resource['late_fee_payable_online']);

        Notification::assertSentTo($ctx['tenant'], LeasePaymentLateFeeNotification::class, function ($notification) use ($ctx, $resource, $phrase, $expected): bool {
            $array = $notification->toArray($ctx['tenant']);
            $mail = implode("\n", $notification->toMail($ctx['tenant'])->introLines);
            $other = $expected ? 'à régler auprès de votre agence' : 'ajoutée au montant de votre paiement en ligne';

            return $array['late_fee_payable_online'] === $resource['late_fee_payable_online']
                && str_contains($mail, $phrase)
                && ! str_contains($mail, $other);
        });
    }

    /**
     * @return array{0: LeasePayment, 1: User}
     */
    private function scaffold(): array
    {
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create([
            'tenant_id' => $tenant->id,
            'late_fee_percent' => 5,
            'late_fee_grace_days' => 0,
        ]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $tenant->id,
            'amount' => 100_000,
            'status' => PaymentStatus::Late,
            'late_fee_amount' => 5000,
            'late_fee_applied_at' => now(),
        ]);

        return [$payment->fresh(), $tenantUser];
    }
}
