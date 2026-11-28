<?php

namespace Tests\Feature\Maintenance;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Models\Agency;
use App\Models\Enums\MaintenanceStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC11 (P5) : le prestataire accepte ou refuse ce qu'on lui assigne.
 *
 * Il n'existait aucun geste entre l'assignation et le démarrage : la demande restait chez lui sans
 * qu'il ait rien dit. Refuser rend la demande au donneur d'ordre ; une fois accepté ou démarré, ce
 * n'est plus un refus mais un abandon, qui n'est pas ouvert ici.
 */
class MaintenanceAcceptDeclineTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_assigned_provider_accepts(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);

        Sanctum::actingAs($provider);

        $this->postJson("/api/maintenance-requests/{$mr->id}/accept")->assertOk();

        $this->assertNotNull($mr->refresh()->accepted_at);
        $this->assertSame(MaintenanceStatus::Assigned, $mr->status);
    }

    public function test_another_provider_of_the_agency_cannot_accept(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Assigned);

        Sanctum::actingAs($this->providerFor($agency));

        $this->postJson("/api/maintenance-requests/{$mr->id}/accept")->assertForbidden();
        $this->postJson("/api/maintenance-requests/{$mr->id}/decline", ['reason' => 'Pas dispo'])->assertForbidden();

        $this->assertNull($mr->refresh()->accepted_at);
    }

    public function test_accepting_twice_is_refused(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['accepted_at' => now()]);

        Sanctum::actingAs($provider);

        $this->postJson("/api/maintenance-requests/{$mr->id}/accept")->assertUnprocessable();
    }

    public function test_decline_before_acceptance_returns_the_request_to_the_principal(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);

        Sanctum::actingAs($provider);

        $this->postJson("/api/maintenance-requests/{$mr->id}/decline", ['reason' => 'Hors de ma zone'])->assertOk();

        $mr->refresh();
        $this->assertNull($mr->assigned_to);
        $this->assertSame(MaintenanceStatus::Open, $mr->status);
        $this->assertSame('Hors de ma zone', Activity::query()->where('event', 'maintenance.declined')->sole()->properties['reason']);
    }

    public function test_decline_requires_a_reason(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);

        Sanctum::actingAs($provider);

        $this->postJson("/api/maintenance-requests/{$mr->id}/decline", [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('reason');
    }

    public function test_decline_after_acceptance_is_refused(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['accepted_at' => now()]);

        Sanctum::actingAs($provider);

        $this->postJson("/api/maintenance-requests/{$mr->id}/decline", ['reason' => 'Finalement non'])->assertUnprocessable();
        $this->assertSame($provider->id, $mr->refresh()->assigned_to);
    }

    public function test_decline_after_start_is_refused(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);

        Sanctum::actingAs($provider);

        // Démarrer, c'est accepter.
        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'in_progress'])->assertOk();
        $this->assertNotNull($mr->refresh()->accepted_at);

        $this->postJson("/api/maintenance-requests/{$mr->id}/decline", ['reason' => 'Trop long'])->assertUnprocessable();
        $this->assertSame($provider->id, $mr->refresh()->assigned_to);
    }

    /** Une réassignation remet l'acceptation à zéro : elle valait pour l'ancien prestataire. */
    public function test_reassignment_resets_acceptance(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['accepted_at' => now()]);
        $next = $this->providerFor($agency);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $next->id])->assertOk();

        $this->assertNull($mr->refresh()->accepted_at);
        $this->assertSame($next->id, $mr->assigned_to);
    }

    /** Le prestataire d'une autre agence ne voit même pas l'endpoint répondre autrement que 403. */
    public function test_stranger_cannot_accept(): void
    {
        ['mr' => $mr] = $this->maintenanceScenario(MaintenanceStatus::Assigned);

        Sanctum::actingAs($this->providerFor(Agency::factory()->create()));

        $this->postJson("/api/maintenance-requests/{$mr->id}/accept")->assertForbidden();
    }

    // --- TCK-2652 (AC3, ex-`MaintenanceAcceptOnCompletedTest`, versé par TCK-3017) : « J'accepte » sur une demande
    // terminée. `completed` n'est pas terminal (le demandeur peut contester) : le bouton disparaît, et le serveur
    // refuse le geste (409). ---------------------------------------------------------------------------------

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
