<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Favorite;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-600 (ADR-0048 §1, verif-600 m3) — le bien d'une agence suspendue a quitté le site : il ne se
 * relit pas par une porte de connecté. Ses médias se refusent, et le favori d'un visiteur est
 * masqué — pas supprimé : il revient à la levée. Les membres de l'agence gardent leur accès.
 */
class AgencySuspensionAuthenticatedReadsTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private Property $bien;

    private User $visiteur;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = $this->agence();
        $this->bien = $this->bienDe($this->agence);
        $this->agent = $this->personnel($this->agence);
        $this->visiteur = User::factory()->create();
        Favorite::query()->create(['user_id' => $this->visiteur->id, 'property_id' => $this->bien->id]);
        Favorite::query()->create(['user_id' => $this->agent->id, 'property_id' => $this->bien->id]);
    }

    public function test_medias_et_favoris_suivent_le_statut_de_l_agence(): void
    {
        $this->assertLisible(true);

        $this->agence->forceFill(['status' => AgencyStatus::Suspended])->save();
        $this->assertLisible(false);
        $this->assertSame(2, Favorite::query()->count(), 'masqué, pas supprimé');

        // Les membres de l'agence gardent leur accès.
        $this->actingAs($this->agent);
        $this->getJson("/api/properties/{$this->bien->id}/media")->assertOk();
        $this->assertContains($this->bien->id, $this->getJson('/api/favorites')->assertOk()->json('data.*.property_id'));

        $this->agence->forceFill(['status' => AgencyStatus::Active])->save();
        $this->assertLisible(true);
    }

    public function test_on_ne_met_pas_en_favori_le_bien_d_une_agence_suspendue(): void
    {
        $autre = User::factory()->create();
        $this->agence->forceFill(['status' => AgencyStatus::Suspended])->save();

        $this->actingAs($autre);
        // TCK-599 (contrainte 11) — 404, la réponse d'un identifiant inexistant : un bien non
        // visible ne se distingue pas d'un bien absent.
        $this->postJson('/api/favorites', ['property_id' => $this->bien->id])->assertNotFound();
        $this->assertFalse(Favorite::query()->where('user_id', $autre->id)->exists());
    }

    private function assertLisible(bool $lisible): void
    {
        $this->app['auth']->forgetGuards();
        $this->actingAs($this->visiteur);

        $media = $this->getJson("/api/properties/{$this->bien->id}/media");
        $lisible ? $media->assertOk() : $media->assertForbidden();

        $favoris = $this->getJson('/api/favorites')->assertOk()->json('data.*.property_id');
        $lisible ? $this->assertContains($this->bien->id, $favoris) : $this->assertNotContains($this->bien->id, $favoris);
        $this->app['auth']->forgetGuards();
    }
}
