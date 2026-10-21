<?php

namespace Tests\Feature\Notifications;

use App\Http\Controllers\NotificationUnsubscribeController;
use App\Mail\NotificationDigestMail;
use App\Models\AppNotification;
use App\Models\Enums\EmailFrequency;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\User;
use App\Support\RelativeSignedUrl;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * P97.06 (TCK-1183) — le désabonnement du résumé suit le modèle des alertes de recherche
 * (ADR-0050) : le lien du courriel ouvre une page du front à un bouton, qui appelle un `POST`
 * signé à échéance ; le client de messagerie l'appelle seul par `List-Unsubscribe-Post`.
 *
 * Avant : `GET notifications/unsubscribe/{user}`, signé sans échéance, coupait le résumé dès
 * l'ouverture du lien — un analyseur de liens qui ouvre l'URL avant le destinataire suffisait.
 */
class DigestUnsubscribeTest extends TestCase
{
    use RefreshDatabase;

    private const FRONT = 'https://front.exemple.test';

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.frontend_url' => self::FRONT.'/']);
    }

    private function abonne(array $attributs = []): User
    {
        return User::factory()->create($attributs + [
            'email' => 'resume@example.com',
            'email_frequency' => EmailFrequency::Daily,
        ]);
    }

    public function test_un_get_du_lien_deja_envoye_n_ecrit_rien_et_mene_a_la_page_de_confirmation(): void
    {
        $user = $this->abonne(['preferred_language' => 'en']);
        // Les liens partis avant TCK-1183 : signés sans échéance, sur la route web.
        $ancien = RelativeSignedUrl::forever('notifications.unsubscribe', ['user' => $user->id]);

        $reponse = $this->get($ancien);

        $reponse->assertRedirect();
        $cible = (string) $reponse->headers->get('Location');
        $this->assertStringStartsWith(self::FRONT.'/en/notifications/unsubscribe?user='.$user->id.'&expires=', $cible);
        $this->assertStringContainsString('&signature=', $cible);
        $this->assertSame(EmailFrequency::Daily, $user->fresh()->email_frequency);
    }

    public function test_un_get_sans_signature_ne_rend_aucun_lien(): void
    {
        $user = $this->abonne();

        $this->get('/notifications/unsubscribe/'.$user->id)->assertForbidden();
    }

    public function test_le_lien_du_courriel_vise_la_page_du_front_dans_la_langue_du_compte(): void
    {
        $user = $this->abonne(['preferred_language' => 'wo']);

        $liens = NotificationUnsubscribeController::links($user);

        $this->assertStringStartsWith(self::FRONT.'/wo/notifications/unsubscribe?user='.$user->id.'&expires=', $liens['page']);
        $this->assertStringContainsString('/api/notifications/digest/unsubscribe/'.$user->id.'?expires=', $liens['one_click']);
    }

    public function test_le_post_signe_coupe_le_resume(): void
    {
        $user = $this->abonne();

        $this->post(NotificationUnsubscribeController::links($user)['one_click'])
            ->assertOk()
            ->assertJsonPath('data.email_frequency', 'off');

        $this->assertSame(EmailFrequency::Off, $user->fresh()->email_frequency);
    }

    public function test_un_get_du_lien_du_post_n_ecrit_rien(): void
    {
        $user = $this->abonne();

        $this->get(NotificationUnsubscribeController::links($user)['one_click'])->assertStatus(405);

        $this->assertSame(EmailFrequency::Daily, $user->fresh()->email_frequency);
    }

    public function test_le_post_sans_signature_ou_echu_est_refuse(): void
    {
        $user = $this->abonne();
        $lien = NotificationUnsubscribeController::links($user)['one_click'];

        $this->post('/api/notifications/digest/unsubscribe/'.$user->id)->assertForbidden();

        $this->travel(NotificationUnsubscribeController::LINK_DAYS + 1)->days();
        $this->post($lien)->assertForbidden();

        $this->assertSame(EmailFrequency::Daily, $user->fresh()->email_frequency);
    }

    public function test_le_resume_annonce_le_desabonnement_en_un_clic_et_lie_la_page(): void
    {
        $user = $this->abonne(['preferred_language' => 'fr']);
        $notification = AppNotification::query()->create([
            'user_id' => $user->id,
            'type' => NotificationType::System->value,
            'delivery_channel' => NotificationChannel::App->value,
            'title' => 'Une notification',
            'body' => 'Corps',
            'is_read' => false,
        ]);

        $mail = new NotificationDigestMail($user, collect(['system' => collect([$notification])]));

        $entetes = $mail->headers()->text;
        $this->assertSame('List-Unsubscribe=One-Click', $entetes['List-Unsubscribe-Post'] ?? null);
        $this->assertMatchesRegularExpression(
            '#^<https?://[^>]+/api/notifications/digest/unsubscribe/'.$user->id.'\?expires=\d+&signature=[0-9a-f]{64}>$#',
            $entetes['List-Unsubscribe'] ?? '',
        );
        $this->assertStringContainsString(
            e(self::FRONT.'/fr/notifications/unsubscribe?user='.$user->id.'&expires='),
            $mail->render(),
        );
    }
}
