<?php

namespace Tests\Feature\Payments;

use App\Contracts\Payments\PaymentDriverContract;
use App\Exceptions\ApiError;
use App\Models\Enums\PaymentProvider;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Services\Payments\Dto\CheckoutSession;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\PaymentStatus as DriverStatus;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * P65.02 (TCK-1075) — l'initiation d'un paiement en trois temps.
 *
 * L'appel au fournisseur (35 s au pire chez Orange Money, 60 s chez Lemon Squeezy) avait lieu dans
 * la transaction, sous le verrou de la ligne : la connexion restait ouverte, et le webhook comme la
 * vérification du même paiement attendaient. Désormais : réserver sous verrou (avec échéance),
 * appeler le fournisseur hors transaction, puis enregistrer sous verrou en revérifiant, comme
 * `verify()`.
 *
 * `RefreshDatabase` ouvre sa propre transaction : « hors transaction » se mesure donc par le niveau
 * de transaction pendant l'appel, comparé à celui d'avant la requête.
 */
class PaymentInitiationOutsideTransactionTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    /** Un pilote dont l'appel au fournisseur exécute `$pendant` (ce qui arrive pendant la latence). */
    private function driver(?\Closure $pendant = null): object
    {
        $driver = new class($pendant) implements PaymentDriverContract
        {
            public int $calls = 0;

            /** @var list<int> */
            public array $levels = [];

            public function __construct(public ?\Closure $pendant) {}

            public function initiate(Model $payment, int $amountCents, string $currency, array $meta = []): CheckoutSession
            {
                $this->calls++;
                $this->levels[] = DB::transactionLevel();
                if ($this->pendant !== null) {
                    $pendant = $this->pendant;
                    $this->pendant = null;
                    $pendant($payment);
                }

                return new CheckoutSession('https://pay.example/c/'.$this->calls, 'txn_'.$this->calls, 'wave');
            }

            public function verify(string $externalId): DriverStatus
            {
                return new DriverStatus(DriverStatus::PENDING, $externalId, []);
            }

            public function handleWebhook(Request $request): PaymentEvent
            {
                throw new \LogicException('non utilisé');
            }
        };

        $this->partialMock(PaymentGatewayService::class, fn ($mock) => $mock->shouldReceive('driverFor')->andReturn($driver));

        return $driver;
    }

    private function initiate(int $paymentId)
    {
        return $this->postJson("/api/lease-payments/{$paymentId}/initiate", ['provider' => 'wave']);
    }

    public function test_le_fournisseur_est_appele_hors_de_la_transaction(): void
    {
        $ctx = $this->leaseDue();
        $driver = $this->driver();
        Sanctum::actingAs($ctx['tenant']);
        $base = DB::transactionLevel();

        $this->initiate($ctx['payment']->id)->assertOk()->assertJsonPath('data.transaction_id', 'txn_1');

        $this->assertSame([$base], $driver->levels, 'Le fournisseur est appelé dans la transaction de l\'initiation.');
        $gateway = $ctx['payment']->refresh()->metadata['gateway'];
        $this->assertSame('txn_1', $gateway['transaction_id']);
        $this->assertArrayNotHasKey('initiating', $gateway, 'La réservation survit à l\'enregistrement.');
    }

    public function test_pendant_l_appel_la_ligne_porte_la_reservation_et_une_seconde_initiation_est_refusee(): void
    {
        $ctx = $this->leaseDue();
        $seen = [];
        $driver = $this->driver(function (Model $payment) use (&$seen): void {
            $seen['initiating'] = LeasePayment::query()->findOrFail($payment->getKey())->metadata['gateway']['initiating'] ?? null;
            try {
                app(PaymentGatewayService::class)->initiate(LeasePayment::query()->findOrFail($payment->getKey()), PaymentProvider::Wave);
                $seen['second'] = 'accepted';
            } catch (ApiError $e) {
                $seen['second'] = $e->getStatusCode().' '.$e->errorCode;
                $seen['checkout'] = $e->extra['checkout'] ?? null;
            }
        });
        Sanctum::actingAs($ctx['tenant']);

        $this->initiate($ctx['payment']->id)->assertOk()->assertJsonPath('data.transaction_id', 'txn_1');

        $this->assertSame(1, $driver->calls, 'Une seconde initiation pendant l\'appel a ouvert un second checkout.');
        $this->assertSame('409 payment.checkout_in_progress', $seen['second']);
        $this->assertSame('wave', $seen['initiating']['provider'] ?? null);
        $this->assertEqualsWithDelta(150_000, $seen['checkout']['amount'] ?? null, 0.001);
        $this->assertNotEmpty($seen['initiating']['expires_at'] ?? null);
    }

    public function test_un_paiement_regle_pendant_l_appel_n_enregistre_pas_le_checkout(): void
    {
        $ctx = $this->leaseDue();
        $this->driver(function (Model $payment): void {
            LeasePayment::query()->whereKey($payment->getKey())->update(['status' => PaymentStatus::Paid->value, 'paid_at' => now()]);
        });
        Sanctum::actingAs($ctx['tenant']);

        $this->initiate($ctx['payment']->id)->assertStatus(409)->assertJsonPath('code', 'payment.not_payable');

        $payment = $ctx['payment']->refresh();
        $this->assertNotSame('txn_1', $payment->transaction_id, 'Le checkout d\'un paiement réglé entre-temps a été enregistré.');
        $this->assertArrayNotHasKey('initiating', $payment->metadata['gateway'] ?? []);
    }

    public function test_un_echec_du_fournisseur_libere_la_reservation(): void
    {
        $ctx = $this->leaseDue();
        $driver = $this->driver(function (): void {
            throw new ApiError(502, 'payment.provider_unavailable');
        });
        Sanctum::actingAs($ctx['tenant']);

        $this->initiate($ctx['payment']->id)->assertStatus(502);
        $this->assertArrayNotHasKey('initiating', $ctx['payment']->refresh()->metadata['gateway'] ?? []);

        $this->initiate($ctx['payment']->id)->assertOk()->assertJsonPath('data.transaction_id', 'txn_2');
        $this->assertSame(2, $driver->calls);
    }

    public function test_une_reservation_echue_ne_bloque_plus(): void
    {
        $ctx = $this->leaseDue();
        $driver = $this->driver();
        $meta = $ctx['payment']->metadata ?? [];
        $meta['gateway'] = ['initiating' => [
            'provider' => 'wave',
            'amount' => 157_500,
            'reserved_at' => now()->subMinutes(10)->toIso8601String(),
            'expires_at' => now()->subMinutes(8)->toIso8601String(),
            'token' => 'ancien',
        ]];
        $ctx['payment']->forceFill(['metadata' => $meta])->saveQuietly();
        Sanctum::actingAs($ctx['tenant']);

        $this->initiate($ctx['payment']->id)->assertOk()->assertJsonPath('data.transaction_id', 'txn_1');
        $this->assertSame(1, $driver->calls);
    }
}
