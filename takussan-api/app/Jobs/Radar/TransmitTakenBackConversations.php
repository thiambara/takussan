<?php

namespace App\Jobs\Radar;

use App\Services\Messaging\PropertyConversationResolver;
use App\Services\Radar\RadarClaims;
use App\Services\Radar\RadarMandateTakeBack;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * TCK-2421 — les fils des biens repris sous mandat ({@see RadarMandateTakeBack}) passent à leur nouveau contact principal, par
 * le chemin de TCK-888 (ADR-0068 § 3, {@see PropertyConversationResolver::transmitForProperty()}). Mis en file APRÈS le commit
 * de la réclamation ({@see RadarClaims::claim()}), et jamais exécuté dans la requête : une transmission qui lève ne rend pas
 * 500 sur une reprise déjà faite, et n'empêche pas la publication des annonces cochées de partir.
 *
 * **Rejouable** : retransmettre un fil déjà transmis ne fait rien (le répondant y est déjà, les autres l'ont quitté). Un bien
 * qui lève n'arrête pas les suivants ; le job se relance ensuite, et l'abandon se signale.
 */
final class TransmitTakenBackConversations implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    /** @param  list<int>  $propertyIds */
    public function __construct(public readonly array $propertyIds) {}

    /** @return list<int> */
    public function backoff(): array
    {
        return [10, 60, 300, 900];
    }

    public function handle(PropertyConversationResolver $conversations): void
    {
        $failure = null;
        foreach ($this->propertyIds as $propertyId) {
            try {
                $conversations->transmitForProperty($propertyId);
            } catch (Throwable $e) {
                $failure ??= $e;
            }
        }

        if ($failure !== null) {
            throw $failure;
        }
    }

    public function failed(?Throwable $exception): void
    {
        if ($exception !== null) {
            report($exception);
        }
        Log::error('radar.take_back.conversations_not_transmitted', ['property_ids' => $this->propertyIds]);
    }
}
