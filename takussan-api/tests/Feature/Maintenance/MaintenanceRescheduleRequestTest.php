<?php

namespace Tests\Feature\Maintenance;

use App\Models\AppNotification;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRescheduleRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\MaintenanceActors;

/**
 * TCK-2917 (ADR-0118 § 3) — le locataire demandeur demande un autre créneau. La demande ne change
 * jamais `scheduled_at` ; elle prévient l'agence et le prestataire ; elle se clôt quand l'un d'eux
 * pose un créneau par les chemins existants.
 */
class MaintenanceRescheduleRequestTest extends ApiTestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_ac3_le_demandeur_propose_deux_creneaux_201_agence_prevenue_scheduled_at_inchange(): void
    {
        $this->travelTo(now()->setTime(9, 0));
        $prevu = now()->addDays(2)->setTime(10, 0);
        ['mr' => $mr, 'agency' => $agency, 'tenant' => $tenant, 'provider' => $provider] = $this->maintenanceScenario(
            MaintenanceStatus::Assigned,
            ['scheduled_at' => $prevu, 'accepted_at' => now()],
        );
        $agent = $this->agentOf($agency);

        $creneaux = [now()->addDays(4)->setTime(15, 0)->toIso8601String(), now()->addDays(3)->setTime(9, 30)->toIso8601String()];
        Sanctum::actingAs($tenant);
        $res = $this->postJson("/api/maintenance-requests/{$mr->id}/reschedule-requests", [
            'proposed_slots' => $creneaux,
            'note' => 'Je travaille ce jour-là.',
        ])->assertCreated();

        $this->assertSame($prevu->utc()->format(DATE_ATOM), $res->json('data.scheduled_at'));
        $this->assertTrue($mr->refresh()->scheduled_at->equalTo($prevu));
        // Dans l'ordre chronologique.
        $this->assertSame(
            [now()->addDays(3)->setTime(9, 30)->utc()->format(DATE_ATOM), now()->addDays(4)->setTime(15, 0)->utc()->format(DATE_ATOM)],
            $res->json('data.pending_reschedule_request.proposed_slots'),
        );
        $this->assertSame('Je travaille ce jour-là.', $res->json('data.pending_reschedule_request.note'));

        foreach (['agent' => $agent, 'prestataire' => $provider] as $qui => $destinataire) {
            $avis = AppNotification::query()->where('user_id', $destinataire->id)->where('code', 'maintenance.reschedule_requested')->first();
            $this->assertNotNull($avis, $qui);
            $this->assertSame(2, (int) ($avis->params['slots'] ?? 0), $qui);
        }
        $this->assertSame(0, AppNotification::query()->where('user_id', $tenant->id)->where('code', 'maintenance.reschedule_requested')->count());

        // Le personnel lit la demande en attente.
        Sanctum::actingAs($agent);
        $this->getJson("/api/maintenance-requests/{$mr->id}")
            ->assertOk()
            ->assertJsonPath('data.pending_reschedule_request.note', 'Je travaille ce jour-là.')
            ->assertJsonPath('data.abilities.can_request_reschedule', false);
    }

    public function test_ac3_un_autre_locataire_recoit_403(): void
    {
        ['mr' => $mr] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        ['tenant' => $autre] = $this->maintenanceScenario(MaintenanceStatus::Assigned);

        Sanctum::actingAs($autre);
        $this->postJson("/api/maintenance-requests/{$mr->id}/reschedule-requests", [
            'proposed_slots' => [now()->addDays(3)->toIso8601String()],
        ])->assertForbidden();

        $this->assertSame(0, MaintenanceRescheduleRequest::query()->count());
    }

    public function test_ni_le_prestataire_ni_l_agence_ni_sur_une_demande_close(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'provider' => $provider, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        $corps = ['proposed_slots' => [now()->addDays(3)->toIso8601String()]];

        foreach ([$provider, $this->agentOf($agency)] as $acteur) {
            Sanctum::actingAs($acteur);
            $this->postJson("/api/maintenance-requests/{$mr->id}/reschedule-requests", $corps)->assertForbidden();
        }

        $mr->forceFill(['status' => MaintenanceStatus::Cancelled])->save();
        Sanctum::actingAs($tenant);
        $this->postJson("/api/maintenance-requests/{$mr->id}/reschedule-requests", $corps)->assertForbidden();
        $this->assertSame(0, MaintenanceRescheduleRequest::query()->count());
    }

    public function test_les_creneaux_sont_valides_a_venir_et_au_plus_trois(): void
    {
        ['mr' => $mr, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        Sanctum::actingAs($tenant);

        foreach ([
            [],
            [now()->subDay()->toIso8601String()],
            ['demain'],
            array_map(fn (int $j) => now()->addDays($j)->toIso8601String(), [1, 2, 3, 4]),
            [now()->addYears(2)->toIso8601String()],
        ] as $creneaux) {
            $this->postJson("/api/maintenance-requests/{$mr->id}/reschedule-requests", ['proposed_slots' => $creneaux])
                ->assertUnprocessable();
        }
        $this->assertSame(0, MaintenanceRescheduleRequest::query()->count());
    }

    public function test_une_nouvelle_demande_remplace_la_precedente(): void
    {
        ['mr' => $mr, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        Sanctum::actingAs($tenant);

        $this->postJson("/api/maintenance-requests/{$mr->id}/reschedule-requests", ['proposed_slots' => [now()->addDays(3)->toIso8601String()]])->assertCreated();
        $this->postJson("/api/maintenance-requests/{$mr->id}/reschedule-requests", ['proposed_slots' => [now()->addDays(5)->toIso8601String()], 'note' => 'Plutôt ça'])
            ->assertCreated()
            ->assertJsonPath('data.pending_reschedule_request.note', 'Plutôt ça');

        $this->assertSame(
            [MaintenanceRescheduleRequest::SUPERSEDED, MaintenanceRescheduleRequest::PENDING],
            MaintenanceRescheduleRequest::query()->orderBy('id')->pluck('status')->all(),
        );
    }

    public function test_le_creneau_pose_par_l_agence_clot_la_demande(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        Sanctum::actingAs($tenant);
        $this->postJson("/api/maintenance-requests/{$mr->id}/reschedule-requests", ['proposed_slots' => [now()->addDays(3)->setTime(9, 0)->toIso8601String()]])->assertCreated();

        Sanctum::actingAs($agent = $this->agentOf($agency));
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => now()->addDays(3)->setTime(9, 0)->toIso8601String()])
            ->assertOk()
            ->assertJsonPath('data.pending_reschedule_request', null);

        $ligne = MaintenanceRescheduleRequest::query()->sole();
        $this->assertSame(MaintenanceRescheduleRequest::ACCEPTED, $ligne->status);
        $this->assertSame($agent->id, $ligne->resolved_by_id);
    }

    public function test_le_creneau_propose_a_l_acceptation_par_le_prestataire_clot_la_demande(): void
    {
        ['mr' => $mr, 'tenant' => $tenant, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        Sanctum::actingAs($tenant);
        $this->postJson("/api/maintenance-requests/{$mr->id}/reschedule-requests", ['proposed_slots' => [now()->addDays(3)->toIso8601String()]])->assertCreated();

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => now()->addDays(3)->setTime(11, 0)->toIso8601String()])->assertOk();

        $this->assertSame(MaintenanceRescheduleRequest::ACCEPTED, MaintenanceRescheduleRequest::query()->sole()->status);
    }

    public function test_l_aptitude_suit_le_demandeur(): void
    {
        ['mr' => $mr, 'tenant' => $tenant, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);

        Sanctum::actingAs($tenant);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->assertJsonPath('data.abilities.can_request_reschedule', true);
        Sanctum::actingAs($provider);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->assertJsonPath('data.abilities.can_request_reschedule', false);

        $mr->forceFill(['status' => MaintenanceStatus::Completed, 'completed_at' => now()])->save();
        Sanctum::actingAs($tenant);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->assertJsonPath('data.abilities.can_request_reschedule', false);
    }
}
