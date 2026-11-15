<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Models\User;
use App\Providers\AppServiceProvider;
use App\Services\Auth\LoginLock;
use App\Services\Auth\PhoneVerificationService;
use App\Services\Property\PublishReadiness;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\PersonalAccessToken;
use PragmaRX\Google2FA\Google2FA;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-2610 (ADR-0094 § 5-6) — l'invité entre comme on entre partout : un numéro, un code. `POST
 * /api/public/invitations/{token}/code` envoie le code (au numéro de l'invitation par SMS, au numéro saisi pour une
 * invitation par e-mail), `…/verify` le vérifie comme la connexion par téléphone, ouvre ou crée le compte du numéro et
 * accepte l'invitation pour lui — en une transaction. Un cas par branche du § 5.
 *
 * Rouge sur `693cb3b42` : les deux routes n'existaient pas (404).
 */
class InvitationAcceptByCodeTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221771234567';

    private FakeSmsRouter $sms;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        Cache::flush();
        Mail::fake();
        $this->sms = FakeSmsRouter::install();
        $this->agency = Agency::factory()->create();
    }

    /** AC1 — invitation par SMS : le compte naît au numéro vérifié, le profil bailleur est actif, ses trois biens lui passent. */
    public function test_par_sms_le_compte_nait_verifie_et_le_bailleur_recoit_ses_biens(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        [$invitation, $profil] = $this->invitationBailleur(null, self::NUMERO);
        $biens = Property::factory()->draft()->count(3)->create(['agency_id' => $this->agency->id, 'pending_owner_profile_id' => $profil->id]);
        $avant = User::query()->count();

        $this->code($invitation)->assertStatus(202)->assertJsonStructure(['data' => ['retry_after']]);
        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));

        $reponse = $this->verifier($invitation, ['code' => $this->sms->lastCodeFor(self::NUMERO), 'first_name' => 'Moussa', 'last_name' => 'Ndiaye'])
            ->assertOk()
            ->assertJsonPath('is_new_account', true)
            ->assertJsonPath('invitation.status', 'accepted')
            ->assertJsonPath('user.first_name', 'Moussa');
        $this->assertNotEmpty($reponse->json('token'));
        $this->assertNotEmpty($reponse->json('expires_at'));

        $this->assertSame($avant + 1, User::query()->count());
        $compte = User::query()->where('phone', self::NUMERO)->sole();
        $this->assertNotNull($compte->phone_verified_at);
        $this->assertNull($compte->email);
        $this->assertSame(['Moussa', 'Ndiaye'], [$compte->first_name, $compte->last_name]);
        $profil->refresh();
        $this->assertSame($compte->id, (int) $profil->user_id);
        $this->assertSame(OwnerProfileStatus::Active, $profil->status);
        foreach ($biens as $bien) {
            $this->assertSame($compte->id, (int) $bien->fresh()->user_id);
            $this->assertNull($bien->fresh()->pending_owner_profile_id);
        }

        // La session émise est celle du compte qui vient de naître.
        $this->app['auth']->forgetGuards();
        $this->withToken($reponse->json('token'))->getJson('/api/auth/me')->assertOk()->assertJsonPath('id', $compte->id);
    }

    /** Invitation par e-mail, numéro saisi, aucun compte : le compte naît avec l'e-mail ET le numéro vérifiés. */
    public function test_par_email_le_compte_nait_avec_l_email_et_le_numero_verifies(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        [$invitation, $profil] = $this->invitationBailleur('m@exemple.sn');

        $this->code($invitation, self::NUMERO)->assertStatus(202);
        $this->verifier($invitation, ['phone' => self::NUMERO, 'code' => $this->sms->lastCodeFor(self::NUMERO), 'first_name' => 'Moussa', 'last_name' => 'Ndiaye'])
            ->assertOk()
            ->assertJsonPath('is_new_account', true)
            ->assertJsonPath('user.email', 'm@exemple.sn');

        $compte = User::query()->where('email', 'm@exemple.sn')->sole();
        $this->assertNotNull($compte->email_verified_at);
        $this->assertSame(self::NUMERO, $compte->phone);
        $this->assertNotNull($compte->phone_verified_at);
        $this->assertSame($compte->id, (int) $profil->fresh()->user_id);
    }

    /** Le numéro est celui d'un compte né par téléphone, sans e-mail : le profil lui est rattaché, l'e-mail posé, aucun compte neuf. */
    public function test_le_compte_du_numero_sans_email_recoit_le_profil_et_l_email(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $compte = User::factory()->create([
            'email' => null, 'email_verified_at' => null,
            'phone' => self::NUMERO, 'phone_verified_at' => now(),
            'first_name' => 'Awa', 'last_name' => 'Sarr',
        ]);
        [$invitation, $profil] = $this->invitationBailleur('m@exemple.sn');
        $avant = User::query()->count();

        $this->code($invitation, self::NUMERO)->assertStatus(202);
        $this->verifier($invitation, ['phone' => self::NUMERO, 'code' => $this->sms->lastCodeFor(self::NUMERO), 'first_name' => 'Autre', 'last_name' => 'Nom'])
            ->assertOk()
            ->assertJsonPath('is_new_account', false)
            ->assertJsonPath('user.id', $compte->id);

        $this->assertSame($avant, User::query()->count());
        $compte->refresh();
        $this->assertSame('m@exemple.sn', $compte->email);
        $this->assertNotNull($compte->email_verified_at);
        // Un compte qui porte un nom le garde (TCK-2281).
        $this->assertSame(['Awa', 'Sarr'], [$compte->first_name, $compte->last_name]);
        $this->assertSame($compte->id, (int) $profil->fresh()->user_id);
    }

    /** AC3 — l'e-mail appartient au compte X, le code prouve le numéro du compte Y : 401, rien n'est accepté ni ouvert. */
    public function test_l_email_d_un_autre_compte_rend_401_et_rien_n_est_accepte(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        User::factory()->create(['email' => 'm@exemple.sn']);
        $y = User::factory()->create(['email' => null, 'phone' => self::NUMERO, 'phone_verified_at' => now()]);
        [$invitation, $profil] = $this->invitationBailleur('m@exemple.sn');
        $comptes = User::query()->count();
        $sessions = PersonalAccessToken::query()->count();

        $this->code($invitation, self::NUMERO)->assertStatus(202);
        $this->verifier($invitation, ['phone' => self::NUMERO, 'code' => $this->sms->lastCodeFor(self::NUMERO)])
            ->assertStatus(401)
            ->assertJsonPath('code', 'invitation.requires_login')
            ->assertJsonPath('requires_login', true)
            ->assertJsonMissingPath('token');

        $this->assertSame($comptes, User::query()->count());
        $this->assertSame($sessions, PersonalAccessToken::query()->count());
        $this->assertNull($y->fresh()->email);
        $this->assertNull($profil->fresh()->user_id);
        $this->assertSame(InvitationStatus::Sent, $invitation->fresh()->status);
    }

    /** AC3, numéro sans compte : le compte que le code aurait créé est défait avec le refus. */
    public function test_l_email_d_un_autre_compte_ne_laisse_pas_naitre_un_compte_au_numero(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        User::factory()->create(['email' => 'm@exemple.sn']);
        [$invitation] = $this->invitationBailleur('m@exemple.sn');
        $comptes = User::query()->count();

        $this->code($invitation, self::NUMERO)->assertStatus(202);
        $this->verifier($invitation, ['phone' => self::NUMERO, 'code' => $this->sms->lastCodeFor(self::NUMERO)])
            ->assertStatus(401)
            ->assertJsonPath('code', 'invitation.requires_login');

        $this->assertSame($comptes, User::query()->count());
        $this->assertSame(0, User::query()->where('phone', self::NUMERO)->count());
        $this->assertSame(0, PersonalAccessToken::query()->count());
    }

    /** Le compte du numéro porte un AUTRE e-mail, personne ne porte celui de l'invitation : 403, rien d'écrit. */
    public function test_le_compte_du_numero_a_un_autre_email_est_refuse(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $compte = User::factory()->create(['email' => 'autre@exemple.sn', 'phone' => self::NUMERO, 'phone_verified_at' => now()]);
        [$invitation, $profil] = $this->invitationBailleur('m@exemple.sn');

        $this->code($invitation, self::NUMERO)->assertStatus(202);
        $this->verifier($invitation, ['phone' => self::NUMERO, 'code' => $this->sms->lastCodeFor(self::NUMERO)])
            ->assertStatus(403)
            ->assertJsonPath('code', 'invitation.email_mismatch');

        $this->assertSame('autre@exemple.sn', $compte->fresh()->email);
        $this->assertNull($profil->fresh()->user_id);
        $this->assertSame(0, PersonalAccessToken::query()->count());
    }

    /** Second facteur actif sur le compte du numéro : `requires_2fa`, code non consommé ; reposé avec le TOTP, l'invitation est acceptée. */
    public function test_un_second_facteur_actif_rend_requires_2fa_sans_consommer_le_code(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $compte = User::factory()->create([
            'email' => null, 'phone' => self::NUMERO, 'phone_verified_at' => now(),
            'two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
        ]);
        [$invitation, $profil] = $this->invitationBailleur(null, self::NUMERO);

        $this->code($invitation)->assertStatus(202);
        $code = $this->sms->lastCodeFor(self::NUMERO);
        $this->verifier($invitation, ['code' => $code])
            ->assertOk()
            ->assertJsonPath('requires_2fa', true)
            ->assertJsonMissingPath('token');
        $this->assertSame(InvitationStatus::Sent, $invitation->fresh()->status);

        $this->verifier($invitation, ['code' => $code, 'two_factor_code' => (new Google2FA)->getCurrentOtp(self::TEST_TWO_FACTOR_SECRET)])
            ->assertOk()
            ->assertJsonPath('user.id', $compte->id)
            ->assertJsonPath('invitation.status', 'accepted');
        $this->assertSame($compte->id, (int) $profil->fresh()->user_id);
    }

    /** Même verrou que la connexion : cinq codes faux invalident le code ; le numéro verrouillé refuse même le bon code (423). */
    public function test_le_verrou_du_numero_est_celui_de_la_connexion(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        [$invitation] = $this->invitationBailleur(null, self::NUMERO);

        $this->code($invitation)->assertStatus(202);
        $code = $this->sms->lastCodeFor(self::NUMERO);
        for ($i = 0; $i < PhoneVerificationService::MAX_ATTEMPTS_PER_CODE; $i++) {
            $this->verifier($invitation, ['code' => '000000'])->assertStatus(422)->assertJsonPath('code', 'phone_code_invalid');
        }
        $this->verifier($invitation, ['code' => $code])->assertStatus(422)->assertJsonPath('code', 'phone_code_invalid');

        // Le verrou du numéro (`LoginLock`, canal téléphone) : posé par la connexion, il ferme aussi cette porte.
        for ($i = 0; $i < LoginLock::MAX_FAILURES; $i++) {
            app(LoginLock::class)->recordNumberFailure(self::NUMERO);
        }
        $this->travel(61)->seconds();
        $envoyes = count($this->sms->sentTo(self::NUMERO));
        $this->assertTrue(app(PhoneVerificationService::class)->sendCodeTo('login', self::NUMERO));
        $this->assertCount($envoyes + 1, $this->sms->sentTo(self::NUMERO));
        $this->verifier($invitation, ['code' => $this->sms->lastCodeFor(self::NUMERO)])
            ->assertStatus(423)
            ->assertJsonPath('code', 'account_locked');
        $this->assertSame(InvitationStatus::Sent, $invitation->fresh()->status);
    }

    /**
     * Le limiteur de vérification par numéro : pour une invitation par SMS, le corps ne porte pas de numéro — le seau est celui
     * du numéro de l'invitation, partagé avec `auth/phone/verify-code`, et non un seau commun à toutes les invitations.
     */
    public function test_le_limiteur_de_verification_compte_sur_le_numero_de_l_invitation(): void
    {
        [$invitation] = $this->invitationBailleur(null, self::NUMERO);
        [$autre] = $this->invitationBailleur(null, '+221771234568');

        for ($i = 0; $i < AppServiceProvider::PHONE_VERIFY_PER_WINDOW; $i++) {
            $this->verifier($invitation, ['code' => '000000'])->assertStatus(422);
        }
        $this->verifier($invitation, ['code' => '000000'])->assertStatus(429);
        // Le même seau que la connexion par téléphone pour ce numéro…
        $this->postJson('/api/auth/phone/verify-code', ['phone' => self::NUMERO, 'code' => '000000'])->assertStatus(429);
        // … et pas celui de l'invitation adressée à un autre numéro.
        $this->verifier($autre, ['code' => '000000'])->assertStatus(422);
    }

    /** TCK-1344 — le compte qui naît du code garde la langue dans laquelle l'invitation est partie. */
    public function test_le_compte_ne_du_code_garde_la_langue_de_l_invitation(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        // Une langue que la requête ne porte pas : le compte ne la tient que de l'invitation.
        $this->assertNotSame('wo', app()->getLocale());
        [$invitation] = $this->invitationBailleur(null, self::NUMERO, ['metadata' => ['locale' => 'wo']]);

        $this->code($invitation)->assertStatus(202);
        $this->verifier($invitation, ['code' => $this->sms->lastCodeFor(self::NUMERO)])->assertOk();

        $this->assertSame('wo', User::query()->where('phone', self::NUMERO)->sole()->preferred_language);
    }

    /**
     * Le compte que le Radar a créé pour ce numéro (TCK-2404) : les conditions lui sont présentées, code non consommé et
     * essai du limiteur rendu ; reposé avec `terms_version`, l'invitation est acceptée pour CE compte.
     */
    public function test_le_compte_du_radar_accepte_les_conditions_puis_l_invitation(): void
    {
        $compte = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => null, 'password_set_at' => null, 'email' => null]);
        RadarAdvertiser::factory()->create(['user_id' => $compte->id]);
        [$invitation, $profil] = $this->invitationBailleur(null, self::NUMERO);

        $this->code($invitation)->assertStatus(202);
        $code = $this->sms->lastCodeFor(self::NUMERO);
        // Plus de présentations que le limiteur n'accorde d'essais : chacune rend le sien.
        for ($i = 0; $i <= AppServiceProvider::PHONE_VERIFY_PER_WINDOW; $i++) {
            $this->verifier($invitation, ['code' => $code])
                ->assertOk()
                ->assertJsonPath('requires_terms', true)
                ->assertJsonMissingPath('token');
        }
        $this->assertSame(InvitationStatus::Sent, $invitation->fresh()->status);

        $this->verifier($invitation, ['code' => $code, 'terms_version' => PublishReadiness::TERMS_VERSION])
            ->assertOk()
            ->assertJsonPath('user.id', $compte->id)
            ->assertJsonPath('invitation.status', 'accepted');
        $this->assertNotNull($compte->fresh()->phone_verified_at);
        $this->assertSame($compte->id, (int) $profil->fresh()->user_id);
    }

    /**
     * La cooptation d'un super-admin acceptée par code : la session ouverte ne confère pas le rôle — l'enrôlement TOTP reste
     * le seul passage (TCK-263), comme par la voie mot de passe.
     */
    public function test_une_cooptation_acceptee_par_code_ne_confere_pas_le_role_avant_la_2fa(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $invitation = Invitation::factory()->create([
            'email' => 'coopte@exemple.sn',
            'agency_id' => null,
            'role' => 'super_admin',
            'metadata' => ['requires_2fa' => true],
        ]);

        $this->code($invitation, self::NUMERO)->assertStatus(202);
        $jeton = $this->verifier($invitation, ['phone' => self::NUMERO, 'code' => $this->sms->lastCodeFor(self::NUMERO)])
            ->assertOk()
            ->assertJsonPath('invitation.status', 'accepted')
            ->json('token');

        $coopte = User::query()->where('email', 'coopte@exemple.sn')->sole();
        $this->assertTrue((bool) $coopte->force_2fa_at_first_login);
        $this->assertFalse($coopte->isSuperAdmin());
        $this->app['auth']->forgetGuards();
        $this->withToken($jeton)->getJson('/api/admin/users')->assertForbidden();
    }

    /** AC4 — la réponse de `code` est la même que le numéro porte un compte ou non. */
    public function test_la_reponse_de_code_est_identique_avec_et_sans_compte(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->freezeTime();
        User::factory()->create(['email' => null, 'phone' => '+221770000301', 'phone_verified_at' => now()]);
        [$invitation] = $this->invitationBailleur('m@exemple.sn');

        $avecCompte = $this->code($invitation, '+221770000301');
        $sansCompte = $this->code($invitation, '+221770000302');

        $avecCompte->assertStatus(202);
        $sansCompte->assertStatus(202);
        $this->assertSame($avecCompte->json(), $sansCompte->json());
    }

    public function test_drapeau_eteint_les_deux_routes_rendent_404(): void
    {
        config(['auth.phone_login.enabled' => false]);
        [$invitation] = $this->invitationBailleur(null, self::NUMERO);

        $this->code($invitation)->assertNotFound();
        $this->verifier($invitation, ['code' => '123456'])->assertNotFound();
        $this->assertSame([], $this->sms->sentTo(self::NUMERO));
    }

    /** Par e-mail, le numéro est requis ; l'état du jeton prime un corps incomplet ; par SMS, un numéro du corps est ignoré. */
    public function test_le_numero_est_requis_par_email_et_l_etat_du_jeton_prime(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        [$parEmail] = $this->invitationBailleur('m@exemple.sn');
        [$echue] = $this->invitationBailleur('n@exemple.sn', null, ['expires_at' => now()->subHour()]);
        [$parSms] = $this->invitationBailleur(null, self::NUMERO);

        $this->code($parEmail)->assertStatus(422)->assertJsonValidationErrors('phone');
        $this->code($echue)->assertStatus(410)->assertJsonPath('code', 'invitation.token_expired');
        $this->postJson('/api/public/invitations/'.str_repeat('x', 64).'/code', [])->assertNotFound()->assertJsonPath('code', 'invitation.token_not_found');

        $this->code($parSms, '+221770000999')->assertStatus(202);
        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));
        $this->assertSame([], $this->sms->sentTo('+221770000999'));
    }

    private function code(Invitation $invitation, ?string $phone = null): TestResponse
    {
        return $this->postJson("/api/public/invitations/{$invitation->token}/code", $phone === null ? [] : ['phone' => $phone]);
    }

    /** @param  array<string, mixed>  $corps */
    private function verifier(Invitation $invitation, array $corps): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->postJson("/api/public/invitations/{$invitation->token}/verify", $corps);
    }

    /**
     * @param  array<string, mixed>  $attributs
     * @return array{0: Invitation, 1: OwnerProfile}
     */
    private function invitationBailleur(?string $email, ?string $phone = null, array $attributs = []): array
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
            ...$attributs,
        ]);

        return [$invitation, $profil];
    }
}
