<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;

/**
 * TCK-591 AC6 — le journal de la fiche client, ouvert à l'agent : le changement d'étape, la note
 * ajoutée, la tâche créée ; jamais le corps de la note ; 403 hors de l'agence.
 */
class CustomerActivityEndpointTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = $this->agentOf($this->agency);
        $this->customer = Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'added_by_id' => $this->agent->id,
            'pipeline_stage' => CustomerPipelineStage::Lead,
        ]);
        // Le jeu commence après la création de la fiche.
        Activity::query()->delete();
    }

    private function agentOf(Agency $agency): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, 'agent', $agency);

        return $user;
    }

    public function test_an_agent_reads_stage_change_note_and_task_without_the_note_body(): void
    {
        $this->actingAsApi($this->agent);
        $this->apiPatch("/api/customers/{$this->customer->id}/pipeline-stage", ['pipeline_stage' => 'qualified'])->assertOk();
        $this->apiPost("/api/customers/{$this->customer->id}/notes", ['body' => 'Secret : il hérite en mars'])->assertCreated();
        $this->apiPost('/api/tasks', [
            'title' => 'Rappeler',
            'taskable_type' => Customer::class,
            'taskable_id' => $this->customer->id,
        ])->assertCreated();

        $response = $this->apiGet("/api/customers/{$this->customer->id}/activity")->assertOk();

        $entries = collect($response->json('data'));
        $this->assertCount(3, $entries);
        $this->assertSame(3, $response->json('meta.total'));
        $this->assertEqualsCanonicalizing(['customer', 'note', 'task'], $entries->pluck('subject')->all());

        $stage = $entries->firstWhere('subject', 'customer');
        $this->assertSame('updated', $stage['event']);
        $this->assertSame('qualified', $stage['changes']['attributes']['pipeline_stage']);
        $this->assertSame('lead', $stage['changes']['old']['pipeline_stage']);
        $this->assertSame($this->agent->id, $stage['causer']['id']);

        $this->assertSame('created', $entries->firstWhere('subject', 'note')['event']);
        $this->assertStringNotContainsString('hérite', $response->getContent());
    }

    public function test_an_agent_of_another_agency_is_refused(): void
    {
        $this->actingAsApi($this->agentOf(Agency::factory()->create()))
            ->apiGet("/api/customers/{$this->customer->id}/activity")
            ->assertForbidden();
    }
}
