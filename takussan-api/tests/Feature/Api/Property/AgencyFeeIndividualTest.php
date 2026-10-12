<?php

namespace Tests\Feature\Api\Property;

use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (AC4) — un indépendant ne facture pas de frais d'agence. Le champ est retiré du
 * formulaire (tâche 21) ET refusé par l'API, à la création comme à la modification, que l'appel
 * vienne de l'agent ou d'un super-admin qui crée pour son compte.
 */
class AgencyFeeIndividualTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, mixed> */
    private function location(array $plus = []): array
    {
        return $plus + ['title' => 'F3 à Mermoz', 'type' => 'apartment', 'contract_type' => 'rent', 'rent_period' => 'monthly', 'price' => 300_000];
    }

    public function test_un_independant_ne_peut_pas_saisir_de_frais(): void
    {
        $this->actingAsRole('agent', ['agency_id' => Agency::factory()->individual()->create(['moderation_required' => false])->id]);

        $this->postJson('/api/properties', $this->location(['agency_fee_months' => 1]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('agency_fee_months');
    }

    public function test_un_independant_garde_le_reste_du_cout_d_entree(): void
    {
        $this->actingAsRole('agent', ['agency_id' => Agency::factory()->individual()->create(['moderation_required' => false])->id]);

        $id = $this->postJson('/api/properties', $this->location(['deposit_months' => 2, 'advance_months' => 1, 'agency_fee_months' => null]))
            ->assertCreated()
            ->json('data.id');

        $bien = Property::query()->findOrFail($id);
        $this->assertSame(2, $bien->deposit_months);
        $this->assertNull($bien->agency_fee_months);
    }

    public function test_une_agence_standard_saisit_ses_frais(): void
    {
        $this->actingAsRole('agent', ['agency_id' => Agency::factory()->create(['moderation_required' => false])->id]);

        $this->postJson('/api/properties', $this->location(['agency_fee_months' => 1]))->assertCreated();
    }

    public function test_le_super_admin_qui_cree_pour_un_independant_est_refuse_aussi(): void
    {
        $independant = Agency::factory()->individual()->create(['moderation_required' => false]);
        $this->actingAsRole('super_admin');

        $this->postJson('/api/properties', $this->location(['agency_id' => $independant->id, 'agency_fee_months' => 1]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('agency_fee_months');
    }

    public function test_la_modification_d_un_bien_d_independant_refuse_les_frais(): void
    {
        $independant = Agency::factory()->individual()->create(['moderation_required' => false]);
        $agent = $this->actingAsRole('agent', ['agency_id' => $independant->id]);
        $bien = Property::factory()->create([
            'user_id' => $agent->id, 'agency_id' => $independant->id,
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'price' => 300_000,
        ]);

        $this->putJson("/api/properties/{$bien->id}", ['agency_fee_months' => 0.5])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('agency_fee_months');
    }
}
