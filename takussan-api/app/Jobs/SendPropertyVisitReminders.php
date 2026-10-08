<?php

namespace App\Jobs;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Services\Notifications\ContactSansCompte;
use App\Services\Visit\VisitNotifier;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;

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
 *
 * TCK-588 (ADR-0032) — le rappel est le code `visit.reminder`, rendu dans la langue de chaque
 * destinataire, et il atteint enfin le visiteur SANS COMPTE : `visitor`, sinon le compte du
 * client lié, sinon son téléphone (`visitor_phone`, puis `customer.phone`) — WhatsApp s'il y a
 * consenti, sinon SMS. Plus l'agent, comme avant.
 */
class SendPropertyVisitReminders implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** @var list<array{window:string,meta_key:string,minutes:int,tolerance:int}> */
    private const WINDOWS = [
        ['window' => '24h', 'meta_key' => 'reminder_24h_sent_at', 'minutes' => 60 * 24, 'tolerance' => 5],
        ['window' => '1h', 'meta_key' => 'reminder_1h_sent_at', 'minutes' => 60, 'tolerance' => 5],
    ];

    private NotificationService $notifications;

    public function handle(): void
    {
        $this->notifications = app(NotificationService::class);

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
            ->with(['property', 'visitor', 'agent', 'customer.user'])
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
        // the same reminder. Transaction + lockForUpdate is portable SQL and
        // avoids driver-specific JSON_SET/jsonb_set shenanigans.
        //
        // ⚠ This said "(works on SQLite/MySQL/Postgres)"; only PostgreSQL is
        // left (ADR-0020). One PostgreSQL caveat that list hid: `FOR UPDATE`
        // is REFUSED on an aggregate — `->lockForUpdate()->count()` raises
        // `SQLSTATE[0A000]`. This call locks a ROW, which is the supported
        // and correct shape.
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
            $fresh->loadMissing(['property', 'visitor', 'agent', 'customer.user']);

            $visitor = $fresh->visitor ?? $fresh->customer?->user;
            $contact = $visitor === null ? ContactSansCompte::fromVisit($fresh) : null;
            $recipients = array_values(array_filter([
                $visitor ?? ($contact?->hasPhone() ? $contact : null),
                $fresh->agent && $fresh->agent->id !== $visitor?->id ? $fresh->agent : null,
            ]));

            if ($recipients === []) {
                return;
            }

            $params = [
                'property' => $fresh->property?->title ?? '#'.$fresh->id,
                'scheduled_at' => $fresh->scheduled_at?->toIso8601String(),
                'window' => $window,
            ];
            foreach ($recipients as $recipient) {
                // TCK-590 (passe 4, X2) — vers un contact sans compte, le SMS du rappel passe par
                // la borne des SMS de visite, seule source du plafond.
                if ($recipient instanceof ContactSansCompte) {
                    app(VisitNotifier::class)->reminderToContact($fresh, $recipient, $params);

                    continue;
                }
                $this->notifications->send(
                    $recipient,
                    NotificationCode::VisitReminder,
                    $params,
                    $recipient instanceof User ? NotificationTarget::of('visit', $fresh->id) : null,
                );
            }

            $metadata[$metaKey] = now()->toIso8601String();
            $fresh->forceFill(['metadata' => $metadata])->save();
        });
    }
}
