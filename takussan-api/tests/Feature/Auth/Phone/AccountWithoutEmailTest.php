<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\User;
use App\Notifications\AccountDeletionStepUpCodeNotification;
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
}
