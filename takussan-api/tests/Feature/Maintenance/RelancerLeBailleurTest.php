<?php

namespace Tests\Feature\Maintenance;

use App\Models\Activity;
use App\Models\AgencyRole;
use App\Models\AppNotification;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Maintenance\MaintenanceJournal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\MaintenanceActors;

/**
 * TCK-2786 — « Relancer le bailleur » : en `awaiting_owner`, le personnel de l'agence du bien qui
 * gère les interventions rappelle au bailleur, par Takussan, qu'un devis attend sa décision. Une
 * relance par demande et par 24 heures ; jamais vers un bailleur parti ou suspendu.
 *
 * Aucun SMS ni courriel réel : la notification part par `NotificationService` (canal mobile fermé
 * pour ce code), et le test lit la ligne stockée.
 */
class RelancerLeBailleurTest extends ApiTestCase
{
    use MaintenanceActors, RefreshDatabase;

    private const CODE = 'maintenance.owner_reminder';

    public function test_ac1_l_agent_relance_le_bailleur_qui_recoit_l_avis_vers_la_decision(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord] = $this->chezLeBailleur();
        $agent = $this->agentOf($agency);

        Sanctum::actingAs($agent);
        $this->postJson("/api/maintenance-requests/{$mr->id}/owner-reminders")
            ->assertCreated()
            ->assertJsonPath('data.status', 'awaiting_owner')
            ->assertJsonPath('data.abilities.can_remind_owner', false);

        $this->assertNotNull($mr->refresh()->owner_reminded_at);

        $avis = AppNotification::query()->where('user_id', $landlord->id)->where('code', self::CODE)->sole();
        $this->assertSame('maintenance', $avis->target['kind'] ?? null);
        $this->assertSame($mr->id, $avis->target['id'] ?? null);
        $this->assertSame($mr->title, $avis->params['request'] ?? null);

