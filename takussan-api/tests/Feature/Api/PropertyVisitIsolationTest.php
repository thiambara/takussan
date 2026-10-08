<?php

namespace Tests\Feature\Api;

use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-590 — ce qu'un client et un bailleur ne peuvent PAS choisir en réservant (AC7, AC7b).
 *
 * `customer_id` était validé par `exists:customers,id` : un client rattachait sa visite à la fiche
 * d'un autre, qui la voyait alors dans sa liste et pouvait l'annuler. `$user->agency_id` faisait
 * passer un bailleur pour du personnel.
 */
class PropertyVisitIsolationTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    /** AC7 (R) — la fiche d'un autre n'est jamais rattachée ; son titulaire ne voit rien. */
    public function test_un_client_ne_rattache_pas_la_fiche_d_un_autre(): void
    {
        $x = $this->agence();
        $y = $this->agence();
        $bien = $this->bienDe($x);
        $client = $this->client();

        $titulaireY = $this->client();
        $ficheY = $this->ficheClient($y, $titulaireY);
        $titulaireX = $this->client();
        $ficheAutreX = $this->ficheClient($x, $titulaireX);

        foreach ([[$ficheY, $titulaireY, 10], [$ficheAutreX, $titulaireX, 11]] as [$fiche, $titulaire, $heure]) {
            Sanctum::actingAs($client);
            $id = $this->postJson('/api/property-visits', [
                'property_id' => $bien->id,
                'customer_id' => $fiche->id,
                'scheduled_at' => $this->creneau(heure: $heure),
            ])->assertCreated()->json('data.id');

            $this->assertNull(PropertyVisit::query()->findOrFail($id)->customer_id);

            Sanctum::actingAs($titulaire);
            $this->assertNotContains($id, collect($this->getJson('/api/property-visits')->assertOk()->json('data'))->pluck('id'));
            $this->getJson("/api/property-visits/{$id}")->assertForbidden();
            $this->postJson("/api/property-visits/{$id}/cancel")->assertForbidden();
        }

        Sanctum::actingAs($this->personnel($x));
        $this->postJson('/api/property-visits', [
            'property_id' => $bien->id,
            'customer_id' => $ficheY->id,
            'scheduled_at' => $this->creneau(heure: 14),
        ])->assertUnprocessable()->assertJsonValidationErrors(['customer_id']);
    }

    /** AC7b (R) — un bailleur de X n'est pas du personnel de X. */
    public function test_un_bailleur_n_est_pas_du_personnel(): void
    {
        $x = $this->agence();
        $bailleur = $this->bailleur($x);
        $autreBailleur = $this->bailleur($x);
        $agent = $this->personnel($x);

        Sanctum::actingAs($bailleur);

        $prive = $this->bienDe($x, $autreBailleur, public: false);
        $this->postJson('/api/property-visits', [
            'property_id' => $prive->id,
            'scheduled_at' => $this->creneau(),
        ])->assertForbidden();

        $public = $this->bienDe($x, $autreBailleur);
        $id = $this->postJson('/api/property-visits', [
            'property_id' => $public->id,
            'agent_id' => $agent->id,
            'scheduled_at' => $this->creneau(),
        ])->assertCreated()->json('data.id');
        $this->assertNull(PropertyVisit::query()->findOrFail($id)->agent_id);
        $this->assertSame($bailleur->id, PropertyVisit::query()->findOrFail($id)->visitor_id);

        $terminee = PropertyVisit::factory()->create([
            'property_id' => $public->id,
            'status' => VisitStatus::Completed,
            'completed_at' => now()->subHour(),
        ]);
        $this->postJson("/api/property-visits/{$terminee->id}/feedback", ['role' => 'agent', 'rating' => 4])
            ->assertForbidden();

        Sanctum::actingAs($agent);
        $this->postJson("/api/property-visits/{$terminee->id}/feedback", ['role' => 'agent', 'rating' => 4])
            ->assertOk();
    }
}
