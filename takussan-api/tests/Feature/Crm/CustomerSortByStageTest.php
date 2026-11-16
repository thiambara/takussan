<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2889 — `sort=pipeline_stage` : l'ordre du PIPELINE (nouveau, prospect, qualifié, négociation,
 * gagné, perdu), pas l'ordre alphabétique des codes ; départage stable par identifiant.
 */
class CustomerSortByStageTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    /** @var array<string, Customer> */
    private array $fiches = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);

        // Créées dans un ordre qui n'est ni celui du pipeline ni l'alphabétique.
        foreach (['lost', 'negotiating', 'prospect', 'converted', 'qualified', 'lead'] as $etape) {
            $this->fiches[$etape] = $this->ficheClient($this->agence, null, [
                'pipeline_stage' => CustomerPipelineStage::from($etape),
            ]);
        }
    }

    /** @return list<string> */
    private function etapes(string $tri): array
    {
        Sanctum::actingAs($this->agent);

        return collect($this->getJson('/api/customers?fields[customers]=id,pipeline_stage&sort='.$tri)->assertOk()->json('data'))
            ->pluck('pipeline_stage')->all();
    }

    /** AC1 — Prospect avant Qualifié avant Négociation ; l'inverse en `-pipeline_stage`. */
    public function test_ac1_l_ordre_du_pipeline_dans_les_deux_sens(): void
    {
        $pipeline = ['lead', 'prospect', 'qualified', 'negotiating', 'converted', 'lost'];

        $this->assertSame($pipeline, $this->etapes('pipeline_stage'));
        $this->assertSame(array_reverse($pipeline), $this->etapes('-pipeline_stage'));
    }

    /** Deux fiches à la même étape : départagées par identifiant, dans le sens du tri. */
    public function test_departage_par_identifiant(): void
    {
        $seconde = $this->ficheClient($this->agence, null, ['pipeline_stage' => CustomerPipelineStage::Qualified]);
        Sanctum::actingAs($this->agent);

        $qualifiees = fn (string $tri) => collect($this->getJson('/api/customers?fields[customers]=id,pipeline_stage&sort='.$tri)->assertOk()->json('data'))
            ->where('pipeline_stage', 'qualified')->pluck('id')->values()->all();

        $this->assertSame([$this->fiches['qualified']->id, $seconde->id], $qualifiees('pipeline_stage'));
        $this->assertSame([$seconde->id, $this->fiches['qualified']->id], $qualifiees('-pipeline_stage'));
    }
}
