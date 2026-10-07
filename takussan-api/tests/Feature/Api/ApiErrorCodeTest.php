<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\PaymentProvider;
use App\Models\Integration;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-588 (ADR-0032), AC7 — une erreur d'API est un CODE et un message dans la langue négociée.
 *
 * Jamais le message de l'exception : il nommait la classe d'un modèle introuvable, rendait l'anglais
 * du framework (« This action is unauthorized. ») ou rien (« Error »).
 *
 * ⚠ La langue part TOUJOURS en `Accept-Language` explicite : sans en-tête, le harnais envoie
 * `en-us`, et un test « en fr » comparerait l'anglais à lui-même.
 */
class ApiErrorCodeTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string}> */
    public static function langues(): array
    {
        return ['fr' => ['fr'], 'en' => ['en'], 'wo' => ['wo']];
    }

    #[DataProvider('langues')]
    public function test_un_abort_code_rend_son_code_et_un_message_localise(string $locale): void
    {
        $agency = Agency::factory()->create();
        $autreBailleur = User::factory()->withOwnerProfile(Agency::factory()->create())->create();
        Sanctum::actingAs(User::factory()->withAgentProfile($agency)->create());

        $response = $this->postJson('/api/payouts', [
            'landlord_id' => $autreBailleur->id,
            'gross_amount' => 100000,
        ], ['Accept-Language' => $locale]);

        $response->assertForbidden()
            ->assertJsonPath('code', 'payout.landlord_not_in_agency')
            ->assertJsonPath('message', __('errors.payout.landlord_not_in_agency', [], $locale));
        $this->assertNotSame('errors.payout.landlord_not_in_agency', $response->json('message'));
    }

    public function test_les_trois_langues_rendent_trois_messages_distincts(): void
    {
        $messages = array_map(
            fn (string $locale) => __('errors.payout.landlord_not_in_agency', [], $locale),
            ['fr', 'en', 'wo'],
        );

        $this->assertCount(3, array_unique($messages));
    }

    #[DataProvider('langues')]
    public function test_un_modele_introuvable_ne_nomme_aucune_classe(string $locale): void
    {
        $this->apiActingAsRole('agency_admin');

        $response = $this->getJson('/api/leases/999999', ['Accept-Language' => $locale]);

        $response->assertNotFound()
            ->assertJsonPath('code', 'http.not_found')
            ->assertJsonPath('message', __('errors.http.not_found', [], $locale));
        $this->assertStringNotContainsString('App\\', $response->getContent());
        $this->assertStringNotContainsString('No query results', $response->getContent());
    }

    public function test_un_refus_de_policy_rend_http_forbidden(): void
    {
        Route::middleware('api')->get('/api/_test/policy', fn () => Gate::authorize('ability-inexistante'));
        $this->apiActingAsRole('agency_admin');

        $response = $this->getJson('/api/_test/policy', ['Accept-Language' => 'fr']);

        $response->assertForbidden()
            ->assertJsonPath('code', 'http.forbidden')
            ->assertJsonPath('message', __('errors.http.forbidden', [], 'fr'));
        $this->assertStringNotContainsString('This action is unauthorized.', $response->getContent());
    }

    public function test_un_abort_nu_rend_http_forbidden_et_pas_error(): void
    {
        Route::middleware('api')->get('/api/_test/abort-nu', fn () => abort(403));

        $response = $this->getJson('/api/_test/abort-nu', ['Accept-Language' => 'en']);

        $response->assertForbidden()
            ->assertJsonPath('code', 'http.forbidden')
            ->assertJsonPath('message', __('errors.http.forbidden', [], 'en'));
        $this->assertNotSame('Error', $response->json('message'));
    }

    #[DataProvider('langues')]
    public function test_un_dossier_kyc_incomplet_est_refuse_dans_la_langue_de_la_requete(string $locale): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency], 'sanctum');

        $response = $this->postJson("/api/agencies/{$agency->id}/kyc/submit", [], ['Accept-Language' => $locale]);

        $response->assertStatus(422)
            ->assertJsonPath('code', 'kyc.documents_missing')
            ->assertJsonPath('params.missing', ['rccm', 'ninea', 'director_id'])
            ->assertJsonPath('message', __('errors.kyc.documents_missing', ['missing' => 'rccm, ninea, director_id'], $locale));
        if ($locale === 'fr') {
            $this->assertStringNotContainsString('Missing required KYC documents', $response->json('message'));
        }
    }

    public function test_un_paiement_sans_montant_ne_nomme_aucune_classe(): void
    {
        Route::middleware('api')->get('/api/_test/paiement-sans-montant', function () {
            $paiement = new LeasePayment;
            $paiement->setRawAttributes(['id' => 1, 'amount' => null, 'currency' => 'XOF']);

            return app(PaymentGatewayService::class)->initiate($paiement, PaymentProvider::Wave);
        });
        $this->partialMock(PaymentGatewayService::class, function ($mock) {
            $mock->shouldAllowMockingProtectedMethods();
            $mock->shouldReceive('resolveIntegration')->andReturn(new Integration);
        });

        $response = $this->getJson('/api/_test/paiement-sans-montant', ['Accept-Language' => 'fr']);

        $response->assertStatus(422)->assertJsonPath('code', 'payment.amount_unresolved');
        $this->assertStringNotContainsString('App\\', $response->getContent());
    }
}
