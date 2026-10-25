<?php

namespace Tests\Feature\Auth\TwoFactor;

use App\Models\User;
use App\Services\Auth\SessionTokenIssuer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-2305 (P221.01) — un compte « 2FA active, secret nul ou vide » : aucun écrivain connu ne
 * produit cette ligne, mais elle rendait 500 sur les six sites qui vérifient un TOTP (`TypeError`
 * pour un secret nul, `SecretKeyTooShortException` pour un secret vide). Désormais
 * `verifyCodeForUser` rend faux (échec fermé) : le code est refusé partout, le code de secours
 * reste une voie à la connexion, et le mot de passe reste celle de la désactivation.
 */
class SecretAbsentTest extends TestCase
{
    use RefreshDatabase;

    private const CODE = '123456';

    private const NUMERO = '+221770000177';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    /** @return array<string, array{0: ?string}> */
    public static function secrets(): array
    {
        return ['secret nul' => [null], 'secret vide' => ['']];
    }

    #[DataProvider('secrets')]
    public function test_la_desactivation_refuse_le_code_sans_500(?string $secret): void
    {
        Sanctum::actingAs($this->compte($secret));

        $this->postJson('/api/auth/two-factor/disable', ['code' => self::CODE])
            ->assertStatus(422)
            ->assertJsonPath('code', 'two_factor.password_or_code_invalid');
    }

    #[DataProvider('secrets')]
    public function test_le_step_up_refuse_le_code_sans_500(?string $secret): void
    {
        $jeton = app(SessionTokenIssuer::class)->issue($this->compte($secret), 'test')['token'];

        $this->withToken($jeton)->postJson('/api/auth/two-factor/step-up', ['code' => self::CODE])
            ->assertStatus(422)
            ->assertJsonPath('code', 'two_factor_step_up_invalid');
    }

    #[DataProvider('secrets')]
    public function test_la_connexion_refuse_le_code_et_garde_le_code_de_secours(?string $secret): void
    {
        $user = $this->compte($secret);

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
            'two_factor_code' => self::CODE,
        ])->assertUnauthorized()->assertJsonPath('requires_2fa', true)->assertJsonMissingPath('token');

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
            'recovery_code' => 'AAAAA-BBBBB',
        ])->assertOk()->assertJsonStructure(['token']);
    }

    #[DataProvider('secrets')]
    public function test_la_connexion_par_telephone_refuse_le_code_sans_500(?string $secret): void
    {
        config(['auth.phone_login.enabled' => true]);
        $sms = FakeSmsRouter::install();
        $this->compte($secret, ['phone' => self::NUMERO, 'phone_verified_at' => now()]);
        $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])->assertStatus(202);

        $this->postJson('/api/auth/phone/verify-code', [
            'phone' => self::NUMERO,
            'code' => $sms->lastCodeFor(self::NUMERO),
            'two_factor_code' => self::CODE,
        ])->assertUnauthorized()->assertJsonPath('requires_2fa', true)->assertJsonMissingPath('token');
    }

    #[DataProvider('secrets')]
    public function test_le_defi_oauth_refuse_le_code_sans_500(?string $secret): void
    {
        config([
            'services.google.client_id' => 'test-client-id',
            'services.google.client_secret' => 'test-secret',
            'services.google.redirect' => 'http://localhost/api/auth/oauth/google/callback',
        ]);
        $this->compte($secret, ['email' => 'oauth@example.com', 'google_id' => 'google-absent']);
        Cache::put('oauth_state:google-ok', ['provider' => 'google'], now()->addMinutes(5));
        $social = Mockery::mock(SocialiteUser::class);
        $social->shouldReceive('getId')->andReturn('google-absent');
        $social->shouldReceive('getEmail')->andReturn('oauth@example.com');
        $social->shouldReceive('getName')->andReturn('Compte Absent');
        Socialite::shouldReceive('driver->stateless->user')->andReturn($social);
        $defi = $this->getJson('/api/auth/oauth/google/callback?code=abc&state=google-ok')
            ->assertOk()
            ->json('data.challenge');

        $this->postJson('/api/auth/oauth/2fa', ['challenge' => $defi, 'two_factor_code' => self::CODE])
            ->assertUnauthorized()
            ->assertJsonPath('requires_2fa', true);
    }

    #[DataProvider('secrets')]
    public function test_la_demande_de_suppression_refuse_le_code_sans_500(?string $secret): void
    {
        Sanctum::actingAs($this->compte($secret));

        $this->postJson('/api/auth/me/deletion-request', [
            'password' => 'password123',
            'reason_code' => 'privacy',
            'two_factor_code' => self::CODE,
        ])->assertStatus(422)->assertJsonValidationErrors(['two_factor_code']);
    }

    /** @param  array<string, mixed>  $attributs */
    private function compte(?string $secret, array $attributs = []): User
    {
        $user = User::factory()->create([
            'email' => 'absent@example.com',
            'password' => Hash::make('password123'),
            'two_factor_enabled' => true,
            'two_factor_recovery_codes' => json_encode(['AAAAA-BBBBB']),
            ...$attributs,
        ]);

        // Posé après la fabrique, qui écrit un secret valide : c'est la ligne incohérente qu'aucun
        // écrivain connu ne produit (SQL manuel, migration de données).
        $user->forceFill(['two_factor_secret' => $secret])->save();

        return $user->fresh();
    }
}
