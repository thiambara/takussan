<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\User;
use App\Notifications\AccountDeletionStepUpCodeNotification;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-589 AC17 — un compte créé par téléphone n'a pas d'e-mail (ADR-0033, tableau
 * des conséquences). Une notification à `toMail()` ne lève pas, et le step-up de
 * suppression de compte part par SMS au numéro vérifié — jamais par `Mail`.
 *
 * Rouge sur `5f872f1f` : `users.email` était `NOT NULL` (le compte ne pouvait pas
 * exister) et le step-up n'avait qu'une voie, le courriel.
 */
class AccountWithoutEmailTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221770000601';

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);

        $this->user = new User;
        $this->user->forceFill([
            'first_name' => '',
            'last_name' => '',
            'email' => null,
            'phone' => self::NUMERO,
            'phone_verified_at' => now(),
            'password' => Hash::make(Str::random(40)),
            'status' => 'active',
        ])->save();
    }

    public function test_une_notification_par_courriel_ne_leve_pas(): void
    {
        Mail::fake();

        $this->user->notify(new AccountDeletionStepUpCodeNotification('123456', 5));

        Mail::assertNothingOutgoing();
    }

    public function test_le_step_up_de_suppression_part_par_sms_et_ouvre_la_demande(): void
    {
        Mail::fake();
        $sms = FakeSmsRouter::install();
        $this->actingAs($this->user, 'sanctum');

        $this->postJson('/api/auth/me/deletion-request/step-up')->assertStatus(202);

        $this->assertCount(1, $sms->sentTo(self::NUMERO));
        Mail::assertNothingOutgoing();

        $this->postJson('/api/auth/me/deletion-request', [
            'step_up_code' => $sms->lastCodeFor(self::NUMERO),
        ])->assertSuccessful();
    }

    /**
     * Passe 2 (p2-2) — le SMS de suppression partait par le routeur sans passer par le plafond
     * GLOBAL des codes (`sms.otp_daily_cap`) : une voie de plus, hors compte. Rouge sur 104589df.
     */
    public function test_plafond_global_atteint_aucun_sms_de_suppression(): void
    {
        config(['sms.otp_daily_cap' => 1]);
        $sms = FakeSmsRouter::install();
        $this->assertTrue(app(PhoneVerificationService::class)->sendCodeTo('login', '+221770000602'));
        $this->actingAs($this->user, 'sanctum');

        // Réponse invariante : rien ne dit au porteur du jeton que le plafond est atteint.
        $this->postJson('/api/auth/me/deletion-request/step-up')->assertStatus(202);

        $this->assertSame([], $sms->sentTo(self::NUMERO));
    }

    public function test_le_sms_de_suppression_compte_dans_le_meme_plafond(): void
    {
        config(['sms.otp_daily_cap' => 1]);
        $sms = FakeSmsRouter::install();
        $this->actingAs($this->user, 'sanctum');

        $this->postJson('/api/auth/me/deletion-request/step-up')->assertStatus(202);
        $this->assertCount(1, $sms->sentTo(self::NUMERO));

        $this->assertFalse(app(PhoneVerificationService::class)->sendCodeTo('login', '+221770000602'));
        $this->assertSame([], $sms->sentTo('+221770000602'));
    }

    public function test_un_indicatif_hors_liste_ne_recoit_pas_de_sms_de_suppression(): void
    {
        $sms = FakeSmsRouter::install();
        $this->user->forceFill(['phone' => '+33612345678'])->save();
        $this->actingAs($this->user, 'sanctum');

        $this->postJson('/api/auth/me/deletion-request/step-up')->assertStatus(202);

        $this->assertSame([], $sms->sentTo('+33612345678'));
    }
}
