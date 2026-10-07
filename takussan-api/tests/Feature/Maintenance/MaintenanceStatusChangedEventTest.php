<?php

namespace Tests\Feature\Maintenance;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Models\Enums\MaintenanceStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC8 : chaque chemin qui change le statut ou l'assignation émet EXACTEMENT UN
 * `MaintenanceStatusChanged`, portant `from`, `to` et l'acteur.
 *
 * « Exactement un » est la moitié qui compte : un chemin qui émettrait deux fois (le service PUIS le
 * flux de devis, par exemple) doublerait chaque notification et chaque avis du fil.
 */
class MaintenanceStatusChangedEventTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Event::fake([MaintenanceStatusChanged::class]);
    }

    public function test_generic_transition(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        Sanctum::actingAs($provider);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'in_progress'])->assertOk();

        $this->assertOne(MaintenanceStatus::Assigned, MaintenanceStatus::InProgress, $provider, MaintenanceStatusChanged::CAUSE_TRANSITION);
    }

    public function test_complete(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::InProgress);
        Sanctum::actingAs($provider);

        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['resolution_notes' => 'Joint changé'])->assertOk();

        $this->assertOne(MaintenanceStatus::InProgress, MaintenanceStatus::Completed, $provider, MaintenanceStatusChanged::CAUSE_COMPLETED);
    }

    public function test_assignment_by_patch(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Open, ['assigned_to' => null]);
        Sanctum::actingAs($landlord);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $this->providerFor($agency)->id])->assertOk();

        $this->assertOne(MaintenanceStatus::Open, MaintenanceStatus::Open, $landlord, MaintenanceStatusChanged::CAUSE_ASSIGNED);
    }

    public function test_assignment_at_creation(): void
    {
        ['property' => $property, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario();
        Sanctum::actingAs($landlord);

        $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'assigned_to' => $this->providerFor($agency)->id,
            'title' => 'Fuite',
            'description' => 'Sous évier',
            'category' => 'plumbing',
        ])->assertCreated();

        $this->assertOne(MaintenanceStatus::Open, MaintenanceStatus::Open, $landlord, MaintenanceStatusChanged::CAUSE_ASSIGNED);
    }

    /** Un PATCH qui ne change pas la personne n'émet rien. */
    public function test_same_assignee_emits_nothing(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'provider' => $provider] = $this->maintenanceScenario();
        Sanctum::actingAs($landlord);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $provider->id])->assertOk();

        Event::assertNotDispatched(MaintenanceStatusChanged::class);
    }

    public function test_accept_and_decline(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        Sanctum::actingAs($provider);

        $this->postJson("/api/maintenance-requests/{$mr->id}/decline", ['reason' => 'Indisponible'])->assertOk();

        $this->assertOne(MaintenanceStatus::Assigned, MaintenanceStatus::Open, $provider, MaintenanceStatusChanged::CAUSE_DECLINED);
    }

    public function test_accept(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        Sanctum::actingAs($provider);

        $this->postJson("/api/maintenance-requests/{$mr->id}/accept")->assertOk();

        $this->assertOne(MaintenanceStatus::Assigned, MaintenanceStatus::Assigned, $provider, MaintenanceStatusChanged::CAUSE_ACCEPTED);
    }

    public function test_quote_request(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        Sanctum::actingAs($landlord);

        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/request")->assertOk();

        $this->assertOne(MaintenanceStatus::Assigned, MaintenanceStatus::QuoteRequested, $landlord, MaintenanceStatusChanged::CAUSE_QUOTE_REQUESTED);
    }

    public function test_quote_submit(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);
        Sanctum::actingAs($provider);

        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quotePayload())->assertOk();

        $this->assertOne(MaintenanceStatus::QuoteRequested, MaintenanceStatus::QuoteSubmitted, $provider, MaintenanceStatusChanged::CAUSE_QUOTE_SUBMITTED);
    }

    public function test_quote_approve(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, $this->submittedQuote());
        Sanctum::actingAs($landlord);

        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk();

        $this->assertOne(MaintenanceStatus::QuoteSubmitted, MaintenanceStatus::Approved, $landlord, MaintenanceStatusChanged::CAUSE_QUOTE_APPROVED);
    }

    public function test_quote_reject(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, $this->submittedQuote());
        Sanctum::actingAs($landlord);

        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/reject", ['reason' => 'Trop cher pour ce travail'])->assertOk();

        $this->assertOne(MaintenanceStatus::QuoteSubmitted, MaintenanceStatus::Rejected, $landlord, MaintenanceStatusChanged::CAUSE_QUOTE_REJECTED);
    }

    /** `start` passe par la transition du service : un seul événement, pas deux. */
    public function test_start_after_approval(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Approved);
        Sanctum::actingAs($provider);

        $this->postJson("/api/maintenance-requests/{$mr->id}/start")->assertOk();

        $this->assertOne(MaintenanceStatus::Approved, MaintenanceStatus::InProgress, $provider, MaintenanceStatusChanged::CAUSE_TRANSITION);
    }

    public function test_collaboration_end_unassigns(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::InProgress);
        $collaboration = $provider->serviceProviderProfile->agencyCollaborations()->sole();
        Sanctum::actingAs($provider);

        $this->patchJson("/api/me/service-provider/collaborations/{$collaboration->id}", ['status' => 'ended'])->assertOk();

        $this->assertOne(MaintenanceStatus::InProgress, MaintenanceStatus::Open, $provider, MaintenanceStatusChanged::CAUSE_UNASSIGNED);
    }

    public function test_confirm_resolution(): void
    {
        ['mr' => $mr, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Completed);
        Sanctum::actingAs($tenant);

        $this->postJson("/api/maintenance-requests/{$mr->id}/confirm-resolution")->assertOk();

        $this->assertOne(MaintenanceStatus::Completed, MaintenanceStatus::Closed, $tenant, MaintenanceStatusChanged::CAUSE_CONFIRMED);
    }

    public function test_contest_resolution(): void
    {
        ['mr' => $mr, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Completed);
        Sanctum::actingAs($tenant);

        $this->postJson("/api/maintenance-requests/{$mr->id}/contest-resolution", ['comment' => 'Toujours une fuite'])->assertOk();

        $this->assertOne(MaintenanceStatus::Completed, MaintenanceStatus::InProgress, $tenant, MaintenanceStatusChanged::CAUSE_CONTESTED);
    }

    /** Le diff ne crée aucun observateur de modèle : TCK-594 en crée un et lit cet événement. */
    public function test_no_maintenance_request_observer(): void
    {
        $this->assertFileDoesNotExist(app_path('Observers/MaintenanceRequestObserver.php'));
    }

    private function assertOne(MaintenanceStatus $from, MaintenanceStatus $to, User $actor, string $cause): void
    {
        Event::assertDispatchedTimes(MaintenanceStatusChanged::class, 1);
        Event::assertDispatched(MaintenanceStatusChanged::class, fn (MaintenanceStatusChanged $e): bool => $e->from === $from
            && $e->to === $to
            && $e->actor?->id === $actor->id
            && $e->cause === $cause);
    }

    /** @return array<string, mixed> */
    protected function quotePayload(): array
    {
        return ['amount' => 25000];
    }

    /** @return array<string, mixed> */
    protected function submittedQuote(): array
    {
        return ['quote_amount' => 25000, 'quote_currency' => 'XOF', 'quote_submitted_at' => now()];
    }
}
