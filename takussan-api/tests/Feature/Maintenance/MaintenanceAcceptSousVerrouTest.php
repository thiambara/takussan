<?php

namespace Tests\Feature\Maintenance;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Exceptions\ApiError;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Services\Model\MaintenanceRequestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * P182.07 (TCK-1822) — `accept` juge `accepted_at` sur la ligne relue sous verrou. Il le jugeait
 * sur le modèle reçu : deux acceptations simultanées passaient toutes deux et émettaient deux
 * `MaintenanceStatusChanged`.
 *
 * La course se rejoue sans concurrence : le second appel reçoit un modèle chargé avant le premier,
 * ce que tient le second de deux appels simultanés.
 */
class MaintenanceAcceptSousVerrouTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_une_acceptation_sur_un_modele_perime_est_refusee_sans_second_evenement(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        $perime = MaintenanceRequest::query()->findOrFail($mr->id);
        Event::fake([MaintenanceStatusChanged::class]);
        $service = app(MaintenanceRequestService::class);

        $service->accept($mr, $provider);
        $premiere = $mr->refresh()->accepted_at;

        try {
            $service->accept($perime, $provider);
            $this->fail('La seconde acceptation aurait dû être refusée.');
        } catch (ApiError $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame('maintenance.already_accepted', $e->errorCode);
        }

        Event::assertDispatchedTimes(MaintenanceStatusChanged::class, 1);
        $this->assertEquals($premiere, $mr->refresh()->accepted_at);
    }

    public function test_une_intervention_assignee_s_accepte_toujours(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        Event::fake([MaintenanceStatusChanged::class]);

        $rendue = app(MaintenanceRequestService::class)->accept($mr, $provider);

        $this->assertNotNull($rendue->accepted_at);
        $this->assertSame(MaintenanceStatus::Assigned, $rendue->status);
        Event::assertDispatchedTimes(MaintenanceStatusChanged::class, 1);
    }
}
