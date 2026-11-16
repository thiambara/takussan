<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-618 (contrainte 4) — `POST /api/properties/{id}/view` ne compte une vue que sur un bien que
 * l'appelant peut voir : en ligne, ou lisible par lui (`view`). Sinon le même 404 qu'un bien
 * inconnu — ni compte, ni `views_count` lu.
 */
class RecordViewVisibilityTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_un_bien_prive_d_une_autre_agence_rend_404_sans_compter(): void
    {
        $autre = Agency::factory()->create();
        $bien = Property::factory()->published()->create([
            'agency_id' => $autre->id,
            'visibility' => PropertyVisibility::Private,
            'views_count' => 7,
        ]);
        Sanctum::actingAs($this->agencyAgent(Agency::factory()->create()));

        $reponse = $this->postJson("/api/properties/{$bien->id}/view")->assertNotFound();
        $inconnu = $this->postJson('/api/properties/999999/view')->assertNotFound();

        $this->assertSame($inconnu->json('message'), $reponse->json('message'));
        $this->assertArrayNotHasKey('data', $reponse->json());
        $this->assertSame(7, (int) Property::query()->whereKey($bien->id)->value('views_count'));
    }

    public function test_un_bien_public_d_une_autre_agence_compte(): void
    {
        $bien = Property::factory()->published()->create([
            'agency_id' => Agency::factory()->create()->id,
            'views_count' => 7,
        ]);
        Sanctum::actingAs($this->agencyAgent(Agency::factory()->create()));

        $this->postJson("/api/properties/{$bien->id}/view")
            ->assertOk()
            ->assertJsonPath('data.views_count', 8);
    }

    public function test_un_bien_prive_de_sa_propre_agence_compte(): void
    {
        $agence = Agency::factory()->create();
        $bien = Property::factory()->published()->create([
            'agency_id' => $agence->id,
            'visibility' => PropertyVisibility::Private,
            'views_count' => 7,
        ]);
        Sanctum::actingAs($this->agencyAgent($agence));

        $this->postJson("/api/properties/{$bien->id}/view")
            ->assertOk()
            ->assertJsonPath('data.views_count', 8);
    }
}
