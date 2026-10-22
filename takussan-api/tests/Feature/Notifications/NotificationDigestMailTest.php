<?php

namespace Tests\Feature\Notifications;

use App\Http\Controllers\NotificationUnsubscribeController;
use App\Jobs\Notifications\BuildUserDigestJob;
use App\Mail\NotificationDigestMail;
use App\Models\AppNotification;
use App\Models\Enums\EmailFrequency;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\User;
use App\Services\Notifications\DigestBuilderService;
use App\Support\RelativeSignedUrl;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\SendQueuedMailable;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class NotificationDigestMailTest extends TestCase
{
    use RefreshDatabase;

    public function test_sends_digest_mail_for_daily_user_with_unread_notifications(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'digest_send_at' => '08:00',
            'timezone' => 'Africa/Dakar',
            'email' => 'digest@example.com',
        ]);

        $this->makeNotification($user);
        $this->makeNotification($user);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        Mail::assertQueued(NotificationDigestMail::class, fn ($m) => $m->hasTo('digest@example.com'));
    }

    public function test_does_not_send_when_no_unread_notifications(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'email' => 'empty@example.com',
        ]);

        // All read — no eligible notifications
        $this->makeNotification($user, ['is_read' => true, 'read_at' => now()]);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        Mail::assertNothingOutgoing();
    }

    public function test_marks_notifications_as_digested_after_send(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'email' => 'mark@example.com',
        ]);

        $n = $this->makeNotification($user);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        $this->assertNotNull($n->fresh()->digested_at);
    }

    /**
     * P111.04 (TCK-1505) — le courriel du résumé part dans un job à part (`SendQueuedMailable`) :
     * il attend avant de réessayer, comme `CodedNotification` (TCK-800), au lieu d'épuiser les
     * trois essais du worker en quelques secondes sur une panne brève du fournisseur.
     * `digested_at` reste posé à la mise en file.
     */
    public function test_le_courriel_du_resume_mis_en_file_attend_avant_de_reessayer(): void
    {
        Queue::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'email' => 'backoff@example.com',
        ]);

        $n = $this->makeNotification($user);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        Queue::assertPushed(
            SendQueuedMailable::class,
            fn (SendQueuedMailable $job): bool => $job->mailable instanceof NotificationDigestMail
                && $job->backoff() === [60, 300, 900],
        );
        $this->assertNotNull($n->fresh()->digested_at);
    }

    public function test_does_not_resend_digested_notifications_on_retry(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'email' => 'idempotent@example.com',
        ]);

        $n = $this->makeNotification($user, ['digested_at' => now()->subHour()]);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        Mail::assertNothingOutgoing();
        // digested_at should remain the original timestamp (not overwritten).
        $this->assertTrue($n->fresh()->digested_at->lt(now()->subMinute()));
    }

    public function test_does_not_include_critical_notifications(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'email' => 'critical@example.com',
        ]);

        // Only a critical notification — should result in empty digest (no mail)
        $this->makeNotification($user, ['data' => ['is_critical' => true]]);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        Mail::assertNothingOutgoing();
    }

    public function test_digest_mail_contains_unsubscribe_url(): void
    {
        $user = User::factory()->create(['email' => 'unsub@example.com']);
        $grouped = collect(['system' => collect([$this->makeNotification($user)])]);
        $liens = NotificationUnsubscribeController::liens($user);

        $mail = new NotificationDigestMail($user, $grouped, $liens['page'], $liens['one_click']);
        $rendered = $mail->render();

        $this->assertStringContainsString(e($liens['page']), $rendered);
    }

    /**
     * P97.06 (TCK-1243) — le lien visible mène à la page du front qui confirme, sous la langue du
     * destinataire, et porte la signature à rejouer en `POST`.
     */
    public function test_le_lien_visible_mene_a_la_page_de_confirmation_du_front(): void
    {
        config(['app.frontend_url' => 'https://front.exemple.test/']);
        $user = User::factory()->create(['preferred_language' => 'en']);

        $page = NotificationUnsubscribeController::liens($user)['page'];

        $this->assertStringStartsWith('https://front.exemple.test/en/notifications/unsubscribe?user='.$user->id.'&expires=', $page);
        $this->assertStringContainsString('&signature=', $page);
    }

    /**
     * P97.06 (TCK-1243) — RFC 8058 : le client de messagerie désabonne en un clic par un `POST` sur
     * l'API, annoncé par les deux en-têtes, comme les alertes de recherche (ADR-0050).
     */
    public function test_le_resume_annonce_le_desabonnement_en_un_clic(): void
    {
        $user = User::factory()->create(['email' => 'entetes@example.com']);
        $grouped = collect(['system' => collect([$this->makeNotification($user)])]);
        $liens = NotificationUnsubscribeController::liens($user);

        $entetes = (new NotificationDigestMail($user, $grouped, $liens['page'], $liens['one_click']))->headers()->text;

        $this->assertSame('<'.$liens['one_click'].'>', $entetes['List-Unsubscribe'] ?? null);
        $this->assertSame('List-Unsubscribe=One-Click', $entetes['List-Unsubscribe-Post'] ?? null);
        $this->assertStringContainsString('/api/notifications/digest/unsubscribe/'.$user->id.'?expires=', $liens['one_click']);
    }

    public function test_le_job_envoie_les_deux_liens(): void
    {
        Mail::fake();
        $user = User::factory()->create(['email_frequency' => EmailFrequency::Daily, 'email' => 'job@example.com']);
        $this->makeNotification($user);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        Mail::assertQueued(NotificationDigestMail::class, fn (NotificationDigestMail $m) => str_contains($m->unsubscribeUrl, '/notifications/unsubscribe?user='.$user->id)
            && str_contains($m->oneClickUrl, '/api/notifications/digest/unsubscribe/'.$user->id));
    }

    /**
     * P97.06 (TCK-1243) — un analyseur de liens qui ouvre le lien d'un courriel déjà envoyé (signé
     * sans échéance) ne désabonne plus personne : le `GET` mène à la page qui confirme, sans écrire.
     */
    public function test_le_get_du_lien_deja_envoye_n_ecrit_rien_et_mene_a_la_confirmation(): void
    {
        config(['app.frontend_url' => 'https://front.exemple.test']);
        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'email' => 'unsub2@example.com',
        ]);

        $url = RelativeSignedUrl::forever('notifications.unsubscribe', ['user' => $user->id]);

        $location = $this->get($url)->assertRedirect()->headers->get('Location');

        $this->assertSame(EmailFrequency::Daily, $user->fresh()->email_frequency);
        $this->assertStringStartsWith('https://front.exemple.test/fr/notifications/unsubscribe?user='.$user->id.'&expires=', $location);
    }

    public function test_le_get_sans_signature_est_refuse(): void
    {
        $user = User::factory()->create();

        $this->get('/notifications/unsubscribe/'.$user->id)->assertForbidden();
    }

    public function test_le_post_signe_coupe_le_resume(): void
    {
        $user = User::factory()->create(['email_frequency' => EmailFrequency::Weekly]);

        $this->postJson(NotificationUnsubscribeController::liens($user)['one_click'])
            ->assertOk()
            ->assertJsonPath('data.email_frequency', 'off');

        $this->assertSame(EmailFrequency::Off, $user->fresh()->email_frequency);
    }

    public function test_le_post_signe_expire_apres_soixante_jours(): void
    {
        $user = User::factory()->create(['email_frequency' => EmailFrequency::Daily]);
        $url = NotificationUnsubscribeController::liens($user)['one_click'];

        $this->travel(NotificationUnsubscribeController::JOURS_DE_VALIDITE + 1)->days();

        $this->postJson($url)->assertForbidden();
        $this->assertSame(EmailFrequency::Daily, $user->fresh()->email_frequency);
    }

    public function test_le_post_sans_signature_ou_pour_un_autre_compte_est_refuse(): void
    {
        $user = User::factory()->create(['email_frequency' => EmailFrequency::Daily]);
        $autre = User::factory()->create(['email_frequency' => EmailFrequency::Daily]);
        $url = NotificationUnsubscribeController::liens($user)['one_click'];

        $this->postJson('/api/notifications/digest/unsubscribe/'.$user->id)->assertForbidden();
        $this->postJson(str_replace('/unsubscribe/'.$user->id.'?', '/unsubscribe/'.$autre->id.'?', $url))->assertForbidden();
        $this->assertSame(EmailFrequency::Daily, $autre->fresh()->email_frequency);
    }

    public function test_le_get_du_lien_en_un_clic_n_ecrit_rien(): void
    {
        $user = User::factory()->create(['email_frequency' => EmailFrequency::Daily]);

        $this->get(NotificationUnsubscribeController::liens($user)['one_click'])->assertStatus(405);
        $this->assertSame(EmailFrequency::Daily, $user->fresh()->email_frequency);
    }

    public function test_skips_instant_user(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Instant,
            'email' => 'instant@example.com',
        ]);

        $this->makeNotification($user);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        Mail::assertNothingOutgoing();
    }

    public function test_skips_user_with_email_notifications_disabled(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'email' => 'noemail@example.com',
            'notifications_email_enabled' => false,
        ]);

        $this->makeNotification($user);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        Mail::assertNothingOutgoing();
    }

    public function test_skips_off_user(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Off,
            'email' => 'off@example.com',
        ]);

        $this->makeNotification($user);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        Mail::assertNothingOutgoing();
    }

    private function makeNotification(User $user, array $overrides = []): AppNotification
    {
        $n = AppNotification::create(array_merge([
            'user_id' => $user->id,
            'type' => NotificationType::System->value,
            'delivery_channel' => NotificationChannel::App->value,
            'title' => 'Test notification',
            'body' => 'Content',
            'is_read' => false,
        ], array_filter($overrides, fn ($k) => ! in_array($k, ['created_at', 'updated_at']), ARRAY_FILTER_USE_KEY)));

        if (isset($overrides['created_at'])) {
            $n->forceFill(['created_at' => $overrides['created_at'], 'updated_at' => $overrides['updated_at'] ?? $overrides['created_at']])->save();
        }

        return $n;
    }
}
