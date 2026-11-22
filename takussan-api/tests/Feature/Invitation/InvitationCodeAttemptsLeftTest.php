<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Providers\AppServiceProvider;
use App\Services\Auth\LoginLock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-2939 (ADR-0094, amendement du 2026-11-15 § 5) — un code faux dit combien d'essais il reste : `attempts_left`, le
 * plus petit des restes des trois compteurs EXISTANTS du numéro (limiteur `auth-phone-verify` à 4 par 15 min, essais du
 * code en cours à 5, verrou `LoginLock` à 10). Aucune seconde comptabilité ; la même valeur qu'un compte existe ou non ;
 * au bout, la réponse reste celle du limiteur (429) ou du verrou (423).
 *
 * Écart mesuré au ticket : AC3 attendait « 2 puis 1 » et `invitation.code_invalid`. Le compteur qui arrête l'invité en
 * premier est le limiteur (4 essais) : « 3 puis 2 », et le code d'erreur reste `phone_code_invalid`, celui que le front lit.
 */
class InvitationCodeAttemptsLeftTest extends TestCase
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

    /** AC3 — chaque code faux décompte un essai ; au bout, le 429 du limiteur, inchangé. */
    public function test_chaque_code_faux_rend_les_essais_restants_puis_le_limiteur(): void
    {
        $invitation = $this->invitation();
        $this->code($invitation)->assertStatus(202);

        $restes = [];
        for ($i = 0; $i < AppServiceProvider::PHONE_VERIFY_PER_WINDOW; $i++) {
            $restes[] = $this->verifier($invitation, ['code' => '000000'])
                ->assertStatus(422)
                ->assertJsonPath('code', 'phone_code_invalid')
                ->json('attempts_left');
        }

        $this->assertSame([3, 2, 1, 0], $restes);
        $this->verifier($invitation, ['code' => '000000'])->assertStatus(429)->assertJsonMissingPath('attempts_left');
    }

    /** Le verrou du numéro déjà entamé (par la connexion, par exemple) borne le reste ; verrouillé, la réponse reste 423. */
    public function test_le_verrou_du_numero_entame_borne_le_reste_puis_rend_423(): void
    {
        $invitation = $this->invitation();
        $this->code($invitation)->assertStatus(202);
        for ($i = 0; $i < LoginLock::MAX_FAILURES - 2; $i++) {
            app(LoginLock::class)->recordNumberFailure(self::NUMERO);
        }

        $this->verifier($invitation, ['code' => '000000'])->assertStatus(422)->assertJsonPath('attempts_left', 1);
        $this->verifier($invitation, ['code' => '000000'])->assertStatus(422)->assertJsonPath('attempts_left', 0);
        $this->verifier($invitation, ['code' => '000000'])->assertStatus(423)->assertJsonPath('code', 'account_locked')
            ->assertJsonMissingPath('attempts_left');
    }

    /** Aucune énumération : la même réponse, essais restants compris, qu'un compte porte le numéro ou non. */
    public function test_la_reponse_est_la_meme_avec_et_sans_compte(): void
    {
        $sansCompte = $this->invitation();
        $this->code($sansCompte)->assertStatus(202);
        $sans = $this->verifier($sansCompte, ['code' => '000000'])->assertStatus(422)->json();

        Cache::flush();
        User::factory()->create(['email' => null, 'phone' => self::NUMERO, 'phone_verified_at' => now()]);
        $avecCompte = $this->invitation();
        $this->code($avecCompte)->assertStatus(202);
        $avec = $this->verifier($avecCompte, ['code' => '000000'])->assertStatus(422)->json();

        $this->assertSame($sans, $avec);
        $this->assertSame(3, $avec['attempts_left']);
    }

    /** Un bon code n'en porte pas : la réponse de la connexion, inchangée. */
    public function test_un_bon_code_ne_porte_pas_d_essais_restants(): void
    {
        $invitation = $this->invitation();
        $this->code($invitation)->assertStatus(202);

        $this->verifier($invitation, ['code' => $this->sms->lastCodeFor(self::NUMERO)])
            ->assertOk()
            ->assertJsonMissingPath('attempts_left');
    }

    private function code(Invitation $invitation): TestResponse
    {
        return $this->postJson("/api/public/invitations/{$invitation->token}/code", []);
    }

    /** @param  array<string, mixed>  $corps */
    private function verifier(Invitation $invitation, array $corps): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->postJson("/api/public/invitations/{$invitation->token}/verify", $corps);
    }

    private function invitation(): Invitation
    {
        $profil = OwnerProfile::factory()->create(['agency_id' => $this->agency->id, 'status' => 'draft', 'user_id' => null]);

        return Invitation::factory()->create([
            'email' => null,
            'phone' => self::NUMERO,
            'agency_id' => $this->agency->id,
            'invitable_type' => OwnerProfile::class,
            'invitable_id' => $profil->id,
            'role' => 'owner',
        ]);
    }
}
