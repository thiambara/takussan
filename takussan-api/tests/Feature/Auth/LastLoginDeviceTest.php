<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Services\Auth\FamilleDAppareil;
use App\Services\Auth\LoginCityResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use PragmaRX\Google2FA\Google2FA;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-2926 (ADR-0124) — la dernière connexion garde la famille d'appareil et la ville seule, par toutes les
 * voies (mot de passe, code SMS, OAuth), jamais l'IP ni la chaîne `User-Agent` ; et la date de la 2FA suit
 * le drapeau.
 */
class LastLoginDeviceTest extends TestCase
{
    use RefreshDatabase;

    private const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

    private const IP = '196.207.231.77';

    public function test_ac3_une_connexion_par_mot_de_passe_garde_la_famille_et_jamais_l_ip_ni_l_agent(): void
    {
        $user = User::factory()->create(['password' => bcrypt('password123')]);

        $this->withHeaders(['User-Agent' => self::IPHONE_SAFARI])
            ->withServerVariables(['REMOTE_ADDR' => self::IP])
            ->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password123'])
            ->assertOk();

        $fresh = $user->fresh();
        $this->assertSame('iPhone · Safari', $fresh->last_login_device);
        $this->assertNull($fresh->last_login_city);
        $this->assertNotNull($fresh->last_login_at);

        // Ni l'IP ni la chaîne d'agent dans aucune colonne de la ligne.
        $ligne = json_encode((array) DB::table('users')->where('id', $user->id)->first());
        $this->assertStringNotContainsString(self::IP, $ligne);
        $this->assertStringNotContainsString('AppleWebKit', $ligne);
        // Et la connexion n'écrit rien au journal du compte.
        $this->assertFalse(Activity::query()->where('subject_type', $user->getMorphClass())->where('subject_id', $user->id)
            ->where('properties', 'like', '%last_login%')->exists());
    }

    public function test_la_ville_vient_du_resolveur_local_et_l_ip_n_en_sort_pas(): void
    {
        $this->app->instance(LoginCityResolver::class, new class implements LoginCityResolver
        {
            public function cityFor(string $ip): ?string
            {
                return $ip === '196.207.231.77' ? 'Dakar' : null;
            }
        });
        $user = User::factory()->create(['password' => bcrypt('password123')]);

        $this->withHeaders(['User-Agent' => self::IPHONE_SAFARI])
            ->withServerVariables(['REMOTE_ADDR' => self::IP])
            ->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password123'])
            ->assertOk();

        $this->assertSame('Dakar', $user->fresh()->last_login_city);
    }

    public function test_la_connexion_par_code_sms_ecrit_la_derniere_connexion(): void
    {
        config(['auth.phone_login.enabled' => true]);
        $this->withoutMiddleware(ThrottleRequests::class);
        $sms = FakeSmsRouter::install();
        $this->postJson('/api/auth/phone/request-code', ['phone' => '+221741234567'])->assertStatus(202);
        $this->app['auth']->forgetGuards();
        $reponse = $this->withHeaders(['User-Agent' => 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'])
            ->postJson('/api/auth/phone/verify-code', ['phone' => '+221741234567', 'code' => $sms->lastCodeFor('+221741234567')])
            ->assertOk();

        $fresh = User::query()->findOrFail($reponse->json('user.id'));
        $this->assertNotNull($fresh->last_login_at);
        $this->assertSame('Android · Chrome', $fresh->last_login_device);
    }

    public function test_la_connexion_par_google_ecrit_la_derniere_connexion(): void
    {
        config([
            'services.google.client_id' => 'test-client-id',
            'services.google.client_secret' => 'test-secret',
            'services.google.redirect' => 'http://localhost/api/auth/oauth/google/callback',
        ]);
        $user = User::factory()->create(['email' => 'known@example.com', 'google_id' => 'google-789', 'last_login_at' => null]);
        Cache::put('oauth_state:valid', ['provider' => 'google'], now()->addMinutes(5));
        $socialUser = Mockery::mock(SocialiteUser::class);
        $socialUser->shouldReceive('getId')->andReturn('google-789');
        $socialUser->shouldReceive('getEmail')->andReturn('known@example.com');
        $socialUser->shouldReceive('getName')->andReturn('Whatever');
        Socialite::shouldReceive('driver->stateless->user')->andReturn($socialUser);

        $this->withHeaders(['User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'])
            ->getJson('/api/auth/oauth/google/callback?code=abc&state=valid')
            ->assertOk();

        $fresh = $user->fresh();
        $this->assertNotNull($fresh->last_login_at);
        $this->assertSame('Windows · Edge', $fresh->last_login_device);
    }

    public function test_ac3_la_date_de_la_2fa_est_posee_a_l_activation_et_effacee_a_la_desactivation(): void
    {
        $this->freezeSecond();
        $secret = (new Google2FA)->generateSecretKey();
        $user = User::factory()->create([
            'two_factor_enabled' => false,
            'two_factor_secret' => $secret,
            'password' => bcrypt('secret123'),
        ]);
        $this->assertNull($user->fresh()->two_factor_enabled_at);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor/confirm', ['code' => (new Google2FA)->getCurrentOtp($secret)])->assertOk();
        $this->assertTrue($user->fresh()->two_factor_enabled_at->equalTo(now()));

        $this->postJson('/api/auth/two-factor/disable', ['password' => 'secret123'])->assertOk();
        $this->assertNull($user->fresh()->two_factor_enabled_at);
    }

    /** @return array<string, array{0: string, 1: ?string}> */
    public static function agents(): array
    {
        return [
            'iPhone Safari' => [self::IPHONE_SAFARI, 'iPhone · Safari'],
            'iPhone Chrome' => ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1', 'iPhone · Chrome'],
            'Android Samsung' => ['Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36', 'Android · Samsung Internet'],
            'Mac Safari' => ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 'Mac · Safari'],
            'Mac Firefox' => ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0', 'Mac · Firefox'],
            'Linux Opera' => ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/111.0.0.0', 'Linux · Opera'],
            'robot' => ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', null],
            'node' => ['node', null],
            'vide' => ['', null],
        ];
    }

    #[DataProvider('agents')]
    public function test_la_famille_d_appareil_lue_d_un_agent(string $agent, ?string $attendu): void
    {
        $this->assertSame($attendu, FamilleDAppareil::lire($agent));
    }
}
