<?php

namespace Tests\Feature\Api\Admin;

use App\Models\User;
use App\Notifications\AgencyAdminActivationNotification;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-781 (P15.07, P13.09) — le gérant provisionné reçoit un e-mail « Activez votre compte »,
 * valable 7 jours (TCK-209), et non le gabarit de réinitialisation à 60 minutes ; son lien porte
 * `activation=1`, que la page de réinitialisation suit vers `/onboarding/agency-admin`.
 */
class AgencyAdminActivationTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_provisionnement_envoie_l_e_mail_d_activation_et_non_la_reinitialisation(): void
    {
        Notification::fake();
        config(['app.frontend_url' => 'http://localhost:3000']);
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/agencies', $this->payload())->assertCreated();

        $admin = User::query()->where('email', 'gerant@sunu.test')->firstOrFail();
        Notification::assertNotSentTo($admin, ResetPasswordNotification::class);
        Notification::assertSentTo($admin, AgencyAdminActivationNotification::class, function (AgencyAdminActivationNotification $n) use ($admin): bool {
            app()->setLocale('fr');
            $mail = $n->toMail($admin);
            $this->assertStringContainsString('Activez votre compte', $mail->subject);
            $this->assertStringContainsString('&activation=1', $mail->actionUrl);
            $this->assertStringStartsWith('http://localhost:3000/auth/reset-password?token=', $mail->actionUrl);
            $this->assertContains('Ce lien d\'activation expirera dans 7 jours.', $mail->outroLines);

            return true;
        });
    }

    public function test_le_jeton_d_activation_vaut_sept_jours(): void
    {
        $admin = User::factory()->create(['password_set_at' => null]);
        $jeton = Password::broker('activations')->createToken($admin);

        $this->travel(6)->days();
        $this->reinitialiser($admin, $jeton, activation: true)->assertOk();
        $this->assertTrue($admin->refresh()->hasUsablePassword());
    }

    public function test_le_jeton_d_activation_expire_apres_sept_jours(): void
    {
        $admin = User::factory()->create(['password_set_at' => null]);
        $jeton = Password::broker('activations')->createToken($admin);

        $this->travel(7)->days();
        $this->travel(1)->minutes();
        $this->reinitialiser($admin, $jeton, activation: true)->assertUnprocessable();
    }

    public function test_un_jeton_de_reinitialisation_ne_s_allonge_pas_par_le_drapeau_d_activation(): void
    {
        $user = User::factory()->create();
        $this->assertTrue($user->hasUsablePassword());
        $jeton = Password::broker()->createToken($user);

        $this->travel(2)->hours();
        $this->reinitialiser($user, $jeton, activation: true)->assertUnprocessable();
        $this->reinitialiser($user, $jeton)->assertUnprocessable();
    }

    public function test_la_reinitialisation_ordinaire_reste_a_soixante_minutes(): void
    {
        $user = User::factory()->create(['password_set_at' => null]);
        $jeton = Password::broker()->createToken($user);

        $this->travel(2)->hours();
        $this->reinitialiser($user, $jeton)->assertUnprocessable();
    }

    private function reinitialiser(User $user, string $jeton, bool $activation = false): TestResponse
    {
        return $this->postJson('/api/auth/reset-password', array_filter([
            'token' => $jeton,
            'email' => $user->email,
            'password' => 'NouveauMotDePasse123',
            'password_confirmation' => 'NouveauMotDePasse123',
            'activation' => $activation ?: null,
        ], fn ($v) => $v !== null));
    }

    private function payload(): array
    {
        return [
            'agency' => [
                'name' => 'Sunu Gestion',
                'slug' => 'sunu-gestion',
                'type' => 'property_management',
            ],
            'admin' => [
                'first_name' => 'Awa',
                'last_name' => 'Ndiaye',
                'email' => 'gerant@sunu.test',
                'language' => 'fr',
            ],
        ];
    }
}
