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
        return $this->etats($fil, [$userId])[$userId];
    }

    /**
     * {@see self::etat()} pour plusieurs comptes du même fil, en deux requêtes quel que soit leur nombre : la dernière
     * invitation de chacun, puis son dernier message.
     *
     * @param  list<int>  $userIds
     * @return array<int, ?string> compte => état
     */
    public function etats(Conversation|int $fil, array $userIds): array
    {
        $filId = $fil instanceof Conversation ? (int) $fil->id : $fil;
        $userIds = array_values(array_unique(array_map('intval', $userIds)));
        if ($userIds === []) {
            return [];
        }
        $invitations = MessageRelay::query()
            ->whereIn('id', MessageRelay::query()
                ->selectRaw('max(id)')
                ->where('purpose', MessageRelay::PURPOSE_INVITATION)
                ->where('conversation_id', $filId)
                ->whereIn('user_id', $userIds)
                ->whereIn('status', [MessageRelay::STATUS_ACCEPTE, MessageRelay::STATUS_ENVOYE, MessageRelay::STATUS_REMIS, MessageRelay::STATUS_LU])
                ->groupBy('user_id'))
            ->get()
            ->keyBy(fn (MessageRelay $r) => (int) $r->user_id);

        // Son dernier message dans ce fil dit d'où il écrit.
        $derniers = Message::query()
            ->whereIn('id', Message::query()
                ->selectRaw('max(id)')
                ->where('conversation_id', $filId)
                ->whereIn('sender_id', $userIds)
                ->groupBy('sender_id'))
            ->get(['id', 'sender_id', 'channel', 'created_at'])
            ->keyBy(fn (Message $m) => (int) $m->sender_id);

        $etats = [];
        foreach ($userIds as $userId) {
            $etats[$userId] = self::juger($invitations->get($userId), $derniers->get($userId));
        }

        return $etats;
    }

    private static function juger(?MessageRelay $invitation, ?Message $dernier): ?string
    {
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
