<?php

namespace Tests\Feature\Auth;

use App\Models\AccountDeletionRequest;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\User;
use App\Notifications\AccountDeletionStepUpCodeNotification;
use App\Services\Account\DeletionStepUpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use PragmaRX\Google2FA\Google2FA;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-272 — step-up alternatif pour les comptes sans mot de passe utilisable.
 *
 * Les comptes provisionnés par OAuth, par invitation acceptée sans mot de
 * passe, ou par la console plateforme, portent un hash de `Str::random()`
 * que personne ne connaît : `Hash::check` y échoue toujours et la
 * suppression de compte leur était refusée avec « Mot de passe incorrect. ».
 * Ils passent désormais par un code à 6 chiffres envoyé par e-mail.
 */
class AccountDeletionStepUpTest extends TestCase
{
    use RefreshDatabase;

    /** Un compte au mot de passe machine : `password_set_at` est NULL. */
    private function machinePasswordUser(array $attributes = []): User
    {
        return User::factory()->withoutUsablePassword()->create($attributes);
    }

    public function test_me_exposes_has_usable_password_faithfully(): void
    {
        $withPassword = User::factory()->create();
        Sanctum::actingAs($withPassword);
        $this->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('has_usable_password', true);

        $withoutPassword = $this->machinePasswordUser(['google_id' => 'g-123']);
        Sanctum::actingAs($withoutPassword);
        $this->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('has_usable_password', false);
    }

