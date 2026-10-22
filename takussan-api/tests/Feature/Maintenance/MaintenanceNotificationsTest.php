<?php

namespace Tests\Feature\Maintenance;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Models\AppNotification;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC9, AC10 et la moitié « notifié avec le motif » d'AC11.
 *
 * Avant : aucune notification sur `transition()`, `complete()` ni l'assignation ; les devis en
 * prose française écrite en dur, adressés au demandeur (`$mr->requester ?? owner`) — le locataire
 * recevait le prix, l'agence rien.
 */
class MaintenanceNotificationsTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /** AC9 — le titre est la chaîne de la langue DU DESTINATAIRE, pas celle de l'auteur. */
    public function test_assigned_provider_is_notified_in_their_own_language(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        $provider = $this->providerFor($agency, userAttributes: ['preferred_language' => 'wo']);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $provider->id])->assertOk();

        $expected = __('notifications.codes.maintenance.assigned.title', ['request' => $mr->title], 'wo');
        $this->assertNotSame(__('notifications.codes.maintenance.assigned.title', ['request' => $mr->title], 'fr'), $expected);
        $this->assertSame([$expected], $this->titlesFor($provider));
    }

    /** AC9 — le locataire demandeur suit son intervention : assignée, en cours, terminée. */
    public function test_requester_is_told_each_step(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'tenant' => $tenant, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        $provider = $this->providerFor($agency);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $provider->id])->assertOk();

        Sanctum::actingAs($provider);
        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'in_progress'])->assertOk();
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['resolution_notes' => 'Réparé'])->assertOk();

        $this->assertSame(
            ['maintenance.step_assigned', 'maintenance.step_in_progress', 'maintenance.step_completed'],
            AppNotification::query()->where('user_id', $tenant->id)->orderBy('id')->pluck('code')->all(),
        );
        $this->assertSame(
            __('notifications.codes.maintenance.step_in_progress.title', ['request' => $mr->title], 'fr'),
            $this->titlesFor($tenant)[1],
        );
    }

    /** Le passage prévu (`scheduled_at`) est dans le corps de l'étape. */
    public function test_requester_step_carries_the_scheduled_date(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Assigned, [
            'scheduled_at' => now()->addDays(2)->setTime(9, 30),
        ]);

        Sanctum::actingAs($provider);
        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'in_progress'])->assertOk();

        $notification = AppNotification::query()->where('user_id', $tenant->id)->sole();
        $this->assertSame('maintenance.step_in_progress_scheduled', $notification->code);
        $this->assertStringContainsString(
            $mr->scheduled_at->copy()->setTimezone($tenant->timezone ?: NotificationRenderer::DEFAULT_TIMEZONE)->locale('fr')->isoFormat('LLL'),
            $notification->body,
        );
    }

    /** AC10 — devis soumis sur une demande du locataire : rien au locataire, l'agence et le bailleur. */
    public function test_submitted_quote_goes_to_principals_never_to_the_tenant(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'tenant' => $tenant, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);
        $agent = $this->agentOf($agency);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quoteBody(27000))->assertOk();

        $this->assertSame(0, AppNotification::query()->where('user_id', $tenant->id)->count());
        foreach ([$agent, $landlord] as $principal) {
            $this->assertSame(
                [__('notifications.codes.maintenance_quote.submitted.title', ['request' => $mr->title], 'fr')],
                $this->titlesFor($principal),
            );
        }

        Sanctum::actingAs($tenant);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()
            ->assertJsonMissingPath('data.quote_amount')
            ->assertJsonMissingPath('data.quote_lines')
            ->assertJsonMissingPath('data.quote_currency');

        // Témoin : le bailleur, donneur d'ordre, voit le montant.
        Sanctum::actingAs($landlord);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->assertJsonPath('data.quote_amount', 27000);
    }

    /** AC10 — même chose quand un agent a ouvert la demande : le bailleur l'apprend. */
    public function test_landlord_hears_of_the_quote_when_an_agent_opened_the_request(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);
        $agent = $this->agentOf($agency);
        $mr->forceFill(['requester_id' => $agent->id])->save();

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quoteBody(27000))->assertOk();

        $this->assertCount(1, $this->titlesFor($landlord));
        $this->assertCount(1, $this->titlesFor($agent));
    }

    /** AC11 — le refus revient au donneur d'ordre avec son motif. */
    public function test_decline_notifies_principals_with_the_reason(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Assigned);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/decline", ['reason' => 'Hors de ma zone'])->assertOk();

        $this->assertStringContainsString('Hors de ma zone', AppNotification::query()->where('user_id', $landlord->id)->sole()->body);
        $this->assertSame(0, AppNotification::query()->where('user_id', $provider->id)->count());
    }

    /** L'auteur d'un geste n'en est pas notifié. */
    public function test_actor_is_not_notified_of_their_own_gesture(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress);

        Sanctum::actingAs($landlord);
        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'cancelled'])->assertOk();

        $this->assertSame(0, AppNotification::query()->where('user_id', $landlord->id)->count());
        $this->assertSame(1, AppNotification::query()->where('user_id', $mr->assigned_to)->count());
    }

    /** @return list<string> */
    /**
     * TCK-1349 (P153.08) — sur un bien d'agence, l'assigné que `ProviderEligibility::isAssignable`
     * refuse (collaboration finie) n'a plus d'accès : les avis « prestataire » ne lui partent plus.
     * Les donneurs d'ordre gardent les leurs.
     */
    public function test_l_assigne_qui_n_est_plus_assignable_ne_recoit_plus_les_avis_prestataire(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress);
        ServiceProviderAgencyCollaboration::query()->update(['status' => CollaborationStatus::Ended->value]);

        event(new MaintenanceStatusChanged($mr, MaintenanceStatus::Assigned, MaintenanceStatus::QuoteRequested, null, MaintenanceStatusChanged::CAUSE_QUOTE_REQUESTED));
        event(new MaintenanceStatusChanged($mr, MaintenanceStatus::Completed, MaintenanceStatus::Closed, null, MaintenanceStatusChanged::CAUSE_CONFIRMED));

        $this->assertSame([], $this->titlesFor($provider));
        $this->assertCount(1, $this->titlesFor($landlord));
    }

    /** TCK-1349 — le cas de la décision : un membre de l'équipe retiré en `leave_unassigned`. */
    public function test_le_membre_retire_en_leave_unassigned_ne_recoit_plus_les_avis_prestataire(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress);
        $agent = $this->agentOf($agency);
        $mr->forceFill(['assigned_to' => $agent->id])->save();
        app(AgencyMemberRemovalService::class)->remove($agency, $agent, $landlord, leaveUnassigned: true);

        event(new MaintenanceStatusChanged($mr->fresh(), MaintenanceStatus::Assigned, MaintenanceStatus::QuoteRequested, null, MaintenanceStatusChanged::CAUSE_QUOTE_REQUESTED));

        $this->assertSame([], $this->titlesFor($agent));
    }

    /** TCK-1349 — témoin : l'assigné encore assignable reçoit les mêmes avis. */
    public function test_l_assigne_assignable_recoit_les_avis_prestataire(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::InProgress);

        event(new MaintenanceStatusChanged($mr, MaintenanceStatus::Assigned, MaintenanceStatus::QuoteRequested, null, MaintenanceStatusChanged::CAUSE_QUOTE_REQUESTED));

        $this->assertCount(1, $this->titlesFor($provider));
    }

    /** TCK-1349 — un bien sans agence garde ses avis tels quels (aucun prestataire n'y est « assignable »). */
    public function test_un_bien_sans_agence_garde_les_avis_de_l_assigne(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'property' => $property] = $this->maintenanceScenario(MaintenanceStatus::InProgress);
        $property->forceFill(['agency_id' => null])->save();

        event(new MaintenanceStatusChanged($mr->fresh(), MaintenanceStatus::Assigned, MaintenanceStatus::QuoteRequested, null, MaintenanceStatusChanged::CAUSE_QUOTE_REQUESTED));

        $this->assertCount(1, $this->titlesFor($provider));
    }

    private function titlesFor(User $user): array
    {
        return AppNotification::query()->where('user_id', $user->id)->orderBy('id')->pluck('title')->all();
    }
}
