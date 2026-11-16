<?php

namespace Tests\Feature\Api\Property;

use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2892 (ADR-0110 § 1, AC2) — l'heure d'arrivée (« à partir de ») et de départ (« avant ») d'un
 * bien loué à la nuit ou à la semaine. Facultatives, et l'API n'écrit AUCUN défaut : un bien sans
 * heures rend `null` (le front affiche 14:00 / 11:00). Hors séjour, elles sont refusées (422).
 */
class PropertyCheckInHoursTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agence;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = Agency::factory()->create(['moderation_required' => false]);
        $this->actingAsRole('agent', ['agency_id' => $this->agence->id]);
    }

    /** @return array<string, mixed> */
    private function bien(string $periode, array $plus = []): array
    {
        return $plus + ['title' => 'Studio aux Almadies', 'type' => 'apartment', 'contract_type' => 'rent', 'rent_period' => $periode, 'price' => 25_000];
    }

    public function test_un_bien_a_la_nuitee_enregistre_et_rend_ses_heures(): void
    {
        $id = $this->postJson('/api/properties', $this->bien('daily', ['check_in_from' => '15:00', 'check_out_before' => '11:00']))
            ->assertCreated()
            ->assertJsonPath('data.check_in_from', '15:00')
            ->assertJsonPath('data.check_out_before', '11:00')
            ->json('data.id');

        $this->getJson("/api/properties/{$id}")
            ->assertOk()
            ->assertJsonPath('data.check_in_from', '15:00')
            ->assertJsonPath('data.check_out_before', '11:00');
        // Lues aussi sous un sparse fieldset qui les demande.
        $this->getJson("/api/properties/{$id}?fields[properties]=id,check_in_from,check_out_before")
            ->assertOk()
            ->assertJsonPath('data.check_in_from', '15:00');
    }

    public function test_un_bien_sans_heures_rend_null_sans_defaut_ecrit(): void
    {
        $id = $this->postJson('/api/properties', $this->bien('daily'))->assertCreated()->json('data.id');

        $this->getJson("/api/properties/{$id}")
            ->assertOk()
            ->assertJsonPath('data.check_in_from', null)
            ->assertJsonPath('data.check_out_before', null);
        $this->assertNull(Property::query()->findOrFail($id)->getRawOriginal('check_in_from'));
    }

    public function test_les_heures_se_modifient_et_se_retirent(): void
    {
        $bien = Property::factory()->create([
            'agency_id' => $this->agence->id, 'user_id' => auth()->id(),
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Weekly, 'price' => 100_000,
        ]);

        $this->putJson("/api/properties/{$bien->id}", ['check_in_from' => '16:30'])
            ->assertOk()->assertJsonPath('data.check_in_from', '16:30');
        $this->putJson("/api/properties/{$bien->id}", ['check_in_from' => null])
            ->assertOk()->assertJsonPath('data.check_in_from', null);
    }

    public function test_hors_sejour_les_heures_sont_refusees(): void
    {
        $this->postJson('/api/properties', $this->bien('monthly', ['check_in_from' => '15:00']))
            ->assertUnprocessable()->assertJsonValidationErrors('check_in_from');
        $this->postJson('/api/properties', ['title' => 'Villa', 'type' => 'villa', 'contract_type' => 'sale', 'price' => 90_000_000, 'check_out_before' => '11:00'])
            ->assertUnprocessable()->assertJsonValidationErrors('check_out_before');

        // Jugées sur la période qui RÉSULTERA de la modification.
        $mensuel = Property::factory()->create([
            'agency_id' => $this->agence->id, 'user_id' => auth()->id(),
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'price' => 300_000,
        ]);
        $this->putJson("/api/properties/{$mensuel->id}", ['check_in_from' => '15:00'])
            ->assertUnprocessable()->assertJsonValidationErrors('check_in_from');
        $this->putJson("/api/properties/{$mensuel->id}", ['rent_period' => 'daily', 'check_in_from' => '15:00'])
            ->assertOk()->assertJsonPath('data.check_in_from', '15:00');

        // Repassé au mois, le bien perd ses heures (invariant du modèle) : elles n'y ont plus de sens.
        $this->putJson("/api/properties/{$mensuel->id}", ['rent_period' => 'monthly'])
            ->assertOk()->assertJsonPath('data.check_in_from', null);
        $this->assertNull($mensuel->refresh()->getRawOriginal('check_in_from'));
    }

    public function test_une_heure_mal_formee_est_refusee(): void
    {
        $this->postJson('/api/properties', $this->bien('daily', ['check_in_from' => '25:00']))
            ->assertUnprocessable()->assertJsonValidationErrors('check_in_from');
        $this->postJson('/api/properties', $this->bien('daily', ['check_out_before' => '11h']))
            ->assertUnprocessable()->assertJsonValidationErrors('check_out_before');
    }
}
