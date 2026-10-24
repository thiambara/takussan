<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\AppNotification;
use App\Models\User;
use App\Services\Auth\PhoneSendQuota;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * P213.02 (TCK-2197) — `POST /api/auth/phone/send-otp` avec un numéro neuf juge le délai de renvoi
 * du compte et le quota du numéro entrant AVANT d'écrire ; l'avis du remplacement d'un numéro
 * vérifié ne part qu'après un envoi réussi. Avant : le numéro vérifié était remplacé, et l'avis
 * « numéro changé » envoyé, sur une réponse 429 sans code envoyé.
 */
class PhoneResendAvantEcritureTest extends TestCase
{
    use RefreshDatabase;

    private const ANCIEN = '+221770009701';

    private const NOUVEAU = '+221770009702';

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->sms = FakeSmsRouter::install();
    }

    private function compte(string $numero = self::ANCIEN): User
    {
        return User::factory()->create([
            'phone' => $numero, 'phone_verified_at' => now(),
            'password' => Hash::make('bon-mot-de-passe'), 'password_set_at' => now(),
            'preferred_language' => 'fr',
        ]);
    }

    private function remplacer(User $u, string $numero = self::NOUVEAU): TestResponse
    {
        Sanctum::actingAs($u);

        return $this->postJson('/api/auth/phone/send-otp', ['phone' => $numero, 'current_password' => 'bon-mot-de-passe']);
    }

    private function assertIntact(User $u): void
    {
        $frais = $u->fresh();
        $this->assertSame(self::ANCIEN, $frais->phone);
        $this->assertNotNull($frais->phone_verified_at);
        $this->assertAucunAvis($u);
    }

    private function assertAucunAvis(User $u): void
    {
        $this->assertSame(0, AppNotification::query()->where('user_id', $u->id)->where('code', 'account.phone_changed')->count());
        $this->assertSame([], $this->sms->sentTo(self::ANCIEN));
    }

    public function test_dans_le_delai_de_renvoi_rien_n_est_ecrit_ni_annonce(): void
    {
        $u = $this->compte();
        app(PhoneVerificationService::class)->holdResendCooldown($u);

        $this->remplacer($u)->assertStatus(429)->assertJsonPath('code', 'phone.resend_too_soon');

        $this->assertIntact($u);
        $this->assertSame([], $this->sms->sentTo(self::NOUVEAU));
    }

    public function test_un_numero_entrant_a_quota_epuise_n_est_pas_ecrit(): void
    {
        $u = $this->compte();
        for ($i = 0; $i < PhoneSendQuota::PER_DAY; $i++) {
            app(PhoneSendQuota::class)->hit(self::NOUVEAU);
        }

        $this->remplacer($u)->assertStatus(429)->assertJsonPath('code', 'phone.send_limit_day');

        $this->assertIntact($u);
    }

    public function test_le_plafond_global_n_annonce_pas_un_remplacement(): void
    {
        config(['sms.otp_daily_cap' => 1]);
        Sanctum::actingAs(User::factory()->create(['phone' => '+221770009799']));
        $this->postJson('/api/auth/phone/send-otp')->assertOk();
        $this->app['auth']->forgetGuards();

        $u = $this->compte();
        $this->remplacer($u)->assertStatus(503)->assertJsonPath('code', 'sms_capacity_reached');

        $this->assertAucunAvis($u);
    }

    public function test_un_envoi_reussi_ecrit_et_annonce_une_fois(): void
    {
        $u = $this->compte();

        $this->remplacer($u)->assertOk();

        $this->assertSame(self::NOUVEAU, $u->fresh()->phone);
        $this->assertNull($u->fresh()->phone_verified_at);
        $this->assertCount(1, $this->sms->sentTo(self::ANCIEN));
        $this->assertSame(1, AppNotification::query()->where('user_id', $u->id)->where('code', 'account.phone_changed')->count());
    }

    public function test_la_reponse_neutre_annonce_le_remplacement_comme_un_envoi_reel(): void
    {
        User::factory()->create(['phone' => self::NOUVEAU, 'phone_verified_at' => now()]);
        $u = $this->compte();

        $this->remplacer($u)->assertOk();

        $this->assertSame(self::NOUVEAU, $u->fresh()->phone);
        $this->assertSame(1, AppNotification::query()->where('user_id', $u->id)->where('code', 'account.phone_changed')->count());
    }
}
