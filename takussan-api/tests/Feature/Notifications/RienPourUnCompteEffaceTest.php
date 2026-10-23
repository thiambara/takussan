<?php

namespace Tests\Feature\Notifications;

use App\Jobs\Notifications\BuildUserDigestJob;
use App\Mail\NotificationDigestMail;
use App\Models\AppNotification;
use App\Models\Enums\EmailFrequency;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use App\Services\Notifications\DigestBuilderService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Events\NotificationSent;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * TCK-1752 (P166.02) — rien ne part vers un compte effacé. Le destinataire d'un avis en file est
 * relu au worker, supprimé en douceur et anonymisé entre-temps : sans garde, le courriel partait
 * vers `deleted-<id>@takussan.local`. L'écouteur `NotificationSending` refuse tout canal pour un
 * `User` `trashed()`, et le résumé par courriel sort de même.
 */
class RienPourUnCompteEffaceTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Le worker sort en 12 (`Worker::EXIT_MEMORY_LIMIT`) quand le PROCESSUS dépasse `--memory`
     * (128 Mo par défaut) : sous la suite entière avec couverture, c'est le processus de PHPUnit
     * qui les dépasse, pas le job. Le plafond se lève pour que le test juge l'avis, pas la suite.
     */
    private const MEMOIRE_SANS_PLAFOND = 1_000_000;

    public function test_un_avis_en_file_pour_un_compte_efface_avant_le_worker_ne_part_pas(): void
    {
        config()->set('queue.default', 'database');
        $envois = [];
        Event::listen(NotificationSent::class, function (NotificationSent $e) use (&$envois) {
            $envois[] = $e->channel;
        });

        $user = User::factory()->create(['email' => 'alice@example.com']);
        $user->notify(new AvisEnFilePourEssai);
        $this->assertSame(1, DB::table('jobs')->count(), 'l’avis est en file');

        app(AccountDeletionService::class)->anonymize($user, notifier: false);
        $this->assertTrue(User::withTrashed()->find($user->id)->trashed(), 'le compte est effacé');

        $this->artisan('queue:work', ['connection' => 'database', '--stop-when-empty' => true, '--memory' => self::MEMOIRE_SANS_PLAFOND])->assertSuccessful();

        $this->assertSame([], $envois, 'aucun canal ne livre');
        $this->assertSame(0, DB::table('jobs')->count());
        $this->assertSame(0, DB::table('failed_jobs')->count());
    }

    public function test_un_compte_actif_recoit_toujours_l_avis(): void
    {
        config()->set('queue.default', 'database');
        $envois = [];
        Event::listen(NotificationSent::class, function (NotificationSent $e) use (&$envois) {
            $envois[] = $e->channel;
        });

        $user = User::factory()->create(['email' => 'bob@example.com']);
        $user->notify(new AvisEnFilePourEssai);

        $this->artisan('queue:work', ['connection' => 'database', '--stop-when-empty' => true, '--memory' => self::MEMOIRE_SANS_PLAFOND])->assertSuccessful();

        $this->assertSame(['mail'], $envois);
    }

    public function test_le_resume_d_un_compte_supprime_ne_part_pas(): void
    {
        Mail::fake();
        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'email' => 'carol@example.com',
        ]);
        AppNotification::create([
            'user_id' => $user->id,
            'type' => NotificationType::System->value,
            'delivery_channel' => NotificationChannel::App->value,
            'title' => 'Test',
            'body' => 'Contenu',
            'is_read' => false,
        ]);
        $user->delete();

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        Mail::assertNotQueued(NotificationDigestMail::class);
        Mail::assertNotSent(NotificationDigestMail::class);
    }
}

class AvisEnFilePourEssai extends Notification implements ShouldQueue
{
    use Queueable;

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)->subject('Avis')->line('Bonjour');
    }
}
