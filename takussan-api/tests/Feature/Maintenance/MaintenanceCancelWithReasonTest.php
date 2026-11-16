<?php

namespace Tests\Feature\Maintenance;

use App\Models\Activity;
use App\Models\AppNotification;
use App\Models\Enums\MaintenanceStatus;
use App\Services\Maintenance\MaintenanceJournal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\MaintenanceActors;

/**
 * TCK-2917 (ADR-0118 § 1) — qui annule une intervention dit pourquoi : le motif est exigé, stocké,
 * rendu à tout lecteur, porté au journal et dans les notifications du locataire et du prestataire.
 */
class MaintenanceCancelWithReasonTest extends ApiTestCase
{
    use MaintenanceActors, RefreshDatabase;

    private const MOTIF = 'Le bailleur fait intervenir son artisan';

    public function test_ac1_le_personnel_qui_annule_sans_motif_recoit_422(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        Sanctum::actingAs($this->agentOf($agency));

        foreach ([[], ['reason' => ''], ['reason' => '   ']] as $corps) {
            $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'cancelled', ...$corps])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('reason');
        }

        $this->assertSame(MaintenanceStatus::Assigned, $mr->refresh()->status);
    }

    public function test_ac1_avec_motif_200_et_le_locataire_et_le_prestataire_recoivent_le_motif(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'tenant' => $tenant, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        Sanctum::actingAs($this->agentOf($agency));

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'cancelled', 'reason' => self::MOTIF])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.cancellation_reason', self::MOTIF);

        $this->assertSame(self::MOTIF, $mr->refresh()->cancellation_reason);

        $locataire = AppNotification::query()->where('user_id', $tenant->id)->where('code', 'maintenance.step_cancelled_with_reason')->sole();
        $this->assertSame(self::MOTIF, $locataire->params['reason'] ?? null);
        $this->assertSame(0, AppNotification::query()->where('user_id', $tenant->id)->where('code', 'maintenance.step_cancelled')->count());

        $prestataire = AppNotification::query()->where('user_id', $provider->id)->where('code', 'maintenance.cancelled_with_reason')->sole();
        $this->assertSame(self::MOTIF, $prestataire->params['reason'] ?? null);
    }

    public function test_le_motif_est_lu_par_le_locataire_le_bailleur_et_le_prestataire(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'tenant' => $tenant, 'landlord' => $landlord, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        Sanctum::actingAs($this->agentOf($agency));
        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'cancelled', 'reason' => self::MOTIF])->assertOk();

        foreach (['locataire' => $tenant, 'bailleur' => $landlord] as $qui => $lecteur) {
            Sanctum::actingAs($lecteur);
            $this->getJson("/api/maintenance-requests/{$mr->id}")
                ->assertOk()
                ->assertJsonPath('data.cancellation_reason', self::MOTIF);
        }

        // Le prestataire : il lit encore la demande annulée tant que sa collaboration vit.
        Sanctum::actingAs($provider);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->assertJsonPath('data.cancellation_reason', self::MOTIF);
    }

    public function test_le_motif_est_au_journal_de_l_annulation(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        Sanctum::actingAs($agent = $this->agentOf($agency));
        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'cancelled', 'reason' => self::MOTIF])->assertOk();

        $entree = Activity::query()->where('log_name', MaintenanceJournal::LOG)->where('subject_id', $mr->id)
            ->where('event', 'status.transition')->sole();
        $this->assertSame(self::MOTIF, $entree->properties['reason'] ?? null);
        $this->assertSame($agent->id, $entree->causer_id);

        $journal = $this->getJson("/api/maintenance-requests/{$mr->id}/journal")->assertOk()->json('data');
        $annulation = collect($journal)->firstWhere('to', 'cancelled');
        $this->assertSame(self::MOTIF, $annulation['reason'] ?? null);
    }

    /**
     * L'annulation du système (bien supprimé, `PropertyObserver`) n'écrit pas de motif : son
     * `context.reason = property_deleted` est un code d'audit, jamais un texte montré au locataire.
     */
    public function test_l_annulation_du_systeme_ne_porte_aucun_motif(): void
    {
        ['mr' => $mr, 'property' => $property, 'tenant' => $tenant, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);

        $property->delete();

        $mr->refresh();
        $this->assertSame(MaintenanceStatus::Cancelled, $mr->status);
        $this->assertNull($mr->cancellation_reason);
        $this->assertSame(1, AppNotification::query()->where('user_id', $tenant->id)->where('code', 'maintenance.step_cancelled')->count());
        $this->assertSame(0, AppNotification::query()->where('code', 'like', '%_with_reason')->count());
        $this->assertSame(0, AppNotification::query()->where('user_id', $provider->id)->where('code', 'maintenance.cancelled_with_reason')->count());

        $entree = Activity::query()->where('log_name', MaintenanceJournal::LOG)->where('subject_id', $mr->id)
            ->where('event', 'status.transition')->sole();
        $this->assertArrayNotHasKey('reason', $entree->properties->toArray());
    }

    /** Un motif n'est exigé que pour l'annulation : les autres cibles n'en demandent pas. */
    public function test_les_autres_cibles_n_exigent_pas_de_motif(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Open);
        Sanctum::actingAs($this->agentOf($agency));

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'acknowledged'])->assertOk();
        $this->assertNull($mr->refresh()->cancellation_reason);
    }
}
