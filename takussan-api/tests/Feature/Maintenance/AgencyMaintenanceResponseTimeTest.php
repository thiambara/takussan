<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use App\Services\Maintenance\AgencyResponseTime;
use App\Services\Maintenance\MaintenanceJournal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\MaintenanceActors;

/**
 * TCK-2917 (ADR-0118 § 5) — « l'agence répond d'ordinaire dans l'heure » : la MÉDIANE du délai entre le
 * signalement et la première prise en charge par une autre personne que le demandeur, sur 90 jours ;
 * aucun chiffre sous 5 demandes mesurées.
 */
class AgencyMaintenanceResponseTimeTest extends ApiTestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_ac5_douze_demandes_mediane_42_minutes_rendue_au_locataire(): void
    {
        ['agency' => $agency, 'tenant' => $tenant, 'mr' => $mr, 'property' => $property] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        $agent = $this->agentOf($agency);

        // Douze délais dont la médiane est 42 (moyenne 125 : la moyenne serait fausse).
        $delais = [5, 10, 20, 30, 40, 41, 43, 50, 60, 120, 480, 600];
        foreach ($delais as $i => $minutes) {
            $this->handled($property, $tenant, $agent, $minutes, now()->subDays(1 + $i));
        }
        // Hors fenêtre, et prise en charge par le demandeur lui-même : ne comptent pas.
        $this->handled($property, $tenant, $agent, 9000, now()->subDays(95));
        $this->handled($property, $agent, $agent, 1, now()->subDays(2));

        $this->assertSame(42, app(AgencyResponseTime::class)->minutesFor($agency->id));

        Sanctum::actingAs($tenant);
        $this->getJson("/api/maintenance-requests/{$mr->id}")
            ->assertOk()
            ->assertJsonPath('data.maintenance_response_minutes', 42);
    }

    public function test_ac5_trois_demandes_null(): void
    {
        ['agency' => $agency, 'tenant' => $tenant, 'property' => $property] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        $agent = $this->agentOf($agency);
        foreach ([10, 42, 60] as $minutes) {
            $this->handled($property, $tenant, $agent, $minutes, now()->subDays(3));
        }

        $this->assertNull(app(AgencyResponseTime::class)->minutesFor($agency->id));
        $this->assertNull(app(AgencyResponseTime::class)->minutesFor(null));
    }

    /** Sous le seuil, le `null` est mis en cache comme un chiffre : la seconde lecture n'interroge pas la base. */
    public function test_le_null_sous_le_seuil_est_mis_en_cache(): void
    {
        ['agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        $service = app(AgencyResponseTime::class);

        $this->assertNull($service->minutesFor($agency->id));
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->assertNull($service->minutesFor($agency->id));
        $requetes = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertSame(0, $requetes);
    }

    /** Une demande signalée il y a `$at`, dont la première entrée `status.*` (par `$by`) vient `$minutes` après. */
    private function handled(Property $property, User $requester, User $by, int $minutes, $at): void
    {
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id, 'requester_id' => $requester->id, 'status' => MaintenanceStatus::Acknowledged,
        ]);
        $mr->forceFill(['created_at' => $at])->saveQuietly();

        $this->entree($mr, $by, $at->copy()->addMinutes($minutes));
        // Une seconde entrée plus tardive : seule la première compte.
        $this->entree($mr, $by, $at->copy()->addMinutes($minutes + 300));
    }

    private function entree(MaintenanceRequest $mr, User $by, $at): void
    {
        $this->travelTo($at);
        app(MaintenanceJournal::class)->record($mr, MaintenanceJournal::STATUS_PREFIX.'transition', $by, ['from' => 'open', 'to' => 'acknowledged']);
        $this->travelBack();
    }
}
