<?php

namespace App\Jobs;

use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use App\Notifications\VisitReminderNotification;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/**
 * TCK-075 — Scheduled every 5 minutes (see `routes/console.php`).
 *
 * Dispatches two reminder waves per visit:
 *
 *   - **24 h window**: visits whose `scheduled_at` falls in (now+23h55m, now+24h05m).
 *   - **1 h window**: visits whose `scheduled_at` falls in (now+55m, now+65m).
 *
 * Only `confirmed` visits are targeted — requested/scheduled visits
 * haven't been acknowledged yet. Each reminder is marked on the visit's
 * `metadata` JSON so re-runs never double-send.
 */
class SendPropertyVisitReminders implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** @var list<array{window:string,meta_key:string,minutes:int,tolerance:int}> */
    private const WINDOWS = [
        ['window' => '24h', 'meta_key' => 'reminder_24h_sent_at', 'minutes' => 60 * 24, 'tolerance' => 5],
        ['window' => '1h', 'meta_key' => 'reminder_1h_sent_at', 'minutes' => 60, 'tolerance' => 5],
    ];

    public function handle(): void
    {
        foreach (self::WINDOWS as $config) {
            $this->sendWindow($config['window'], $config['meta_key'], $config['minutes'], $config['tolerance']);
        }
    }

    private function sendWindow(string $window, string $metaKey, int $minutes, int $tolerance): void
    {
        $target = now()->addMinutes($minutes);
        $from = $target->copy()->subMinutes($tolerance);
        $to = $target->copy()->addMinutes($tolerance);

        PropertyVisit::query()
            ->where('status', VisitStatus::Confirmed)
            ->whereBetween('scheduled_at', [$from, $to])
            ->with(['property', 'visitor', 'agent'])
            ->chunkById(100, function ($visits) use ($window, $metaKey) {
                foreach ($visits as $visit) {
                    $this->notifyFor($visit, $window, $metaKey);
                }
            });
    }

    private function notifyFor(PropertyVisit $visit, string $window, string $metaKey): void
    {
        // Claim + send atomically: take a row lock on the visit, re-read
        // metadata inside the transaction, and only dispatch if the
        // marker is still empty. Without this, two concurrent scheduler
        // ticks could both pass the "not sent yet" check and both emit
        // the same reminder. Transaction + lockForUpdate is DB-agnostic
        // (works on SQLite/MySQL/Postgres) and avoids driver-specific
        // JSON_SET/jsonb_set shenanigans.
        DB::transaction(function () use ($visit, $window, $metaKey) {
            $fresh = PropertyVisit::query()
                ->whereKey($visit->id)
                ->lockForUpdate()
                ->first();

            if (! $fresh) {
                return;
            }

            $metadata = $fresh->metadata ?? [];
            if (! empty($metadata[$metaKey])) {
                return;
            }

            // Reload the relations we need on the locked row; the
            // eager-loaded copy passed in above is outside the lock.
            $fresh->loadMissing(['property', 'visitor', 'agent']);

            $recipients = collect();
            if ($fresh->visitor) {
                $recipients->push($fresh->visitor);
            }
            if ($fresh->agent && (! $fresh->visitor || $fresh->agent->id !== $fresh->visitor->id)) {
                $recipients->push($fresh->agent);
            }

            if ($recipients->isEmpty()) {
                return;
            }

            Notification::send($recipients, new VisitReminderNotification($fresh, $window));

            $metadata[$metaKey] = now()->toIso8601String();
            $fresh->forceFill(['metadata' => $metadata])->save();
        });
    }
}
