<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2610 (ADR-0094 § 7) — un appelant CONNECTÉ n'est jamais doublé d'un nouveau compte. Sans compte
 * qui porte l'e-mail de l'invitation, l'acceptation se fait pour lui, aux règles
 * d'`acceptForAuthenticatedUser` ; s'il n'a pas d'e-mail, celui de l'invitation est posé, vérifié (le lien
 * est arrivé à cette adresse). Drapeau `auth.phone_login.enabled` éteint comme allumé.
 *
 * Rouge sur `693cb3b42` : un compte né par téléphone (sans e-mail) qui acceptait une invitation par
 * e-mail passait par `acceptAsNewUser` et créait un SECOND compte, qui recevait le profil.
 */
class InvitationAcceptConnectedNoDuplicateTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->agency = Agency::factory()->create();
    }

    /** @return array<string, array{0: bool}> */
    public static function drapeau(): array
    {
        return ['drapeau éteint' => [false], 'drapeau allumé' => [true]];
    }

    /** AC2 — compte né par téléphone, sans e-mail, connecté : un seul compte, le profil et l'e-mail sur lui. */
    #[DataProvider('drapeau')]
    public function test_un_compte_sans_email_accepte_pour_lui_et_recoit_l_email_verifie(bool $drapeau): void
    {
        config(['auth.phone_login.enabled' => $drapeau]);
        $compte = User::factory()->create([
            'email' => null, 'email_verified_at' => null,
            'phone' => '+221771234567', 'phone_verified_at' => now(),
            'first_name' => '', 'last_name' => '',
        ]);
        [$invitation, $profil] = $this->invitationBailleur('m@exemple.sn');
        $avant = User::query()->count();

        Sanctum::actingAs($compte);
        $this->postJson("/api/invitations/{$invitation->token}/accept", ['first_name' => 'Moussa', 'last_name' => 'Ndiaye'])
            ->assertOk()
            ->assertJsonPath('data.status', 'accepted');

        $this->assertSame($avant, User::query()->count());
        $compte->refresh();
        $this->assertSame('m@exemple.sn', $compte->email);
        $this->assertNotNull($compte->email_verified_at);
        $this->assertSame(['Moussa', 'Ndiaye'], [$compte->first_name, $compte->last_name]);
        $this->assertSame($compte->id, (int) $profil->fresh()->user_id);
        $this->assertSame(OwnerProfileStatus::Active, $profil->fresh()->status);
        $this->assertSame($compte->id, (int) $invitation->fresh()->invited_user_id);
    }

    /** Les règles d'`acceptForAuthenticatedUser` : un compte connecté qui porte un AUTRE e-mail est refusé, rien n'est écrit. */
    public function test_un_compte_connecte_a_un_autre_email_est_refuse_sans_rien_ecrire(): void
    {
        $compte = User::factory()->create(['email' => 'autre@exemple.sn']);
        [$invitation, $profil] = $this->invitationBailleur('m@exemple.sn');
        $avant = User::query()->count();

        Sanctum::actingAs($compte);
        $this->postJson("/api/invitations/{$invitation->token}/accept", [])
            ->assertStatus(403)
            ->assertJsonPath('code', 'invitation.email_mismatch');

        $this->assertSame($avant, User::query()->count());
        $this->assertSame('autre@exemple.sn', $compte->fresh()->email);
        $this->assertNull($profil->fresh()->user_id);
        $this->assertSame(InvitationStatus::Sent, $invitation->fresh()->status);
    }

    /** Une invitation par SMS, compte connecté qui n'a pas VÉRIFIÉ ce numéro : refusée, aucun compte neuf. */
    public function test_par_sms_un_compte_connecte_sans_ce_numero_verifie_est_refuse_sans_doublon(): void
    {
        config(['auth.phone_login.enabled' => true]);
        $compte = User::factory()->create(['email' => 'a@exemple.sn', 'phone' => '+221771234567', 'phone_verified_at' => null]);
        [$invitation] = $this->invitationBailleur(null, '+221771234567');
        $avant = User::query()->count();

        Sanctum::actingAs($compte);
        $this->postJson("/api/invitations/{$invitation->token}/accept", [])
            ->assertStatus(403)
            ->assertJsonPath('code', 'invitation.phone_mismatch');

        $this->assertSame($avant, User::query()->count());
        $this->assertSame(InvitationStatus::Sent, $invitation->fresh()->status);
    }

    /**
     * Sans session, rien ne change : un destinataire sans compte voit le sien naître (la voie mot de passe reste entière).
     */
    public function test_sans_session_le_compte_nait_comme_avant(): void
    {
        [$invitation] = $this->invitationBailleur('m@exemple.sn');
        $avant = User::query()->count();

        $this->postJson("/api/invitations/{$invitation->token}/accept", ['first_name' => 'Moussa', 'last_name' => 'Ndiaye', 'password' => 'sup3r-secret'])
            ->assertOk();

        $this->assertSame($avant + 1, User::query()->count());
        $this->assertNotNull(User::query()->where('email', 'm@exemple.sn')->sole()->password_set_at);
    }

    /** @return array{0: Invitation, 1: OwnerProfile} */
    private function invitationBailleur(?string $email, ?string $phone = null): array
    {
        $profil = OwnerProfile::factory()->create([
            'agency_id' => $this->agency->id,
            'status' => OwnerProfileStatus::Draft->value,
            'user_id' => null,
        ]);
        $invitation = Invitation::factory()->create([
            'email' => $email,
            'phone' => $phone,
            'agency_id' => $this->agency->id,
            'invitable_type' => OwnerProfile::class,
            'invitable_id' => $profil->id,
            'role' => 'owner',
        ]);

        return [$invitation, $profil];
    }
}
