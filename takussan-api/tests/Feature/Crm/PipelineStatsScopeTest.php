<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\RelationshipType;
use App\Models\Tag;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2591 — `GET /api/customers/pipeline-stats?scope=mine|agency` et les filtres de la liste.
 * « Moi » : les fiches dont l'appelant est le référent (`filter[referent]=me`, TCK-2588) ;
 * « Agence » : le CRM de l'agence active, sous `crm.view_all` (403 sinon, avant toute validation).
 */
class PipelineStatsScopeTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agency;

    private User $sokhna;

    private User $collegue;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->sokhna = $this->personnel($this->agency, attributes: ['first_name' => 'Sokhna', 'last_name' => 'Sène']);
        $this->collegue = $this->personnel($this->agency);

        // Sokhna est référente de 3 fiches (2 lead, 1 qualified) ; sa collègue de 4.
        foreach ([CustomerPipelineStage::Lead, CustomerPipelineStage::Lead, CustomerPipelineStage::Qualified] as $stage) {
            $this->referent($this->fiche($stage), $this->sokhna);
        }
        foreach (range(1, 4) as $i) {
            $this->referent($this->fiche(CustomerPipelineStage::Prospect), $this->collegue);
        }
        // Une fiche sans référent, et une fiche que Sokhna a ajoutée HORS agence : `visibleTo` la
        // lui laisse, la portée « Agence » non.
        $this->fiche(CustomerPipelineStage::Negotiating);
        Customer::factory()->create([
            'agency_id' => null, 'added_by_id' => $this->sokhna->id,
            'status' => CustomerStatus::Active, 'pipeline_stage' => CustomerPipelineStage::Lead,
        ]);
    }

    private function fiche(CustomerPipelineStage $stage): Customer
    {
        return Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'added_by_id' => $this->collegue->id,
            'status' => CustomerStatus::Active,
            'pipeline_stage' => $stage,
        ]);
    }

    private function referent(Customer $fiche, User $agent): void
    {
        UserCustomerRelationship::query()->create([
            'user_id' => $agent->id,
            'customer_id' => $fiche->id,
            'relationship_type' => RelationshipType::AgentClient,
            'status' => RelationshipStatus::Active,
            'is_primary' => true,
        ]);
    }

    /** @return array<string, int> */
    private function counts(string $query, ?User $as = null): array
    {
        Sanctum::actingAs($as ?? $this->sokhna);

        return $this->getJson('/api/customers/pipeline-stats'.$query)->assertOk()->json('data.stage_counts');
    }

    public function test_ac3_mine_counts_only_the_fiches_of_which_she_is_the_referent(): void
    {
        $counts = $this->counts('?scope=mine');

        $this->assertSame(3, array_sum($counts));
        $this->assertSame(2, $counts['lead']);
        $this->assertSame(1, $counts['qualified']);
        $this->assertSame(0, $counts['prospect']);
    }

    public function test_agency_counts_the_active_agency_only(): void
    {
        $counts = $this->counts('?scope=agency');

        $this->assertSame(8, array_sum($counts));
        $this->assertSame(2, $counts['lead'], 'la fiche hors agence de Sokhna n\'y entre pas');
    }

    public function test_without_scope_the_reading_of_the_fiche_applies_as_before(): void
    {
        $this->assertSame(9, array_sum($this->counts('')));
    }

    public function test_ac3_agency_is_forbidden_without_crm_view_all_before_any_validation(): void
    {
        $role = AgencyRole::factory()->for($this->agency)->withCapabilities([Capability::PropertiesCreate])->create();
        $restreint = $this->personnel($this->agency, agencyRole: $role);

        foreach ([$restreint, $this->bailleur($this->agency), $this->client()] as $lecteur) {
            Sanctum::actingAs($lecteur);
            $this->getJson('/api/customers/pipeline-stats?scope=agency')->assertForbidden();
            $this->getJson('/api/customers/pipeline-stats?scope=agency&filter[referent]=x')->assertForbidden();
        }

        Sanctum::actingAs($restreint);
        $this->getJson('/api/customers/pipeline-stats?scope=mine')->assertOk();
    }

    public function test_malformed_scopes_are_refused(): void
    {
        Sanctum::actingAs($this->sokhna);

        $this->getJson('/api/customers/pipeline-stats?scope=all')->assertStatus(422);
        $this->getJson('/api/customers/pipeline-stats?scope[]=agency')->assertStatus(422);
        $this->getJson('/api/customers/pipeline-stats?scope=mine&filter[referent]=none')->assertStatus(422);
        $this->getJson('/api/customers/pipeline-stats?filter[nope]=1')->assertStatus(400);
    }

    public function test_the_list_filters_apply_to_the_figures(): void
    {
        $tag = Tag::factory()->create(['name' => 'VIP']);
        Customer::query()->where('agency_id', $this->agency->id)->where('pipeline_stage', 'prospect')->limit(2)->get()
            ->each(fn (Customer $c) => $c->tags()->attach($tag->id));

        $this->assertSame(2, array_sum($this->counts('?scope=agency&filter[tags]=VIP')));
        $this->assertSame(4, array_sum($this->counts('?scope=agency&filter[referent]='.$this->collegue->id)));
        $this->assertSame(0, array_sum($this->counts('?scope=mine&filter[tags]=VIP')));
    }
}
