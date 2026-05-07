<?php

namespace App\Jobs;

use App\Models\AlertRule;
use App\Notifications\Admin\DiscordWebhookAlert;
use App\Notifications\Admin\EmailAlert;
use App\Notifications\Admin\SlackWebhookAlert;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

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

        foreach ($rule->channels_json ?? [] as $channel) {
            match ($channel) {
                'email' => EmailAlert::payload($this->alert),
                'slack' => SlackWebhookAlert::payload($this->alert),
                'discord' => DiscordWebhookAlert::payload($this->alert),
                default => null,
            };
        }

        $rule->forceFill(['last_triggered_at' => now()])->save();
    }

    public function failed(): void
    {
        AlertRule::query()->whereKey($this->ruleId)->increment('failure_count');
    }
}
