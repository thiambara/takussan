<?php

namespace Tests\Feature\Maintenance;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Models\Enums\MaintenanceStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2652 (AC3, P2 de l'audit n° 32) — « J'accepte » sur une demande terminée. `completed` n'est pas
 * terminal (le demandeur peut contester) : le bloc `abilities` offrait l'acceptation, et le serveur
 * l'enregistrait. Le bouton disparaît, et le serveur refuse le geste (409).
 */
class MaintenanceAcceptOnCompletedTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /** AC3. */
    public function test_ac3_the_provider_cannot_accept_a_completed_request(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['completed_at' => now(), 'accepted_at' => null]);
        Sanctum::actingAs($provider);

        $abilities = $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->json('data.abilities');
        $this->assertFalse($abilities['can_accept']);
        $this->assertFalse($abilities['can_decline']);

        Event::fake([MaintenanceStatusChanged::class]);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept")
            ->assertStatus(409)
            ->assertJsonPath('code', 'maintenance.accept_after_completion');

        $this->assertNull($mr->refresh()->accepted_at);
        $this->assertSame(MaintenanceStatus::Completed, $mr->status);
        Event::assertNotDispatched(MaintenanceStatusChanged::class);
    }

    /** Close ou annulée : ni « J'accepte » ni « Refuser » ; le refus du serveur reste le 422 des terminaux. */
    public function test_closed_and_cancelled_offer_neither_accept_nor_decline(): void
    {
        foreach ([MaintenanceStatus::Closed, MaintenanceStatus::Cancelled] as $status) {
            ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario($status, ['accepted_at' => null]);
            Sanctum::actingAs($provider);

            $abilities = $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->json('data.abilities');
            $this->assertFalse($abilities['can_accept'], $status->value);
            $this->assertFalse($abilities['can_decline'], $status->value);

            $this->postJson("/api/maintenance-requests/{$mr->id}/accept")
                ->assertUnprocessable()->assertJsonPath('code', 'maintenance.terminal_request');
        }
    }

    /** Témoin : une demande en cours non acceptée reste acceptable — le correctif ne ferme que le rendu. */
    public function test_an_unaccepted_in_progress_request_stays_acceptable(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::InProgress, ['accepted_at' => null]);
        Sanctum::actingAs($provider);

        $this->assertTrue($this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->json('data.abilities.can_accept'));
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept")->assertOk();
        $this->assertNotNull($mr->refresh()->accepted_at);
    }
}
