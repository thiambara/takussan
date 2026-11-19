<?php

namespace App\Jobs;

use App\Models\Agency;
use App\Models\Enums\MessageType;
use App\Models\Enums\MessageVisibility;
use App\Models\Message;
use App\Models\MessageRelay;
use App\Models\User;
use App\Services\Messaging\EquipeDuFil;
use App\Services\Pont\AccordDuPont;
use App\Services\Pont\JointsParLePont;
use App\Services\Pont\RelaisSortant;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

/**
 * TCK-2981 (ADR-0132 § 4) — relaie UN message du fil vers UN destinataire joint par le pont, après le COMMIT (mis en
 * file par {@see NotifyNewMessageJob}, ou par l'accord qui vide l'attente : {@see AccordDuPont}).
 *
 * Relayé **seulement** : un `text`, `visibility = all`, écrit par le personnel actif de l'agence du fil. Une note
 * d'équipe, un avis système, le message d'un client ou d'un prestataire ne partent jamais — la garde est ICI, au
 * départ, et non seulement chez l'appelant : la file d'attente d'accord repasse par elle.
 *
 * Joint → l'envoi par l'ordre de repli ({@see RelaisSortant}) ; invitation sans réponse → un relais
 * `en_attente_accord`, qui partira à l'accord ; sinon rien.
 */
class RelayerMessageAuPont implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    public function __construct(public readonly int $messageId, public readonly int $userId) {}

    public static function relayable(Message $message): bool
    {
        $fil = $message->conversation;
        $auteur = $message->sender;

        return $fil !== null && $auteur !== null
            && $message->type === MessageType::Text
            && $message->visibility === MessageVisibility::All
            && EquipeDuFil::tiersLitLesNotes($auteur, $fil);
    }

    public function handle(JointsParLePont $joints, RelaisSortant $relais): void
    {
        $message = Message::with(['conversation', 'sender'])->find($this->messageId);
        $destinataire = User::query()->find($this->userId);
        if ($message === null || $destinataire === null || ! self::relayable($message) || (int) $message->sender_id === $destinataire->id) {
            return;
        }
        $etat = $joints->etat($message->conversation, $destinataire->id);
        if ($etat === null) {
            return;
        }
        // Un seul relais par (message, destinataire) : un rejeu de la file ne renvoie rien.
        $deja = MessageRelay::query()->where('message_id', $message->id)->where('user_id', $destinataire->id)
            ->where('direction', MessageRelay::DIRECTION_OUT)->where('status', '!=', MessageRelay::STATUS_REPRIS)->exists();
        if ($deja) {
            return;
        }
        $agence = EquipeDuFil::agence($message->conversation);
        $base = [
            'purpose' => MessageRelay::PURPOSE_MESSAGE,
            'direction' => MessageRelay::DIRECTION_OUT,
            'message_id' => $message->id,
            'conversation_id' => $message->conversation_id,
            'agency_id' => $agence,
            'user_id' => $destinataire->id,
            'phone' => $destinataire->phone,
        ];
        if ($etat === JointsParLePont::EN_ATTENTE) {
            MessageRelay::query()->create($base + ['status' => MessageRelay::STATUS_EN_ATTENTE_ACCORD]);

            return;
        }
        if ((string) $destinataire->phone === '') {
            return;
        }

        $langue = $destinataire->preferredLocale() ?? (string) config('app.locale');
        $nom = $message->sender->nameWithoutContact();
        $nomDAgence = $agence === null ? 'Takussan' : (string) (Agency::query()->whereKey($agence)->value('name') ?? 'Takussan');
        $texte = __('pont.relais', ['nom' => $nom, 'agence' => $nomDAgence, 'texte' => (string) $message->content], $langue);

        $envoi = $relais->envoyer((string) $destinataire->phone, $agence, $texte, 'pont_nouveau_message', $langue, [$nom, $nomDAgence, mb_strimwidth((string) $message->content, 0, 500, '…')]);
        if ($envoi === null) {
            // Opposition, ou aucun canal : rien ne part, et la trace le dit sans numéro de plus.
            MessageRelay::query()->create($base + ['status' => MessageRelay::STATUS_NON_ENVOYE]);

            return;
        }
        $relais->tracer(MessageRelay::query()->create($base + ['status' => MessageRelay::STATUS_ECHEC]), $envoi['canal'], $envoi['resultat']);
    }
}
