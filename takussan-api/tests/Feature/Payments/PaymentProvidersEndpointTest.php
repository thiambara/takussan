<?php

namespace Tests\Feature\Payments;

use App\Models\Integration;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Payments\Drivers\OrangeMoneyDriver;
use App\Services\Payments\Drivers\WaveDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-602 (ADR-0051 §3) — les fournisseurs proposés au payeur viennent du serveur, et l'initiation
 * refuse en 422, AVANT tout appel sortant, un fournisseur que la liste n'aurait pas proposé.
 */
class PaymentProvidersEndpointTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Http::fake();
    }

    /** @param  list<string>  $keys */
    private function credentials(array $keys): array
    {
        return array_fill_keys($keys, 'filled');
    }

    private function providers(int $paymentId)
    {
        return $this->getJson("/api/lease-payments/{$paymentId}/providers");
    }

    /**
     * AC22 — le locataire AVEC compte lit `["wave"]` sur l'agence A ; une agence sans intégration
     * propre lit l'Orange Money GLOBAL ; une intégration inactive, ou Lemon Squeezy sur du XOF,
     * n'y figurent pas ; l'admin d'une agence B : 403.
     */
    public function test_the_payer_reads_the_providers_of_their_agency(): void
    {
        $a = $this->leaseDue();
        Integration::factory()->create(['agency_id' => $a['agency']->id, 'provider' => 'lemon_squeezy', 'is_active' => true,
            'credentials' => ['api_key' => 'k', 'store_id' => 's', 'variant_id' => 'v', 'signing_secret' => 'x']]);
        Integration::factory()->create(['agency_id' => $a['agency']->id, 'provider' => 'orange_money', 'is_active' => false,
            'credentials' => $this->credentials(OrangeMoneyDriver::CREDENTIAL_KEYS)]);

        $this->actingAs($a['tenant'], 'sanctum');
        $this->providers($a['payment']->id)->assertOk()->assertExactJson(['data' => ['providers' => ['wave']]]);

        $b = $this->leaseDue();
        Integration::query()->where('agency_id', $b['agency']->id)->delete();
        Integration::factory()->create(['agency_id' => null, 'provider' => 'orange_money', 'is_active' => true,
            'credentials' => $this->credentials(OrangeMoneyDriver::CREDENTIAL_KEYS)]);
        $this->actingAs($b['tenant'], 'sanctum');
        $this->providers($b['payment']->id)->assertOk()->assertJsonPath('data.providers', ['orange_money']);

        $adminB = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $adminB->id, 'agency_id' => $b['agency']->id]);
        $this->actingAs($adminB, 'sanctum');
        $this->providers($a['payment']->id)->assertForbidden();

        Http::assertNothingSent();
    }

    /** Une intégration aux identifiants incomplets n'est pas proposée : elle cassait au clic. */
    public function test_an_integration_with_missing_credentials_is_not_offered(): void
    {
        $ctx = $this->leaseDue();
        Integration::query()->where('agency_id', $ctx['agency']->id)->get()->each(
            fn (Integration $i) => $i->forceFill(['credentials' => ['api_key' => 'k']])->save()
        );

        $this->actingAs($ctx['tenant'], 'sanctum');
        $this->providers($ctx['payment']->id)->assertOk()->assertJsonPath('data.providers', []);
        $this->assertContains('webhook_secret', WaveDriver::CREDENTIAL_KEYS);
    }

    /**
     * AC23 — `lemon_squeezy` sur du XOF, ou un fournisseur qu'aucune intégration ne couvre : 422
     * avant tout appel au fournisseur.
     */
    public function test_initiate_refuses_an_unoffered_provider_before_any_call(): void
    {
        $ctx = $this->leaseDue();
        Integration::factory()->create(['agency_id' => $ctx['agency']->id, 'provider' => 'lemon_squeezy', 'is_active' => true,
            'credentials' => ['api_key' => 'k', 'store_id' => 's', 'variant_id' => 'v', 'signing_secret' => 'x']]);
        $this->actingAs($ctx['tenant'], 'sanctum');
        $path = "/api/lease-payments/{$ctx['payment']->id}/initiate";

        $this->postJson($path, ['provider' => 'lemon_squeezy'])->assertStatus(422)->assertJsonPath('code', 'payment.xof_requires_local_provider');
        $this->postJson($path, ['provider' => 'orange_money'])->assertStatus(422)->assertJsonPath('code', 'payment.provider_not_available');

        Http::assertNothingSent();
        $this->assertNull($ctx['payment']->fresh()->transaction_id);
    }
}
