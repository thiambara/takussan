<?php

namespace Tests\Feature\Api\Property;

use App\Models\Agency;
use App\Models\Enums\Currency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (ADR-0061) — un bien se publie en francs CFA. Le formulaire ne propose plus la devise,
 * et le serveur l'impose : un corps forgé qui l'envoie est ramené à XOF, sans 422 — la réponse ne
 * doit pas casser un client qui l'envoie encore.
 */
class PropertyCurrencyForcedTest extends TestCase
{
    use RefreshDatabase;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $agence = Agency::factory()->create(['moderation_required' => false]);
        $this->agent = $this->actingAsRole('agent', ['agency_id' => $agence->id]);
    }

    public function test_la_creation_impose_le_franc_cfa(): void
    {
        $reponse = $this->postJson('/api/properties', [
            'title' => 'Villa', 'type' => 'villa', 'contract_type' => 'sale', 'price' => 90_000_000, 'currency' => 'EUR',
        ])->assertCreated();

        $this->assertSame(Currency::XOF, Property::query()->findOrFail($reponse->json('data.id'))->currency);
    }

    public function test_la_creation_sans_devise_donne_le_franc_cfa(): void
    {
        $reponse = $this->postJson('/api/properties', [
            'title' => 'Studio', 'type' => 'apartment', 'contract_type' => 'rent', 'price' => 150_000,
        ])->assertCreated();

        $this->assertSame(Currency::XOF, Property::query()->findOrFail($reponse->json('data.id'))->currency);
    }

    public function test_une_modification_qui_envoie_une_devise_est_ramenee_au_franc_cfa(): void
    {
        $bien = Property::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agent->agency_id, 'currency' => Currency::XOF]);

        $this->putJson("/api/properties/{$bien->id}", ['currency' => 'USD'])->assertOk();

        $this->assertSame(Currency::XOF, $bien->refresh()->currency);
    }
}
