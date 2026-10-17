<?php

namespace Tests\Feature\Services\Sms;

use App\Models\Agency;
use App\Models\Integration;
use App\Services\Notifications\Sms\IntegrationLocator;
use App\Services\Notifications\Sms\SmsRouterDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * TCK-765 (P11.06) — le compte SMS d'une agence retombe sur l'intégration
 * de la plateforme, et une intégration activée prend effet au job suivant
 * du worker (le localisateur et ses consommateurs sont `scoped`, oubliés
 * entre deux jobs par `forgetScopedInstances()`).
 */
class IntegrationLocatorTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        config()->set('sms.webhook_url_token', 'tck-765-test-token');
    }

    private function makeIntegration(string $provider, ?int $agencyId, array $credentials = []): Integration
    {
        return Integration::create([
            'provider' => $provider,
            'agency_id' => $agencyId,
            'credentials' => array_merge([
                'client_id' => 'cid',
                'client_secret' => 'csec',
                'sender_address' => 'tel:+221771111111',
                'accountid' => 'lam-acc',
                'password' => 'lam-pass',
                'sender_id' => 'TAKUSSAN',
            ], $credentials),
            'metadata' => [],
            'is_active' => true,
        ]);
    }

    public function test_agency_without_its_own_integration_falls_back_to_the_platform_one(): void
    {
        $platform = $this->makeIntegration('sms_lafricamobile', null);

        $this->assertTrue($platform->is(app(IntegrationLocator::class)->find($this->agency->id, 'sms_lafricamobile')));

        Http::preventStrayRequests();
        Http::fake(['lampush*' => Http::response(['push_id' => 'lam-plateforme'], 200)]);

        $result = app(SmsRouterDriver::class)->send('+221771234567', 'bonjour', [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
        ])['+221771234567'];

        $this->assertSame('lafricamobile', $result->provider);
        $this->assertSame('sent', $result->status);
    }

    public function test_the_agency_integration_wins_over_the_platform_one(): void
    {
        $this->makeIntegration('sms_lafricamobile', null);
        $own = $this->makeIntegration('sms_lafricamobile', $this->agency->id);

        $this->assertTrue($own->is(app(IntegrationLocator::class)->find($this->agency->id, 'sms_lafricamobile')));
    }

    public function test_an_integration_activated_between_two_jobs_is_used_by_the_next_one(): void
    {
        $this->makeIntegration('sms_lafricamobile', null);

        Http::preventStrayRequests();
        Http::fake([
            'api.orange.com/oauth/*' => Http::response(['access_token' => 't', 'expires_in' => 3600]),
            'api.orange.com/smsmessaging/*' => Http::response([
                'outboundSMSMessageRequest' => ['resourceURL' => 'https://api.orange.com/r/1'],
            ], 201),
            'lampush*' => Http::response(['push_id' => 'lam-1'], 200),
        ]);
        $context = ['agency_id' => null, 'is_critical' => true];

        $first = app(SmsRouterDriver::class)->send('+221771234567', 'bonjour', $context)['+221771234567'];
        $this->assertSame('lafricamobile', $first->provider);

        $this->makeIntegration('sms_orange', null);
        // Ce que fait le worker entre deux jobs (QueueServiceProvider, `resetScope`).
        $this->app->forgetScopedInstances();

        $second = app(SmsRouterDriver::class)->send('+221771234567', 'bonjour', $context)['+221771234567'];
        $this->assertSame('orange', $second->provider);
    }
}
