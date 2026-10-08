<?php

namespace Tests\Support;

use App\Contracts\Payments\PaymentDriverContract;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Payments\Drivers\WaveDriver;
use App\Services\Payments\Dto\CheckoutSession;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\PaymentStatus as DriverStatus;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * TCK-593 — l'échéance des critères d'acceptation : 150 000 XOF, pénalité de 7 500 appliquée et
 * non réglée, statut `late`, sur un bail d'agence dont le locataire a un compte, plus une
 * intégration Wave active sur cette agence.
 *
 * Partagée par les tests d'initiation, de webhook, de ressource et d'historique : l'AC3 compare la
 * MÊME échéance sous les deux réglages, et chaque classe la reconstruisait sinon à sa façon.
 */
trait LeaseDueFixture
{
    protected string $waveSecret = 'wave_secret_593';

    /**
     * @param  array<string, mixed>|null  $settings  `settings` de l'agence (`null` = agence neuve)
     * @param  array<string, mixed>  $payment
     * @return array{agency: Agency, lease: Lease, payment: LeasePayment, tenant: User, agent: User}
     */
    protected function leaseDue(?array $settings = null, array $payment = []): array
    {
        $agency = Agency::factory()->create(['currency' => Currency::XOF, 'settings' => $settings]);
        $agent = User::factory()->withAgentProfile($agency)->create();
        $tenant = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $tenant->id]);

        $lease = Lease::factory()->create([
            'agency_id' => $agency->id,
            'tenant_id' => $customer->id,
            'status' => LeaseStatus::Active,
            'currency' => Currency::XOF,
            'late_fee_percent' => 5,
            'late_fee_grace_days' => 0,
        ]);

        $row = LeasePayment::factory()->create(array_merge([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
            'amount' => 150_000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Late,
            'due_date' => now()->subDays(10)->toDateString(),
            'late_fee_amount' => 7_500,
            'late_fee_applied_at' => now()->subDay(),
            'late_fee_paid_at' => null,
        ], $payment));

        Integration::factory()->create([
            'agency_id' => $agency->id,
            'provider' => 'wave',
            'is_active' => true,
            'credentials' => ['api_key' => 'wave_key', 'webhook_secret' => $this->waveSecret],
        ]);

        return ['agency' => $agency, 'lease' => $lease, 'payment' => $row->fresh(), 'tenant' => $tenant, 'agent' => $agent];
    }

    /**
     * Remplace le pilote par un espion : chaque `initiate()` est enregistré avec le montant ENTIER
     * ×100 que le service lui transmet (principe n°3), sans appel réseau. Les identifiants de
     * transaction valent `spy_txn_1`, `spy_txn_2`… dans l'ordre des initiations.
     */
    protected function spyDriver(): object
    {
        $spy = new class implements PaymentDriverContract
        {
            /** @var list<array{payment_id: int, amount_cents: int, currency: string, meta: array<string, mixed>}> */
            public array $calls = [];

            /** TCK-602 — ce que `verify()` répond : `pending` par défaut. */
            public string $verifyStatus = DriverStatus::PENDING;

            /** VERIF-602 M1 — ce qui se passe PENDANT l'appel au fournisseur (un webhook qui arrive). */
            public ?\Closure $onVerify = null;

            public bool $verified = false;

            public function initiate(Model $payment, int $amountCents, string $currency, array $meta = []): CheckoutSession
            {
                // TCK-602 — `meta` aussi : les URLs de retour que le service transmet au pilote.
                $this->calls[] = ['payment_id' => (int) $payment->getKey(), 'amount_cents' => $amountCents, 'currency' => $currency, 'meta' => $meta];

                return new CheckoutSession('https://pay.example/c/'.count($this->calls), 'spy_txn_'.count($this->calls), 'wave');
            }

            public function verify(string $externalId): DriverStatus
            {
                if ($this->onVerify !== null) {
                    ($this->onVerify)();
                }
                $this->verified = true;

                return new DriverStatus($this->verifyStatus, $externalId, []);
            }

            /** Le webhook, lui, passe par le vrai pilote Wave : signature comprise. */
            public function handleWebhook(Request $request): PaymentEvent
            {
                $integration = Integration::query()->where('provider', 'wave')->where('is_active', true)->firstOrFail();

                return (new WaveDriver($integration))->handleWebhook($request);
            }
        };

        $this->partialMock(PaymentGatewayService::class, function ($mock) use ($spy): void {
            $mock->shouldReceive('driverFor')->andReturn($spy);
        });

        return $spy;
    }

    /**
     * Envoie un webhook Wave signé `checkout.session.completed` (ou `…failed`), sur l'URL de
     * l'intégration Wave de `leaseDue()` — la dernière créée (TCK-293, ADR-0046 : une URL par
     * intégration), ou celle qu'on désigne.
     */
    protected function waveWebhook(string $transactionId, ?int $amount, string $type = 'checkout.session.completed', ?Integration $integration = null)
    {
        $integration ??= Integration::query()->where('provider', 'wave')->where('is_active', true)->latest('id')->firstOrFail();

        $data = ['id' => $transactionId];
        if ($amount !== null) {
            $data += ['amount' => (string) $amount, 'currency' => 'XOF'];
        }
        $payload = ['type' => $type, 'data' => $data];
        $body = json_encode($payload);
        $ts = time();
        $sig = 't='.$ts.',v1='.hash_hmac('sha256', $ts.'.'.$body, $this->waveSecret);

        return $this->call('POST', '/api/webhooks/payments/wave/'.$integration->webhook_token, $payload, [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_WAVE_SIGNATURE' => $sig,
        ], $body);
    }
}
