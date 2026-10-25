<?php

namespace Tests\Feature\Invitation;

use App\Mail\InvitationMailable;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * P15.01 (TCK-2351, décision du porteur du 2026-10-25) — « inviter le locataire à créer son
 * compte » : un lien à usage unique, et `linkUser()` à l'acceptation.
 *
 * Une fiche saisie par l'agence n'avait jamais de `user_id` : `linkUser()` n'avait d'appelant que
 * l'appariement de la candidature. Sur un bail tiré de cette fiche, « Demander la signature »
 * rendait 422 `lease_signature.tenant_without_account`, et l'espace du locataire restait vide.
 *
 * Le geste réutilise `InvitationService` (rôle `tenant`, cible la fiche) : jeton à usage unique,
 * expiration, relance, révocation, e-mail ou SMS. Le destinataire est la coordonnée de la fiche ; le
 * compte ne se lie qu'à l'acceptation, par qui détient cette coordonnée.
 */
class InvitationDuLocataireTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        config(['auth.phone_login.enabled' => false]);

        $this->agence = Agency::factory()->create();
        $this->agent = $this->agencyAgent($this->agence);
    }

    private function fiche(array $attributes = []): Customer
    {
        return Customer::factory()->create($attributes + [
            'agency_id' => $this->agence->id,
            'added_by_id' => $this->agent->id,
            'user_id' => null,
            'email' => 'Awa@Example.test',
            'phone' => '+221771234567',
        ]);
    }

    private function inviter(Customer $fiche, ?User $par = null): TestResponse
    {
        return $this->actingAsApi($par ?? $this->agent)->postJson("/api/customers/{$fiche->id}/invite");
    }

    public function test_l_agent_invite_la_fiche_a_son_e_mail_et_le_nouveau_compte_s_y_lie_a_l_acceptation(): void
    {
        $fiche = $this->fiche();

        $this->inviter($fiche)->assertCreated()->assertJsonPath('data.role', 'tenant');

        $invitation = Invitation::query()->sole();
        $this->assertSame('awa@example.test', $invitation->email);
        $this->assertSame(Customer::class, $invitation->invitable_type);
        $this->assertSame($fiche->id, $invitation->invitable_id);
        $this->assertSame($this->agence->id, $invitation->agency_id);
        Mail::assertSent(InvitationMailable::class, fn ($m) => $m->hasTo('awa@example.test'));
        $this->assertNull($fiche->refresh()->user_id, 'Le compte ne se lie qu\'à l\'acceptation.');

        $this->app['auth']->forgetGuards();
        $this->postJson("/api/invitations/{$invitation->token}/accept", [
            'first_name' => 'Awa', 'last_name' => 'Diop', 'password' => 'sup3r-secret-Pass',
        ])->assertOk();

        $compte = User::query()->where('email', 'awa@example.test')->sole();
        $this->assertSame($compte->id, $fiche->refresh()->user_id);
        $this->assertSame(InvitationStatus::Accepted, $invitation->refresh()->status);

        $this->postJson("/api/invitations/{$invitation->token}/accept", [])->assertStatus(410);
    }

    public function test_un_compte_existant_connecte_au_meme_e_mail_s_y_lie(): void
    {
        $fiche = $this->fiche();
        $compte = User::factory()->create(['email' => 'awa@example.test']);
        $this->inviter($fiche)->assertCreated();
        $invitation = Invitation::query()->sole();

        $this->actingAsApi($compte)->postJson("/api/invitations/{$invitation->token}/accept", [])->assertOk();

        $this->assertSame($compte->id, $fiche->refresh()->user_id);
    }

    /** Le compte de l'adresse existe : un autre compte connecté ne l'accepte pas à sa place. */
    public function test_un_autre_compte_ne_s_y_lie_pas(): void
    {
        $fiche = $this->fiche();
        $this->inviter($fiche)->assertCreated();
        $invitation = Invitation::query()->sole();
        User::factory()->create(['email' => 'awa@example.test']);
        $intrus = User::factory()->create(['email' => 'intrus@example.test']);

        $this->actingAsApi($intrus)->postJson("/api/invitations/{$invitation->token}/accept", [])->assertUnauthorized();

        $this->assertNull($fiche->refresh()->user_id);
        $this->assertSame(InvitationStatus::Sent, $invitation->refresh()->status);
    }

    public function test_une_fiche_deja_liee_ne_s_invite_pas(): void
    {
        $fiche = $this->fiche(['user_id' => User::factory()->create()->id]);

        $this->inviter($fiche)->assertStatus(409)->assertJsonPath('code', 'customer.invite_already_linked');

        $this->assertSame(0, Invitation::query()->count());
    }

    public function test_une_fiche_liee_entre_l_envoi_et_l_acceptation_refuse_l_acceptation(): void
    {
        $fiche = $this->fiche();
        $this->inviter($fiche)->assertCreated();
        $invitation = Invitation::query()->sole();
        $autre = User::factory()->create();
        $fiche->update(['user_id' => $autre->id]);

        $this->app['auth']->forgetGuards();
        $this->postJson("/api/invitations/{$invitation->token}/accept", [
            'first_name' => 'Awa', 'last_name' => 'Diop', 'password' => 'sup3r-secret-Pass',
        ])->assertStatus(409)->assertJsonPath('code', 'invitation.tenant_already_linked');

        $this->assertSame($autre->id, $fiche->refresh()->user_id);
        $this->assertSame(InvitationStatus::Sent, $invitation->refresh()->status);
        $this->assertSame(0, User::query()->where('email', 'awa@example.test')->count());
    }

    public function test_sans_e_mail_ni_numero_joignable_rien_ne_part(): void
    {
        $sansRien = $this->fiche(['email' => null, 'phone' => null]);
        $this->inviter($sansRien)->assertStatus(422)->assertJsonPath('code', 'customer.invite_no_contact');

        // Drapeau du lien par SMS éteint : le numéro seul ne suffit pas, comme pour le bailleur.
        $numeroSeul = $this->fiche(['email' => null]);
        $this->inviter($numeroSeul)->assertStatus(422)->assertJsonPath('code', 'customer.invite_no_contact');

        $this->assertSame(0, Invitation::query()->count());
    }

    public function test_drapeau_allume_le_numero_seul_part_par_sms(): void
    {
        config(['auth.phone_login.enabled' => true]);
        $fiche = $this->fiche(['email' => null]);

        $this->inviter($fiche)->assertCreated();

        $invitation = Invitation::query()->sole();
        $this->assertNull($invitation->email);
        $this->assertSame('+221771234567', $invitation->phone);
        Mail::assertNothingSent();
    }

    public function test_le_personnel_d_une_autre_agence_et_le_bailleur_n_invitent_pas(): void
    {
        $fiche = $this->fiche();

        $this->inviter($fiche, $this->agencyAgent(Agency::factory()->create()))->assertForbidden();

        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agence->id]);
        $sienne = $this->fiche(['added_by_id' => $bailleur->id, 'email' => 'moussa@example.test']);
        $this->inviter($sienne, $bailleur)->assertForbidden();

        $this->assertSame(0, Invitation::query()->count());
    }
}
