<?php

namespace Tests\Feature\Account;

use App\Models\AccountDeletionRequest;
use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2011 (P175.02) — l'effacement du compte d'un agent remet à `null` l'`agent_id` de ses
 * visites à venir (`scheduled`, `confirmed`), qui retombent dans « non attribuées » ; ses visites
 * passées (`completed`, `cancelled`, `no_show`) gardent leur agent pour l'historique.
 */
class EffacementAgentVisitesAVenirTest extends ApiTestCase
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
    }

    private function visite(VisitStatus $statut, ?User $agent = null): PropertyVisit
    {
        return PropertyVisit::factory()->create([
            'property_id' => $this->bien->id,
            'visitor_id' => $this->client()->id,
            'agent_id' => ($agent ?? $this->agent)->id,
            'status' => $statut,
            'scheduled_at' => $statut === VisitStatus::Scheduled || $statut === VisitStatus::Confirmed
                ? now()->addDays(3)
                : now()->subDays(3),
        ]);
    }

    private function effacer(User $user): void
    {
        $request = AccountDeletionRequest::factory()->for($user)->due()->create();
        app(AccountDeletionService::class)->executeDeletion($request);
    }

    public function test_les_visites_a_venir_de_l_agent_efface_retombent_dans_non_attribuees(): void
    {
        $prevue = $this->visite(VisitStatus::Scheduled);
        $confirmee = $this->visite(VisitStatus::Confirmed);
        $collegue = $this->personnel($this->agence);

        $this->effacer($this->agent);

        Sanctum::actingAs($collegue);
        $ids = collect($this->getJson('/api/property-visits?filter[unassigned]=1')->assertOk()->json('data'))
            ->pluck('id')->sort()->values()->all();

        $this->assertSame(collect([$prevue->id, $confirmee->id])->sort()->values()->all(), $ids);
        $this->assertNull($prevue->fresh()->agent_id);
        $this->assertNull($confirmee->fresh()->agent_id);
    }

    public function test_les_visites_passees_gardent_l_agent_efface(): void
    {
        $passees = [
            $this->visite(VisitStatus::Completed),
            $this->visite(VisitStatus::Cancelled),
            $this->visite(VisitStatus::NoShow),
        ];

        $this->effacer($this->agent);

        foreach ($passees as $visite) {
            $this->assertSame($this->agent->id, $visite->fresh()->agent_id, "visite {$visite->status->value}");
        }
    }

    public function test_les_visites_d_un_autre_agent_ne_bougent_pas(): void
    {
        $autre = $this->personnel($this->agence);
        $sienne = $this->visite(VisitStatus::Scheduled, $autre);

        $this->effacer($this->agent);

        $this->assertSame($autre->id, $sienne->fresh()->agent_id);
    }
}