    public function test_password_is_rejected_on_an_account_without_usable_password(): void
    {
        $user = $this->machinePasswordUser(['google_id' => 'g-123', 'password' => bcrypt('machine-secret')]);
        Sanctum::actingAs($user);

        // Even the *correct* machine password must not open the door — the
        // server decides the mode, not the payload.
        $this->postJson('/api/auth/me/deletion-request', [
            'password' => 'machine-secret',
            'reason_code' => 'privacy',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['password'])
            ->assertJsonPath('errors.password.0', __('account.deletion.errors.password_not_applicable'));

        $this->assertSame(0, AccountDeletionRequest::query()->count());
    }

    public function test_step_up_code_endpoint_sends_a_code_and_answers_202(): void
    {
        Notification::fake();

        $user = $this->machinePasswordUser(['google_id' => 'g-123']);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/me/deletion-request/step-up')
            ->assertStatus(202)
            ->assertJsonPath('message', __('account.deletion.step_up.code_sent'));

        Notification::assertSentTo($user, AccountDeletionStepUpCodeNotification::class);
    }

    public function test_step_up_code_endpoint_is_refused_when_the_account_has_a_usable_password(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/me/deletion-request/step-up')
            ->assertStatus(422)
            ->assertJsonPath('message', __('account.deletion.errors.step_up_not_applicable'));

        Notification::assertNothingSent();
    }

    public function test_deletion_succeeds_with_a_valid_step_up_code(): void
    {
        Notification::fake();

        $user = $this->machinePasswordUser(['google_id' => 'g-123']);
        Sanctum::actingAs($user);

        $code = app(DeletionStepUpService::class)->sendCode($user);
        $this->assertNotNull($code);

        $this->postJson('/api/auth/me/deletion-request', [
            'step_up_code' => $code,
            'reason_code' => 'privacy',
        ])->assertStatus(202)
            ->assertJsonStructure(['data' => ['id', 'requested_at', 'scheduled_for', 'days_remaining']]);

        $this->assertNotNull($user->fresh()->deletion_requested_at);
    }

    public function test_step_up_code_is_single_use(): void
    {
        Notification::fake();

        $user = $this->machinePasswordUser(['google_id' => 'g-123']);
        Sanctum::actingAs($user);

        $code = app(DeletionStepUpService::class)->sendCode($user);

        $this->postJson('/api/auth/me/deletion-request', [
            'step_up_code' => $code,
            'reason_code' => 'privacy',
        ])->assertStatus(202);

        // Replay the very same code — must be refused.
        $this->postJson('/api/auth/me/deletion-request', [
            'step_up_code' => $code,
            'reason_code' => 'privacy',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['step_up_code']);
    }

    public function test_expired_step_up_code_is_refused(): void
    {
        Notification::fake();

        $user = $this->machinePasswordUser(['google_id' => 'g-123']);
        Sanctum::actingAs($user);

        $code = app(DeletionStepUpService::class)->sendCode($user);

        $this->travel(DeletionStepUpService::CODE_TTL_SECONDS + 5)->seconds();

        $this->postJson('/api/auth/me/deletion-request', [
            'step_up_code' => $code,
            'reason_code' => 'privacy',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['step_up_code']);

        $this->travelBack();
    }

    public function test_missing_step_up_code_is_refused(): void
    {
        $user = $this->machinePasswordUser(['google_id' => 'g-123']);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/me/deletion-request', [
            'reason_code' => 'privacy',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['step_up_code']);
    }

    /**
     * La devinette — l'attaque la plus évidente sur un code à 6 chiffres, et la seule
     * que cette classe ne couvrait pas.
     *
     * Les autres cas (expiré, rejeu, absent) laissaient passer une régression précise :
     * une `verifyCode()` qui vérifie qu'un code A ÉTÉ ÉMIS et qu'il a le bon format, sans
     * jamais comparer sa VALEUR, traversait les 15 tests au vert. Mesuré par ablation le
     * 2026-08-15. Le code livré est juste (`hash_equals`) et le débit est borné par
     * `throttle:5,10` — ce test ne corrige donc rien : il empêche que la ligne la plus
     * sensible du ticket se casse sans que personne ne le voie.
     */
    public function test_wrong_step_up_code_is_refused_while_a_valid_one_is_pending(): void
    {
        Notification::fake();

        $user = $this->machinePasswordUser(['google_id' => 'g-123']);
        Sanctum::actingAs($user);

        $code = app(DeletionStepUpService::class)->sendCode($user);
        $wrong = str_pad((string) ((((int) $code) + 1) % 1000000), 6, '0', STR_PAD_LEFT);
        $this->assertNotSame($code, $wrong);

        $this->postJson('/api/auth/me/deletion-request', [
            'step_up_code' => $wrong,
            'reason_code' => 'privacy',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['step_up_code']);

        $this->assertDatabaseCount('account_deletion_requests', 0);

        // Et l'échec ne doit pas avoir brûlé le bon code : la personne se trompe, elle ne
        // se punit pas.
        $this->postJson('/api/auth/me/deletion-request', [
            'step_up_code' => $code,
            'reason_code' => 'privacy',
        ])->assertStatus(202);
    }

    public function test_two_factor_stays_mandatory_on_the_alternative_path(): void
    {
        Notification::fake();

        $secret = (new Google2FA)->generateSecretKey();
        $user = $this->machinePasswordUser([
            'google_id' => 'g-123',
            'two_factor_enabled' => true,
            'two_factor_secret' => $secret,
        ]);
        Sanctum::actingAs($user);

        $code = app(DeletionStepUpService::class)->sendCode($user);

        // Valid e-mail code but no TOTP → refused.
        $this->postJson('/api/auth/me/deletion-request', [
            'step_up_code' => $code,
            'reason_code' => 'privacy',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['two_factor_code']);

        // The e-mail code must NOT have been burnt by the 2FA failure.
        $this->postJson('/api/auth/me/deletion-request', [
            'step_up_code' => $code,
            'reason_code' => 'privacy',
            'two_factor_code' => (new Google2FA)->getCurrentOtp($secret),
        ])->assertStatus(202);
    }

    public function test_step_up_code_is_not_burnt_when_obligations_block_the_deletion(): void
    {
        Notification::fake();

        $user = $this->machinePasswordUser(['google_id' => 'g-123']);
        $lease = Lease::factory()->create(['landlord_id' => $user->id, 'status' => LeaseStatus::Active]);
        Sanctum::actingAs($user);

        $code = app(DeletionStepUpService::class)->sendCode($user);

        $this->postJson('/api/auth/me/deletion-request', [
            'step_up_code' => $code,
            'reason_code' => 'privacy',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['obligations']);

        // Terminate the obligation, then reuse the same (unconsumed) code.
        $lease->forceFill(['status' => LeaseStatus::Terminated->value])->save();

        $this->postJson('/api/auth/me/deletion-request', [
            'step_up_code' => $code,
            'reason_code' => 'privacy',
        ])->assertStatus(202);
    }

    /**
     * Le pendant du test ci-dessus pour l'échec qui survient AVANT le bloc
     * `after()` — et non dedans.
     *
     * `Validator::passes()` déroule les règles PUIS appelle inconditionnellement
     * tous les `after()`. Un `reason` trop long échoue donc en 422 pendant que le
     * bloc de step-up s'exécute quand même : sans la garde
     * `$validator->errors()->isNotEmpty()`, le code à usage unique était vérifié
     * ET consommé sur une requête qui ne supprimait rien. Le second appel
     * ci-dessous, avec le MÊME code, est ce qui le prouve — il rendait 422
     * `step_up_code` avant le correctif.
     */
    public function test_step_up_code_is_not_burnt_when_the_payload_fails_base_validation(): void
    {
        Notification::fake();

        $user = $this->machinePasswordUser(['google_id' => 'g-124']);
        Sanctum::actingAs($user);

        $code = app(DeletionStepUpService::class)->sendCode($user);

        $this->postJson('/api/auth/me/deletion-request', [
            'step_up_code' => $code,
            'reason_code' => 'privacy',
            'reason' => str_repeat('a', 2001),
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['reason']);

        $this->postJson('/api/auth/me/deletion-request', [
            'step_up_code' => $code,
            'reason_code' => 'privacy',
        ])->assertStatus(202);
    }

    public function test_mixed_account_keeps_the_password_path(): void
    {
        Notification::fake();

        // Provisioned by OAuth, then went through "forgot password" — the
        // reset stamps `password_set_at`, so the password path stays.
        $user = User::factory()->create([
            'google_id' => 'g-123',
            'password' => bcrypt('chosen-by-me'),
        ]);
        Sanctum::actingAs($user);

        $this->assertTrue($user->hasUsablePassword());

        $this->postJson('/api/auth/me/deletion-request', [
            'password' => 'chosen-by-me',
            'reason_code' => 'privacy',
        ])->assertStatus(202);
    }

    public function test_activity_log_records_the_step_up_mode(): void
    {
        Notification::fake();

        $user = $this->machinePasswordUser(['google_id' => 'g-123']);
        Sanctum::actingAs($user);

        $code = app(DeletionStepUpService::class)->sendCode($user);

        $this->postJson('/api/auth/me/deletion-request', [
            'step_up_code' => $code,
            'reason_code' => 'privacy',
        ])->assertStatus(202);

        $log = Activity::query()->where('event', 'account.deletion.requested')->first();
        $this->assertNotNull($log);
        $this->assertSame('email_code', $log->properties['step_up'] ?? null);
    }

    public function test_registration_stamps_password_set_at(): void
    {
        $this->postJson('/api/auth/register', [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'email' => 'awa.diop@example.test',
            'password' => 'Str0ng-P@ssword!',
            'password_confirmation' => 'Str0ng-P@ssword!',
        ])->assertStatus(201);

        $user = User::query()->where('email', 'awa.diop@example.test')->firstOrFail();
        $this->assertTrue($user->hasUsablePassword());
    }

    public function test_password_reset_moves_a_machine_password_account_back_to_the_password_path(): void
    {
        $user = $this->machinePasswordUser(['google_id' => 'g-123']);
        $this->assertFalse($user->hasUsablePassword());

        $token = app('auth.password.broker')->createToken($user);

        $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $user->email,
            'password' => 'Str0ng-P@ssword!',
            'password_confirmation' => 'Str0ng-P@ssword!',
        ])->assertOk();

        $this->assertTrue($user->fresh()->hasUsablePassword());
    }

    public function test_activity_log_records_the_password_mode_on_the_historical_path(): void
    {
        Notification::fake();

        $user = User::factory()->create(['password' => bcrypt('correct-horse')]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/me/deletion-request', [
            'password' => 'correct-horse',
            'reason_code' => 'privacy',
        ])->assertStatus(202);

        $log = Activity::query()->where('event', 'account.deletion.requested')->first();
        $this->assertSame('password', $log->properties['step_up'] ?? null);
    }
}
