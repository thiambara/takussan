<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\User;
use App\Services\Auth\OtpPreview;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-620 (ADR-0060) — hors production, drapeau allumé, le code envoyé par SMS revient dans la
 * réponse (`otp_preview`), et c'est CE code qui vérifie. Les deux verrous se testent séparément :
 * drapeau éteint, et drapeau allumé en `production` — chacun doit suffire à fermer l'aperçu.
 *
 * La signature de bail est couverte dans `LeaseSignatureTest` (sa fixture y vit).
 */
class OtpPreviewTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221770000620';

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true, 'auth.otp_preview.enabled' => true]);
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->sms = FakeSmsRouter::install();
    }

    // ─── Les deux verrous ────────────────────────────────────────────────────────────────────

    public function test_drapeau_eteint_aucun_code_dans_la_reponse(): void
    {
        config(['auth.otp_preview.enabled' => false]);

        $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])
            ->assertStatus(202)
            ->assertJsonMissingPath('otp_preview');
        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));
    }

    public function test_drapeau_allume_en_production_aucun_code_dans_la_reponse(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        $this->assertFalse(OtpPreview::enabled());

        $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])
            ->assertStatus(202)
            ->assertJsonMissingPath('otp_preview');
    }

    public function test_la_preproduction_est_dans_la_liste_d_autorisation(): void
    {
        $this->app->detectEnvironment(fn () => 'staging');

        $this->assertTrue(OtpPreview::enabled());
    }

    // ─── Les émetteurs ───────────────────────────────────────────────────────────────────────

    public function test_connexion_par_telephone_le_code_rendu_ouvre_la_session(): void
    {
        $code = $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])
            ->assertStatus(202)
            ->assertJsonPath('data.retry_after', 60)
            ->json('otp_preview');

        // Le SMS part quand même, et porte le même code.
        $this->assertSame($this->sms->lastCodeFor(self::NUMERO), $code);

        $this->postJson('/api/auth/phone/verify-code', ['phone' => self::NUMERO, 'code' => $code])
            ->assertOk()
            ->assertJsonPath('is_new_account', true)
            ->assertJsonMissingPath('otp_preview');
    }

    public function test_aucun_code_emis_aucun_code_rendu(): void
    {
        $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])->assertJsonStructure(['otp_preview']);

        // Délai de renvoi : rien n'est émis, la réponse reste 202 — sans code.
        $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])
            ->assertStatus(202)
            ->assertJsonMissingPath('otp_preview');
    }

    public function test_verification_du_numero_du_profil_et_des_onboardings(): void
    {
        $user = User::factory()->create(['phone' => null, 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $code = $this->postJson('/api/auth/phone/send-otp', ['phone' => self::NUMERO])
            ->assertOk()
            ->assertJsonPath('data.sent', true)
            ->json('otp_preview');
        $this->assertSame($this->sms->lastCodeFor(self::NUMERO), $code);

        $this->postJson('/api/auth/phone/verify-otp', ['code' => $code])->assertOk();
        $this->assertNotNull($user->fresh()->phone_verified_at);
    }

    public function test_preuve_par_l_ancien_numero(): void
    {
        $user = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);
        Sanctum::actingAs($user);

        $code = $this->postJson('/api/auth/phone/change-code')->assertOk()->json('otp_preview');

        $this->assertSame($this->sms->lastCodeFor(self::NUMERO), $code);
    }

    public function test_suppression_d_un_compte_sans_e_mail_le_code_sms_est_rendu(): void
    {
        Mail::fake();
        $user = new User;
        $user->forceFill([
            'first_name' => '',
            'last_name' => '',
            'email' => null,
            'phone' => self::NUMERO,
            'phone_verified_at' => now(),
            'password' => Hash::make(Str::random(40)),
            'status' => 'active',
        ])->save();
        $this->actingAs($user, 'sanctum');

        $code = $this->postJson('/api/auth/me/deletion-request/step-up')->assertStatus(202)->json('otp_preview');

        $this->assertSame($this->sms->lastCodeFor(self::NUMERO), $code);
        $this->postJson('/api/auth/me/deletion-request', ['step_up_code' => $code])->assertSuccessful();
    }

    public function test_un_code_parti_par_e_mail_ne_revient_pas(): void
    {
        Mail::fake();
        $user = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);
        $user->forceFill(['password' => Hash::make(Str::random(40)), 'password_set_at' => null])->save();
        $this->actingAs($user, 'sanctum');

        $this->postJson('/api/auth/me/deletion-request/step-up')
            ->assertStatus(202)
            ->assertJsonMissingPath('otp_preview');
        $this->assertSame([], $this->sms->sentTo(self::NUMERO));
    }
}
