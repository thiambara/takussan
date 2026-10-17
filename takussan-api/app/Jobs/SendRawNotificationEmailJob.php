<?php

namespace App\Jobs;

use App\Services\Model\NotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Jobs\SyncJob;
use Illuminate\Support\Facades\Mail;

/**
 * Sends a plain-text notification email off the request cycle.
 *
 * Previously {@see NotificationService::sendEmail()} called
 * `Mail::raw()` synchronously, so any request that produced a notification —
 * including unauthenticated public endpoints (property contact-lead) — blocked
 * on an SMTP round-trip. Dispatching here keeps the request fast while the
 * `sync` queue driver in tests still runs it inline so Mail assertions hold.
 */
class SendRawNotificationEmailJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function backoff(): array
    {
        return [10, 60, 180];
    }

    public function __construct(
        public readonly string $email,
        public readonly string $subject,
        public readonly string $body,
    ) {}

    public function handle(): void
    {
        // Preserve the original "never let mail break the flow" resilience:
        // a misconfigured mailer should not fail the job in environments
        // without SMTP. Transient failures are retried via $tries: the error
        // is swallowed on the final attempt only.
        //
        // TCK-770 (P14.06) — the catch used to swallow EVERY attempt, so the
        // job succeeded on its first failure and was never retried. On the
        // `sync` queue there is a single attempt, run inside the caller: the
        // error is still swallowed there, as before.
        try {
            Mail::raw($this->body, function ($message): void {
                $message->to($this->email)->subject($this->subject);
            });
        } catch (\Throwable $e) {
            if (! $this->job instanceof SyncJob && $this->attempts() < $this->tries) {
                throw $e;
            }

            report($e);
        }
    }
}
