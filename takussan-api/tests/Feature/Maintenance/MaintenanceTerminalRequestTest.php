<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Services\Model\MaintenanceRequestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 (verif-592, M2) — une intervention close ou annulée ne se modifie plus, ni ne s'assigne.
 *
 * Le kit d'accès et les photos refusaient l'état terminal ; le `PATCH` générique, non : le
 * prestataire réécrivait ses notes après la confirmation du locataire (v01), le donneur d'ordre le
 * coût d'une intervention close (v02), et assigner une demande annulée ouvrait la fiche et le fil
 * au nouveau prestataire (v03).
 */
class MaintenanceTerminalRequestTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /** Sonde v01. */
    public function test_the_provider_cannot_rewrite_a_closed_request(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Closed, ['accepted_at' => now(), 'resolution_notes' => 'orig']);

        Sanctum::actingAs($provider);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'resolution_notes' => 'réécrit après clôture',
            'scheduled_at' => now()->addDay()->toIso8601String(),
        ])->assertUnprocessable()->assertJsonPath('message', __('maintenance.errors.terminal_request'));

        $mr->refresh();
        $this->assertSame('orig', $mr->resolution_notes);
        $this->assertNull($mr->scheduled_at);
    }

    /** Sonde v02. */
    public function test_the_principal_cannot_rewrite_the_cost_of_a_closed_request(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Closed, ['actual_cost' => 40000]);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 900000])->assertUnprocessable();

        $this->assertSame('40000.00', (string) $mr->refresh()->actual_cost);
    }

    /** Sonde v03, par le `PATCH` et par le service (seul point d'assignation). */
    public function test_a_cancelled_request_is_not_assigned(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Cancelled, ['assigned_to' => null]);
        $other = $this->providerFor($agency);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $other->id])->assertUnprocessable();
        $this->assertNull($mr->refresh()->assigned_to);

        try {
            app(MaintenanceRequestService::class)->assign($mr, $other, $landlord);
            $this->fail('assign() a accepté une demande annulée.');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
        $this->assertNull($mr->refresh()->assigned_to);
    }

    /** `completed` attend la confirmation : les notes au prestataire, le coût au donneur d'ordre. */
    public function test_a_completed_request_keeps_notes_for_the_provider_and_cost_for_the_principal(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['accepted_at' => now(), 'completed_at' => now()]);

        Sanctum::actingAs($provider);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['resolution_notes' => 'joint remplacé'])->assertOk();
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 15000])->assertForbidden();

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 15000])->assertOk();

        $mr->refresh();
        $this->assertSame('joint remplacé', $mr->resolution_notes);
        $this->assertSame('15000.00', (string) $mr->actual_cost);
    }
}
