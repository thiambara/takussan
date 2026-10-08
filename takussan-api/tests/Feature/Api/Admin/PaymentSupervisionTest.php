<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentProvider;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\IntegrationWebhookLog;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-602 (AC10) — la console « Paiements ». Le jeu est construit PAR LE CHEMIN RÉEL : les échecs
 * d'échéance viennent de webhooks `failed` traités par `applyEventToMatchingPayment` (l'échéance
 * reste `pending`, TCK-593), jamais d'une fabrique qui écrirait `status = failed`.
 */
class PaymentSupervisionTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    private const FAILED = 'checkout.session.payment_failed';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    public function test_summary_and_list_count_failures_by_last_failed_at_and_survive_a_new_attempt(): void
    {
        $spy = $this->spyDriver();
        $pending = ['status' => PaymentStatus::Pending, 'due_date' => now()->addDays(5)->toDateString(), 'late_fee_amount' => 0, 'late_fee_applied_at' => null];

        // Deux échéances Wave : un checkout chacune, puis l'échec de ce checkout.
        $a = $this->leaseDue(payment: $pending);
        $integrationA = Integration::query()->where('agency_id', $a['agency']->id)->firstOrFail();
        $b = $this->leaseDue(payment: $pending);
        $integrationB = Integration::query()->where('agency_id', $b['agency']->id)->firstOrFail();

        Sanctum::actingAs($a['tenant']);
        $this->postJson("/api/lease-payments/{$a['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();
        Sanctum::actingAs($b['tenant']);
        $this->postJson("/api/lease-payments/{$b['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();
        $this->waveWebhook('spy_txn_1', null, self::FAILED, $integrationA)->assertOk();
        $this->waveWebhook('spy_txn_2', null, self::FAILED, $integrationB)->assertOk();

        // L'une est ré-initiée : la nouvelle tentative ne doit pas effacer l'échec.
        Sanctum::actingAs($a['tenant']);
        $this->postJson("/api/lease-payments/{$a['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();
        $this->assertCount(3, $spy->calls);

        foreach ([$a['payment'], $b['payment']] as $payment) {
            $payment->refresh();
            $this->assertSame(PaymentStatus::Pending, $payment->status, 'TCK-593 : un échec laisse l\'échéance ouverte.');
            $this->assertNotNull($payment->metadata['gateway']['last_failed_at'] ?? null);
        }

        // Une réservation Wave en échec, par le même chemin.
        $booking = BookingPayment::factory()->create([
            'booking_id' => Booking::factory()->create([
                'property_id' => Property::factory()->create(['agency_id' => $a['agency']->id])->id,
                'customer_id' => Customer::factory()->create(['agency_id' => $a['agency']->id])->id,
                'agency_id' => $a['agency']->id,
                'currency' => Currency::XOF,
            ])->id,
            'amount' => 20000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Pending,
            'payment_type' => BookingPaymentType::Deposit,
        ]);
        app(PaymentGatewayService::class)->initiate($booking, PaymentProvider::Wave);
        $this->waveWebhook('spy_txn_4', null, self::FAILED, $integrationA)->assertOk();
        $this->assertSame(PaymentStatus::Failed, $booking->refresh()->status);

        // Une échéance Orange Money en retard.
        LeasePayment::factory()->create([
            'lease_id' => $b['lease']->id,
            'amount' => 80000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Late,
            'due_date' => now()->subDays(2)->toDateString(),
            'metadata' => ['gateway' => ['provider' => 'orange_money', 'transaction_id' => 'om_602']],
        ]);

        // Trois webhooks Wave authentifiés qui n'apparient rien.
        foreach (['inconnu_1', 'inconnu_2', 'inconnu_3'] as $txn) {
            $this->waveWebhook($txn, null, 'checkout.session.completed', $integrationB)->assertOk();
        }
        $this->assertSame(3, IntegrationWebhookLog::query()->where('matched_count', 0)->count());

        $this->actingAsRole('super_admin');
        $summary = $this->getJson('/api/admin/payments/summary')->assertOk()->json('data.last_7_days');
        $this->assertSame(['failed' => 3, 'late' => 0, 'unmatched' => 3], $summary['wave']);
        $this->assertSame(0, $summary['orange_money']['failed']);
        $this->assertSame(1, $summary['orange_money']['late']);

        $failed = $this->getJson('/api/admin/payments?filter[status]=failed')->assertOk()->json('data');
        $this->assertCount(3, $failed);
        $lease = collect($failed)->where('type', 'lease_payment');
        $this->assertEqualsCanonicalizing([$a['payment']->id, $b['payment']->id], $lease->pluck('id')->all());
        $this->assertSame(['pending'], $lease->pluck('status')->unique()->values()->all());
        $this->assertSame([$booking->id], collect($failed)->where('type', 'booking_payment')->pluck('id')->values()->all());

        $this->getJson('/api/admin/payments?filter[status]=late&filter[provider]=orange_money')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.reason', 'late');
        $this->getJson('/api/admin/payments?filter[status]=failed&filter[agency_id]='.$b['agency']->id)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $b['payment']->id);
        $this->getJson('/api/admin/payments?filter[status]=unknown')->assertStatus(422);
    }

    /** AC10 — un agent ou un admin d'agence : 403 sur les quatre routes. */
    public function test_agency_staff_is_forbidden_on_the_console_routes(): void
    {
        $log = IntegrationWebhookLog::query()->create(['provider' => 'wave', 'direction' => 'incoming', 'status' => 'processed', 'payload' => []]);
        foreach (['agent', 'agency_admin'] as $role) {
            $this->actingAsRole($role);
            foreach (['/api/admin/payments', '/api/admin/payments/summary', '/api/admin/webhook-logs', "/api/admin/webhook-logs/{$log->id}"] as $url) {
                $this->getJson($url)->assertForbidden();
            }
        }
    }
}
