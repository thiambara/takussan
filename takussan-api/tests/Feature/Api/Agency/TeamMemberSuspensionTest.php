<?php

namespace Tests\Feature\Api\Agency;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\Capability;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\UserStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-587 (ADR-0031 §2, AC7) — suspendre un membre DANS l'agence, jamais sur son compte.
 */
class TeamMemberSuspensionTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agencyA;

    private Agency $agencyB;

    private User $adminA;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agencyA = Agency::factory()->create();
        $this->agencyB = Agency::factory()->create();
        $this->adminA = $this->agencyAdmin($this->agencyA);
    }

    private function suspend(User $target, ?Agency $agency = null): TestResponse
    {
        $agency ??= $this->agencyA;

        return $this->postJson("/api/agencies/{$agency->id}/team/{$target->id}/suspend");
    }

    public function test_un_bailleur_de_deux_agences_est_suspendu_de_l_une_et_agit_dans_l_autre(): void
    {
        $bailleur = User::factory()->withOwnerProfile($this->agencyA)->withOwnerProfile($this->agencyB)->create();
        $profileA = OwnerProfile::query()->where('user_id', $bailleur->id)->where('agency_id', $this->agencyA->id)->firstOrFail();
        $profileB = OwnerProfile::query()->where('user_id', $bailleur->id)->where('agency_id', $this->agencyB->id)->firstOrFail();

        $this->actingAsApi($this->adminA);
        $this->suspend($bailleur)
            ->assertOk()
            ->assertExactJson(['data' => [
                'user_id' => $bailleur->id,
                'profiles' => [['type' => 'owner', 'id' => $profileA->id, 'status' => 'blocked']],
            ]]);

        $this->assertSame('blocked', $profileA->fresh()->status->value);
        $this->assertSame('active', $profileB->fresh()->status->value);
        $this->assertSame(UserStatus::Active, $bailleur->fresh()->status);

        // Il agit dans B : l'auto-bascule ne retient plus que son profil de B, et sa proposition
        // de bien y est rattachée.
        $id = $this->actingAsApi($bailleur->fresh())
            ->postJson('/api/properties', [
                'title' => 'Studio Mermoz',
                'type' => 'apartment',
                'contract_type' => 'rent',
                'rent_period' => 'monthly',
                'price' => 150000,
            ])
            ->assertCreated()
            ->json('data.id');
        $this->assertSame($this->agencyB->id, (int) Property::query()->findOrFail($id)->agency_id);

        $activity = Activity::query()->where('event', 'team_member_suspended')->sole();
        $this->assertSame($this->adminA->id, (int) $activity->causer_id);
        $this->assertSame($this->agencyA->id, $activity->properties['agency_id']);
    }

    public function test_l_administrateur_principal_et_soi_meme_ne_se_suspendent_pas(): void
    {
        $principal = $this->agencyAdmin($this->agencyA);
        $this->agencyA->update(['primary_admin_id' => $principal->id]);

        $this->actingAsApi($this->adminA);
        $this->suspend($principal)->assertStatus(422);
        $this->suspend($this->adminA)->assertStatus(422);

        $this->assertSame('active', AgencyAdminProfile::query()->where('user_id', $principal->id)->sole()->status->value);
        $this->assertSame(0, Activity::query()->where('event', 'team_member_suspended')->count());
    }

    public function test_un_agent_d_une_seule_agence_perd_ses_jetons_et_se_reactive(): void
    {
        $agent = $this->agencyAgent($this->agencyA);
        $agent->createToken('session');
        $profile = AgentProfile::query()->where('user_id', $agent->id)->sole();

        $this->actingAsApi($this->adminA);
        $this->suspend($agent)->assertOk()->assertJsonPath('data.profiles.0.status', 'suspended');

        $this->assertSame('suspended', $profile->fresh()->status->value);
        $this->assertSame(0, $agent->tokens()->count());

        $this->postJson("/api/agencies/{$this->agencyA->id}/team/{$agent->id}/reactivate")
            ->assertOk()
            ->assertJsonPath('data.profiles.0.status', 'active');
        $this->assertSame('active', $profile->fresh()->status->value);
    }

    public function test_un_membre_d_une_autre_agence_ne_se_suspend_pas_ici(): void
    {
        $etranger = $this->agencyAgent($this->agencyB);

        $this->actingAsApi($this->adminA);
        $this->suspend($etranger)->assertStatus(422);
        $this->assertSame('active', AgentProfile::query()->where('user_id', $etranger->id)->sole()->status->value);
    }

    public function test_on_ne_suspend_pas_dans_une_agence_ou_l_on_n_agit_pas(): void
    {
        $agent = $this->agencyAgent($this->agencyA);

        $this->actingAsApi($this->agencyAdmin($this->agencyB));
        $this->suspend($agent)->assertForbidden();
    }

    /** AC12 — `team.suspend` est lue : le rôle d'admin moins elle est refusé. */
    public function test_la_capacite_team_suspend_est_lue(): void
    {
        $agent = $this->agencyAgent($this->agencyA);

        $this->actingAsApi($this->adminWithout($this->agencyA, Capability::TeamSuspend));
        $this->suspend($agent)->assertForbidden();

        $this->actingAsApi($this->agencyAgent($this->agencyA));
        $this->suspend($agent)->assertForbidden();

        $this->actingAsApi($this->adminA);
        $this->suspend($agent)->assertOk();
    }

    // ─── Vérification adverse (verif-587) ─────────────

    private function reactivate(User $target): TestResponse
    {
        return $this->postJson("/api/agencies/{$this->agencyA->id}/team/{$target->id}/reactivate");
    }

    /** M2 — réactiver ne touche que ce que la suspension a posé : une invitation reste une invitation. */
    public function test_reactiver_laisse_une_invitation_draft_et_un_profil_archive_tels_quels(): void
    {
        $invite = User::factory()->create();
        $agentDraft = AgentProfile::factory()->create(['user_id' => $invite->id, 'agency_id' => $this->agencyA->id, 'status' => 'draft']);
        $ownerDraft = OwnerProfile::factory()->create(['user_id' => $invite->id, 'agency_id' => $this->agencyA->id, 'status' => 'draft']);
        $archive = User::factory()->create();
        $adminArchived = AgencyAdminProfile::factory()->create(['user_id' => $archive->id, 'agency_id' => $this->agencyA->id, 'status' => 'archived']);

        $this->actingAsApi($this->adminA);
        $this->reactivate($invite)->assertStatus(422)->assertJsonPath('message', __('errors.team_nothing_to_reactivate'));
        $this->reactivate($archive)->assertStatus(422);
        // Ni suspendre : un `draft` suspendu deviendrait `blocked`, puis actif à la réactivation.
        $this->suspend($invite)->assertStatus(422)->assertJsonPath('message', __('errors.team_nothing_to_suspend'));

        $this->assertSame('draft', $agentDraft->fresh()->status->value);
        $this->assertSame('draft', $ownerDraft->fresh()->status->value);
        $this->assertSame('archived', $adminArchived->fresh()->status->value);
        $this->assertSame(0, Activity::query()->whereIn('event', ['team_member_suspended', 'team_member_reactivated'])->count());
    }

    /** M2 — un membre suspendu ET invité ailleurs dans l'agence : seul le profil suspendu revient. */
    public function test_reactiver_ne_rend_actif_que_le_profil_suspendu(): void
    {
        $membre = $this->agencyAgent($this->agencyA);
        $ownerDraft = OwnerProfile::factory()->create(['user_id' => $membre->id, 'agency_id' => $this->agencyA->id, 'status' => 'draft']);

        $this->actingAsApi($this->adminA);
        $this->suspend($membre)->assertOk()->assertJsonCount(1, 'data.profiles');
        $this->reactivate($membre)
            ->assertOk()
            ->assertJsonCount(1, 'data.profiles')
            ->assertJsonPath('data.profiles.0.type', 'agent')
            ->assertJsonPath('data.profiles.0.status', 'active');

        $this->assertSame('draft', $ownerDraft->fresh()->status->value);
    }

    /** M3 — `team.suspend` délégué à un agent ne lui permet pas d'écarter un admin. */
    public function test_un_agent_tenant_team_suspend_ne_suspend_pas_un_co_admin(): void
    {
        $coAdmin = $this->agencyAdmin($this->agencyA);
        $agent = $this->agentWith($this->agencyA, Capability::TeamSuspend, Capability::TeamInvite);

        $this->actingAsApi($agent);
        $this->suspend($coAdmin)->assertForbidden()->assertJsonPath('message', __('errors.team_admin_suspension_reserved'));
        $this->assertSame('active', AgencyAdminProfile::query()->where('user_id', $coAdmin->id)->sole()->status->value);

        // La capacité vaut pour le reste de l'équipe.
        $this->suspend($this->agencyAgent($this->agencyA))->assertOk();
    }

    /** m2 — un bailleur qui garde un profil actif ailleurs garde ses jetons. */
    public function test_un_bailleur_de_deux_agences_garde_son_jeton(): void
    {
        $bailleur = User::factory()->withOwnerProfile($this->agencyA)->withOwnerProfile($this->agencyB)->create();
        $bailleur->createToken('session');

        $this->actingAsApi($this->adminA);
        $this->suspend($bailleur)->assertOk();

        $this->assertSame(1, $bailleur->tokens()->count());
    }

    /**
     * m3 (décision de la session, ADR-0031 §2) — un bailleur suspendu (`blocked`) dans une agence
     * reste partie à ses baux : il en garde la LECTURE, il en perd les ÉCRITURES dans cette agence.
     * Son bail dans une autre agence où il est actif ne change pas.
     */
    public function test_un_bailleur_bloque_lit_ses_baux_sans_plus_y_ecrire(): void
    {
        $bailleur = User::factory()->withOwnerProfile($this->agencyA)->withOwnerProfile($this->agencyB)->create();
        $bailDe = function (Agency $agency) use ($bailleur): Lease {
            $property = Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agency->id]);
            $customer = Customer::factory()->create(['agency_id' => $agency->id, 'added_by_id' => $bailleur->id]);

            return Lease::factory()->create([
                'property_id' => $property->id,
                'landlord_id' => $bailleur->id,
                'tenant_id' => $customer->id,
                'agency_id' => $agency->id,
            ]);
        };
        $bailA = $bailDe($this->agencyA);
        $bailB = $bailDe($this->agencyB);
        $loyerA = LeasePayment::factory()->create(['lease_id' => $bailA->id, 'payer_id' => $bailA->tenant_id, 'status' => PaymentStatus::Pending]);

        $this->actingAsApi($this->adminA);
        $this->suspend($bailleur)->assertOk();

        $this->actingAsApi($bailleur->fresh());
        $this->getJson("/api/leases/{$bailA->id}")->assertOk();
        $this->getJson("/api/leases/{$bailA->id}/payments")->assertOk();
        $this->postJson("/api/leases/{$bailA->id}/payments", [
            'amount' => 400000,
            'payment_type' => 'rent',
            'period_start' => '2026-01-01',
            'period_end' => '2026-01-31',
            'due_date' => '2026-01-05',
        ])->assertForbidden();
        $this->postJson("/api/lease-payments/{$loyerA->id}/mark-paid")->assertForbidden();
        $this->patchJson("/api/leases/{$bailA->id}", ['late_fee_grace_days' => 3])->assertForbidden();
        $this->postJson('/api/leases', [
            'property_id' => $bailA->property_id,
            'tenant_id' => $bailA->tenant_id,
            'type' => 'residential_rent',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'monthly_rent' => 400000,
            'payment_day' => 5,
        ])->assertForbidden();
        $this->assertSame('pending', $loyerA->fresh()->status->value);

        // Dans B, où il est actif, rien ne change.
        $this->patchJson("/api/leases/{$bailB->id}", ['late_fee_grace_days' => 3])->assertOk();
    }

    /**
     * Vérification adverse passe 2 (N2, décision de la session) — la règle d'ADR-0031 §2 ne vaut
     * pas pour le seul bail : un bailleur bloqué dans une agence y perd TOUTE écriture faite en son
     * nom (état des lieux, visite, document), et en garde la lecture. Rend le bailleur, suspendu
     * dans A et actif dans B, et ses deux biens.
     *
     * @return array{0: User, 1: Property, 2: Property}
     */
    private function bailleurBloqueDansA(): array
    {
        $bailleur = User::factory()->withOwnerProfile($this->agencyA)->withOwnerProfile($this->agencyB)->create();
        $bienA = Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agencyA->id]);
        $bienB = Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agencyB->id]);

        $this->actingAsApi($this->adminA);
        $this->suspend($bailleur)->assertOk();
        $this->actingAsApi($bailleur->fresh());

        return [$bailleur, $bienA, $bienB];
    }

    /** N2 — l'état des lieux, qu'il le désigne comme propriétaire du bien ou comme celui qui l'a conduit. */
    public function test_un_bailleur_bloque_ne_modifie_plus_un_etat_des_lieux(): void
    {
        [$bailleur, $bienA, $bienB] = $this->bailleurBloqueDansA();
        $parLAgent = Inventory::factory()->create(['property_id' => $bienA->id, 'conducted_by' => $this->adminA->id]);
        $parLui = Inventory::factory()->create(['property_id' => $bienA->id, 'conducted_by' => $bailleur->id]);
        $dansB = Inventory::factory()->create(['property_id' => $bienB->id, 'conducted_by' => $bailleur->id]);

        foreach ([$parLAgent, $parLui] as $edl) {
            $this->getJson("/api/inventories/{$edl->id}")->assertOk();
            $this->patchJson("/api/inventories/{$edl->id}", ['notes' => 'réécrit'])->assertForbidden();
            $this->assertNotSame('réécrit', $edl->fresh()->notes);
        }
        $this->patchJson("/api/inventories/{$dansB->id}", ['notes' => 'réécrit'])->assertOk();
    }

    /**
     * N2 — la visite de son bien. TCK-590 (passe 3, t1) : sur un bien d'AGENCE, aucun bailleur,
     * actif ou bloqué, ne déplace, confirme ni n'annule plus une visite (`visits.staff_only`) —
     * l'écriture ne distingue donc plus le blocage. Ce qui le distingue, c'est la LECTURE (M7′) :
     * le bailleur actif de B lit la visite de son bien, sans la fiche client ; bloqué dans A, il
     * ne la lit plus. Avant la passe 3, ce test attendait 200 à la lecture dans A, et 200 au
     * déplacement dans B.
     */
    public function test_un_bailleur_bloque_ne_lit_plus_la_visite_de_son_bien(): void
    {
        [, $bienA, $bienB] = $this->bailleurBloqueDansA();
        $ficheB = Customer::factory()->create(['agency_id' => $this->agencyB->id]);
        $visiteA = PropertyVisit::factory()->create(['property_id' => $bienA->id]);
        $visiteB = PropertyVisit::factory()->create(['property_id' => $bienB->id, 'customer_id' => $ficheB->id]);
        $nouvelle = now()->addDays(5)->setTime(10, 0)->toIso8601String();

        $this->getJson("/api/property-visits/{$visiteA->id}")->assertForbidden();
        $this->getJson("/api/property-visits/{$visiteB->id}")->assertOk()
            ->assertJsonPath('data.id', $visiteB->id)
            ->assertJsonPath('data.customer_id', null);
        $this->assertSame([$visiteB->id], collect($this->getJson('/api/property-visits')->json('data'))->pluck('id')->all());

        foreach ([$visiteA, $visiteB] as $visite) {
            $this->patchJson("/api/property-visits/{$visite->id}", ['scheduled_at' => $nouvelle])->assertForbidden();
            $this->postJson("/api/property-visits/{$visite->id}/confirm")->assertForbidden();
            $this->assertTrue($visite->fresh()->scheduled_at->equalTo($visite->scheduled_at));
        }
    }

    /**
     * N2 — le partage public, le geste le plus sensible : un lien publié survit à tout ce que
     * l'agence fait ensuite. Les deux titres qui l'ouvraient sont fermés : téléverseur (document de
     * son bail) et propriétaire du porteur (document de son bien téléversé par l'agence).
     */
    public function test_un_bailleur_bloque_ne_partage_plus_un_document(): void
    {
        [$bailleur, $bienA, $bienB] = $this->bailleurBloqueDansA();
        $bailA = Lease::factory()->create(['property_id' => $bienA->id, 'landlord_id' => $bailleur->id, 'agency_id' => $this->agencyA->id]);
        $televerseParLui = Document::factory()->create(['documentable_type' => Lease::class, 'documentable_id' => $bailA->id, 'uploaded_by' => $bailleur->id]);
        $surSonBien = Document::factory()->create(['documentable_type' => Property::class, 'documentable_id' => $bienA->id, 'uploaded_by' => $this->adminA->id]);
        $dansB = Document::factory()->create(['documentable_type' => Property::class, 'documentable_id' => $bienB->id, 'uploaded_by' => $bailleur->id]);

        foreach ([$televerseParLui, $surSonBien] as $document) {
            $this->getJson("/api/documents/{$document->id}")->assertOk();
            $this->postJson("/api/documents/{$document->id}/share", [])->assertForbidden();
            $this->assertSame(0, $document->shareLinks()->count());
        }
        $this->postJson("/api/documents/{$dansB->id}/share", [])->assertCreated();
    }

    /** N2 — la suppression : il la perdait par la seule règle du téléverseur. */
    public function test_un_bailleur_bloque_ne_supprime_plus_un_document(): void
    {
        [$bailleur, $bienA, $bienB] = $this->bailleurBloqueDansA();
        $documentA = Document::factory()->create(['documentable_type' => Property::class, 'documentable_id' => $bienA->id, 'uploaded_by' => $bailleur->id]);
        $documentB = Document::factory()->create(['documentable_type' => Property::class, 'documentable_id' => $bienB->id, 'uploaded_by' => $bailleur->id]);

        $this->getJson("/api/documents/{$documentA->id}")->assertOk();
        $this->deleteJson("/api/documents/{$documentA->id}")->assertForbidden();
        $this->assertNotNull($documentA->fresh());
        $this->deleteJson("/api/documents/{$documentB->id}")->assertNoContent();
    }

    /**
     * N2 — la règle borne le BAILLEUR, pas le personnel : un agent actif de A qui y garde un profil
     * de bailleur bloqué agit en tant qu'agent, et supprime encore ce qu'il a téléversé.
     */
    public function test_un_agent_actif_au_profil_de_bailleur_bloque_ecrit_en_agent(): void
    {
        $agent = User::factory()->withAgentProfile($this->agencyA)->withOwnerProfile($this->agencyA)->create();
        OwnerProfile::query()->where('user_id', $agent->id)->update(['status' => 'blocked']);
        $bien = Property::factory()->create(['agency_id' => $this->agencyA->id]);
        $document = Document::factory()->create(['documentable_type' => Property::class, 'documentable_id' => $bien->id, 'uploaded_by' => $agent->id]);

        $this->actingAsApi($agent->fresh());
        $this->deleteJson("/api/documents/{$document->id}")->assertNoContent();
    }
}
