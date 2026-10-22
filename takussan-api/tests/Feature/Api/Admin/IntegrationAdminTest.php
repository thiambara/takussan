<?php

namespace Tests\Feature\Api\Admin;

use App\Events\IntegrationConfigChanged;
use App\Models\Integration;
use App\Models\IntegrationWebhookLog;
use App\Services\Payments\Drivers\OrangeMoneyDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class IntegrationAdminTest extends TestCase
{
    use RefreshDatabase;

    public function test_secret_credentials_are_masked_and_schema_is_exposed(): void
    {
        $this->actingAsRole('super_admin');
        $integration = Integration::factory()->create([
            'provider' => 'wave',
            'agency_id' => null,
            'credentials' => ['api_key' => 'wave-secret-1234', 'webhook_secret' => 'whsec-9999'],
        ]);

        $detail = $this->getJson("/api/admin/integrations/{$integration->id}")
            ->assertOk()
            ->assertJsonPath('data.masked_credentials.api_key', '••••1234')
            ->assertJsonMissing(['wave-secret-1234']);

        $this->assertStringNotContainsString('wave-secret-1234', $detail->getContent());

        $this->getJson("/api/admin/integrations/{$integration->id}/schema")
            ->assertOk()
            ->assertJsonPath('data.provider', 'wave')
            ->assertJsonPath('data.fields.0.name', 'api_key')
            ->assertJsonPath('data.fields.0.secret', true);
    }

    public function test_update_payment_integration_audits_without_secret_and_dispatches_event(): void
    {
        Event::fake([IntegrationConfigChanged::class]);
        $this->actingAsRole('super_admin');
        $integration = Integration::factory()->create([
            'provider' => 'stripe',
            'agency_id' => null,
            'credentials' => ['secret_key' => 'sk_old_secret'],
        ]);

        $this->patchJson("/api/admin/integrations/{$integration->id}", [
            'credentials' => ['secret_key' => 'sk_new_secret_9876'],
            'is_active' => true,
        ])->assertOk()
            ->assertJsonPath('data.masked_credentials.secret_key', '••••9876')
            ->assertJsonMissing(['sk_new_secret_9876']);

        Event::assertDispatched(IntegrationConfigChanged::class, fn (IntegrationConfigChanged $event) => $event->integration->id === $integration->id
            && $event->changedFields === ['secret_key']);

        $activity = Activity::query()->where('event', 'super_admin_integration_updated')->first();
        $this->assertNotNull($activity);
        $this->assertSame(['secret_key'], $activity->properties['credential_fields_changed']);
        $this->assertStringNotContainsString('sk_new_secret_9876', $activity->properties->toJson());
    }

    /**
     * P98.10 (TCK-1176) — après rotation des identifiants Orange Money, le jeton OAuth en cache pour
     * l'intégration est oublié : il n'est plus servi jusqu'à son expiration.
     */
    public function test_rotating_orange_money_credentials_forgets_the_cached_oauth_token(): void
    {
        $this->actingAsRole('super_admin');
        $integration = Integration::factory()->create([
            'provider' => 'orange_money',
            'agency_id' => null,
            'is_active' => true,
            'credentials' => ['client_id' => 'id-1', 'client_secret' => 'secret-1', 'merchant_key' => 'mk', 'webhook_secret' => 'wh'],
        ]);
        $key = OrangeMoneyDriver::oauthTokenCacheKey($integration->id);
        Cache::put($key, 'jeton-ancien', 3600);

        $this->patchJson("/api/admin/integrations/{$integration->id}", ['credentials' => ['client_secret' => 'secret-2']])->assertOk();

        $this->assertNull(Cache::get($key));
    }

    public function test_connection_test_returns_status_latency_and_updates_health(): void
    {
        $this->actingAsRole('super_admin');
        $integration = Integration::factory()->create([
            'provider' => 'sms',
            'agency_id' => null,
            'credentials' => ['api_key' => 'sms-secret', 'sender' => 'TAKUSSAN'],
            'is_active' => true,
        ]);

        $this->postJson("/api/admin/integrations/{$integration->id}/test")
            ->assertOk()
            ->assertJsonPath('data.success', true)
            ->assertJsonStructure(['data' => ['success', 'latency_ms', 'error']]);

        $this->assertSame('healthy', $integration->refresh()->health_status);
        $this->assertNotNull($integration->last_health_check_at);
        $this->assertTrue(Activity::query()->where('event', 'super_admin_integration_tested')->exists());
    }

    public function test_agency_admin_is_forbidden_on_super_admin_endpoints(): void
    {
        $this->actingAsRole('agency_admin');
        $integration = Integration::factory()->create(['provider' => 'wave']);

        $this->getJson('/api/admin/integrations')->assertForbidden();
        $this->getJson("/api/admin/integrations/{$integration->id}")->assertForbidden();
        $this->patchJson("/api/admin/integrations/{$integration->id}", ['is_active' => false])->assertForbidden();
        $this->postJson("/api/admin/integrations/{$integration->id}/test")->assertForbidden();
    }

    /**
     * TCK-602 (AC8) — lire la piste ne purge plus rien : la rétention appartient à
     * `webhooks:prune`, jamais à une lecture.
     */
    public function test_reading_the_webhook_trail_never_prunes(): void
    {
        $this->actingAsRole('super_admin');
        $integration = Integration::factory()->create(['provider' => 'wave', 'agency_id' => null]);
        $old = IntegrationWebhookLog::create([
            'integration_id' => $integration->id,
            'provider' => 'wave',
            'direction' => 'incoming',
            'status' => 'processed',
            'event_type' => 'old',
            'payload' => ['legacy' => true],
            'processed_at' => now()->subDays(31),
        ]);
        $old->forceFill([
            'created_at' => now()->subDays(31),
            'updated_at' => now()->subDays(31),
        ])->save();
        IntegrationWebhookLog::create([
            'integration_id' => $integration->id,
            'provider' => 'wave',
            'direction' => 'incoming',
            'status' => 'processed',
            'event_type' => 'checkout.completed',
            'payload' => ['data' => ['id' => 'evt_1']],
            'processed_at' => now(),
        ]);

        $this->getJson("/api/admin/integrations/{$integration->id}/webhooks")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.event_type', 'checkout.completed');

        $this->assertDatabaseHas('integration_webhook_logs', ['id' => $old->id]);
    }
}
