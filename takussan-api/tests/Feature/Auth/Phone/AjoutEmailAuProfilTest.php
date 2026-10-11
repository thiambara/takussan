<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\User;
use App\Notifications\RegistrationConfirmationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-632 — un compte ouvert par téléphone naît sans e-mail (TCK-589), et le profil ne lui
 * offrait aucun moyen d'en ajouter un : `PUT /auth/profile` ignorait le champ, et
 * `POST /auth/email/resend` n'avait aucun appelant.
 *
 * | test | régression attrapée |
 * |---|---|
 * | ajout | le champ ignoré en silence — 200, et toujours aucune adresse |
 * | ajout → lien | une adresse enregistrée sans lien de vérification : « non vérifiée » pour toujours |
 * | correction d'une adresse non vérifiée | une faute de frappe sans retour possible |
 * | adresse vérifiée → 403 | un jeton volé qui se donne une boîte durable (mot de passe oublié) |
 * | même adresse renvoyée | un lien renvoyé à chaque enregistrement de la bio |
 * | variante de casse prise → 422 | la règle passe, l'index casse : une 500 |
 * | renvoi sans adresse → 422 | un « lien envoyé » qui n'est parti nulle part |
 * | step-up par SMS tant que non vérifiée | le code de suppression envoyé à une adresse mal saisie |
 */
class AjoutEmailAuProfilTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221770000632';

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
        $this->actingAs($this->user, 'sanctum');
    }

    public function test_un_compte_sans_adresse_en_ajoute_une_et_recoit_le_lien(): void
    {
        Notification::fake();

        $this->putJson('/api/auth/profile', ['email' => '  Awa.Diop@Example.SN '])
            ->assertOk()
            ->assertJsonPath('email', 'awa.diop@example.sn')
            ->assertJsonPath('email_verified_at', null);

        $this->user->refresh();
        $this->assertSame('awa.diop@example.sn', $this->user->email);
        $this->assertNull($this->user->email_verified_at);
        Notification::assertSentTo($this->user, RegistrationConfirmationNotification::class);
    }

    public function test_une_adresse_jamais_verifiee_se_corrige(): void
    {
        $this->user->forceFill(['email' => 'faute@example.sn'])->save();
        Notification::fake();

        $this->putJson('/api/auth/profile', ['email' => 'juste@example.sn'])->assertOk();

        $this->assertSame('juste@example.sn', $this->user->refresh()->email);
        Notification::assertSentToTimes($this->user, RegistrationConfirmationNotification::class, 1);
    }

    public function test_une_adresse_verifiee_ne_se_remplace_pas_sur_la_seule_session(): void
    {
        $this->user->forceFill(['email' => 'awa@example.sn', 'email_verified_at' => now()])->save();
        Notification::fake();

        $this->putJson('/api/auth/profile', ['email' => 'intrus@example.sn', 'bio' => 'Nouvelle bio'])
            ->assertStatus(403)
            ->assertJsonPath('message', __('errors.email.change_requires_proof'));

        $this->user->refresh();
        $this->assertSame('awa@example.sn', $this->user->email);
        $this->assertNotNull($this->user->email_verified_at);
        $this->assertNull($this->user->bio);
        Notification::assertNothingSent();
    }

    public function test_la_meme_adresse_renvoyee_ne_renvoie_pas_de_lien(): void
    {
        $this->user->forceFill(['email' => 'awa@example.sn', 'email_verified_at' => now()])->save();
        Notification::fake();

        $this->putJson('/api/auth/profile', ['email' => 'AWA@example.sn', 'bio' => 'Bio'])->assertOk();

        $this->assertNotNull($this->user->refresh()->email_verified_at);
        Notification::assertNothingSent();
    }

    public function test_une_adresse_prise_sous_une_autre_casse_est_un_422(): void
    {
        User::factory()->create(['email' => 'prise@example.sn']);

        $this->putJson('/api/auth/profile', ['email' => 'PRISE@Example.sn'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        $this->assertNull($this->user->refresh()->email);
    }

    public function test_une_adresse_vide_ou_invalide_est_refusee(): void
    {
        $this->putJson('/api/auth/profile', ['email' => ''])->assertStatus(422)->assertJsonValidationErrors(['email']);
        $this->putJson('/api/auth/profile', ['email' => 'pas-une-adresse'])->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    public function test_le_renvoi_du_lien_sans_adresse_est_un_422(): void
    {
        Notification::fake();

        $this->postJson('/api/auth/email/resend')
            ->assertStatus(422)
            ->assertJsonPath('message', __('errors.email.missing'));

        Notification::assertNothingSent();
    }

    public function test_le_step_up_de_suppression_reste_par_sms_tant_que_l_adresse_n_est_pas_verifiee(): void
    {
        $this->user->forceFill(['email' => 'faute@example.sn'])->save();
        Mail::fake();
        $sms = FakeSmsRouter::install();

        $this->postJson('/api/auth/me/deletion-request/step-up')->assertStatus(202);

        $this->assertCount(1, $sms->sentTo(self::NUMERO));
        Mail::assertNothingOutgoing();
    }
}
