<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Notifications\ResetPasswordNotification as ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AuthPasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_forgot_password_sends_reset_email(): void
    {
        Notification::fake();

        $user = User::factory()->create();

        $response = $this->postJson('/api/auth/forgot-password', [
            'email' => $user->email,
        ]);

        $response->assertStatus(200);
        Notification::assertSentTo($user, ResetPassword::class);
    }

    public function test_reset_password_email_points_to_frontend_route(): void
    {
        config(['app.frontend_url' => 'http://localhost:3000']);

        $user = User::factory()->create();
        $notification = new ResetPassword('fake-token');
        $actionUrl = $notification->toMail($user)->actionUrl;

        $this->assertSame(
            'http://localhost:3000/auth/reset-password?token=fake-token&email='.urlencode($user->email),
            $actionUrl
        );
    }

    public function test_forgot_password_returns_200_for_unknown_email(): void
    {
        $response = $this->postJson('/api/auth/forgot-password', [
            'email' => 'unknown@example.com',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('message', __('messages.password_reset_link_sent'));
    }

    public function test_user_can_reset_password_with_valid_token(): void
    {
        Notification::fake();

        $user = User::factory()->create();

        // Request a reset link to get a valid token
        $this->postJson('/api/auth/forgot-password', ['email' => $user->email]);

        // Extract the token from the notification
        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function ($notification) use (&$token) {
            $token = $notification->token;

            return true;
        });

        $response = $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $user->email,
            'password' => 'newpassword123',
            'password_confirmation' => 'newpassword123',
        ]);

        $response->assertStatus(200);
        $this->assertTrue(Hash::check('newpassword123', $user->fresh()->password));
    }

    public function test_reset_password_fails_with_invalid_token(): void
    {
        $user = User::factory()->create();

        $response = $this->postJson('/api/auth/reset-password', [
            'token' => 'invalid-token',
            'email' => $user->email,
            'password' => 'newpassword123',
            'password_confirmation' => 'newpassword123',
        ]);

        $response->assertStatus(422);
    }

    public function test_reset_password_revokes_all_tokens(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $user->createToken('existing_token');

        $this->postJson('/api/auth/forgot-password', ['email' => $user->email]);

        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function ($notification) use (&$token) {
            $token = $notification->token;

            return true;
        });

        $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $user->email,
            'password' => 'newpassword123',
            'password_confirmation' => 'newpassword123',
        ]);

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    /**
     * TCK-2026 (P192.01) — un lien faux ou expiré rend un code stable, et son texte suit la langue
     * négociée : jamais la phrase anglaise du cadriciel (`passwords.token`), que le front affichait.
     */
    public function test_un_jeton_faux_rend_un_code_et_un_texte_dans_la_langue_de_la_requete(): void
    {
        $user = User::factory()->create();

        foreach (['fr', 'en', 'wo'] as $locale) {
            $response = $this->postJson('/api/auth/reset-password', [
                'token' => 'invalid-token',
                'email' => $user->email,
                'password' => 'newpassword123',
                'password_confirmation' => 'newpassword123',
            ], ['Accept-Language' => $locale]);

            $response->assertStatus(422)
                ->assertJsonPath('code', 'password_reset.invalid_link')
                ->assertJsonPath('message', __('errors.password_reset.invalid_link', [], $locale));
            $this->assertNotSame('This password reset token is invalid.', $response->json('message'), $locale);
        }

        $this->assertNotSame(
            __('errors.password_reset.invalid_link', [], 'en'),
            $this->postJson('/api/auth/reset-password', [
                'token' => 'invalid-token',
                'email' => $user->email,
                'password' => 'newpassword123',
                'password_confirmation' => 'newpassword123',
            ], ['Accept-Language' => 'fr'])->json('message'),
        );
    }

    /**
     * TCK-2026 (P192.01) — décision du porteur : une adresse sans compte (`passwords.user`) rend
     * le même code et le même texte qu'un jeton faux ; la réponse ne dit pas si le compte existe.
     */
    public function test_une_adresse_sans_compte_repond_comme_un_jeton_faux(): void
    {
        $user = User::factory()->create();
        $corps = fn (string $email) => [
            'token' => 'invalid-token',
            'email' => $email,
            'password' => 'newpassword123',
            'password_confirmation' => 'newpassword123',
        ];

        $inconnue = $this->postJson('/api/auth/reset-password', $corps('personne@example.com'), ['Accept-Language' => 'fr']);
        $connue = $this->postJson('/api/auth/reset-password', $corps($user->email), ['Accept-Language' => 'fr']);

        $inconnue->assertStatus(422)->assertJsonPath('code', 'password_reset.invalid_link');
        $this->assertSame($connue->status(), $inconnue->status());
        $this->assertSame($connue->json(), $inconnue->json());
    }

    /** TCK-2026 (P192.01) — le succès se dit aussi dans la langue de la requête. */
    public function test_le_succes_se_dit_dans_la_langue_de_la_requete(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $this->postJson('/api/auth/forgot-password', ['email' => $user->email]);

        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function ($notification) use (&$token) {
            $token = $notification->token;

            return true;
        });

        $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $user->email,
            'password' => 'newpassword123',
            'password_confirmation' => 'newpassword123',
        ], ['Accept-Language' => 'fr'])
            ->assertOk()
            ->assertJsonPath('message', __('messages.password_reset_done', [], 'fr'))
            ->assertJsonMissingPath('code');
        $this->assertNotSame('Your password has been reset.', __('messages.password_reset_done', [], 'fr'));
    }
}