        $entree = $this->journal($mr)->firstWhere('event', MaintenanceJournal::OWNER_REMINDED);
        $this->assertNotNull($entree);
        $this->assertSame($agent->id, $entree->causer_id);
    }

    public function test_ac2_une_relance_par_24_heures_avec_la_date_permise(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord] = $this->chezLeBailleur();
        Sanctum::actingAs($this->agentOf($agency));

        $this->travelTo(now()->startOfMinute());
        $this->postJson("/api/maintenance-requests/{$mr->id}/owner-reminders")->assertCreated();
        $permise = $mr->refresh()->owner_reminded_at->copy()->addHours(24);

        $this->travel(23)->hours();
        $this->postJson("/api/maintenance-requests/{$mr->id}/owner-reminders")
            ->assertConflict()
            ->assertJsonPath('code', 'maintenance.owner_reminder_too_soon')
            ->assertJsonPath('params.available_at', $permise->utc()->format(DATE_ATOM));
        $this->assertSame(1, AppNotification::query()->where('user_id', $landlord->id)->where('code', self::CODE)->count());

        $this->travel(61)->minutes();
        $this->postJson("/api/maintenance-requests/{$mr->id}/owner-reminders")->assertCreated();
        $this->assertSame(2, AppNotification::query()->where('user_id', $landlord->id)->where('code', self::CODE)->count());
    }

    public function test_ac3_ni_le_prestataire_ni_le_locataire_ni_le_bailleur(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'tenant' => $tenant, 'provider' => $provider] = $this->chezLeBailleur();

        foreach (['prestataire' => $provider, 'locataire' => $tenant, 'bailleur' => $landlord] as $qui => $user) {
            Sanctum::actingAs($user);
            $this->postJson("/api/maintenance-requests/{$mr->id}/owner-reminders")->assertForbidden();
            $this->assertNull($mr->refresh()->owner_reminded_at, $qui);
        }
        $this->assertSame(0, AppNotification::query()->where('code', self::CODE)->count());
    }

    /**
     * Le bailleur qui est AUSSI agent de l'agence (avec `maintenance.assign`) ne se relance pas
     * lui-même : la règle est `isTeamPrincipalFor`, que le bailleur du bien ne passe jamais. Le
     * bailleur sans profil de personnel est déjà refusé par la capacité : ce cas-ci est le seul qui
     * distingue `isTeamPrincipalFor` d'`isPrincipalFor`.
     */
    public function test_le_bailleur_aussi_agent_de_l_agence_ne_se_relance_pas(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord] = $this->chezLeBailleur();
        AgentProfile::query()->create(['user_id' => $landlord->id, 'agency_id' => $agency->id]);

        Sanctum::actingAs($landlord);
        $this->postJson("/api/maintenance-requests/{$mr->id}/owner-reminders")->assertForbidden();
        $this->assertNull($mr->refresh()->owner_reminded_at);

        // Témoin : un agent de l'agence, lui, relance.
        Sanctum::actingAs($this->agentOf($agency));
        $this->postJson("/api/maintenance-requests/{$mr->id}/owner-reminders")->assertCreated();
    }

    public function test_le_personnel_d_une_autre_agence_ou_sans_maintenance_assign_recoit_403(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->chezLeBailleur();
        ['agency' => $autre] = $this->maintenanceScenario();

        Sanctum::actingAs($this->agentOf($autre));
        $this->postJson("/api/maintenance-requests/{$mr->id}/owner-reminders")->assertForbidden();

        Sanctum::actingAs($this->agentWithout($agency, Capability::MaintenanceAssign));
        $this->postJson("/api/maintenance-requests/{$mr->id}/owner-reminders")->assertForbidden();

        $this->assertNull($mr->refresh()->owner_reminded_at);
    }

    public function test_ac3_hors_awaiting_owner_409(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->chezLeBailleur(MaintenanceStatus::QuoteSubmitted);

        Sanctum::actingAs($this->agentOf($agency));
        $this->postJson("/api/maintenance-requests/{$mr->id}/owner-reminders")
            ->assertConflict()
            ->assertJsonPath('code', 'maintenance.not_awaiting_owner');
        $this->assertNull($mr->refresh()->owner_reminded_at);
    }

    /** TCK-2753 — parti (`inactive`) ou suspendu (`blocked`) : pas de relance, et le journal le dit, une fois. */
    public function test_un_bailleur_parti_ou_suspendu_n_est_pas_relance(): void
    {
        foreach ([OwnerProfileStatus::Inactive, OwnerProfileStatus::Blocked] as $statut) {
            ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord] = $this->chezLeBailleur();
            OwnerProfile::query()->where('user_id', $landlord->id)->where('agency_id', $agency->id)->update(['status' => $statut->value]);
            Sanctum::actingAs($agent = $this->agentOf($agency));

            $show = $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk();
            $this->assertFalse($show->json('data.abilities.can_remind_owner'), $statut->value);

            for ($i = 0; $i < 2; $i++) {
                $this->postJson("/api/maintenance-requests/{$mr->id}/owner-reminders")
                    ->assertConflict()
                    ->assertJsonPath('code', 'maintenance.owner_unavailable');
            }

            $this->assertNull($mr->refresh()->owner_reminded_at);
            $this->assertSame(0, AppNotification::query()->where('user_id', $landlord->id)->where('code', self::CODE)->count());
            $refus = $this->journal($mr)->where('event', MaintenanceJournal::OWNER_UNAVAILABLE);
            $this->assertCount(1, $refus, $statut->value);
            $this->assertSame($agent->id, $refus->first()->causer_id);
        }
    }

    public function test_l_aptitude_suit_l_acteur_et_la_cadence(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord] = $this->chezLeBailleur();

        Sanctum::actingAs($landlord);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->assertJsonPath('data.abilities.can_remind_owner', false);

        Sanctum::actingAs($this->agentOf($agency));
        $this->getJson("/api/maintenance-requests/{$mr->id}")
            ->assertOk()
            ->assertJsonPath('data.abilities.can_remind_owner', true)
            ->assertJsonPath('data.owner_reminded_at', null);

        $this->postJson("/api/maintenance-requests/{$mr->id}/owner-reminders")->assertCreated();
        $this->getJson("/api/maintenance-requests/{$mr->id}")
            ->assertOk()
            ->assertJsonPath('data.abilities.can_remind_owner', false)
            ->assertJsonPath('data.owner_reminded_at', $mr->refresh()->owner_reminded_at->utc()->format(DATE_ATOM));
    }

    /** `owner_reminded_at` est une affaire du donneur d'ordre : ni le locataire ni le prestataire ne le lisent. */
    public function test_owner_reminded_at_n_est_servi_qu_au_donneur_d_ordre(): void
    {
        ['mr' => $mr, 'tenant' => $tenant, 'provider' => $provider] = $this->chezLeBailleur();
        $mr->forceFill(['owner_reminded_at' => now()])->save();

        foreach ([$tenant, $provider] as $user) {
            Sanctum::actingAs($user);
            $this->assertArrayNotHasKey('owner_reminded_at', $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->json('data'));
        }
    }

    /** @return array<string, mixed> */
    private function chezLeBailleur(MaintenanceStatus $status = MaintenanceStatus::AwaitingOwner): array
    {
        $scenario = $this->maintenanceScenario($status, [
            'quote_amount' => 75000,
            'quote_currency' => 'XOF',
            'quote_submitted_at' => now(),
            'accepted_at' => now(),
        ]);
        OwnerProfile::query()
            ->where('user_id', $scenario['landlord']->id)
            ->where('agency_id', $scenario['agency']->id)
            ->update(['works_approval_threshold' => 50000]);

        return $scenario;
    }

    /** @return Collection<int, Activity> */
    private function journal(MaintenanceRequest $mr)
    {
        return Activity::query()->where('log_name', MaintenanceJournal::LOG)
            ->where('subject_type', $mr->getMorphClass())->where('subject_id', $mr->id)
            ->orderBy('id')->get();
    }

    private function agentWithout($agency, Capability ...$retirees): User
    {
        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities(array_values(array_filter(Capability::cases(), fn (Capability $c) => ! in_array($c, $retirees, true))))
            ->create(['agency_id' => $agency->id]);

        $user = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $user->id, 'agency_id' => $agency->id, 'agency_role_id' => $role->id]);

        return $user;
    }
}
