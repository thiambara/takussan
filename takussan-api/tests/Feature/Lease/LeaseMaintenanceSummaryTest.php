<?php

namespace Tests\Feature\Lease;

use App\Models\Agency;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2906 (AC1) — le dossier d'un bail rend `maintenance_summary` sous `include=maintenance_summary` :
 * les interventions DE CE BAIL (`lease_id`), à la portée du lecteur — celle de
 * `GET /api/maintenance-requests` : le locataire ne compte que les siennes.
 */
class LeaseMaintenanceSummaryTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $tenantUser;

    private Property $property;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');
        $this->agency = $this->agence();
        $this->agent = $this->agencyAgent($this->agency);
        $this->property = $this->bienLoue($this->agency, $this->bailleur($this->agency), 'Boutique Sandaga');
        $this->lease = $this->bail($this->property, 'Awa Ndiaye');
        $this->tenantUser = User::factory()->create();
        $this->lease->tenant->update(['user_id' => $this->tenantUser->id]);
    }

    /** @param  array<string, mixed>  $attributes */
    private function demande(string $title, MaintenanceStatus $status, array $attributes = []): MaintenanceRequest
    {
        return MaintenanceRequest::factory()->create($attributes + [
            'property_id' => $this->property->id,
            'lease_id' => $this->lease->id,
            'requester_id' => $this->agent->id,
            'title' => $title,
            'status' => $status,
        ]);
    }

    /** @return array<string, mixed>|null */
    private function resume(User $as): ?array
    {
        return $this->actingAsApi($as)
            ->getJson("/api/leases/{$this->lease->id}?include=maintenance_summary")
            ->assertOk()->json('data.maintenance_summary');
    }

    public function test_ac1_le_resume_du_bail_se_borne_a_ses_demandes(): void
    {
        $rideau = $this->demande('Rideau métallique', MaintenanceStatus::InProgress);
        $this->demande('Fuite réparée', MaintenanceStatus::Completed);
        $this->demande('Peinture', MaintenanceStatus::Cancelled);
        // Sur le bien, hors du bail : hors du résumé du bail.
        $this->demande('Toiture', MaintenanceStatus::Open, ['lease_id' => null]);

        $this->assertSame(
            ['total' => 3, 'open' => 1, 'latest_open' => ['id' => $rideau->id, 'title' => 'Rideau métallique', 'status' => 'in_progress']],
            $this->resume($this->agent),
        );
    }

    public function test_le_locataire_ne_compte_que_ce_qu_il_lit(): void
    {
        $this->demande('Rideau métallique', MaintenanceStatus::InProgress);
        $sienne = $this->demande('Robinet', MaintenanceStatus::Completed, ['requester_id' => $this->tenantUser->id]);

        $resume = $this->resume($this->tenantUser);

        $this->assertSame(['total' => 1, 'open' => 0, 'latest_open' => null], $resume);
        // La même portée que la liste qu'il lit.
        $liste = $this->actingAsApi($this->tenantUser)
            ->getJson("/api/maintenance-requests?filter[lease_id]={$this->lease->id}&fields[maintenance_requests]=id")
            ->assertOk()->json('data');
        $this->assertSame([$sienne->id], array_column($liste, 'id'));
    }

    public function test_sans_l_inclusion_la_cle_est_absente(): void
    {
        $this->actingAsApi($this->agent)->getJson("/api/leases/{$this->lease->id}")
            ->assertOk()->assertJsonMissingPath('data.maintenance_summary');
    }
}
