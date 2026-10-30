<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\RadarAdvertiser;
use App\Models\User;
use App\Services\Property\PublishReadiness;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Testing\TestResponse;
use PragmaRX\Google2FA\Google2FA;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-2404 — l'article 6.3 des CGU promet à l'annonceur dont le Radar a créé le compte : « Vous l'activez en vous connectant
 * avec un code reçu par SMS à ce numéro ; les présentes Conditions vous sont alors présentées pour acceptation. » La page de
 * réclamation le tient (TCK-2390) ; la connexion ordinaire par code le tient ici : tant que le compte désigné par un
 * `radar_advertisers.user_id` n'a pas accepté, le bon code rend `requires_terms` sans jeton ni écriture, et c'est le même
 * code reposé avec `terms_version` qui ouvre la session et date l'acceptation.
 */
class PhoneLoginRadarTermsTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221741234567';

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->sms = FakeSmsRouter::install();
        $this->freezeSecond();
    }

    public function test_le_compte_du_radar_n_entre_pas_avant_d_avoir_accepte_les_conditions(): void
    {
        $compte = $this->compteRadar();
        $code = $this->demanderCode();

        $this->verifier($code)
            ->assertOk()
            ->assertJsonPath('requires_terms', true)
            ->assertJsonPath('terms_version', PublishReadiness::TERMS_VERSION)
            ->assertJsonMissingPath('token')
            ->assertJsonMissingPath('user');

        // Rien n'est écrit : ni l'acceptation, ni la vérification du numéro, ni la connexion.
        $compte->refresh();
        $this->assertNull($compte->terms_accepted_at);
        $this->assertNull($compte->phone_verified_at);
        $this->assertNull($compte->last_login_at);
        $this->assertSame(0, $compte->tokens()->count());

        // Le MÊME code, reposé avec la version acceptée : la session s'ouvre et l'acceptation est datée, version comprise.
        $this->verifier($code, ['terms_version' => PublishReadiness::TERMS_VERSION])
            ->assertOk()
            ->assertJsonPath('is_new_account', false)
            ->assertJsonPath('user.id', $compte->id)
            ->assertJsonPath('user.terms_accepted_at', now()->toIso8601String());

        $compte->refresh();
        $this->assertTrue($compte->terms_accepted_at->equalTo(now()));
        $this->assertSame(PublishReadiness::TERMS_VERSION, $compte->terms_version);
        $this->assertNotNull($compte->phone_verified_at);

        // Et le code est désormais consommé.
        $this->verifier($code, ['terms_version' => PublishReadiness::TERMS_VERSION])
            ->assertStatus(422)
            ->assertJsonPath('code', 'phone_code_invalid');
    }

    public function test_une_version_perimee_n_est_pas_une_acceptation(): void
    {
        $compte = $this->compteRadar();

        $this->verifier($this->demanderCode(), ['terms_version' => '2020-01-01'])
            ->assertOk()
            ->assertJsonPath('requires_terms', true)
            ->assertJsonPath('terms_version', PublishReadiness::TERMS_VERSION)
            ->assertJsonMissingPath('token');

        $this->assertNull($compte->fresh()->terms_accepted_at);
    }

    public function test_un_code_faux_ne_presente_pas_les_conditions(): void
    {
        $this->compteRadar();
        $this->demanderCode();

        $this->verifier('000000')
            ->assertStatus(422)
            ->assertJsonPath('code', 'phone_code_invalid')
            ->assertJsonMissingPath('requires_terms');
    }

    public function test_un_compte_du_radar_deja_active_sans_acceptation_est_interroge(): void
    {
        // Activé par la connexion avant ce ticket : le numéro est vérifié, les conditions ne sont pas acceptées.
        $compte = $this->compteRadar(['phone_verified_at' => now()]);
        $code = $this->demanderCode();

        $this->verifier($code)->assertOk()->assertJsonPath('requires_terms', true)->assertJsonMissingPath('token');

        $this->verifier($code, ['terms_version' => PublishReadiness::TERMS_VERSION])
            ->assertOk()
            ->assertJsonPath('user.id', $compte->id);
        $this->assertSame(PublishReadiness::TERMS_VERSION, $compte->fresh()->terms_version);
    }

    public function test_un_compte_qui_a_deja_accepte_n_est_pas_interroge_de_nouveau(): void
    {
        // Par la réclamation ou par une publication : l'acceptation est datée, une version plus ancienne comprise.
        $compte = $this->compteRadar(['terms_accepted_at' => now()->subDay(), 'terms_version' => '2026-10-01']);

        $this->verifier($this->demanderCode())
            ->assertOk()
            ->assertJsonMissingPath('requires_terms')
            ->assertJsonPath('user.id', $compte->id);

        $compte->refresh();
        $this->assertSame('2026-10-01', $compte->terms_version);
        $this->assertTrue($compte->terms_accepted_at->equalTo(now()->subDay()));
    }

    public function test_un_compte_que_le_radar_ne_designe_pas_n_est_pas_interroge(): void
    {
        $compte = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);

        $this->verifier($this->demanderCode())
            ->assertOk()
            ->assertJsonMissingPath('requires_terms')
            ->assertJsonPath('user.id', $compte->id);

        $this->assertNull($compte->fresh()->terms_accepted_at);
    }

    public function test_un_compte_neuf_n_est_pas_interroge(): void
    {
        $this->verifier($this->demanderCode())
            ->assertOk()
            ->assertJsonMissingPath('requires_terms')
            ->assertJsonPath('is_new_account', true);
    }

    public function test_les_conditions_passent_avant_le_second_facteur(): void
    {
        $compte = $this->compteRadar([
            'phone_verified_at' => now(),
            'two_factor_enabled' => true,
            'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
        ]);
        $code = $this->demanderCode();

        // Le second facteur se saisit en dernier : un TOTP ne survit pas à la lecture des conditions.
        $this->verifier($code)->assertOk()->assertJsonPath('requires_terms', true)->assertJsonMissingPath('requires_2fa');

        $this->verifier($code, ['terms_version' => PublishReadiness::TERMS_VERSION])
            ->assertOk()
            ->assertJsonPath('requires_2fa', true)
            ->assertJsonMissingPath('token');
        $this->assertNull($compte->fresh()->terms_accepted_at);

        $this->verifier($code, [
            'terms_version' => PublishReadiness::TERMS_VERSION,
            'two_factor_code' => (new Google2FA)->getCurrentOtp(self::TEST_TWO_FACTOR_SECRET),
        ])->assertOk()->assertJsonPath('user.id', $compte->id);
        $this->assertSame(PublishReadiness::TERMS_VERSION, $compte->fresh()->terms_version);
    }

    /** Le compte que « Publier pour lui » crée : un numéro, ni mot de passe, ni e-mail, jamais vérifié, aucune acceptation. */
    private function compteRadar(array $attributs = []): User
    {
        $compte = User::factory()->create($attributs + [
            'phone' => self::NUMERO,
            'phone_verified_at' => null,
            'password_set_at' => null,
            'email' => null,
            'last_login_at' => null,
        ]);
        RadarAdvertiser::factory()->create(['user_id' => $compte->id]);

        return $compte;
    }

    private function demanderCode(): string
    {
        $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])->assertStatus(202);

        return $this->sms->lastCodeFor(self::NUMERO);
    }

    /** @param  array<string, string>  $extra */
    private function verifier(string $code, array $extra = []): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->postJson('/api/auth/phone/verify-code', ['phone' => self::NUMERO, 'code' => $code] + $extra);
    }
}
