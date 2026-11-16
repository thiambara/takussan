<?php

namespace Tests\Feature\Agency;

use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\User;
use App\Services\Agency\AgentHandoverService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-616 AC6 — le bail d'un bien saisi transmis à la passation (décision du porteur du 2026-11-16,
 * ADR-0059 amendement §7) : un bail `draft` dont le partant est le bailleur passe au repreneur de
 * `held_properties`, comme le reste de son portefeuille ; tout autre statut garde `landlord_id` = le
 * partant et est LISTÉ au bilan (`leases.to_review`).
 *
 * Moitié lecture — NON-RÉGRESSION de TCK-1926 : le partant, retiré de l'agence, ne lit plus le bail
 * actif resté à son nom (`LeasePolicy::view` ne rend le bail à `landlord_id` qu'avec un profil
 * propriétaire, `BailleurDuBien`).
 */
class AgentHandoverLeaseTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    public function test_l_agent_parti_ne_lit_plus_le_bail_du_bien_transmis(): void
    {
        Notification::fake();
        Http::preventStrayRequests();

        $agency = $this->agence();
        $partant = $this->personnel($agency);
        $repreneur = $this->personnel($agency);
        $admin = $this->personnel($agency, 'agency_admin');
        $bien = $this->bienDe($agency, $partant);
        $bail = Lease::factory()->active()->create([
            'property_id' => $bien->id, 'landlord_id' => $partant->id, 'agency_id' => $agency->id,
        ]);

        // Avant le départ, il le lit au titre du personnel.
        Sanctum::actingAs($partant);
        $this->getJson("/api/leases/{$bail->id}")->assertOk();

        $bilan = app(AgentHandoverService::class)
            ->transfer($agency, $partant, ['held_properties' => $repreneur], $admin, removeAfter: true);

        $this->assertContains($bien->id, $bilan['moved']['held_properties']);
        $this->assertSame([$bail->id], $bilan['leases']['to_review']);
        $this->assertSame([], $bilan['leases']['moved']);
        $this->assertNotEmpty($bilan['removed_profiles']);
        $this->assertSame($repreneur->id, (int) $bien->fresh()->user_id);
        $this->assertSame($partant->id, (int) $bail->fresh()->landlord_id);

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($partant->fresh());
        $this->getJson("/api/leases/{$bail->id}")->assertForbidden();
        $this->assertFalse($partant->fresh()->can('view', $bail->fresh()));
    }

    /**
     * AC6 — un brouillon du partant passe au repreneur ; son bail actif reste à son nom et figure au
     * bilan ; le brouillon d'un autre agent, sur le même bien, ne bouge pas.
     */
    public function test_le_brouillon_passe_au_repreneur_les_autres_sont_listes(): void
    {
        Notification::fake();
        Http::preventStrayRequests();

        $agency = $this->agence();
        $partant = $this->personnel($agency);
        $repreneur = $this->personnel($agency);
        $autre = $this->personnel($agency);
        $admin = $this->personnel($agency, 'agency_admin', attributes: [
            'two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
        ]);
        $bien = $this->bienDe($agency, $partant);
        $bail = fn (User $landlord, LeaseStatus $status) => Lease::factory()->create([
            'property_id' => $bien->id, 'landlord_id' => $landlord->id, 'agency_id' => $agency->id, 'status' => $status,
        ]);
        $brouillon = $bail($partant, LeaseStatus::Draft);
        $actif = $bail($partant, LeaseStatus::Active);
        $enSignature = $bail($partant, LeaseStatus::PendingSignature);
        $brouillonDAutrui = $bail($autre, LeaseStatus::Draft);

        $this->actingAsApi($admin)->apiPost("/api/agencies/{$agency->id}/members/{$partant->id}/handover", [
            'successor_id' => $repreneur->id,
        ])->assertOk()
            ->assertJsonPath('data.moved.held_properties', 1)
            ->assertJsonPath('data.leases.moved', 1)
            ->assertJsonPath('data.leases.to_review', [$actif->id, $enSignature->id]);

        $this->assertSame($repreneur->id, (int) $brouillon->fresh()->landlord_id);
        $this->assertSame($partant->id, (int) $actif->fresh()->landlord_id);
        $this->assertSame(LeaseStatus::Active, $actif->fresh()->status);
        $this->assertSame($partant->id, (int) $enSignature->fresh()->landlord_id);
        $this->assertSame($autre->id, (int) $brouillonDAutrui->fresh()->landlord_id);

        $journal = Activity::query()->where('log_name', 'AgentHandover')->where('event', 'leases')->sole();
        $this->assertSame([$brouillon->id], $journal->properties['ids']);
        $this->assertSame([$actif->id, $enSignature->id], $journal->properties['to_review_ids']);
    }

    /** Un repreneur bailleur de l'agence est refusé pour le bien saisi (ADR-0036) : le bien et ses baux restent au partant. */
    public function test_un_bien_laisse_au_partant_garde_ses_brouillons(): void
    {
        Notification::fake();
        Http::preventStrayRequests();

        $agency = $this->agence();
        $partant = $this->personnel($agency);
        $repreneurBailleur = $this->bailleur($agency);
        $admin = $this->personnel($agency, 'agency_admin');
        $bien = $this->bienDe($agency, $partant);
        $brouillon = Lease::factory()->create([
            'property_id' => $bien->id, 'landlord_id' => $partant->id, 'agency_id' => $agency->id, 'status' => LeaseStatus::Draft,
        ]);

        $bilan = app(AgentHandoverService::class)
            ->transfer($agency, $partant, ['held_properties' => $repreneurBailleur], $admin);

        $this->assertSame([$bien->id], $bilan['left_to_member']['held_properties']);
        $this->assertSame(['moved' => [], 'to_review' => []], $bilan['leases']);
        $this->assertSame($partant->id, (int) $brouillon->fresh()->landlord_id);
    }
}
