<?php

namespace Tests\Feature\Auth\TwoFactor;

use App\Models\Enums\UserStatus;
use App\Models\User;
use App\Services\Auth\LoginLock;
use App\Services\Auth\OAuthSessionOpener;
use App\Services\Auth\SessionTokenIssuer;
use App\Services\Auth\TwoFactorService;
use Illuminate\Cache\ArrayStore;
use Illuminate\Cache\Repository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * P213.04 (TCK-2201) — `OAuthSessionOpener::complete` juge le blocage du compte et tire le défi
 * (`pull`) AVANT de vérifier le second facteur : un code de secours n'est plus brûlé sur une
 * session refusée (compte bloqué, défi déjà soldé par une soumission concurrente). Un facteur
 * faux remet le défi, `attempts + 1`.
 */
class OAuthDefiAvantFacteurTest extends TestCase
{
    use RefreshDatabase;

    private const SECOURS = 'AAAAA-BBBBB';

    private function compte(array $attributs = []): User
    {
        return User::factory()->create($attributs + [
            'two_factor_enabled' => true,
            'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
            'two_factor_recovery_codes' => json_encode([self::SECOURS, 'CCCCC-DDDDD']),
        ]);
    }

    private function ouvreur(Repository $cache): OAuthSessionOpener
    {
        return new OAuthSessionOpener(app(SessionTokenIssuer::class), app(TwoFactorService::class), app(LoginLock::class), $cache);
    }

    /** Le défi d'un rappel OAuth, tel que `open()` le dépose. */
    private function defi(Repository $cache, User $u, int $tentatives = 0): string
    {
        $defi = str_repeat('d', 64);
        $cache->put('oauth_2fa:'.hash('sha256', $defi), [
            'user_id' => $u->id, 'token_name' => 'oauth', 'attempts' => $tentatives,
            'expires_at' => now()->addMinutes(5)->getTimestamp(),
        ], now()->addMinutes(5));

        return $defi;
    }

    private function secoursEncoreValable(User $u): bool
    {
        return app(TwoFactorService::class)->verifyRecoveryCode($u->fresh(), self::SECOURS);
    }

    public function test_un_compte_bloque_garde_son_code_de_secours(): void
    {
        $u = $this->compte(['status' => UserStatus::Blocked]);
        $cache = new Repository(new ArrayStore);

        $reponse = $this->ouvreur($cache)->complete($this->defi($cache, $u), ['recovery_code' => self::SECOURS], Request::create('/', 'POST'));

        $this->assertSame(403, $reponse->getStatusCode());
        $this->assertSame(0, $u->tokens()->count());
        $this->assertTrue($this->secoursEncoreValable($u), 'le code de secours n\'est pas brûlé');
    }

    public function test_un_defi_solde_par_une_soumission_concurrente_garde_le_code_de_secours(): void
    {
        $u = $this->compte();
        // L'autre soumission tire le défi entre la lecture et le tirage de celle-ci.
        $cache = new class(new ArrayStore) extends Repository
        {
            public function pull($key, $default = null)
            {
                $this->forget($key);

                return $default;
            }
        };

        $reponse = $this->ouvreur($cache)->complete($this->defi($cache, $u), ['recovery_code' => self::SECOURS], Request::create('/', 'POST'));

        $this->assertSame(422, $reponse->getStatusCode());
        $this->assertSame(0, $u->tokens()->count());
        $this->assertTrue($this->secoursEncoreValable($u), 'le code de secours n\'est pas brûlé');
    }

    public function test_un_facteur_faux_remet_le_defi_avec_une_tentative_de_plus(): void
    {
        $u = $this->compte();
        $cache = new Repository(new ArrayStore);
        $defi = $this->defi($cache, $u, 2);

        $reponse = $this->ouvreur($cache)->complete($defi, ['two_factor_code' => '000000'], Request::create('/', 'POST'));

        $this->assertSame(401, $reponse->getStatusCode());
        $this->assertSame(3, $cache->get('oauth_2fa:'.hash('sha256', $defi))['attempts']);
    }

    public function test_la_derniere_tentative_fausse_oublie_le_defi(): void
    {
        $u = $this->compte();
        $cache = new Repository(new ArrayStore);
        $defi = $this->defi($cache, $u, 4);

        $this->ouvreur($cache)->complete($defi, ['two_factor_code' => '000000'], Request::create('/', 'POST'));

        $this->assertNull($cache->get('oauth_2fa:'.hash('sha256', $defi)));
    }
}
