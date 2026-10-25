<?php

namespace App\Console\Commands\Payouts;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Services\Model\PayoutService;
use App\Services\Payout\PayoutApprovers;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-594 (AC20) — un reversement `pending` ou `scheduled` dont `scheduled_at` est échu se rappelle
 * à son émetteur, UNE fois (`metadata.due_reminded_at`) ; à défaut d'émetteur encore actif, aux
 * détenteurs actifs de `payouts.create` (TCK-1706).
 *
 * Elle n'exécute rien : le décaissement est manuel (ADR-0039 §1). Le statut `scheduled` était posé
 * sans que rien ne le traite.
 */
class RemindDuePayouts extends Command
{
    protected $signature = 'payouts:remind-due';

    protected $description = 'Rappelle à leur émetteur les reversements programmés échus (une fois chacun).';

    public function handle(NotificationService $notifications, PayoutApprovers $approvers): int
    {
        $sent = 0;

        self::due(Payout::query())
            ->orderBy('id')
            ->chunkById(200, function ($payouts) use (&$sent, $notifications, $approvers): void {
                foreach ($payouts as $loaded) {
                    // Marqué AVANT l'envoi : une relance rejouée ne double jamais l'avis, au prix
                    // d'un avis perdu si l'envoi échoue — c'est un rappel, pas l'argent.
                    $payout = $this->claim($loaded);
                    if ($payout === null) {
                        continue;
                    }

                    foreach ($this->recipientsFor($payout, $approvers) as $recipient) {
                        $notifications->send($recipient, NotificationCode::PayoutDue, PayoutService::notificationParams($payout), self::targetFor($recipient, $payout));
                        $sent++;
                    }
                }
            });

        $this->info("{$sent} rappel(s) envoyé(s).");

        return self::SUCCESS;
    }

    /**
     * La sélection des reversements à rappeler : `pending` ou `scheduled`, échus, émis, jamais
     * rappelés. Jugée au chargement du lot, puis REJUGÉE sous verrou par `claim()`.
     *
     * @param  Builder<Payout>  $query
     * @return Builder<Payout>
     */
    private static function due(Builder $query): Builder
    {
        return $query
            ->whereIn('status', [PayoutStatus::Pending->value, PayoutStatus::Scheduled->value])
            ->whereNotNull('scheduled_at')
            ->where('scheduled_at', '<=', now())
            ->whereNotNull('issued_by_id')
            ->whereRaw("(metadata->>'due_reminded_at') IS NULL");
    }

    /**
     * P245.01 (TCK-2362) — le marqueur se pose sur la ligne RELUE sous verrou, et seulement si elle
     * est encore à rappeler. Posé sur le modèle chargé en lot, il réécrivait `metadata` en entier :
     * un reversement payé pendant le passage (`PayoutService::markProcessed`, qui verrouille la
     * ligne) perdait la trace du décaissement, et son émetteur était rappelé pour un reversement
     * soldé. Rend `null` quand la ligne n'est plus à rappeler : rien ne part.
     */
    private function claim(Payout $loaded): ?Payout
    {
        return DB::transaction(function () use ($loaded): ?Payout {
            /** @var Payout|null $locked */
            $locked = self::due(Payout::query()->whereKey($loaded->getKey()))->lockForUpdate()->first();
            if ($locked === null) {
                return null;
            }

            $locked->forceFill(['metadata' => array_merge($locked->metadata ?? [], [
                'due_reminded_at' => now()->toIso8601String(),
            ])])->saveQuietly();

            return $locked;
        });
    }

    /**
     * TCK-1706 (P126.03) — l'émetteur, s'il est encore personnel ACTIF de l'agence du reversement
     * tenant `payouts.create` ; sinon les détenteurs actifs de cette capacité, hors bénéficiaire.
     * La capacité est celle qui administre un reversement échu (`PayoutPolicy::update`) : un agent
     * suspendu ou parti recevait seul le rappel, et l'équipe active n'en savait rien.
     *
     * @return iterable<int, User>
     */
    private function recipientsFor(Payout $payout, PayoutApprovers $approvers): iterable
    {
        $agency = Agency::query()->find($payout->agency_id);
        if ($agency === null) {
            return [];
        }

        $holders = $approvers->holders($agency, Capability::PayoutsCreate);
        $issuer = $holders->first(fn (User $user): bool => (int) $user->id === (int) $payout->issued_by_id);
        if ($issuer !== null) {
            return [$issuer];
        }

        $beneficiaryId = $payout->beneficiaryUserId();

        return $holders->reject(fn (User $user): bool => $beneficiaryId !== null && (int) $user->id === (int) $beneficiaryId);
    }

    /**
     * TCK-1467 (P161.01) — la cible suit le destinataire : les finances de l'agence pour son admin,
     * l'onglet des reversements de `/app/payments` sinon (l'agent émet par `payouts.create`, TCK-528,
     * et la section `/app/agency` lui est fermée).
     */
    private static function targetFor(User $issuer, Payout $payout): NotificationTarget
    {
        return $issuer->isAgencyAdminAt((int) $payout->agency_id)
            ? NotificationTarget::of('finances')->forAgency($payout->agency_id)
            : NotificationTarget::of('payouts')->forAgency($payout->agency_id);
    }
}
