<?php

namespace App\Services\Pont;

use App\Jobs\RelayerMessageAuPont;
use App\Models\Conversation;
use App\Models\MessageRelay;
use App\Services\Messaging\SystemMessageFactory;

/**
 * TCK-2981 (ADR-0132 § 3) — l'accord, lu par {@see PontEntrant} : la réponse au bouton « Accepter les messages » d'une
 * invitation, venue DU NUMÉRO INVITÉ et sur le canal de l'invitation, pose l'accord (`pont_invitation`, le compte
 * invité), marque l'invitation acceptée, écrit l'avis `pont.accord` (équipe seule) et vide la file d'attente d'accord
 * de ce destinataire, dans l'ordre.
 *
 * Une charge utile qui ne désigne pas une invitation de ce numéro sur ce canal n'est pas un accord (elle suit le
 * chemin d'un message).
 */
final class AccordDuPont
{
    public const PREFIXE = 'pont-invitation:';

    public function __construct(private readonly SystemMessageFactory $avis) {}

    public static function charge(MessageRelay $invitation): string
    {
        return self::PREFIXE.$invitation->id;
    }

    /** Vrai si le message était la réponse à une invitation (et l'accord est posé). */
    public function lire(CanalDuPont $canal, MessageEntrant $message): bool
    {
        $charge = (string) $message->reponseBouton;
        if (! str_starts_with($charge, self::PREFIXE) || ! ctype_digit(substr($charge, strlen(self::PREFIXE)))) {
            return false;
        }
        $invitation = MessageRelay::query()
            ->whereKey((int) substr($charge, strlen(self::PREFIXE)))
            ->where('purpose', MessageRelay::PURPOSE_INVITATION)
            ->where('direction', MessageRelay::DIRECTION_OUT)
            ->where('channel', $canal->nom())
            ->where('phone', $message->telephone)
            ->whereNotNull('user_id')
            ->first();
        if ($invitation === null) {
            return false;
        }
        if ($canal->accord($message->telephone) === EtatDAccord::Oppose) {
            // STOP vaut jusqu'à START : le bouton d'une vieille invitation ne le lève pas.
            return true;
        }

        $canal->accorder($message->telephone, 'pont_invitation', (int) $invitation->user_id);
        $dejaAccepte = $invitation->status === MessageRelay::STATUS_ACCEPTE;
        $invitation->forceFill(['status' => MessageRelay::STATUS_ACCEPTE])->save();
        $fil = $invitation->conversation_id === null ? null : Conversation::query()->find($invitation->conversation_id);
        if ($fil !== null && ! $dejaAccepte) {
            $this->avis->avisDuPont($fil, SystemMessageFactory::AVIS_PONT_ACCORD, ['user_id' => (int) $invitation->user_id, 'channel' => $canal->nom()]);
        }
        $this->viderLAttente((int) $invitation->user_id);

        return true;
    }

    /** Les messages écrits avant l'accord partent, dans l'ordre (chacun repasse par la garde du job). */
    public function viderLAttente(int $userId): void
    {
        MessageRelay::query()
            ->where('user_id', $userId)
            ->where('direction', MessageRelay::DIRECTION_OUT)
            ->where('status', MessageRelay::STATUS_EN_ATTENTE_ACCORD)
            ->orderBy('id')
            ->get()
            ->each(function (MessageRelay $attente): void {
                $attente->forceFill(['status' => MessageRelay::STATUS_REPRIS])->save();
                RelayerMessageAuPont::dispatch((int) $attente->message_id, (int) $attente->user_id)->afterCommit();
            });
    }
}
