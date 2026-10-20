<?php

namespace Tests\Feature\Payments;

use App\Models\Integration;
use App\Models\LeasePayment;
use App\Services\Payments\Drivers\OrangeMoneyDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-1021 (P65.03) — un fournisseur qui ne répond pas (délai dépassé, connexion refusée) est un
 * fournisseur indisponible : 502 `payment.provider_unavailable`, comme une réponse en erreur, et
 * non la 500 générique d'une `ConnectionException` sortie du pilote. Le journal garde la forme sûre
 * de l'exception (`SafeExceptionContext`) : ni le message de cURL, ni l'URL appelée, qui porte pour
 * Wave l'identifiant de la session de paiement.
 */
class PaymentDriverConnectionFailureTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    private const CURL = 'cURL error 28: Operation timed out for https://api.wave.com/v1/checkout/sessions/txn_conn';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Cache::flush();
    }

    /** @return array<string, array{string, string, bool, string}>  le jeton d'Orange est-il rendu ? */
    public static function calls(): array
    {
        return [
            'wave, initiation' => ['wave', 'initiate', false, '[wave] checkout unreachable'],
            'wave, vérification' => ['wave', 'verify', false, '[wave] verify unreachable'],
            'orange money, jeton à l\'initiation' => ['orange_money', 'initiate', false, '[orange-money] oauth unreachable'],
            'orange money, initiation' => ['orange_money', 'initiate', true, '[orange-money] checkout unreachable'],
            'orange money, jeton à la vérification' => ['orange_money', 'verify', false, '[orange-money] oauth unreachable'],
            'orange money, vérification' => ['orange_money', 'verify', true, '[orange-money] verify unreachable'],
        ];
    }

    #[DataProvider('calls')]
    public function test_a_connection_failure_is_a_provider_unavailable(string $provider, string $action, bool $oauthAnswers, string $logMessage): void
    {
        Log::spy();
        Http::fake(fn (Request $request) => $oauthAnswers && str_contains($request->url(), '/oauth/v3/token')
            ? Http::response(['access_token' => 'om_oauth', 'expires_in' => 3600])
            : Http::failedConnection(self::CURL)($request));
        $ctx = $this->leaseDue();
        Integration::factory()->create([
            'agency_id' => $ctx['agency']->id,
            'provider' => 'orange_money',
            'is_active' => true,
            'credentials' => array_fill_keys(OrangeMoneyDriver::CREDENTIAL_KEYS, 'x'),
        ]);
        $this->actingAs($ctx['tenant'], 'sanctum');

        $response = $this->hit($ctx['payment'], $provider, $action);

        $response->assertStatus(502)->assertJsonPath('code', 'payment.provider_unavailable');
        $this->assertStringNotContainsString('cURL', $response->getContent());
        $this->assertStringNotContainsString('txn_conn', $response->getContent());

        Log::shouldHaveReceived('warning')->withArgs(fn (string $m, array $c = []) => $m === $logMessage
            && ($c['exception'] ?? null) === ConnectionException::class
            && isset($c['trace'])
            && ! str_contains((string) json_encode($c), 'txn_conn')
            && ! str_contains((string) json_encode($c), 'cURL'))->once();
    }

    private function hit(LeasePayment $payment, string $provider, string $action): TestResponse
    {
        $path = "/api/lease-payments/{$payment->id}";
        if ($action === 'initiate') {
            return $this->postJson("{$path}/initiate", ['provider' => $provider]);
        }

        DB::table('lease_payments')->where('id', $payment->id)->update([
            'transaction_id' => 'txn_conn',
            'metadata' => json_encode(['gateway' => ['provider' => $provider, 'transaction_id' => 'txn_conn']]),
        ]);

        return $this->getJson("{$path}/verify");
    }
}
