<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Integration;
use App\Models\User;
use App\Services\Payments\Drivers\OrangeMoneyDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-602 (ADR-0051 §3, AC25) — une intégration de paiement ne s'enregistre qu'avec les
 * identifiants que son pilote lit ; un fournisseur inconnu du registre est refusé.
 */
class IntegrationStoreValidationTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): array
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->withTwoFactor()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);
        Sanctum::actingAs($admin);

        return [$agency, $admin];
    }

    public function test_a_wave_integration_without_its_webhook_secret_is_refused(): void
    {
        $this->admin();

        $this->postJson('/api/integrations', [
            'provider' => 'wave',
            'credentials' => ['api_key' => 'k', 'api_secret' => 's'],
        ])->assertStatus(422)->assertJsonValidationErrors(['credentials.webhook_secret']);

        $this->postJson('/api/integrations', [
            'provider' => 'inconnu',
            'credentials' => ['api_key' => 'k'],
        ])->assertStatus(422)->assertJsonValidationErrors(['provider']);

        $this->assertSame(0, Integration::query()->count());

        $this->postJson('/api/integrations', [
            'provider' => 'wave',
            'credentials' => ['api_key' => 'k', 'webhook_secret' => 's'],
        ])->assertCreated();
    }

    public function test_orange_money_requires_the_keys_its_driver_reads(): void
    {
        $this->admin();

        $response = $this->postJson('/api/integrations', [
            'provider' => 'orange_money',
            'credentials' => ['api_key' => 'k', 'merchant_key' => 'm', 'webhook_secret' => 's'],
        ])->assertStatus(422);
        $response->assertJsonValidationErrors(['credentials.client_id', 'credentials.client_secret']);

        $this->postJson('/api/integrations', [
            'provider' => 'orange_money',
            'credentials' => array_fill_keys(OrangeMoneyDriver::CREDENTIAL_KEYS, 'x'),
        ])->assertCreated();
    }

    public function test_a_non_payment_provider_keeps_its_free_form_credentials(): void
    {
        $this->admin();

        $this->postJson('/api/integrations', [
            'provider' => 'sms_orange',
            'credentials' => ['client_id' => 'c', 'client_secret' => 's'],
        ])->assertCreated();
    }

    /** En édition, les identifiants envoyés recouvrent les enregistrés ; le résultat doit rester complet. */
    public function test_update_merges_credentials_then_validates_the_result(): void
    {
        [$agency] = $this->admin();
        $integration = Integration::factory()->create([
            'agency_id' => $agency->id,
            'provider' => 'wave',
            'credentials' => ['api_key' => 'old', 'webhook_secret' => 'kept'],
        ]);

        $this->putJson("/api/integrations/{$integration->id}", ['credentials' => ['api_key' => 'new']])->assertOk();
        $this->assertSame(['api_key' => 'new', 'webhook_secret' => 'kept'], $integration->fresh()->credentials);

        $this->putJson("/api/integrations/{$integration->id}", ['credentials' => ['webhook_secret' => '']])
            ->assertStatus(422)->assertJsonValidationErrors(['credentials.webhook_secret']);
        $this->assertSame('kept', $integration->fresh()->credentials['webhook_secret']);
    }

    /** Le formulaire lit les champs du schéma : ceux que le pilote lit, et rien de secret. */
    public function test_the_form_reads_the_fields_of_each_payment_provider(): void
    {
        $this->admin();

        $providers = collect($this->getJson('/api/integrations/payment-providers')->assertOk()->json('data'))->keyBy('key');
        $this->assertSame(
            OrangeMoneyDriver::CREDENTIAL_KEYS,
            collect($providers['orange_money']['fields'])->where('required', true)->pluck('name')->values()->all(),
        );
        $this->assertTrue($providers->has('wave'));
        $this->assertTrue($providers->has('lemon_squeezy'));
        $this->assertFalse($providers->has('sms_orange'));

        $agent = User::factory()->withAgentProfile(Agency::factory()->create())->create();
        Sanctum::actingAs($agent);
        $this->getJson('/api/integrations/payment-providers')->assertForbidden();
    }
}
