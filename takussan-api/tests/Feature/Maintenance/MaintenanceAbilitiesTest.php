<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — le bloc `abilities` : le serveur dit ce qui est permis, le front n'a plus de table de
 * transitions. Chaque drapeau doit dire EXACTEMENT ce que l'endpoint correspondant rendrait : un
 * bouton qui rend 403 ou 422 est un défaut. Chaque cas est donc rejoué contre l'endpoint.
 */
class MaintenanceAbilitiesTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /** P1 : le prestataire, devis soumis — ni « Approuver » ni « Annuler ». */
    public function test_provider_with_a_submitted_quote_can_neither_approve_nor_cancel(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, ['quote_amount' => 25000, 'accepted_at' => now()]);

        $abilities = $this->abilities($provider, $mr->id);
        $this->assertSame([], $abilities['transitions']);
        $this->assertFalse($abilities['can_manage_quotes']);
        $this->assertFalse($abilities['can_submit_quote']);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'cancelled'])->assertForbidden();
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertForbidden();
    }

    /** P11 : après un refus, le prestataire peut re-soumettre. */
    public function test_provider_can_resubmit_after_rejection(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Rejected, ['accepted_at' => now()]);

        $this->assertTrue($this->abilities($provider, $mr->id)['can_submit_quote']);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quoteBody(20000))->assertOk();
    }

    public function test_principal_manages_quotes_and_may_cancel(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, ['quote_amount' => 25000]);

        $abilities = $this->abilities($landlord, $mr->id);
        $this->assertTrue($abilities['can_manage_quotes']);
        $this->assertTrue($abilities['can_assign']);
        $this->assertSame(['cancelled'], $abilities['transitions']);
        $this->assertFalse($abilities['can_submit_quote']);
    }

    public function test_unaccepted_provider_may_accept_decline_or_start(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);

        $abilities = $this->abilities($provider, $mr->id);
        $this->assertTrue($abilities['can_accept']);
        $this->assertTrue($abilities['can_decline']);
        $this->assertSame(['in_progress'], $abilities['transitions']);
        $this->assertFalse($abilities['can_assign']);
        $this->assertFalse($abilities['can_upload_before_photos']);
    }

    /** Le demandeur confirme par son geste, pas par `PUT …/status` (403 pour lui). */
    public function test_requester_confirms_but_has_no_generic_transition(): void
    {
        ['mr' => $mr, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Completed);

        $abilities = $this->abilities($tenant, $mr->id);
        $this->assertTrue($abilities['can_confirm_resolution']);
        $this->assertTrue($abilities['can_contest_resolution']);
        $this->assertSame([], $abilities['transitions']);
        $this->assertFalse($abilities['can_manage_quotes']);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'closed'])->assertForbidden();
    }

    /** @return array<string, mixed> */
    /** G — « Demander un devis » au donneur d'ordre, tant que la machine l'autorise. */
    public function test_principal_may_request_a_quote_from_open_only(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Open);

        $this->assertFalse($this->abilities($provider, $mr->id)['can_request_quote']);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/request")->assertForbidden();

        $this->assertTrue($this->abilities($landlord, $mr->id)['can_request_quote']);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/request")->assertOk();

        $this->assertFalse($this->abilities($landlord, $mr->id)['can_request_quote']);
    }

    /** ADR-0037 — en `awaiting_owner`, « Approuver » n'est proposé qu'au bailleur du bien. */
    public function test_only_the_landlord_decides_a_quote_awaiting_owner(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(
            MaintenanceStatus::AwaitingOwner,
            ['quote_amount' => 75000, 'quote_submitted_at' => now(), 'quote_valid_until' => now()->addWeek()],
        );

        $this->assertFalse($this->abilities($this->agentOf($agency), $mr->id)['can_decide_quote']);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertForbidden();

        $this->assertTrue($this->abilities($landlord, $mr->id)['can_decide_quote']);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk();
    }

    /** Le PDF du devis : prestataire et donneurs d'ordre, jamais le demandeur seul. */
    public function test_quote_pdf_is_offered_to_whom_may_read_it(): void
    {
        ['mr' => $mr, 'tenant' => $tenant, 'provider' => $provider] = $this->maintenanceScenario(
            MaintenanceStatus::QuoteSubmitted,
            ['quote_amount' => 25000, 'quote_submitted_at' => now(), 'accepted_at' => now()],
        );

        $this->assertFalse($this->abilities($tenant, $mr->id)['can_view_quote_pdf'] ?? false);
        $this->get("/api/maintenance-requests/{$mr->id}/quote/pdf")->assertForbidden();

        $this->assertTrue($this->abilities($provider, $mr->id)['can_view_quote_pdf']);
    }

    private function abilities(User $user, int $id): array
    {
        Sanctum::actingAs($user);

        return $this->getJson("/api/maintenance-requests/{$id}")->assertOk()->json('data.abilities');
    }
}
