<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Support\OperateursPlateforme;

/**
 * P216.03 (TCK-2124) — un `include` relu à la main par `explode(',', (string) …)` rendait 500
 * « Array to string conversion » sur `include[]=` : la liste des interventions, leur fiche, la fiche
 * d'un document et les biens d'une agence en console. Une liste vaut désormais un `include` absent
 * (TCK-1407, TCK-1866), et ne rouvre jamais au `viewer` les personnes que TCK-600 lui retire.
 */
class ValeursEnListeIncludeLuALaMainTest extends ApiTestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    public function test_liste_des_interventions(): void
    {
        $this->apiActingAsRole('super_admin');
        MaintenanceRequest::factory()->create();

        $this->apiGet('/api/maintenance-requests?include[]=property')->assertOk();
    }

    public function test_fiche_d_une_intervention(): void
    {
        $this->apiActingAsRole('super_admin');
        $intervention = MaintenanceRequest::factory()->create();

        $this->apiGet("/api/maintenance-requests/{$intervention->id}?include[]=property")->assertOk();
    }

    public function test_fiche_d_un_document(): void
    {
        $this->apiActingAsRole('super_admin');
        $document = Document::factory()->create();

        $this->apiGet("/api/documents/{$document->id}?include[]=versions")
            ->assertOk()
            ->assertJsonPath('data.versions', null);
    }

    public function test_biens_d_une_agence_pour_un_viewer_sans_personne(): void
    {
        $admin = User::factory()->create();
        $agence = Agency::factory()->create(['primary_admin_id' => $admin->id]);
        Property::factory()->create(['agency_id' => $agence->id, 'user_id' => $admin->id]);

        $this->agirEnOperateur(PlatformProfileLevel::Viewer);
        $biens = $this->getJson("/api/admin/agencies/{$agence->id}/properties?include[]=owner")->assertOk();

        $this->assertArrayNotHasKey('owner', $biens->json('data.0'));
        $this->assertStringNotContainsString($admin->email, $biens->getContent());
    }
}
