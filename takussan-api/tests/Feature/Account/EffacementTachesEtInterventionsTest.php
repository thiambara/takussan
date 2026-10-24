<?php

namespace Tests\Feature\Account;

use App\Models\AccountDeletionRequest;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\TaskStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2168 (P204.03, décision du porteur du 2026-10-24) — à l'effacement, les tâches ouvertes du
 * compte sont remises à `null` ; ses interventions non closes passent par
 * `MaintenanceRequestService::assign(…, null, keepQuote: true)` s'il est du personnel de l'agence du
 * bien, et par `unassignProviderFromAgency()` s'il en est le prestataire.
 */
class EffacementTachesEtInterventionsTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private Property $bien;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->bien = $this->bienDe($this->agence);
        $this->agent = $this->personnel($this->agence);
        $this->personnel($this->agence, 'agency_admin');
    }

    private function effacer(User $user): void
    {
        $request = AccountDeletionRequest::factory()->for($user)->due()->create();
        app(AccountDeletionService::class)->executeDeletion($request);
    }

    private function intervention(User $assigne, MaintenanceStatus $statut, array $attributs = []): MaintenanceRequest
    {
        return MaintenanceRequest::factory()->create($attributs + [
            'property_id' => $this->bien->id,
            'assigned_to' => $assigne->id,
            'accepted_at' => now(),
            'status' => $statut,
        ]);
    }

    public function test_les_taches_ouvertes_sont_remises_a_personne(): void
    {
        $client = Customer::factory()->create(['agency_id' => $this->agence->id]);
        $ouverte = Task::factory()->forCustomer($client)->create(['assigned_to_id' => $this->agent->id, 'status' => TaskStatus::Open]);
        $enCours = Task::factory()->forCustomer($client)->create(['assigned_to_id' => $this->agent->id, 'status' => TaskStatus::InProgress]);
        $faite = Task::factory()->forCustomer($client)->create(['assigned_to_id' => $this->agent->id, 'status' => TaskStatus::Done]);

        $this->effacer($this->agent);

        $this->assertNull($ouverte->fresh()->assigned_to_id);
        $this->assertNull($enCours->fresh()->assigned_to_id);
        $this->assertSame($this->agent->id, $faite->fresh()->assigned_to_id);
    }

    public function test_l_intervention_d_un_agent_perd_son_assigne_et_garde_son_devis(): void
    {
        $mr = $this->intervention($this->agent, MaintenanceStatus::QuoteSubmitted, [
            'quote_amount' => 150000,
            'quote_submitted_at' => now(),
        ]);

        $this->effacer($this->agent);

        $mr->refresh();
        $this->assertNull($mr->assigned_to);
        $this->assertNull($mr->accepted_at);
        $this->assertSame(MaintenanceStatus::QuoteSubmitted, $mr->status);
        $this->assertEquals(150000, (float) $mr->quote_amount);
    }

    public function test_l_intervention_d_un_prestataire_revient_au_donneur_d_ordre(): void
    {
        $prestataire = User::factory()->create();
        ServiceProviderProfile::factory()->create(['user_id' => $prestataire->id]);
        $mr = $this->intervention($prestataire, MaintenanceStatus::InProgress);

        $this->effacer($prestataire);

        $mr->refresh();
        $this->assertNull($mr->assigned_to);
        $this->assertSame(MaintenanceStatus::Open, $mr->status);
    }

    public function test_une_intervention_terminee_garde_son_assigne(): void
    {
        $mr = $this->intervention($this->agent, MaintenanceStatus::Completed);

        $this->effacer($this->agent);

        $this->assertSame($this->agent->id, $mr->fresh()->assigned_to);
    }
}
