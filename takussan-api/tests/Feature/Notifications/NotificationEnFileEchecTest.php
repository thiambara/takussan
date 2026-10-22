<?php

namespace Tests\Feature\Notifications;

use App\Notifications\AccountDeletionStepUpCodeNotification;
use App\Notifications\TaskDueReminderNotification;
use Illuminate\Notifications\SendQueuedNotifications;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use ReflectionClass;
use RuntimeException;
use Tests\TestCase;

/**
 * TCK-1352 (P142.05) — l'échec final d'une notification en file se journalise (classe, canal,
 * jamais le message de l'exception), et un code court ne se réessaie pas au-delà de sa durée de vie.
 */
class NotificationEnFileEchecTest extends TestCase
{
    public function test_l_echec_final_nomme_la_classe_et_le_canal_sans_le_message(): void
    {
        $notification = (new ReflectionClass(TaskDueReminderNotification::class))->newInstanceWithoutConstructor();
        $notification->middleware(new \stdClass, 'mail');
        Log::spy();

        $notification->failed(new RuntimeException('adresse secrete@example.com'));

        Log::shouldHaveReceived('error')->once()->withArgs(fn (string $message, array $context) => $message === '[notifications] envoi abandonné'
            && $context['notification'] === TaskDueReminderNotification::class
            && $context['channel'] === 'mail'
            && ! str_contains((string) json_encode($context), 'secrete'));
    }

    public function test_le_code_de_suppression_ne_se_reessaie_pas_au_dela_de_cinq_minutes(): void
    {
        Queue::fake();
        $this->freezeTime();

        Notification::route('mail', 'awa@example.com')->notify(new AccountDeletionStepUpCodeNotification('123456', 5));

        Queue::assertPushed(SendQueuedNotifications::class, fn (SendQueuedNotifications $job) => $job->retryUntil() == now()->addMinutes(5)
            && $job->backoff() === [60, 300, 900]);
    }
}
