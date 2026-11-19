<?php

namespace App\Services\Pont;

use App\Jobs\RelayerMessageAuPont;
use App\Models\MessageRelay;
use Illuminate\Support\Carbon;

/**
 * TCK-2981 (ADR-0132 § 4) — les accusés d'un pilote appliqués aux relais du pont (`envoye` → `remis` → `lu`, ou
 * `echec`), par (canal, identifiant externe). Un statut ne recule jamais. Un `echec` TARDIF (après un envoi accepté)
 * d'un relais de message repart une fois par les canaux qui suivent dans l'ordre de repli — sauf opposition, que
 * {@see RelaisSortant} garde —, avec son propre relais.
 *
 * Le vocabulaire d'un pilote est ramené ici (`sent`, `delivered`, `read`, `failed` ou leurs équivalents français) :
 * aucun canal n'y est nommé.
 */
final class AccusesDuPont
{
    private const STATUTS = [
        'sent' => MessageRelay::STATUS_ENVOYE, 'envoye' => MessageRelay::STATUS_ENVOYE,
        'delivered' => MessageRelay::STATUS_REMIS, 'remis' => MessageRelay::STATUS_REMIS,
        'read' => MessageRelay::STATUS_LU, 'lu' => MessageRelay::STATUS_LU,
        'failed' => MessageRelay::STATUS_ECHEC, 'echec' => MessageRelay::STATUS_ECHEC,
    ];

    private const RANG = [MessageRelay::STATUS_ENVOYE => 1, MessageRelay::STATUS_REMIS => 2, MessageRelay::STATUS_LU => 3];

    /**
     * @param  list<AccuseEntrant>  $accuses
     * @return int le nombre de relais mis à jour
     */
    public function appliquer(CanalDuPont $canal, array $accuses): int
    {
        $appliques = 0;
        foreach ($accuses as $accuse) {
            $statut = self::STATUTS[$accuse->statut] ?? null;
            if ($statut === null || $accuse->identifiant === '') {
                continue;
            }
            $relais = MessageRelay::query()->where('channel', $canal->nom())->where('provider_message_id', $accuse->identifiant)
                ->where('direction', MessageRelay::DIRECTION_OUT)->first();
            if ($relais === null || ! $this->avance($relais, $statut)) {
                continue;
            }
            $quand = $accuse->horodatage === null ? now() : Carbon::createFromTimestamp($accuse->horodatage);
            $tardif = $statut === MessageRelay::STATUS_ECHEC && $relais->status === MessageRelay::STATUS_ENVOYE;
            $relais->forceFill(match ($statut) {
                MessageRelay::STATUS_REMIS => ['status' => $statut, 'delivered_at' => $quand],
                MessageRelay::STATUS_LU => ['status' => $statut, 'read_at' => $quand, 'delivered_at' => $relais->delivered_at ?? $quand],
                MessageRelay::STATUS_ECHEC => ['status' => $statut, 'failed_at' => $quand, 'failure_reason' => mb_substr((string) $accuse->motif, 0, 255)],
                default => ['status' => $statut, 'sent_at' => $relais->sent_at ?? $quand],
            })->save();
            $appliques++;

            if ($tardif && $relais->purpose === MessageRelay::PURPOSE_MESSAGE && $relais->message_id !== null && $relais->user_id !== null) {
                RelayerMessageAuPont::dispatch((int) $relais->message_id, (int) $relais->user_id, $canal->nom())->afterCommit();
            }
        }

        return $appliques;
    }

    private function avance(MessageRelay $relais, string $statut): bool
    {
        if ($relais->status === MessageRelay::STATUS_ECHEC || $relais->status === $statut) {
            return false;
        }
        if ($statut === MessageRelay::STATUS_ECHEC) {
            // Un échec après la remise ou la lecture ne défait pas ce qui est arrivé.
            return ! in_array($relais->status, [MessageRelay::STATUS_REMIS, MessageRelay::STATUS_LU], true);
        }

        return (self::RANG[$statut] ?? 0) > (self::RANG[$relais->status] ?? 0);
    }
}
