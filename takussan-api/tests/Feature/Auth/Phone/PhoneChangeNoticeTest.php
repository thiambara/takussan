<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\AppNotification;
use App\Models\User;
use App\Notifications\CodedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse passe 3 (p3-1) — un numéro vérifié remplacé AVEC preuve
 * prévient l'ANCIEN numéro (SMS, contact sans compte : ce n'est plus le numéro du compte) et
 * l'e-mail s'il existe, par le code `account.phone_changed`. Sans preuve, rien n'est remplacé
 * et rien ne part.
 *
 * Rouge sur a2e2cd7d : aucun avis — le titulaire apprenait la perte de son entrée par
 * téléphone en essayant de s'en servir.
 */
class PhoneChangeNoticeTest extends TestCase
{
    use RefreshDatabase;

    private const P = '+221770009402';

    private const N = '+221770009403';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    public function test_l_ancien_numero_recoit_l_avis_par_chacun_des_trois_ecrivains(): void
    {
        // Un seul faux routeur : le canal SMS résolu garde l'instance du premier `install()`.
        $sms = FakeSmsRouter::install();
        foreach (['profil', 'me', 'send-otp'] as $i => $ecrivain) {
            $ancien = '+22177000950'.$i;
            $u = $this->compte($ancien);

            $this->remplacer($u, $ecrivain, '+22177000960'.$i, ['current_password' => 'bon-mot-de-passe'])->assertOk();

            $avis = array_values(array_filter(
                $sms->sentTo($ancien),
                fn (array $s): bool => $s['message'] === __('notifications.codes.account.phone_changed.sms', [], 'fr'),
            ));
            $this->assertCount(1, $avis, "avis à l'ancien numéro par {$ecrivain}");
            $this->assertSame(1, AppNotification::query()->where('user_id', $u->id)->where('code', 'account.phone_changed')->count());
        }
    }

    public function test_l_avis_part_aussi_par_e_mail_et_jamais_vers_le_nouveau_numero(): void
    {
        Notification::fake();
        $u = $this->compte(self::P);

        $this->remplacer($u, 'profil', self::N, ['current_password' => 'bon-mot-de-passe'])->assertOk();

        Notification::assertSentTo($u, CodedNotification::class, fn (CodedNotification $n, array $canaux): bool => in_array('mail', $canaux, true));
        Notification::assertSentOnDemand(
            CodedNotification::class,
            fn (CodedNotification $n, array $canaux, AnonymousNotifiable $a): bool => ($a->routes['sms'] ?? null) === self::P,
        );
        Notification::assertNotSentTo(
            new AnonymousNotifiable,
            CodedNotification::class,
            fn (CodedNotification $n, array $canaux, AnonymousNotifiable $a): bool => ($a->routes['sms'] ?? null) === self::N,
        );
    }

    public function test_sans_preuve_aucun_avis(): void
    {
        $sms = FakeSmsRouter::install();
        $u = $this->compte(self::P);

        $this->remplacer($u, 'profil', self::N)->assertForbidden();

        $this->assertSame([], $sms->sentTo(self::P));
        $this->assertSame(0, AppNotification::query()->where('user_id', $u->id)->count());
    }

    private function compte(string $numero): User
    {
        return User::factory()->create([
            'phone' => $numero, 'phone_verified_at' => now(),
            'password' => Hash::make('bon-mot-de-passe'), 'password_set_at' => now(),
            'preferred_language' => 'fr',
        ]);
    }

    /** @param  array<string, string>  $preuve */
    private function remplacer(User $u, string $ecrivain, string $numero, array $preuve = []): TestResponse
    {
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($u);

        return match ($ecrivain) {
            'profil' => $this->putJson('/api/auth/profile', ['phone' => $numero, 'first_name' => 'X', 'last_name' => 'Y'] + $preuve),
            'me' => $this->patchJson('/api/me', ['phone' => $numero] + $preuve),
            'send-otp' => $this->postJson('/api/auth/phone/send-otp', ['phone' => $numero] + $preuve),
        };
    }
}
