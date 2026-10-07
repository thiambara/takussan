<?php

namespace Tests\Feature\Maintenance;

use App\Models\AppNotification;
use App\Models\Enums\MaintenanceStatus;
use App\Models\User;
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

        $expected = __('maintenance.notifications.assigned.title', ['title' => $mr->title], 'wo');
        $this->assertNotSame(__('maintenance.notifications.assigned.title', ['title' => $mr->title], 'fr'), $expected);
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
            ['assigned', 'in_progress', 'completed'],
            AppNotification::query()->where('user_id', $tenant->id)->orderBy('id')->get()
                ->map(fn (AppNotification $n) => $n->data['status'] === 'open' ? 'assigned' : $n->data['status'])->all(),
        );
        $this->assertSame(
            __('maintenance.notifications.step.title', ['title' => $mr->title, 'status' => __('maintenance.status.in_progress', [], 'fr')], 'fr'),
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

        $body = AppNotification::query()->where('user_id', $tenant->id)->sole()->body;
        $this->assertStringContainsString($mr->scheduled_at->copy()->locale('fr')->isoFormat('LLL'), $body);
    }

    /** AC10 — devis soumis sur une demande du locataire : rien au locataire, l'agence et le bailleur. */
    public function test_submitted_quote_goes_to_principals_never_to_the_tenant(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'tenant' => $tenant, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);
        $agent = $this->agentOf($agency);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", ['amount' => 27000])->assertOk();

        $this->assertSame(0, AppNotification::query()->where('user_id', $tenant->id)->count());
        foreach ([$agent, $landlord] as $principal) {
            $this->assertSame(
                [__('maintenance.notifications.quote_submitted.title', ['title' => $mr->title], 'fr')],
                $this->titlesFor($principal),
            );
        }

        Sanctum::actingAs($tenant);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->assertJsonMissingPath('data.quote_amount');

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
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", ['amount' => 27000])->assertOk();

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
    private function titlesFor(User $user): array
    {
        return AppNotification::query()->where('user_id', $user->id)->orderBy('id')->pluck('title')->all();
    }
}
