<?php

namespace Tests\Feature\Auth\Session;

use App\Models\User;
use App\Providers\AppServiceProvider;
use App\Services\Auth\LoginLock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Testing\TestResponse;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse M1 — un tiers ne verrouille pas un compte indéfiniment
 * (contrainte 5 bis, ADR-0033 §6).
 *
 * L'ancien `PasswordLoginLockTest::test_un_tiers_ne_peut_pas_verrouiller_indefiniment`
 * vérifiait qu'UN échec isolé après l'échéance ne reverrouillait pas : il restait vert avec le
 * défaut. Ce test rejoue la séquence du vérificateur, LIMITEURS ACTIFS, depuis une seule IP :
 * dix codes faux sans qu'aucun code ait été demandé, puis le titulaire entre avec son mot de
 * passe ; trois cycles, chacun à l'échéance du précédent. Rouge sur `e59cb8b2` : 423 aux trois
 * cycles.
 */
class ThirdPartyLockTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221770009001';

    private FakeSmsRouter $sms;

    private User $victime;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        Cache::flush();
        $this->sms = FakeSmsRouter::install();
        $this->victime = User::factory()->create([
            'email' => 'victime@example.com',
            'password' => 'bon-mot-de-passe',
            'phone' => self::NUMERO,
            'phone_verified_at' => now(),
        ]);
    }

    public function test_un_tiers_ne_peut_pas_verrouiller_indefiniment(): void
    {
        for ($cycle = 1; $cycle <= 3; $cycle++) {
            for ($i = 0; $i < 10; $i++) {
                $this->depuis('10.0.0.1')->postJson('/api/auth/phone/verify-code', ['phone' => self::NUMERO, 'code' => '000000'])
                    ->assertStatus($i < AppServiceProvider::PHONE_VERIFY_PER_WINDOW ? 422 : 429);
            }

            $this->depuis("10.0.9.{$cycle}")->postJson('/api/auth/login', ['email' => 'victime@example.com', 'password' => 'bon-mot-de-passe'])
                ->assertOk()->assertJsonStructure(['token']);

            $this->travel(15)->minutes();
            $this->travel(1)->seconds();
        }

        $this->assertSame([], $this->sms->sent, 'aucun SMS dépensé');
    }

    public function test_un_code_faux_sans_code_en_cours_n_ecrit_rien(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);

        for ($i = 0; $i < LoginLock::MAX_FAILURES + 2; $i++) {
            $this->verifier('000000')->assertStatus(422)->assertJsonPath('code', 'phone_code_invalid');
        }

        $this->assertArrayNotHasKey('failed_login_attempts', $this->victime->fresh()->metadata ?? []);
        $this->assertFalse(app(LoginLock::class)->isNumberLocked(self::NUMERO));
    }

    /** Un verrou par canal : le numéro verrouillé ne ferme pas la porte du mot de passe. */
    public function test_le_verrou_du_numero_ne_ferme_pas_le_mot_de_passe(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->echouerParTelephone(LoginLock::MAX_FAILURES);

        $this->verifier('000000')->assertStatus(423);
        $this->postJson('/api/auth/login', ['email' => 'victime@example.com', 'password' => 'bon-mot-de-passe'])->assertOk();
    }

    /** Et réciproquement : dix mots de passe faux ne ferment pas le téléphone. */
    public function test_le_verrou_du_mot_de_passe_ne_ferme_pas_le_telephone(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        for ($i = 0; $i < LoginLock::MAX_FAILURES; $i++) {
            $this->postJson('/api/auth/login', ['email' => 'victime@example.com', 'password' => 'faux'])->assertUnauthorized();
        }
        $this->postJson('/api/auth/login', ['email' => 'victime@example.com', 'password' => 'bon-mot-de-passe'])->assertStatus(423);

        $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])->assertStatus(202);
        $this->verifier($this->sms->lastCodeFor(self::NUMERO))->assertOk()->assertJsonStructure(['token']);

        // Le canal téléphone ne solde pas le verrou du mot de passe.
        $this->postJson('/api/auth/login', ['email' => 'victime@example.com', 'password' => 'bon-mot-de-passe'])->assertStatus(423);
    }

    /** M1 (c) — deux fenêtres de limiteur contiguës restent sous le seuil du verrou. */
    public function test_le_limiteur_de_verification_reste_sous_la_moitie_du_seuil(): void
    {
        $this->assertLessThan(LoginLock::MAX_FAILURES, 2 * AppServiceProvider::PHONE_VERIFY_PER_WINDOW);
    }

    /** Avec des codes réellement demandés, limiteurs actifs, une IP : le numéro ne se verrouille pas. */
    public function test_avec_des_codes_demandes_le_tiers_ne_verrouille_pas_le_numero(): void
    {
        for ($cycle = 1; $cycle <= 3; $cycle++) {
            $this->depuis('10.0.0.1')->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])->assertStatus(202);
            for ($i = 0; $i < 10; $i++) {
                $this->depuis('10.0.0.1')->postJson('/api/auth/phone/verify-code', ['phone' => self::NUMERO, 'code' => '000000']);
            }
            $this->assertFalse(app(LoginLock::class)->isNumberLocked(self::NUMERO), "cycle {$cycle}");
            $this->depuis("10.0.9.{$cycle}")->postJson('/api/auth/login', ['email' => 'victime@example.com', 'password' => 'bon-mot-de-passe'])
                ->assertOk();

            $this->travel(7)->minutes();
            $this->travel(31)->seconds();
        }
    }

    /**
     * M1 (c) — fenêtre FIXE : neuf échecs étalés sur plus de 15 min ne s'additionnent pas. Avec
     * une échéance repoussée à chaque échec, une fenêtre glissante les cumulait sans fin.
     */
    public function test_les_echecs_du_numero_se_comptent_dans_une_fenetre_fixe(): void
    {
        $lock = app(LoginLock::class);
        for ($i = 0; $i < 5; $i++) {
            $lock->recordNumberFailure(self::NUMERO);
        }
        $this->travel(14)->minutes();
        for ($i = 0; $i < 4; $i++) {
            $lock->recordNumberFailure(self::NUMERO);
        }
        $this->travel(2)->minutes();
        for ($i = 0; $i < 5; $i++) {
            $lock->recordNumberFailure(self::NUMERO);
        }

        $this->assertFalse($lock->isNumberLocked(self::NUMERO));
    }

    public function test_le_deverrouillage_du_support_leve_aussi_le_verrou_du_numero(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->echouerParTelephone(LoginLock::MAX_FAILURES);
        $this->assertTrue(app(LoginLock::class)->isNumberLocked(self::NUMERO));

        $this->actingAsRole('super_admin');
        $this->postJson("/api/admin/users/{$this->victime->id}/unlock", ['reason' => 'Identité vérifiée par téléphone'])
            ->assertOk();

        $this->assertFalse(app(LoginLock::class)->isNumberLocked(self::NUMERO));
    }

    private function echouerParTelephone(int $fois): void
    {
        // Un code en cours à chaque fois : cinq échecs l'invalident (MAX_ATTEMPTS_PER_CODE).
        for ($i = 0; $i < $fois; $i++) {
            if ($i % 5 === 0) {
                $this->travel(61)->seconds();
                $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])->assertStatus(202);
            }
            $this->verifier('000000')->assertStatus(422);
        }
    }

    private function verifier(string $code): TestResponse
    {
        return $this->postJson('/api/auth/phone/verify-code', ['phone' => self::NUMERO, 'code' => $code]);
    }

    private function depuis(string $ip): static
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip]);
    }
}
