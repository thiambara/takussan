<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC1 et AC2 : le statut ne change QUE par la machine d'état, et chaque transition se
 * juge pour un acteur.
 *
 * ⚠ Chaque refus a son témoin autorisé : une garde qui refuserait tout le monde cocherait aussi
 * « le prestataire ne peut pas ».
 */
class MaintenanceStatusBypassTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /** AC1 — `PATCH {status: approved}` sur son propre devis : 422 qui nomme `status`. */
    public function test_provider_cannot_approve_his_own_quote_by_patch(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted);

        Sanctum::actingAs($provider);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['status' => 'approved'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');

        $this->assertSame(MaintenanceStatus::QuoteSubmitted, $mr->refresh()->status);
    }

    /** AC1 — ni clore depuis `open`. */
    public function test_provider_cannot_close_from_open_by_patch(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario();

        Sanctum::actingAs($provider);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['status' => 'closed'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');

        $this->assertSame(MaintenanceStatus::Open, $mr->refresh()->status);
    }

    /** AC1 — `completed_at` et `started_at` ne s'écrivent pas à la main. */
    public function test_state_dates_are_prohibited(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::InProgress);

        Sanctum::actingAs($provider);

        foreach (['completed_at', 'started_at'] as $field) {
            $this->patchJson("/api/maintenance-requests/{$mr->id}", [$field => now()->toISOString()])
                ->assertUnprocessable()
                ->assertJsonValidationErrors($field);
        }

        $mr->refresh();
        $this->assertNull($mr->completed_at);
        $this->assertNull($mr->started_at);
    }

    /** AC1 — le coût réel est un champ du donneur d'ordre : 403 au prestataire. */
    public function test_provider_cannot_write_actual_cost(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::InProgress);

        Sanctum::actingAs($provider);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 15000])
            ->assertForbidden();

        $this->assertNull($mr->refresh()->actual_cost);
    }

    /** Témoin d'AC1 — le donneur d'ordre écrit le coût réel. */
    public function test_principal_writes_actual_cost(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress);

        Sanctum::actingAs($landlord);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 15000])
            ->assertOk();

        $this->assertEquals(15000, (float) $mr->refresh()->actual_cost);
    }

    /** AC2 — le prestataire n'annule pas une intervention en cours. */
    public function test_provider_cannot_cancel(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::InProgress);

        Sanctum::actingAs($provider);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'cancelled'])
            ->assertForbidden();

        $this->assertSame(MaintenanceStatus::InProgress, $mr->refresh()->status);
    }

    /** AC2 — ni ne clôt une intervention terminée. */
    public function test_provider_cannot_close_a_completed_request(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Completed);

        Sanctum::actingAs($provider);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'closed'])
            ->assertForbidden();

        $this->assertSame(MaintenanceStatus::Completed, $mr->refresh()->status);
    }

    /** Témoin d'AC2 — le prestataire démarre puis termine. */
    public function test_provider_starts_and_completes(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario();

        Sanctum::actingAs($provider);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'in_progress'])->assertOk();
        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'completed'])->assertOk();

        $this->assertSame(MaintenanceStatus::Completed, $mr->refresh()->status);
    }

    /** AC2 — le donneur d'ordre annule depuis un état de devis (422 avant : aucune clé dans la table). */
    public function test_principal_cancels_from_quote_requested(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);

        Sanctum::actingAs($landlord);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'cancelled'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
    }

    /**
     * Le générique ne porte pas les cibles de devis : approuver passe par `quote/approve`, qui juge
     * la validité du devis et le plafond du bailleur.
     */
    public function test_generic_endpoint_refuses_quote_targets_even_to_the_principal(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted);

        Sanctum::actingAs($landlord);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'approved'])
            ->assertUnprocessable();

        $this->assertSame(MaintenanceStatus::QuoteSubmitted, $mr->refresh()->status);
    }

    /** Le demandeur seul n'a pas le générique : il confirme ou conteste par ses endpoints. */
    public function test_requester_cannot_use_the_generic_status(): void
    {
        ['mr' => $mr, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Open);

        Sanctum::actingAs($tenant);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'cancelled'])
            ->assertForbidden();
    }
}
