<?php

namespace Tests\Feature\Property;

use App\Models\AccountDeletionRequest;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\Capability;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Invitation;
use App\Models\Lease;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use App\Services\Invitation\InvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Schema;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-1000 (P15.06, Q2 ; ADR-0036, amendement du 2026-10-19, voie 2) — un bien saisi pour un bailleur
 * INVITÉ reste au nom de son auteur et porte le profil invité (`pending_owner_profile_id`). Il passe
 * au bailleur dans la transaction qui active le profil, par le transfert de TCK-999 ; une invitation
 * révoquée ou expirée efface le lien, et le bien reste à l'agence.
 */
class PropertyPendingOwnerTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        Notification::fake();
        $this->agency = Agency::factory()->create(['moderation_required' => false]);
        // `properties.update_any` : rattacher un lot sous le bien d'un bailleur (`updateParent`).
        $this->agent = $this->agentWith($this->agency, Capability::TeamInvite, Capability::PropertiesUpdateAny);
    }

    /** L'agent invite un bailleur, comme depuis le formulaire : l'invitation et son profil `draft`. */
    private function inviter(string $email = 'awa.diop@example.sn'): Invitation
    {
        $id = $this->actingAsApi($this->agent)->postJson("/api/agencies/{$this->agency->id}/owners/invite", [
            'email' => $email,
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'owner_type' => 'individual',
        ])->assertCreated()->json('data.id');

        return Invitation::query()->findOrFail($id);
    }

    private function creer(array $extra): TestResponse
    {
        return $this->actingAsApi($this->agent)->postJson('/api/properties', $extra + [
            'title' => 'Maison de Awa à Ouakam',
            'type' => 'house',
            'contract_type' => 'rent',
            'rent_period' => 'monthly',
            'price' => 250_000,
        ]);
    }

    private function accepter(Invitation $invitation): TestResponse
    {
        return $this->postJson('/api/invitations/'.$invitation->token.'/accept', [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'password' => 'sup3r-secret',
        ]);
    }

    private function bienLie(Invitation $invitation): Property
    {
        $id = $this->creer(['pending_owner_profile_id' => $invitation->invitable_id])->assertCreated()->json('data.id');

        return Property::query()->findOrFail($id);
    }

    public function test_ac1_le_bien_passe_au_bailleur_quand_il_accepte_l_invitation(): void
    {
        $invitation = $this->inviter();
        $bien = $this->bienLie($invitation);
        $this->assertSame($this->agent->id, (int) $bien->user_id);
        $this->assertSame((int) $invitation->invitable_id, (int) $bien->pending_owner_profile_id);
        $brouillon = Lease::factory()->create([
            'property_id' => $bien->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => $this->agent->id,
            'status' => LeaseStatus::Draft,
        ]);

        $this->accepter($invitation)->assertOk();

        $c = User::query()->where('email', 'awa.diop@example.sn')->sole();
        $bien->refresh();
        $this->assertSame($c->id, (int) $bien->user_id);
        $this->assertNull($bien->pending_owner_profile_id);
        $this->assertSame($c->id, (int) $brouillon->fresh()->landlord_id);
        $this->assertSame(1, AppNotification::query()->where('user_id', $c->id)->where('code', 'property.assigned_to_owner')->count());
        $ligne = Activity::query()->where('log_name', 'Property')->where('event', 'owner_transferred')->sole();
        $this->assertSame('invitation_accepted', $ligne->properties['via']);
        $this->assertSame([$brouillon->id], $ligne->properties['leases_moved']);

        $this->actingAsApi($c)->getJson("/api/properties/{$bien->id}")->assertOk();
    }

    public function test_ac1_le_personnel_lit_le_bailleur_en_attente_sur_la_fiche_le_bailleur_non(): void
    {
        $invitation = $this->inviter();
        $bien = $this->bienLie($invitation);

        $this->actingAsApi($this->agent)->getJson("/api/properties/{$bien->id}")
            ->assertOk()
            ->assertJsonPath('data.pending_owner.profile_id', (int) $invitation->invitable_id)
            ->assertJsonPath('data.pending_owner.name', 'Awa Diop');

        $autre = User::factory()->withOwnerProfile($this->agency)->create();
        $bienDeAutre = Property::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => $autre->id, 'pending_owner_profile_id' => $invitation->invitable_id,
        ]);
        $this->actingAsApi($autre)->getJson("/api/properties/{$bienDeAutre->id}")
            ->assertOk()
            ->assertJsonMissingPath('data.pending_owner');
    }

    public function test_ac2_une_invitation_revoquee_efface_le_lien_et_le_bien_reste_a_l_agence(): void
    {
        $invitation = $this->inviter();
        $bien = $this->bienLie($invitation);
        $this->assertSame((int) $invitation->invitable_id, (int) $bien->pending_owner_profile_id);

        app(InvitationService::class)->revoke($invitation, $this->agencyAdmin($this->agency));

        $this->assertNull($bien->fresh()->pending_owner_profile_id);
        $this->assertSame($this->agent->id, (int) $bien->fresh()->user_id);
        $this->accepter($invitation->fresh())->assertStatus(410);
        $this->assertSame($this->agent->id, (int) $bien->fresh()->user_id);
    }

    public function test_ac2_une_invitation_expiree_efface_le_lien_et_le_bien_reste_a_l_agence(): void
    {
        $invitation = $this->inviter();
        $bien = $this->bienLie($invitation);
        $this->assertSame((int) $invitation->invitable_id, (int) $bien->pending_owner_profile_id);

        $this->travel(8)->days();
        $this->artisan('invitations:expire')->assertSuccessful();

        $this->assertNull($bien->fresh()->pending_owner_profile_id);
        $this->assertSame($this->agent->id, (int) $bien->fresh()->user_id);
        $this->accepter($invitation->fresh())->assertStatus(410);
        $this->assertSame($this->agent->id, (int) $bien->fresh()->user_id);
    }

    public function test_ac3_un_profil_qui_n_est_pas_une_invitation_en_cours_de_l_agence_est_refuse(): void
    {
        $ailleurs = Agency::factory()->create();
        $profilAilleurs = OwnerProfile::factory()->draft()->create(['agency_id' => $ailleurs->id, 'user_id' => null]);
        Invitation::factory()->create(['agency_id' => $ailleurs->id, 'role' => 'owner', 'invitable_type' => OwnerProfile::class, 'invitable_id' => $profilAilleurs->id]);
        $actif = OwnerProfile::factory()->create(['agency_id' => $this->agency->id]);
        $revoquee = $this->inviter('revoque@example.sn');
        app(InvitationService::class)->revoke($revoquee, $this->agencyAdmin($this->agency));

        foreach ([$profilAilleurs->id, $actif->id, $revoquee->invitable_id, 999_999] as $profileId) {
            $this->creer(['pending_owner_profile_id' => $profileId])
                ->assertStatus(422)
                ->assertJsonPath('code', 'property.pending_owner_not_invited');
        }

        $this->assertSame(0, Property::query()->count());
    }

    public function test_ac3_une_invitation_echue_non_balayee_et_un_lot_sous_un_bailleur_sont_refuses(): void
    {
        $echue = $this->inviter('echue@example.sn');
        $echue->forceFill(['expires_at' => now()->subMinute()])->save();
        $this->creer(['pending_owner_profile_id' => $echue->invitable_id])
            ->assertStatus(422)
            ->assertJsonPath('code', 'property.pending_owner_not_invited');

        $invitation = $this->inviter();
        $b = User::factory()->withOwnerProfile($this->agency)->create();
        $immeuble = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $b->id]);
        $this->creer(['pending_owner_profile_id' => $invitation->invitable_id, 'parent_id' => $immeuble->id])
            ->assertStatus(422)
            ->assertJsonPath('code', 'property.parent_owner_mismatch');

        $this->assertSame(1, Property::query()->count());
    }

    public function test_ac2_l_effacement_du_compte_que_vise_l_invitation_efface_le_lien(): void
    {
        $invitation = $this->inviter();
        $bien = $this->bienLie($invitation);
        $compte = User::factory()->create(['email' => 'awa.diop@example.sn']);

        app(AccountDeletionService::class)->executeDeletion(AccountDeletionRequest::factory()->for($compte)->due()->create());

        $this->assertSame(InvitationStatus::Revoked, $invitation->fresh()->status);
        $this->assertNull($bien->fresh()->pending_owner_profile_id);
        $this->assertSame($this->agent->id, (int) $bien->fresh()->user_id);
    }

    public function test_ac3_owner_id_et_pending_owner_profile_id_ensemble_sont_refuses(): void
    {
        $invitation = $this->inviter();
        $b = User::factory()->withOwnerProfile($this->agency)->create();

        $this->creer(['owner_id' => $b->id, 'pending_owner_profile_id' => $invitation->invitable_id])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['pending_owner_profile_id']);

        $this->assertSame(0, Property::query()->count());
    }

    public function test_ac4_le_bien_d_un_repreneur_passe_quand_meme_celui_d_un_bailleur_non(): void
    {
        $invitation = $this->inviter();
        $repris = $this->bienLie($invitation);
        $rendu = $this->bienLie($invitation);
        $repreneur = $this->agencyAgent($this->agency);
        $d = User::factory()->withOwnerProfile($this->agency)->create();
        // La passation (ADR-0036 § 4) et « changer le titulaire » (TCK-999) écrivent `user_id`
        // journal du modèle coupé : le lien au bailleur invité, lui, reste.
        $repris->disableLogging()->forceFill(['user_id' => $repreneur->id])->save();
        $rendu->disableLogging()->forceFill(['user_id' => $d->id])->save();

        $this->accepter($invitation)->assertOk();

        $c = User::query()->where('email', 'awa.diop@example.sn')->sole();
        $this->assertSame($c->id, (int) $repris->fresh()->user_id);
        $this->assertSame($d->id, (int) $rendu->fresh()->user_id);
        $this->assertNull($rendu->fresh()->pending_owner_profile_id);
        $this->assertNull($repris->fresh()->pending_owner_profile_id);
    }

    public function test_ac5_le_down_de_la_migration_retire_la_colonne_et_le_up_la_rend(): void
    {
        $migration = require database_path('migrations/2026_10_25_120000_add_pending_owner_profile_id_to_properties.php');

        $migration->down();
        $this->assertFalse(Schema::hasColumn('properties', 'pending_owner_profile_id'));

        $migration->up();
        $this->assertTrue(Schema::hasColumn('properties', 'pending_owner_profile_id'));
        $this->assertContains('properties_pending_owner_profile_idx', collect(Schema::getIndexes('properties'))->pluck('name')->all());
        $this->assertContains('properties_pending_owner_profile_fk', collect(Schema::getForeignKeys('properties'))->pluck('name')->all());
    }
}
