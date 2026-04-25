<?php

namespace App\Notifications;

use App\Jobs\SendTaskDueReminders;
use App\Models\Task;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-083 — Sent 24 h before `Task.due_at`. Dispatched by
 * {@see SendTaskDueReminders} which guarantees idempotence
 * via a marker stored on the task itself.
 */
class TaskDueReminderNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'task_due_reminder';

    public function __construct(public Task $task) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        $resolver = app(PreferenceResolver::class);
        $channels = [];

        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_INAPP)) {
            $channels[] = 'database';
        }
        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_EMAIL)) {
            $channels[] = 'mail';
        }
        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_PUSH)) {
            $channels[] = 'broadcast';
        }

        return $channels;
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject(__('notifications.task_due_reminder.subject', ['title' => $this->task->title]))
            ->greeting(__('notifications.task_due_reminder.greeting'))
            ->line(__('notifications.task_due_reminder.intro', [
                'title' => $this->task->title,
                'datetime' => optional($this->task->due_at)->format('Y-m-d H:i') ?? '—',
            ]))
            ->salutation(__('notifications.salutation'));
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'task_id' => $this->task->id,
            'taskable_type' => $this->task->taskable_type,
            'taskable_id' => $this->task->taskable_id,
            'title' => $this->task->title,
            'due_at' => optional($this->task->due_at)->toIso8601String(),
            'priority' => $this->task->priority?->value,
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return 'task.due_reminder';
    }
}
