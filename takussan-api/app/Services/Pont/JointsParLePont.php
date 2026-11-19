<?php

namespace App\Services\Pont;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\MessageRelay;

/**
 * TCK-2981 (ADR-0132 § 3, § 4) — qui est joint par le pont dans un fil.
 *
 * - **joint** : une invitation acceptée dans ce fil (ou un accord déjà donné ailleurs : joint d'emblée), ou son
 *   dernier message dans ce fil venu d'un canal du pont ; il cesse de l'être quand il écrit depuis l'application
 *   (`channel = app`) après ;
 * - **en attente** : une invitation envoyée dans ce fil, sans réponse : les messages du personnel attendent l'accord ;
 * - sinon, rien : aucun relais.
 */
final class JointsParLePont
{
    public const JOINT = 'joint';

    public const EN_ATTENTE = 'en_attente';

    public function etat(Conversation|int $fil, int $userId): ?string
    {
        $filId = $fil instanceof Conversation ? (int) $fil->id : $fil;
        $invitation = MessageRelay::query()
            ->where('purpose', MessageRelay::PURPOSE_INVITATION)
            ->where('conversation_id', $filId)
            ->where('user_id', $userId)
            ->whereIn('status', [MessageRelay::STATUS_ACCEPTE, MessageRelay::STATUS_ENVOYE, MessageRelay::STATUS_REMIS, MessageRelay::STATUS_LU])
            ->orderByDesc('id')
            ->first();

        // Son dernier message dans ce fil dit d'où il écrit.
        $dernier = Message::query()
            ->where('conversation_id', $filId)
            ->where('sender_id', $userId)
            ->orderByDesc('id')
            ->first(['id', 'channel', 'created_at']);
        $depuisLePont = $dernier !== null && $dernier->getAttribute('channel') !== RegistreDesCanaux::APP;

        if ($invitation?->status === MessageRelay::STATUS_ACCEPTE) {
            $ecritDepuisLApp = $dernier !== null && ! $depuisLePont && $dernier->created_at > $invitation->updated_at;

            return $ecritDepuisLApp ? null : self::JOINT;
        }
        if ($depuisLePont) {
            return self::JOINT;
        }

        return $invitation === null ? null : self::EN_ATTENTE;
    }
}
