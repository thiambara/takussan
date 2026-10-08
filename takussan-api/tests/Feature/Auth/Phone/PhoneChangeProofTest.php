<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\User;
use App\Services\Auth\PhoneChangeGuard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse passe 3 (p3-1) — remplacer un numéro DÉJÀ VÉRIFIÉ exige une
 * preuve sur le facteur en place : un code reçu sur l'ancien numéro, le mot de passe, ou un
 * step-up TOTP de moins de 10 min. Sans preuve : 403 `phone.change_requires_proof`, rien n'est
 * écrit, rien ne part vers le nouveau numéro.
 *
 * Rouge sur bb27af99 : la séquence de la sonde (`PUT /auth/profile` → `send-otp` →
 * `verify-otp`, sur la seule session) rendait le numéro vérifié du compte au NOUVEAU numéro, et
 * le code de suppression suivant y partait.
 */
class PhoneChangeProofTest extends TestCase
{
    use RefreshDatabase;

    private const P = '+221770009302';

    private const N = '+221770009303';

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->sms = FakeSmsRouter::install();
    }

    public function test_la_sequence_de_la_sonde_est_refusee_et_p_reste_le_numero_verifie(): void
    {
        $u = $this->compteSansEmail();
        $this->en($u);

        $this->putJson('/api/auth/profile', ['phone' => self::N, 'first_name' => 'X', 'last_name' => 'Y'])
            ->assertForbidden()
            ->assertJsonPath('code', 'phone.change_requires_proof');
        $this->postJson('/api/auth/phone/send-otp', [])->assertStatus(422);
        $this->assertSame([], $this->sms->sentTo(self::N));

        $u->refresh();
        $this->assertSame(self::P, $u->phone);
        $this->assertNotNull($u->phone_verified_at);

        // Le code de suppression part toujours vers P, et vers P seul.
        Cache::flush();
        $this->postJson('/api/auth/me/deletion-request/step-up')->assertStatus(202);
        $this->assertCount(1, $this->suppression(self::P));
        $this->assertSame([], $this->suppression(self::N));
    }

    public function test_les_trois_ecrivains_refusent_sans_preuve(): void
    {
        $u = $this->compteSansEmail();
        $this->en($u);

        $this->postJson('/api/auth/phone/send-otp', ['phone' => self::N])
            ->assertForbidden()->assertJsonPath('code', 'phone.change_requires_proof');
        $this->patchJson('/api/me', ['phone' => self::N])
            ->assertForbidden()->assertJsonPath('code', 'phone.change_requires_proof');
        // Retirer le numéro vérifié, c'est aussi le remplacer.
        $this->putJson('/api/auth/profile', ['phone' => '', 'first_name' => 'X', 'last_name' => 'Y'])
            ->assertForbidden();

        $this->assertSame([], $this->sms->sentTo(self::N));
        $this->assertSame(self::P, $u->fresh()->phone);
        $this->assertNotNull($u->fresh()->phone_verified_at);
    }

    public function test_le_code_recu_sur_l_ancien_numero_vaut_preuve(): void
    {
        $u = $this->compteSansEmail();
        $this->en($u);

        $this->postJson('/api/auth/phone/change-code')->assertOk()->assertExactJson(['data' => ['sent' => true]]);
        $this->assertCount(1, $this->sms->sentTo(self::P));
        $this->assertSame([], $this->sms->sentTo(self::N));

        $this->putJson('/api/auth/profile', [
            'phone' => self::N, 'first_name' => 'X', 'last_name' => 'Y', 'phone_change_code' => '000000',
        ])->assertForbidden();

        $this->putJson('/api/auth/profile', [
            'phone' => self::N, 'first_name' => 'X', 'last_name' => 'Y',
            'phone_change_code' => $this->sms->lastCodeFor(self::P),
        ])->assertOk();

        $u->refresh();
        $this->assertSame(self::N, $u->phone);
        $this->assertNull($u->phone_verified_at);
    }

    public function test_le_code_ne_sert_qu_une_fois(): void
    {
        $u = $this->compteSansEmail();
        $this->en($u);
        $this->postJson('/api/auth/phone/change-code')->assertOk();
        $code = $this->sms->lastCodeFor(self::P);

        $this->postJson('/api/auth/phone/send-otp', ['phone' => self::N, 'phone_change_code' => $code])->assertOk();
        $this->assertCount(1, $this->sms->sentTo(self::N));

        // Le compte n'a plus de numéro vérifié : le code consommé ne rouvre rien d'autre.
        $this->assertFalse(app(PhoneChangeGuard::class)->replacesVerified($u->fresh(), '+221770009304'));
    }

    public function test_le_mot_de_passe_vaut_preuve_et_ses_echecs_sont_bornes(): void
    {
        $u = $this->compteAvecMotDePasse();
        $this->en($u);

        for ($i = 0; $i < PhoneChangeGuard::MAX_PASSWORD_FAILURES; $i++) {
            $this->patchJson('/api/me', ['phone' => self::N, 'current_password' => 'mauvais'])->assertForbidden();
        }
        // La borne atteinte, même le bon mot de passe ne prouve plus rien.
        $this->patchJson('/api/me', ['phone' => self::N, 'current_password' => 'bon-mot-de-passe'])->assertForbidden();
        $this->assertSame(self::P, $u->fresh()->phone);

        $this->travel(PhoneChangeGuard::PASSWORD_WINDOW_MINUTES + 1)->minutes();
        $this->patchJson('/api/me', ['phone' => self::N, 'current_password' => 'bon-mot-de-passe'])->assertOk();
        $this->assertSame(self::N, $u->fresh()->phone);
        $this->assertNull($u->fresh()->phone_verified_at);
    }

    public function test_un_step_up_totp_recent_vaut_preuve_un_ancien_non(): void
    {
        $u = $this->compteAvecMotDePasse();
        $token = $this->actingAsWithStepUp($u);

        $this->travel(11)->minutes();
        $this->putJson('/api/auth/profile', ['phone' => self::N, 'first_name' => 'X', 'last_name' => 'Y'])
            ->assertForbidden();

        $token->forceFill(['two_factor_verified_at' => now()])->save();
        $this->putJson('/api/auth/profile', ['phone' => self::N, 'first_name' => 'X', 'last_name' => 'Y'])
            ->assertOk();
        $this->assertSame(self::N, $u->fresh()->phone);
    }

    public function test_un_compte_sans_numero_verifie_n_est_pas_concerne(): void
    {
        $u = User::factory()->create(['phone' => self::P, 'phone_verified_at' => null]);
        $this->en($u);

        $this->putJson('/api/auth/profile', ['phone' => self::N, 'first_name' => 'X', 'last_name' => 'Y'])->assertOk();
        $this->postJson('/api/auth/phone/send-otp', ['phone' => '+221770009305'])->assertOk();
    }

    public function test_renvoyer_le_meme_numero_ne_demande_rien(): void
    {
        $u = $this->compteSansEmail();
        $this->en($u);

        $this->putJson('/api/auth/profile', ['phone' => self::P, 'first_name' => 'X', 'last_name' => 'Y', 'bio' => 'b'])
            ->assertOk();
        $this->assertNotNull($u->fresh()->phone_verified_at);
    }

    private function compteSansEmail(): User
    {
        $u = new User;
        $u->forceFill([
            'first_name' => '', 'last_name' => '', 'email' => null,
            'phone' => self::P, 'phone_verified_at' => now(),
            'password' => Hash::make('aleatoire-'.random_int(0, PHP_INT_MAX)),
            'password_set_at' => null, 'status' => 'active',
        ])->save();

        return $u;
    }

    private function compteAvecMotDePasse(): User
    {
        return User::factory()->create([
            'phone' => self::P, 'phone_verified_at' => now(),
            'password' => Hash::make('bon-mot-de-passe'), 'password_set_at' => now(),
        ]);
    }

    private function en(User $u): void
    {
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($u);
    }

    /** @return list<array<string, mixed>> */
    private function suppression(string $numero): array
    {
        return array_values(array_filter(
            $this->sms->sentTo($numero),
            fn (array $s): bool => ($s['context']['event_type'] ?? '') === 'account_deletion_step_up',
        ));
    }
}
