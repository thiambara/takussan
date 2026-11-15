<?php

namespace Tests\Feature\Agency;

use App\Jobs\Permissions\ProcessRoleDelegationsJob;
use App\Models\Activity;
use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Permissions\RoleDelegationService;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-2666 (ADR-0035, amendement du 2026-11-10) — une absence peut porter une délégation de rôle
 * LIÉE : créée, modifiée, révoquée et expirée avec elle. L'absence elle-même n'accorde toujours rien.
 */
class AbsenceCoverDelegationTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $absent;

    private User $substitute;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-11-09 09:00:00', 'Africa/Dakar'));
        $this->agency = Agency::factory()->create();
        $this->admin = $this->member('agency_admin');
        // Un ADMIN absent couvert par un AGENT : le rôle prêté porte des capacités que le
        // remplaçant n'a pas. Deux agents ne prouveraient rien.
        $this->absent = $this->member('agency_admin');
        $this->substitute = $this->member('agent');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function member(string $role): User
    {
        $user = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $this->materializeRoleProfile($user, $role, $this->agency);

        return $user;
    }

    /** @param  array<string, mixed>  $overrides */
    private function declare(User $as, array $overrides = []): TestResponse
    {
        return $this->actingAsApi($as)->apiPost("/api/agencies/{$this->agency->id}/absences", array_merge([
            'user_id' => $this->absent->id,
            'substitute_id' => $this->substitute->id,
            'starts_at' => '2026-11-10T00:00:00+00:00',
            'ends_at' => '2026-11-14',
            'substitute_can_act' => true,
        ], $overrides));
    }

    /** @param  array<string, mixed>  $data */
    private function modifier(User $as, int $id, array $data): TestResponse
    {
        return $this->actingAsApi($as)->apiPatch("/api/agencies/{$this->agency->id}/absences/{$id}", $data);
    }

    private function cover(int $absenceId): ?RoleDelegation
    {
        return RoleDelegation::query()->where('covers_absence_id', $absenceId)
            ->whereIn('status', [RoleDelegationStatus::Scheduled, RoleDelegationStatus::Active])
            ->first();
    }

    /** Lu sur un compte relu (le résolveur n'est pas un singleton) : aucune relation chargée d'une lecture antérieure. */
    private function substituteCanInvite(): bool
    {
        return app(MembershipCapabilityResolver::class)->allows($this->substitute->fresh(), Capability::TeamInvite, $this->agency->fresh());
    }

    private function runJob(): void
    {
        (new ProcessRoleDelegationsJob)->handle(app(RoleDelegationService::class));
    }

    public function test_ac1_deux_lignes_liees_et_le_droit_pendant_la_periode_seulement(): void
    {
        $this->assertFalse($this->substituteCanInvite(), 'précondition : un agent n\'invite pas');

        $response = $this->declare($this->admin)->assertCreated()
            ->assertJsonPath('data.substitute_can_act', true);
        $absence = RoleDelegation::query()->findOrFail($response->json('data.id'));
        $cover = $this->cover($absence->id);

        $this->assertNotNull($cover);
        $response->assertJsonPath('data.delegation_id', $cover->id);
        $this->assertSame(2, RoleDelegation::query()->count());
        $this->assertNull($cover->replaces_user_id);
        $this->assertSame('agency_admin', $cover->role);
        $this->assertSame($this->substitute->id, $cover->user_id);
        $this->assertSame($this->admin->id, $cover->delegator_id);
        $this->assertTrue($cover->starts_at->equalTo($absence->starts_at));
        $this->assertTrue($cover->ends_at->equalTo($absence->ends_at));
        $this->assertSame(RoleDelegationStatus::Scheduled, $cover->status);

        // Pendant la période.
        $this->travelTo(Carbon::parse('2026-11-12 10:00:00', 'Africa/Dakar'));
        $this->runJob();
        $this->assertSame(RoleDelegationStatus::Active, $cover->fresh()->status);
        $this->assertTrue($this->substituteCanInvite());

        // Le lendemain de la fin.
        $this->travelTo(Carbon::parse('2026-11-15 10:00:00', 'Africa/Dakar'));
        $this->assertFalse($this->substituteCanInvite());
        $this->runJob();
        $this->assertSame(RoleDelegationStatus::Expired, $cover->fresh()->status);
        $this->assertSame(RoleDelegationStatus::Expired, $absence->fresh()->status);
    }

    public function test_le_role_prete_est_celui_de_l_absent(): void
    {
        $agent = $this->member('agent');

        $id = $this->declare($this->admin, ['user_id' => $agent->id])->assertCreated()->json('data.id');

        $this->assertSame('agent', $this->cover($id)->role);
    }

    public function test_l_absence_seule_n_accorde_toujours_rien(): void
    {
        $this->travelTo(Carbon::parse('2026-11-10 10:00:00', 'Africa/Dakar'));

        $this->declare($this->admin, ['substitute_can_act' => false, 'starts_at' => null])->assertCreated()
            ->assertJsonPath('data.substitute_can_act', false)
            ->assertJsonPath('data.delegation_id', null);

        $this->assertSame(1, RoleDelegation::query()->count());
        $this->assertFalse($this->substituteCanInvite());
    }

    public function test_ac2_sans_team_delegate_role_403_et_aucune_ligne(): void
    {
        $agent = $this->member('agent');

        $this->declare($agent, ['user_id' => $agent->id])->assertForbidden();
        $this->assertSame(0, RoleDelegation::query()->count());

        // Sans délégation, sa propre absence reste déclarable, comme aujourd'hui.
        $this->declare($agent, ['user_id' => $agent->id, 'substitute_can_act' => false])->assertCreated();
        $this->assertSame(1, RoleDelegation::query()->count());
    }

    public function test_un_refus_de_la_delegation_n_ecrit_pas_l_absence(): void
    {
        // L'admin se nomme lui-même remplaçant : une délégation à soi-même est refusée.
        $this->declare($this->admin, ['substitute_id' => $this->admin->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors('substitute_can_act');

        $this->assertSame(0, RoleDelegation::query()->count());
    }

    public function test_un_absent_sans_role_de_base_n_a_rien_a_preter(): void
    {
        // Un bailleur n'est personnel que par une délégation d'agent : son absence se déclare,
        // mais il n'a pas de rôle de base à prêter (jamais plus que le sien).
        $owner = User::factory()->create();
        $this->materializeRoleProfile($owner, 'owner', $this->agency);
        RoleDelegation::query()->create([
            'user_id' => $owner->id, 'delegator_id' => $this->admin->id, 'agency_id' => $this->agency->id,
            'role' => 'agent', 'ends_at' => now()->addMonth(), 'status' => RoleDelegationStatus::Active,
            'activated_at' => now(), 'user_native_roles_snapshot' => ['owner'],
        ]);

        $this->declare($this->admin, ['user_id' => $owner->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors('substitute_can_act');
        $this->assertSame(1, RoleDelegation::query()->count());

        $this->declare($this->admin, ['user_id' => $owner->id, 'substitute_can_act' => false])->assertCreated();
    }

    public function test_ac3_revoquer_l_absence_revoque_la_delegation_dans_la_meme_requete(): void
    {
        $id = $this->declare($this->admin)->assertCreated()->json('data.id');
        $coverId = $this->cover($id)->id;

        $this->actingAsApi($this->admin)->apiDelete("/api/agencies/{$this->agency->id}/absences/{$id}")
            ->assertOk()
            ->assertJsonPath('data.status', 'revoked')
            ->assertJsonPath('data.substitute_can_act', false)
            ->assertJsonPath('data.delegation_id', $coverId);

        $this->assertSame(RoleDelegationStatus::Revoked, RoleDelegation::query()->findOrFail($coverId)->status);
    }

    public function test_l_absent_qui_revoque_sa_propre_absence_revoque_aussi_la_delegation(): void
    {
        $agent = $this->member('agent');
        $id = $this->declare($this->admin, ['user_id' => $agent->id])->assertCreated()->json('data.id');
        $coverId = $this->cover($id)->id;

        $this->actingAsApi($agent)->apiDelete("/api/agencies/{$this->agency->id}/absences/{$id}")->assertOk();

        $this->assertSame(RoleDelegationStatus::Revoked, RoleDelegation::query()->findOrFail($coverId)->status);
    }

    public function test_l_expiration_de_l_absence_expire_la_delegation_dans_la_meme_transaction(): void
    {
        $id = $this->declare($this->admin, ['starts_at' => null])->assertCreated()->json('data.id');
        $absence = RoleDelegation::query()->findOrFail($id);
        $coverId = $this->cover($id)->id;

        // Le service seul, sans la tâche planifiée qui verrait aussi la délégation échue.
        $this->travelTo(Carbon::parse('2026-11-15 10:00:00', 'Africa/Dakar'));
        app(RoleDelegationService::class)->expire($absence);

        $this->assertSame(RoleDelegationStatus::Expired, RoleDelegation::query()->findOrFail($coverId)->status);
    }

    public function test_l_activation_de_l_absence_active_la_delegation(): void
    {
        $id = $this->declare($this->admin)->assertCreated()->json('data.id');
        $absence = RoleDelegation::query()->findOrFail($id);
        $coverId = $this->cover($id)->id;

        $this->travelTo(Carbon::parse('2026-11-10 10:00:00', 'Africa/Dakar'));
        app(RoleDelegationService::class)->activate($absence);

        $this->assertSame(RoleDelegationStatus::Active, RoleDelegation::query()->findOrFail($coverId)->status);
    }

    public function test_ac4_avancer_la_fin_au_12_fait_finir_la_delegation_le_12(): void
    {
        $id = $this->declare($this->admin)->assertCreated()->json('data.id');
        $coverId = $this->cover($id)->id;

        $this->modifier($this->admin, $id, ['ends_at' => '2026-11-12'])->assertOk()
            ->assertJsonPath('data.ends_at', Carbon::parse('2026-11-12 23:59:59', 'Africa/Dakar')->utc()->toIso8601String())
            ->assertJsonPath('data.delegation_id', $coverId);

        $cover = RoleDelegation::query()->findOrFail($coverId);
        $this->assertTrue($cover->ends_at->equalTo(Carbon::parse('2026-11-12 23:59:59', 'Africa/Dakar')));
        $this->assertTrue($cover->ends_at->equalTo(RoleDelegation::query()->findOrFail($id)->ends_at));
        $this->assertSame(RoleDelegationStatus::Scheduled, $cover->status);
    }

    public function test_deplacer_le_debut_d_une_absence_planifiee_deplace_la_delegation(): void
    {
        $id = $this->declare($this->admin)->assertCreated()->json('data.id');
        $coverId = $this->cover($id)->id;

        $this->modifier($this->admin, $id, ['starts_at' => '2026-11-11T08:00:00+00:00'])->assertOk()
            ->assertJsonPath('data.status', 'scheduled');
        $this->assertTrue(RoleDelegation::query()->findOrFail($coverId)->starts_at->equalTo(Carbon::parse('2026-11-11T08:00:00+00:00')));

        // Ramené à maintenant : l'absence et sa délégation commencent ensemble.
        $this->modifier($this->admin, $id, ['starts_at' => null])->assertOk()->assertJsonPath('data.status', 'active');
        $this->assertSame(RoleDelegationStatus::Active, RoleDelegation::query()->findOrFail($coverId)->status);
        $this->assertTrue($this->substituteCanInvite());
    }

    public function test_le_debut_d_une_absence_commencee_ne_bouge_plus(): void
    {
        $id = $this->declare($this->admin, ['starts_at' => null])->assertCreated()->json('data.id');

        $this->modifier($this->admin, $id, ['starts_at' => '2026-11-12T08:00:00+00:00'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('starts_at');
    }

    public function test_changer_de_remplacant_revoque_l_ancienne_delegation_et_en_cree_une(): void
    {
        $id = $this->declare($this->admin)->assertCreated()->json('data.id');
        $old = $this->cover($id);
        $other = $this->member('agent');

        $response = $this->modifier($this->admin, $id, ['substitute_id' => $other->id])->assertOk()
            ->assertJsonPath('data.substitute.id', $other->id)
            ->assertJsonPath('data.substitute_can_act', true);
        $new = $this->cover($id);

        $this->assertSame(RoleDelegationStatus::Revoked, $old->fresh()->status);
        $this->assertNotSame($old->id, $new->id);
        $this->assertSame($other->id, $new->user_id);
        $this->assertSame($id, $new->covers_absence_id);
        $response->assertJsonPath('data.delegation_id', $new->id);
        $this->assertSame($other->id, RoleDelegation::query()->findOrFail($id)->user_id);
    }

    public function test_retirer_puis_rendre_le_droit(): void
    {
        $id = $this->declare($this->admin)->assertCreated()->json('data.id');
        $first = $this->cover($id);

        $this->modifier($this->admin, $id, ['substitute_can_act' => false])->assertOk()->assertJsonPath('data.substitute_can_act', false);
        $this->assertSame(RoleDelegationStatus::Revoked, $first->fresh()->status);
        $this->assertNull($this->cover($id));

        $this->modifier($this->admin, $id, ['substitute_can_act' => true])->assertOk()->assertJsonPath('data.substitute_can_act', true);
        $this->assertNotNull($this->cover($id));
        $this->assertSame(2, RoleDelegation::query()->where('covers_absence_id', $id)->count());
    }

    public function test_ajouter_le_droit_a_une_absence_qui_n_en_portait_pas(): void
    {
        $id = $this->declare($this->admin, ['substitute_can_act' => false])->assertCreated()->json('data.id');

        $this->modifier($this->admin, $id, ['substitute_can_act' => true])->assertOk();

        $this->assertSame('agency_admin', $this->cover($id)->role);
    }

    public function test_l_absent_sans_capacite_ne_touche_pas_a_la_delegation_mais_corrige_le_motif(): void
    {
        $agent = $this->member('agent');
        $id = $this->declare($this->admin, ['user_id' => $agent->id])->assertCreated()->json('data.id');
        $cover = $this->cover($id);

        $this->modifier($agent, $id, ['ends_at' => '2026-11-20'])->assertForbidden();
        $this->modifier($agent, $id, ['substitute_can_act' => true])->assertForbidden();
        $this->assertTrue($cover->fresh()->ends_at->equalTo($cover->ends_at));

        $this->modifier($agent, $id, ['reason' => 'Congé'])->assertOk();
        // Retirer le droit ne prête rien : l'absent peut le faire.
        $this->modifier($agent, $id, ['substitute_can_act' => false])->assertOk();
        $this->assertSame(RoleDelegationStatus::Revoked, $cover->fresh()->status);
    }

    public function test_sans_delegation_l_absent_modifie_sa_propre_absence(): void
    {
        $agent = $this->member('agent');
        $id = $this->declare($agent, ['user_id' => $agent->id, 'substitute_can_act' => false])->assertCreated()->json('data.id');

        $this->modifier($agent, $id, ['ends_at' => '2026-11-20'])->assertOk();
        $this->modifier($this->substitute, $id, ['ends_at' => '2026-11-21'])->assertForbidden();
    }

    public function test_une_absence_close_ne_se_modifie_plus(): void
    {
        $id = $this->declare($this->admin)->assertCreated()->json('data.id');
        $this->actingAsApi($this->admin)->apiDelete("/api/agencies/{$this->agency->id}/absences/{$id}")->assertOk();

        $this->modifier($this->admin, $id, ['ends_at' => '2026-11-20'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'agent_absence.closed');
    }

    public function test_la_modification_refuse_un_chevauchement_mais_pas_avec_elle_meme(): void
    {
        $id = $this->declare($this->admin)->assertCreated()->json('data.id');
        $this->declare($this->admin, ['starts_at' => '2026-11-20T00:00:00+00:00', 'ends_at' => '2026-11-25', 'substitute_can_act' => false])->assertCreated();

        $this->modifier($this->admin, $id, ['ends_at' => '2026-11-13'])->assertOk();
        $this->modifier($this->admin, $id, ['ends_at' => '2026-11-22'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'agent_absence.overlaps');
    }

    public function test_la_modification_garde_les_regles_du_remplacant(): void
    {
        $id = $this->declare($this->admin)->assertCreated()->json('data.id');

        $this->modifier($this->admin, $id, ['substitute_id' => $this->absent->id])->assertStatus(422)->assertJsonValidationErrors('substitute_id');
        $this->modifier($this->admin, $id, ['ends_at' => '2026-11-09T08:00:00+00:00'])->assertStatus(422)->assertJsonValidationErrors('ends_at');
        // À venir, mais avant le début (le 10 à minuit UTC) : refusé par le service.
        $this->modifier($this->admin, $id, ['ends_at' => '2026-11-09T20:00:00+00:00'])->assertStatus(422)->assertJsonValidationErrors('ends_at');
        $this->assertTrue(RoleDelegation::query()->findOrFail($id)->ends_at->equalTo(Carbon::parse('2026-11-14 23:59:59', 'Africa/Dakar')));
    }

    public function test_une_absence_d_une_autre_agence_rend_404(): void
    {
        $id = $this->declare($this->admin)->assertCreated()->json('data.id');
        $elsewhere = Agency::factory()->create();

        $this->actingAsApi($this->admin)->apiPatch("/api/agencies/{$elsewhere->id}/absences/{$id}", ['reason' => 'x'])->assertNotFound();
    }

    public function test_la_console_des_delegations_nomme_l_absence_et_renvoie_a_elle(): void
    {
        $id = $this->declare($this->admin)->assertCreated()->json('data.id');
        $cover = $this->cover($id);

        $this->actingAsApi($this->admin)->apiGet("/api/agencies/{$this->agency->id}/role-delegations")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $cover->id)
            ->assertJsonPath('data.0.covers_absence.id', $id)
            ->assertJsonPath('data.0.covers_absence.absent.id', $this->absent->id)
            ->assertJsonPath('data.0.covers_absence.absent.name', $this->absent->nameWithoutContact());

        $this->actingAsApi($this->admin)->apiDelete("/api/agencies/{$this->agency->id}/role-delegations/{$cover->id}")
            ->assertStatus(422)
            ->assertJsonPath('code', 'role_delegation.covers_absence');
        $this->assertSame(RoleDelegationStatus::Scheduled, $cover->fresh()->status);
    }

    public function test_une_delegation_ordinaire_n_a_pas_de_covers_absence(): void
    {
        $this->actingAsApi($this->admin)->apiPost("/api/agencies/{$this->agency->id}/role-delegations", [
            'user_id' => $this->substitute->id, 'role' => 'agent', 'ends_at' => '2026-11-20',
        ])->assertCreated()->assertJsonStructure(['data' => ['covers_absence']])->assertJsonPath('data.covers_absence', null);
    }

    public function test_chaque_acte_est_journalise_et_nomme_la_delegation(): void
    {
        $id = $this->declare($this->admin)->assertCreated()->json('data.id');
        $coverId = $this->cover($id)->id;
        $this->modifier($this->admin, $id, ['ends_at' => '2026-11-12'])->assertOk();

        $declared = Activity::query()->where('event', 'absence.declared')->sole();
        $this->assertSame($coverId, $declared->properties['delegation_id']);
        $updated = Activity::query()->where('event', 'absence.updated')->sole();
        $this->assertSame($coverId, $updated->properties['delegation_id']);
        $this->assertSame(['ends_at'], $updated->properties['changed']);
        $this->assertSame((int) $this->admin->id, (int) $updated->causer_id);

        $this->actingAsApi($this->admin)->apiDelete("/api/agencies/{$this->agency->id}/absences/{$id}")->assertOk();
        $revoked = Activity::query()->where('event', 'revoked')->where('subject_id', $id)->sole();
        $this->assertSame($coverId, $revoked->properties['delegation_id']);
    }

    public function test_l_index_refuse_une_seconde_delegation_liee_en_cours(): void
    {
        $id = $this->declare($this->admin)->assertCreated()->json('data.id');
        $cover = $this->cover($id);

        $refused = false;
        try {
            // Transaction imbriquée : un point de sauvegarde, que PostgreSQL annule seul.
            DB::transaction(fn () => RoleDelegation::query()->create(
                $cover->only(['user_id', 'delegator_id', 'agency_id', 'role', 'starts_at', 'ends_at', 'status', 'user_native_roles_snapshot', 'covers_absence_id'])
            ));
        } catch (UniqueConstraintViolationException) {
            $refused = true;
        }

        $this->assertTrue($refused);
        $this->assertSame(1, RoleDelegation::query()->where('covers_absence_id', $id)->count());
    }

    public function test_l_absent_sans_capacite_n_ajoute_pas_le_droit_a_une_absence_qui_n_en_porte_pas(): void
    {
        $agent = $this->member('agent');
        $id = $this->declare($agent, ['user_id' => $agent->id, 'substitute_can_act' => false])->assertCreated()->json('data.id');

        $this->modifier($agent, $id, ['substitute_can_act' => true])->assertForbidden();

        $this->assertSame(1, RoleDelegation::query()->count());
    }

    public function test_un_remplacant_seulement_administrateur_ne_recoit_pas_de_delegation(): void
    {
        // Règle de `RoleDelegationService::create()`, la même que sur la page Rôles : le délégataire a
        // un profil d'agent ou de bailleur dans l'agence. Un administrateur sans profil d'agent couvre
        // l'absence, mais sans délégation ; le refus est rendu sur `substitute_can_act`.
        $adminOnly = $this->member('agency_admin');
        $agent = $this->member('agent');

        $this->declare($this->admin, ['user_id' => $agent->id, 'substitute_id' => $adminOnly->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['substitute_can_act' => __('role_delegations.validation.user_not_in_agency')]);
        $this->assertSame(0, RoleDelegation::query()->count());

        $this->declare($this->admin, ['user_id' => $agent->id, 'substitute_id' => $adminOnly->id, 'substitute_can_act' => false])->assertCreated();
    }

    public function test_la_modification_exige_le_second_facteur_de_l_admin(): void
    {
        $id = $this->declare($this->admin)->assertCreated()->json('data.id');
        $this->admin->forceFill(['two_factor_enabled' => false, 'two_factor_secret' => null])->save();

        $this->modifier($this->admin, $id, ['ends_at' => '2026-11-12'])
            ->assertForbidden()
            ->assertJsonPath('code', 'two_factor_required');
    }

    public function test_la_liste_des_absences_rend_le_droit_et_la_delegation(): void
    {
        $id = $this->declare($this->admin)->assertCreated()->json('data.id');

        $this->actingAsApi($this->substitute)->apiGet("/api/agencies/{$this->agency->id}/absences")
            ->assertOk()
            ->assertJsonPath('data.0.id', $id)
            ->assertJsonPath('data.0.substitute_can_act', true)
            ->assertJsonPath('data.0.delegation_id', $this->cover($id)->id);
    }
}
