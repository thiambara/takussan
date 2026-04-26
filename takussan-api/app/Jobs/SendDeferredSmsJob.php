<?php

namespace App\Jobs;

use App\Services\Notifications\Sms\SmsRouterDriver;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * TCK-102 — Re-dispatch a non-critical SMS once the ARTP quiet-hours
 * window has ended (delay computed by the router via QuietHoursGuard).
 * The job re-enters the router which goes back through the fallback
 * chain — quiet hours has lifted by the time the job runs so the
 * router will proceed normally.
 */
class SendDeferredSmsJob implements ShouldQueue
{
    use Queueable;

    /**
     * @param  list<string>  $to
     * @param  array<string,mixed>  $context
     */
    public function __construct(
        public readonly array $to,
        public readonly string $message,
        public readonly array $context,
    ) {}

    public function handle(SmsRouterDriver $router): void
    {
        $router->send($this->to, $this->message, [
            ...$this->context,
            'bypass_quiet_hours' => true,
        ]);
    }
}
