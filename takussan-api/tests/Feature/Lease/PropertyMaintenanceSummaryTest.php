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
 * TCK-2906 (AC1) — la fiche d'un bien rend `maintenance_summary { total, open, latest_open }` sous
 * `include=maintenanceSummary` : les interventions du bien que le lecteur lit, « ouvertes » au sens des
 * tableaux de bord (hors terminées, closes, annulées, refusées), la dernière ouverte en tête.
 */
class PropertyMaintenanceSummaryTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $owner;

    private Property $property;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');
        $this->agency = $this->agence();
        $this->agent = $this->agencyAgent($this->agency);
        $this->owner = $this->bailleur($this->agency);
        $this->property = $this->bienLoue($this->agency, $this->owner, 'Boutique Sandaga');
        $this->lease = $this->bail($this->property, 'Awa Ndiaye');
    }

    /** @param  array<string, mixed>  $attributes */
    private function demande(string $title, MaintenanceStatus $status, array $attributes = []): MaintenanceRequest
    {
        return MaintenanceRequest::factory()->create($attributes + [
            'property_id' => $this->property->id,
            'requester_id' => $this->agent->id,
            'title' => $title,
            'status' => $status,
        ]);
    }

    /** @return array<string, mixed>|null */
    private function resume(User $as): ?array
    {
        return $this->actingAsApi($as)
            ->getJson("/api/properties/{$this->property->id}?include=maintenanceSummary")
            ->assertOk()->json('data.maintenance_summary');
    }

    public function test_ac1_trois_interventions_dont_une_en_cours(): void
    {
        $rideau = $this->demande('Rideau métallique', MaintenanceStatus::InProgress, ['lease_id' => $this->lease->id]);
        $this->demande('Fuite réparée', MaintenanceStatus::Completed, ['lease_id' => $this->lease->id]);
        $this->demande('Serrure', MaintenanceStatus::Closed);
        // Un autre bien de l'agence : hors du résumé.
        MaintenanceRequest::factory()->create(['property_id' => $this->bienLoue($this->agency, $this->owner, 'Autre')->id, 'status' => MaintenanceStatus::Open]);

        $attendu = ['total' => 3, 'open' => 1, 'latest_open' => ['id' => $rideau->id, 'title' => 'Rideau métallique', 'status' => 'in_progress']];
        $this->assertSame($attendu, $this->resume($this->agent));
        // Le bailleur du bien lit les mêmes demandes (`BailleurDuBien`).
        $this->assertSame($attendu, $this->resume($this->owner));
    }

    public function test_la_derniere_ouverte_est_la_plus_recente_puis_l_id_le_plus_haut(): void
    {
        $this->demande('Ancienne', MaintenanceStatus::Open, ['created_at' => '2026-11-01 08:00:00']);
        $this->demande('Égale A', MaintenanceStatus::Acknowledged, ['created_at' => '2026-11-10 08:00:00']);
        $b = $this->demande('Égale B', MaintenanceStatus::AwaitingOwner, ['created_at' => '2026-11-10 08:00:00']);
        $this->demande('Refusée, plus récente', MaintenanceStatus::Rejected, ['created_at' => '2026-11-14 08:00:00']);

        $resume = $this->resume($this->agent);

        $this->assertSame(4, $resume['total']);
        $this->assertSame(3, $resume['open']);
        $this->assertSame($b->id, $resume['latest_open']['id']);
    }

    public function test_sans_l_inclusion_la_cle_est_absente_et_sans_demande_le_resume_est_vide(): void
    {
        $this->actingAsApi($this->agent)->getJson("/api/properties/{$this->property->id}")
            ->assertOk()->assertJsonMissingPath('data.maintenance_summary');

        $this->assertSame(['total' => 0, 'open' => 0, 'latest_open' => null], $this->resume($this->agent));
    }
}
