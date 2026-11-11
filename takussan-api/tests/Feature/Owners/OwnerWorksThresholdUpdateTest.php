<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Support\MaintenanceActors;

/**
 * TCK-2640 (AC3, AC4) — l'admin règle le plafond de travaux d'un bailleur du carnet
 * (`PATCH /api/owners/{id}`, capacité `owners.update`). L'écriture est journalisée (avant, après,
 * auteur), et le plafond vaut pour les devis approuvés ENSUITE (ADR-0037 : il est lu à
 * l'approbation par l'agence).
 */
class OwnerWorksThresholdUpdateTest extends ApiTestCase
{
    use MaintenanceActors;
    use RefreshDatabase;

    private function ownerIn(Agency $agency): OwnerProfile
    {
        return OwnerProfile::factory()->create(['agency_id' => $agency->id]);
    }

    /** AC3 — l'admin enregistre 150 000 ; relu, le plafond y est ; l'agent est refusé. */
    public function test_l_admin_regle_le_plafond_et_l_agent_est_refuse(): void
    {
        $agency = Agency::factory()->create();
        $profile = $this->ownerIn($agency);

        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->apiPatch("/api/owners/{$profile->id}", ['works_approval_threshold' => 150000])
            ->assertOk()
            ->assertJsonPath('data.works_approval_threshold', 150000);
        $this->apiGet("/api/owners/{$profile->id}")->assertOk()->assertJsonPath('data.works_approval_threshold', 150000);
        $this->assertEquals(150000, $profile->refresh()->works_approval_threshold);

        $activity = Activity::query()->where('event', 'owner_works_threshold_updated')->sole();
        $this->assertSame($admin->id, $activity->causer_id);
        $this->assertSame($profile->id, $activity->subject_id);
        $this->assertSame(OwnerProfile::class, $activity->subject_type);
        $this->assertNull($activity->properties['before']);
        $this->assertEquals(150000, $activity->properties['after']);

        // Retirer le plafond : `null`, journalisé avec l'ancienne valeur.
        $this->apiPatch("/api/owners/{$profile->id}", ['works_approval_threshold' => null])
            ->assertOk()->assertJsonPath('data.works_approval_threshold', null);
        $last = Activity::query()->where('event', 'owner_works_threshold_updated')->latest('id')->first();
        $this->assertEquals(150000, $last->properties['before']);
        $this->assertNull($last->properties['after']);

        // Même valeur : rien n'est écrit au journal.
        $this->apiPatch("/api/owners/{$profile->id}", ['works_approval_threshold' => null])->assertOk();
        $this->assertSame(2, Activity::query()->where('event', 'owner_works_threshold_updated')->count());

        $this->apiActingAsRole('agent', ['agency' => $agency]);
        $this->apiPatch("/api/owners/{$profile->id}", ['works_approval_threshold' => 1])->assertForbidden();
        // L'agent ne lit pas non plus les règles du champ.
        $this->apiPatch("/api/owners/{$profile->id}", ['works_approval_threshold' => -5])->assertForbidden();
        $this->assertNull($profile->refresh()->works_approval_threshold);
    }

    public function test_le_corps_est_valide_et_le_profil_d_une_autre_agence_rend_404(): void
    {
        $agency = Agency::factory()->create();
        $profile = $this->ownerIn($agency);
        $foreign = $this->ownerIn(Agency::factory()->create());

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->apiPatch("/api/owners/{$profile->id}", ['works_approval_threshold' => -5])->assertUnprocessable();
        $this->apiPatch("/api/owners/{$profile->id}", ['works_approval_threshold' => 'beaucoup'])->assertUnprocessable();
        $this->apiPatch("/api/owners/{$profile->id}", [])->assertUnprocessable();
        $this->apiPatch("/api/owners/{$foreign->id}", ['works_approval_threshold' => 1000])->assertNotFound();
        $this->assertNull($foreign->refresh()->works_approval_threshold);
    }

    public function test_une_agence_individuelle_et_le_bailleur_lui_meme_sont_refuses(): void
    {
        $individual = Agency::factory()->individual()->create();
        $profile = $this->ownerIn($individual);
        $this->apiActingAsRole('agency_admin', ['agency' => $individual]);
        $this->apiPatch("/api/owners/{$profile->id}", ['works_approval_threshold' => 1000])->assertForbidden();

        $agency = Agency::factory()->create();
        $mine = $this->ownerIn($agency);
        $this->actingAs(User::query()->findOrFail($mine->user_id), 'sanctum');
        $this->patchJson("/api/owners/{$mine->id}", ['works_approval_threshold' => 999999999])->assertNotFound();
        $this->assertNull($mine->refresh()->works_approval_threshold);
    }

    /**
     * AC4 — après le réglage à 150 000, un devis de 200 000 approuvé par l'agent attend le bailleur ;
     * un devis de 100 000 est approuvé directement.
     */
    public function test_le_plafond_regle_decide_des_devis_approuves_ensuite(): void
    {
        $above = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, ['quote_amount' => 200000, 'quote_currency' => 'XOF', 'quote_submitted_at' => now()]);
        $agency = $above['agency'];
        $profile = OwnerProfile::query()->where('user_id', $above['landlord']->id)->where('agency_id', $agency->id)->sole();
        $agent = $this->agentOf($agency);

        // Sans plafond, rien n'attend le bailleur : c'est bien le réglage qui décide.
        $this->assertNull($profile->works_approval_threshold);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->apiPatch("/api/owners/{$profile->id}", ['works_approval_threshold' => 150000])->assertOk();

        Sanctum::actingAs($agent);
        $this->postJson("/api/maintenance-requests/{$above['mr']->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'awaiting_owner');

        $below = $above['mr']->replicate(['quote_decision_by_id', 'quote_decided_at']);
        $below->fill(['status' => MaintenanceStatus::QuoteSubmitted, 'quote_amount' => 100000])->save();
        $this->postJson("/api/maintenance-requests/{$below->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'approved');
        // Un devis déjà en attente du bailleur ne bouge pas quand le plafond change : il est tranché
        // par le bailleur, plus par le plafond.
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->apiPatch("/api/owners/{$profile->id}", ['works_approval_threshold' => null])->assertOk();
        $this->assertSame(MaintenanceStatus::AwaitingOwner, $above['mr']->refresh()->status);
    }
}
