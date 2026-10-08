<?php

namespace App\Console\Commands\Payouts;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Services\Model\PayoutService;
use Illuminate\Console\Command;

/**
 * TCK-594 (AC20) — un reversement `pending` ou `scheduled` dont `scheduled_at` est échu se rappelle
 * à son émetteur, UNE fois (`metadata.due_reminded_at`).
 *
 * Elle n'exécute rien : le décaissement est manuel (ADR-0039 §1). Le statut `scheduled` était posé
 * sans que rien ne le traite.
 */
class RemindDuePayouts extends Command
{
    protected $signature = 'payouts:remind-due';

    protected $description = 'Rappelle à leur émetteur les reversements programmés échus (une fois chacun).';

    public function handle(NotificationService $notifications): int
    {
        $sent = 0;

        Payout::query()
            ->whereIn('status', [PayoutStatus::Pending->value, PayoutStatus::Scheduled->value])
            ->whereNotNull('scheduled_at')
            ->where('scheduled_at', '<=', now())
            ->whereNotNull('issued_by_id')
            ->whereRaw("(metadata->>'due_reminded_at') IS NULL")
            ->orderBy('id')
            ->chunkById(200, function ($payouts) use (&$sent, $notifications): void {
                foreach ($payouts as $payout) {
                    // Marqué AVANT l'envoi : une relance rejouée ne double jamais l'avis, au prix
                    // d'un avis perdu si l'envoi échoue — c'est un rappel, pas l'argent.
                    $payout->forceFill(['metadata' => array_merge($payout->metadata ?? [], [
                        'due_reminded_at' => now()->toIso8601String(),
                    ])])->saveQuietly();

                    $issuer = User::query()->find($payout->issued_by_id);
                    if ($issuer !== null) {
                        $notifications->send($issuer, NotificationCode::PayoutDue, PayoutService::notificationParams($payout), NotificationTarget::of('finances'));
                        $sent++;
                    }
                }
            });

        $this->info("{$sent} rappel(s) envoyé(s).");

        return self::SUCCESS;
    }
}
