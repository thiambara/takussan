<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\Profiles\OwnerProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 (verif-592, M1) — `actual_cost` est un champ du DONNEUR D'ORDRE, par tous les chemins, et
 * au-delà du plafond du bailleur (ADR-0037) c'est l'accord du bailleur qui s'applique.
 *
 * `PUT …/complete` acceptait `cost` et `actual_cost` du prestataire, ce qu'AC1 lui interdit au
 * `PATCH` ; et un coût réel de 750 000 se posait sur un devis de 40 000 approuvé par l'agent sous un
 * plafond de 50 000, sans que le bailleur ait rien dit.
 */
class MaintenanceActualCostTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /**
     * Passe 3 (N8, sonde q01) — le REFUS du bailleur posait `quote_decision_by_id` comme son accord :
     * l'agent inscrivait ensuite le coût réel de 200 000 que le bailleur venait de refuser.
     */
    public function test_a_landlord_rejection_is_not_an_agreement(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested, ['accepted_at' => now()]);
        $this->threshold($landlord->id, $agency->id, 50000);
        $agent = $this->agentOf($agency);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quoteBody(200000))->assertOk();
        Sanctum::actingAs($agent);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'awaiting_owner');
        Sanctum::actingAs($landlord);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/reject", ['reason' => 'Beaucoup trop cher'])->assertOk();
        $this->assertSame($landlord->id, $mr->refresh()->quote_decision_by_id);

        Sanctum::actingAs($agent);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 200000])
            ->assertUnprocessable()->assertJsonPath('code', 'maintenance.actual_cost_needs_owner');
        $this->assertNull($mr->refresh()->actual_cost);
    }

    /** Passe 4 (N11) — un coût retiré n'est plus un accord : réinscrit par l'agent, il redemande le bailleur. */
    public function test_a_withdrawn_landlord_cost_is_no_longer_an_agreement(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress, ['accepted_at' => now(), 'actual_cost' => null]);
        $this->threshold($landlord->id, $agency->id, 50000);
        $agent = $this->agentOf($agency);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 200000])->assertOk();
        Sanctum::actingAs($agent);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 150000])->assertOk();
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => null])->assertOk();

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 200000])
            ->assertUnprocessable()->assertJsonPath('code', 'maintenance.actual_cost_needs_owner');
        $this->assertNull($mr->refresh()->actual_cost);
    }

    /**
     * Passe 3 (N8, N9) — sans coût fourni, la fin des travaux REJUGE le coût déjà inscrit. Posé
     * sous un accord qui n'existe plus (ici, en base : les chemins de l'API le referment par
     * ailleurs), il ne se fige pas.
     */
    public function test_completion_rejudges_a_cost_already_inscribed(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress, ['accepted_at' => now()]);
        $this->threshold($landlord->id, $agency->id, 50000);
        $mr->forceFill(['actual_cost' => 200000])->save();

        Sanctum::actingAs($this->agentOf($agency));
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['resolution_notes' => 'fait'])
            ->assertUnprocessable()->assertJsonPath('code', 'maintenance.actual_cost_needs_owner');
        $this->assertSame(MaintenanceStatus::InProgress, $mr->refresh()->status);
    }

    /** Témoin du rejugement : le coût que le bailleur a inscrit lui-même est son accord. */
    public function test_a_cost_the_landlord_inscribed_survives_the_rejudgement(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress, ['accepted_at' => now(), 'actual_cost' => null]);
        $this->threshold($landlord->id, $agency->id, 50000);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 750000])->assertOk();
        Sanctum::actingAs($provider);
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['resolution_notes' => 'fait'])->assertOk();

        $this->assertSame('750000.00', (string) $mr->refresh()->actual_cost);
        $this->assertSame(MaintenanceStatus::Completed, $mr->status);
    }

    /**
     * Passe 3 (N10, sondes q04b et q04c) — sans `max`, un montant au-delà de `decimal(14,2)`
     * passait la validation et rendait 500 (`numeric field overflow`).
     */
    public function test_a_cost_beyond_the_column_is_refused(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress, ['accepted_at' => now(), 'actual_cost' => null, 'estimated_cost' => null]);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => '1000000000000'])
            ->assertUnprocessable()->assertJsonValidationErrors('actual_cost');
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['estimated_cost' => '1000000000000'])
            ->assertUnprocessable()->assertJsonValidationErrors('estimated_cost');
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['actual_cost' => '99999999999999999999'])
            ->assertUnprocessable()->assertJsonValidationErrors('actual_cost');
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['cost' => '99999999999999999999'])
            ->assertUnprocessable()->assertJsonValidationErrors('cost');
        $this->assertNull($mr->refresh()->actual_cost);
        $this->assertSame(MaintenanceStatus::InProgress, $mr->status);

        // La borne elle-même tient dans la colonne.
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => '999999999999'])->assertOk();
        $this->assertSame('999999999999.00', (string) $mr->refresh()->actual_cost);
    }

    /**
     * Passe 4 (N12, sondes r02a à r02c) — la borne se juge APRÈS l'arrondi : 999 999 999 999,99 passe
     * le `max` de la FormRequest, puis l'arrondi XOF le porte à 1 000 000 000 000, et l'écriture
     * rendait 500 (`numeric field overflow`). Par `PATCH`, `PUT` et `complete`.
     */
    public function test_a_cost_that_rounds_beyond_the_column_is_refused(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress, ['accepted_at' => now(), 'actual_cost' => null, 'estimated_cost' => null]);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => '999999999999.99'])
            ->assertUnprocessable()->assertJsonPath('code', 'maintenance.amount_too_large');
        $this->putJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => '999999999999.5'])
            ->assertUnprocessable()->assertJsonPath('code', 'maintenance.amount_too_large');
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['actual_cost' => '999999999999.5'])
            ->assertUnprocessable()->assertJsonPath('code', 'maintenance.amount_too_large');
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['cost' => '999999999999.99'])
            ->assertUnprocessable()->assertJsonPath('code', 'maintenance.amount_too_large');
        // L'estimation n'est pas arrondie par l'application : son `max` suffit, tout ce qu'il admet
        // tient dans la colonne une fois arrondi par PostgreSQL.
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['estimated_cost' => '999999999999.995'])
            ->assertUnprocessable()->assertJsonValidationErrors('estimated_cost');
        $mr->refresh();
        $this->assertNull($mr->actual_cost);
        $this->assertNull($mr->estimated_cost);
        $this->assertSame(MaintenanceStatus::InProgress, $mr->status);

        // Juste sous la demi-unité, l'arrondi reste dans la colonne.
        $this->putJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => '999999999999.49'])->assertOk();
        $this->assertSame('999999999999.00', (string) $mr->refresh()->actual_cost);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['estimated_cost' => '999999999999.99'])->assertOk();
        $this->assertSame('999999999999.99', (string) $mr->refresh()->estimated_cost);
    }

    /**
     * Passe 2 (N5, sonde p05) — `numeric` admettait la notation scientifique, que bcmath refuse au
     * premier plafond lu : `5e5` rendait une 500. Désormais un 422 de validation, et rien d'écrit.
     */
    public function test_a_cost_in_scientific_notation_is_refused(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress, ['accepted_at' => now(), 'actual_cost' => null]);
        $this->threshold($landlord->id, $agency->id, 50000);

        Sanctum::actingAs($this->agentOf($agency));
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => '5e5'])
            ->assertUnprocessable()->assertJsonValidationErrors('actual_cost');
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['actual_cost' => '6e4'])
            ->assertUnprocessable()->assertJsonValidationErrors('actual_cost');
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['cost' => '6e4'])
            ->assertUnprocessable()->assertJsonValidationErrors('cost');

        $mr->refresh();
        $this->assertNull($mr->actual_cost);
        $this->assertSame(MaintenanceStatus::InProgress, $mr->status);
    }

    /**
     * Passe 2 (N5) — le coût est arrondi à l'unité de la devise (0 décimale en XOF) AVANT d'être
     * comparé au plafond et écrit : 50 000,40 est 50 000, égal au plafond ; 50 000,50 est 50 001.
     */
    public function test_a_cost_is_rounded_to_the_currency_unit_before_the_threshold(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress, ['accepted_at' => now(), 'actual_cost' => null]);
        $this->threshold($landlord->id, $agency->id, 50000);

        Sanctum::actingAs($this->agentOf($agency));
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => '50000.40'])->assertOk();
        $this->assertSame('50000.00', (string) $mr->refresh()->actual_cost);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => '50000.50'])
            ->assertUnprocessable()->assertJsonPath('code', 'maintenance.actual_cost_needs_owner');

        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['actual_cost' => '49999.5'])->assertOk();
        $this->assertSame('50000.00', (string) $mr->refresh()->actual_cost);
    }

    /** Sonde v04. */
    public function test_the_provider_cannot_write_the_cost_through_complete(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::InProgress, ['accepted_at' => now(), 'actual_cost' => null]);

        Sanctum::actingAs($provider);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 15000])->assertForbidden();
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['actual_cost' => 15000, 'resolution_notes' => 'ok'])->assertForbidden();
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['cost' => 15000, 'resolution_notes' => 'ok'])->assertForbidden();

        $mr->refresh();
        $this->assertNull($mr->actual_cost);
        $this->assertSame(MaintenanceStatus::InProgress, $mr->status);

        // Sans coût, il termine.
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['resolution_notes' => 'ok'])->assertOk();
        $this->assertSame(MaintenanceStatus::Completed, $mr->refresh()->status);
    }

    /** Sonde v05 : devis de 40 000 approuvé par l'agent, plafond de 50 000, coût réel de 750 000. */
    public function test_a_cost_beyond_the_threshold_needs_the_landlord(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);
        $this->threshold($landlord->id, $agency->id, 50000);
        $agent = $this->agentOf($agency);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quoteBody(40000))->assertOk();
        Sanctum::actingAs($agent);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'approved');
        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/start")->assertOk();
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['cost' => 750000])->assertForbidden();

        Sanctum::actingAs($agent);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 750000])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'maintenance.actual_cost_needs_owner');
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['actual_cost' => 750000])->assertUnprocessable();
        $this->assertNull($mr->refresh()->actual_cost);
        $this->assertSame(MaintenanceStatus::InProgress, $mr->status);

        // Le bailleur l'inscrit : c'est son accord.
        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 750000])->assertOk();
        $this->assertSame('750000.00', (string) $mr->refresh()->actual_cost);
    }

    /** Égal au plafond : l'équipe l'inscrit (même borne que le devis, ADR-0037). */
    public function test_a_cost_equal_to_the_threshold_is_written_by_the_team(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress);
        $this->threshold($landlord->id, $agency->id, 50000);

        Sanctum::actingAs($this->agentOf($agency));
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 50000])->assertOk();
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 50001])->assertUnprocessable();

        $this->assertSame('50000.00', (string) $mr->refresh()->actual_cost);
    }

    /** Au-delà du plafond mais dans ce que le bailleur a approuvé lui-même : l'équipe l'inscrit. */
    public function test_a_cost_within_what_the_landlord_approved_is_written_by_the_team(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);
        $this->threshold($landlord->id, $agency->id, 50000);
        $agent = $this->agentOf($agency);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quoteBody(80000))->assertOk();
        Sanctum::actingAs($agent);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'awaiting_owner');
        Sanctum::actingAs($landlord);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'approved');

        Sanctum::actingAs($agent);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 80000])->assertOk();
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 80001])->assertUnprocessable();

        $this->assertSame('80000.00', (string) $mr->refresh()->actual_cost);
    }

    private function threshold(int $landlordId, int $agencyId, int $amount): void
    {
        OwnerProfile::query()->where('user_id', $landlordId)->where('agency_id', $agencyId)
            ->update(['works_approval_threshold' => $amount]);
    }
}
