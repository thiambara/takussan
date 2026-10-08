<?php

namespace Tests\Feature\Auth\Session;

use App\Exceptions\ApiError;
use App\Models\Enums\UserStatus;
use App\Models\User;
use App\Services\Auth\SessionTokenIssuer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-589 AC4 — un compte `blocked` ou `deleted` n'ouvre aucune session, par aucun
 * chemin : mot de passe, code SMS, rappel OAuth Google, jeton émis AVANT le blocage.
 *
 * Rouge sur `5f872f1f` : `AuthController::login` ne lisait jamais `status`, le mot de
 * passe suffisait à rouvrir une session. Ablations séparées rejouées (re-mesurées le
 * 2026-10-08, vérification adverse m8) : retirer la clause de `login` → 4 rouges, les deux
 * cas « refus avant le défi 2FA » et les deux cas « mot de passe » (l'émetteur refuse encore,
 * mais sous son propre code `auth.account_blocked`) ; retirer la clause d'`AccessTokenGate`
 * → le cas « jeton existant » rougit ; retirer celle de l'émetteur → son cas direct rougit.
 */
class BlockedAccountAuthenticationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    /** @return array<string, array{0: UserStatus}> */
    public static function statutsFermes(): array
    {
        return ['bloqué' => [UserStatus::Blocked], 'supprimé' => [UserStatus::Deleted]];
    }

    #[DataProvider('statutsFermes')]
    public function test_le_mot_de_passe_ne_rouvre_pas_la_session(UserStatus $statut): void
    {
        User::factory()->create([
            'email' => 'ferme@example.com',
            'password' => 'password123',
            'status' => $statut->value,
        ]);

        $this->postJson('/api/auth/login', ['email' => 'ferme@example.com', 'password' => 'password123'])
            ->assertForbidden()
            ->assertJsonPath('code', 'account_blocked')
            ->assertJsonMissingPath('token');
    }

    /**
     * L'émetteur refuse LUI-MÊME un compte fermé : depuis la fusion de TCK-588, chaque
     * chemin d'entrée refuse avant lui, si bien qu'aucun test HTTP n'atteignait plus cette
     * clause (mesuré : la retirer laissait `tests/Feature/Auth` entièrement vert). C'est
     * l'invariant d'un appelant futur qui oublierait de vérifier.
     */
    #[DataProvider('statutsFermes')]
    public function test_l_emetteur_refuse_lui_meme_un_compte_ferme(UserStatus $statut): void
    {
        $user = User::factory()->create(['status' => $statut->value]);

        try {
            app(SessionTokenIssuer::class)->issue($user, 'appelant-oublieux');
            $this->fail("L'émetteur a émis un jeton pour un compte fermé.");
        } catch (ApiError $e) {
            $this->assertSame(403, $e->getStatusCode());
            $this->assertSame('auth.account_blocked', $e->errorCode);
        }

        $this->assertSame(0, $user->tokens()->count());
    }

    /**
     * Le refus tombe AVANT le défi 2FA et avant toute écriture : un compte bloqué
     * n'obtient ni `requires_2fa`, ni une date de dernière connexion. L'émetteur de
     * jeton refuse aussi (défense en profondeur) : c'est ce cas qui distingue la
     * clause de `login` de celle de l'émetteur.
     */
    #[DataProvider('statutsFermes')]
    public function test_le_refus_precede_le_defi_2fa_et_toute_ecriture(UserStatus $statut): void
    {
        $user = User::factory()->create([
            'email' => 'ferme@example.com',
            'password' => 'password123',
            'status' => $statut->value,
            'two_factor_enabled' => true,
            'two_factor_secret' => 'JBSWY3DPEHPK3PXP',
            'last_login_at' => null,
        ]);

        $this->postJson('/api/auth/login', ['email' => 'ferme@example.com', 'password' => 'password123'])
            ->assertForbidden()
            ->assertJsonPath('code', 'account_blocked')
            ->assertJsonMissingPath('requires_2fa');

        $this->assertNull($user->fresh()->last_login_at);
    }

    public function test_un_mauvais_mot_de_passe_ne_revele_pas_le_blocage(): void
    {
        User::factory()->create([
            'email' => 'ferme@example.com',
            'password' => 'password123',
            'status' => UserStatus::Blocked->value,
        ]);

        $this->postJson('/api/auth/login', ['email' => 'ferme@example.com', 'password' => 'faux-faux'])
            ->assertUnauthorized()
            ->assertJsonMissingPath('code');
    }

    #[DataProvider('statutsFermes')]
    public function test_le_rappel_oauth_google_ne_rouvre_pas_la_session(UserStatus $statut): void
    {
        config([
            'services.google.client_id' => 'test-client-id',
            'services.google.client_secret' => 'test-secret',
            'services.google.redirect' => 'http://localhost/api/auth/oauth/google/callback',
        ]);
        User::factory()->create([
            'email' => 'ferme@example.com',
            'google_id' => 'google-ferme',
            'status' => $statut->value,
        ]);
        Cache::put('oauth_state:valid', ['provider' => 'google'], now()->addMinutes(5));
        $socialUser = Mockery::mock(SocialiteUser::class);
        $socialUser->shouldReceive('getId')->andReturn('google-ferme');
        $socialUser->shouldReceive('getEmail')->andReturn('ferme@example.com');
        $socialUser->shouldReceive('getName')->andReturn('Compte Fermé');
        Socialite::shouldReceive('driver->stateless->user')->andReturn($socialUser);

        $this->getJson('/api/auth/oauth/google/callback?code=abc&state=valid')
            ->assertForbidden()
            ->assertJsonPath('code', 'account_blocked');
    }

    #[DataProvider('statutsFermes')]
    public function test_le_code_sms_ne_rouvre_pas_la_session(UserStatus $statut): void
    {
        config(['auth.phone_login.enabled' => true]);
        $sms = FakeSmsRouter::install();
        $user = User::factory()->create([
            'phone' => '+221770000701',
            'phone_verified_at' => now(),
            'status' => $statut->value,
            'last_login_at' => null,
        ]);

        $this->postJson('/api/auth/phone/request-code', ['phone' => '+221770000701'])->assertStatus(202);
        $this->postJson('/api/auth/phone/verify-code', [
            'phone' => '+221770000701',
            'code' => $sms->lastCodeFor('+221770000701'),
        ])->assertForbidden()->assertJsonPath('code', 'account_blocked')->assertJsonMissingPath('token');

        $this->assertNull($user->fresh()->last_login_at);
        $this->assertSame(1, User::query()->where('phone', '+221770000701')->count());
    }

    #[DataProvider('statutsFermes')]
    public function test_un_jeton_emis_avant_le_blocage_rend_401(UserStatus $statut): void
    {
        $user = User::factory()->create(['status' => UserStatus::Active->value]);
        $token = $user->createToken('avant')->plainTextToken;
        $this->withToken($token)->getJson('/api/auth/me')->assertOk();

        // Un statut posé sans passer par `block` (qui supprime les jetons) : la porte
        // doit refuser le jeton survivant.
        $user->forceFill(['status' => $statut->value])->save();
        $this->app['auth']->forgetGuards();

        $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
    }
}
