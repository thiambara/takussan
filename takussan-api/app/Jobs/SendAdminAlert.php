<?php

namespace App\Jobs;

use App\Models\AlertRule;
use App\Notifications\Admin\DiscordWebhookAlert;
use App\Notifications\Admin\EmailAlert;
use App\Notifications\Admin\SlackWebhookAlert;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

class SendAdminAlert implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function backoff(): array
    {
        return [10, 60, 180];
    }

    public function __construct(
        public readonly int $ruleId,
        public readonly array $alert,
        public readonly bool $test = false,
    ) {}

    public function handle(): void
    {
        $rule = AlertRule::find($this->ruleId);
        if (! $rule) {
            return;
        }

        $recipients = $rule->recipients_json ?? [];
        $emails = $recipients['emails'] ?? [];
        $webhooks = $recipients['webhooks'] ?? [];
        $channels = $rule->channels_json ?? [];

        // Previously these `payload()` factories were called and their return
        // value discarded — the alert was NEVER delivered, yet last_triggered_at
        // was stamped as if it had. Actually deliver each channel, and let any
        // failure propagate so $tries / failed() apply.
        if (in_array('email', $channels, true)) {
            $this->sendEmail($emails);
        }

        // `webhooks` is a flat list of URLs that is NOT keyed by provider, yet
        // Slack and Discord expect different JSON shapes. Post each URL exactly
        // once with the payload its host accepts. Looping per-channel instead
        // (the previous approach) sent BOTH bodies to EVERY URL when both
        // channels were enabled, so a Slack body hit a Discord endpoint → 400
        // → `->throw()` → the whole job failed every time.
        $this->postWebhooks($webhooks, array_values(array_intersect(['slack', 'discord'], $channels)));

        // Only stamp success once every channel has actually been delivered.
        $rule->forceFill(['last_triggered_at' => now()])->save();
    }

    /**
     * @param  array<int,string>  $emails
     */
    private function sendEmail(array $emails): void
    {
        if ($emails === []) {
            return;
        }

        $payload = EmailAlert::payload($this->alert);
        $body = trim(($payload['body'] ?? '')."\n\n".($payload['audit_url'] ?? ''));

        Mail::raw($body, function ($message) use ($emails, $payload): void {
            $message->to($emails)->subject($payload['subject'] ?? 'Alerte administrateur');
        });
    }

    /**
     * @param  array<int,string>  $webhooks  flat list of URLs from the rule
     * @param  array<int,string>  $enabledChannels  webhook channels enabled on the rule (slack/discord)
     */
    private function postWebhooks(array $webhooks, array $enabledChannels): void
    {
        if ($enabledChannels === []) {
            return;
        }

        foreach ($webhooks as $url) {
            if (! is_string($url) || $url === '') {
                continue;
            }

            $channel = $this->channelForUrl($url, $enabledChannels);
            if ($channel === null) {
                continue;
            }

            $body = $channel === 'slack'
                ? SlackWebhookAlert::payload($this->alert)
                : DiscordWebhookAlert::payload($this->alert);

            Http::asJson()->connectTimeout(5)->timeout(10)->post($url, $body)->throw();
        }
    }

    /**
     * Resolve which payload format a webhook URL should receive. Prefer the
     * provider implied by the host; for a custom/unknown host fall back to the
     * sole enabled webhook channel (when both are enabled an unrecognised host
     * is skipped rather than guessed wrong and delivered the wrong shape).
     *
     * @param  array<int,string>  $enabledChannels
     */
    private function channelForUrl(string $url, array $enabledChannels): ?string
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        $detected = match (true) {
            str_contains($host, 'slack.com') => 'slack',
            str_contains($host, 'discord.com'), str_contains($host, 'discordapp.com') => 'discord',
            default => null,
        };

        if ($detected !== null) {
            return in_array($detected, $enabledChannels, true) ? $detected : null;
        }

        return count($enabledChannels) === 1 ? $enabledChannels[0] : null;
    }

    public function failed(): void
    {
        AlertRule::query()->whereKey($this->ruleId)->increment('failure_count');
    }
}
