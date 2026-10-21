<?php

namespace Tests\Feature\Public;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

/**
 * TCK-1076 (P85.01) — la fiche publique d'agence sert le logo que l'annuaire sert déjà.
 *
 * `show()` lisait `$agency->logo_url`, attribut qui n'existe pas (ni colonne ni accesseur) : la
 * fiche rendait toujours `null`, quand `index()` et la carte d'agence de la fiche bien rendaient
 * l'URL de la collection `logo`. Le test compare les deux surfaces, pour qu'une URL réécrite d'un
 * seul côté rougisse aussi.
 */
class PublicAgencyLogoTest extends TestCase
{
    use RefreshDatabase;

    private function agencePubliee(string $slug): Agency
    {
        $agence = Agency::factory()->create(['slug' => $slug, 'status' => AgencyStatus::Active]);
        Property::factory()->published()->create(['agency_id' => $agence->id]);

        return $agence;
    }

    public function test_la_fiche_sert_le_logo_de_la_collection_comme_l_annuaire(): void
    {
        $agence = $this->agencePubliee('agence-au-logo');
        $agence->addMedia(UploadedFile::fake()->image('logo.png', 240, 80))->toMediaCollection('logo');

        $fiche = $this->getJson('/api/public/agencies/agence-au-logo')->assertOk()->json('data.logo_url');

        $annuaire = collect($this->getJson('/api/public/agencies?per_page=48')->assertOk()->json('data'))
            ->firstWhere('slug', 'agence-au-logo');

        $this->assertNotNull($fiche);
        $this->assertStringContainsString('logo.png', $fiche);
        $this->assertSame($annuaire['logo_url'] ?? null, $fiche);
    }

    public function test_sans_logo_la_fiche_rend_null_et_non_une_chaine_vide(): void
    {
        $this->agencePubliee('agence-sans-logo');

        $this->getJson('/api/public/agencies/agence-sans-logo')
            ->assertOk()
            ->assertJsonPath('data.logo_url', null);
    }
}
