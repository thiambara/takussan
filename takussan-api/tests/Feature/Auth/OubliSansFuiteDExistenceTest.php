<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Notifications\ResetPasswordNotification as ResetPassword;
use Illuminate\Foundation\Http\Events\RequestHandled;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * r1 de la contre-vérification de 861535de2 (TCK-2606) — « mot de passe oublié » ne dit pas, par son
 * temps de réponse, si l'adresse a un compte. Pour une adresse connue, l'envoi du lien hache le jeton
 * et l'écrit en base : il part APRÈS la réponse. On le prouve par l'ordre, pas par une durée (une
 * durée sous charge ne prouve rien) : au moment où la réponse est rendue (`RequestHandled`, avant
 * `terminate`), aucun jeton n'est écrit ; après, le jeton existe et le lien est parti.
 */
class OubliSansFuiteDExistenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_reponse_part_avant_le_jeton_et_le_lien(): void
    {
        Notification::fake();
        $user = User::factory()->create();
        $jetonsALaReponse = null;
        $this->app['events']->listen(RequestHandled::class, function () use (&$jetonsALaReponse): void {
            $jetonsALaReponse = DB::table('password_reset_tokens')->count();
        });

        $this->postJson('/api/auth/forgot-password', ['email' => $user->email])->assertOk();

        $this->assertSame(0, $jetonsALaReponse, 'aucun jeton haché ni écrit avant la réponse');
        $this->assertSame(1, DB::table('password_reset_tokens')->where('email', $user->email)->count());
        Notification::assertSentTo($user, ResetPassword::class);
    }

    public function test_meme_statut_et_meme_corps_avec_ou_sans_compte(): void
    {
        Notification::fake();
        $user = User::factory()->create();

        $connue = $this->postJson('/api/auth/forgot-password', ['email' => $user->email]);
        $inconnue = $this->postJson('/api/auth/forgot-password', ['email' => 'personne@example.com']);

        $this->assertSame($connue->status(), $inconnue->status());
        $this->assertSame($connue->getContent(), $inconnue->getContent());
        Notification::assertSentTimes(ResetPassword::class, 1);
    }

    public function test_une_adresse_mal_formee_est_refusee_avant_la_reponse(): void
    {
        Notification::fake();

        $this->postJson('/api/auth/forgot-password', ['email' => 'pas-une-adresse'])->assertUnprocessable();

        Notification::assertNothingSent();
    }
}
