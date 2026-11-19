<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Conversation\TranscriptionRequest;
use App\Jobs\Copilote\TranscrireLaNoteVocale;
use App\Models\Conversation;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Services\Messaging\ConversationAccess;
use App\Services\Messaging\Copilote\TranscriptionsDuFil;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2976 (ADR-0131 § 7) — la transcription d'une note vocale, demandée par le personnel servi par le copilote.
 *
 * Le message doit être lisible par le lecteur DANS CE FIL (`messagesLisiblesPar`) et de type `audio`, sinon 404.
 * Une seule transcription par message : prête ou en cours, `200` avec l'état, sans job. Fonction non servie (rôle
 * vide, coupée) : `200` `indisponible`, sans job ni ligne `ai_calls` — le fichier ne quitte pas la plateforme.
 * Sinon marque « en cours », job de la file `ai`, `202`. Un refus ou un échec passé ne bloque pas une nouvelle demande.
 */
class MessageTranscriptionController extends Controller
{
    public function store(TranscriptionRequest $request, Conversation $conversation, string $message, ConversationAccess $acces, TranscriptionsDuFil $transcriptions): JsonResponse
    {
        $user = $request->user();
        /** @var Message|null $note */
        $note = $acces->messagesLisiblesPar($user, Message::query()->where('messages.conversation_id', $conversation->id), $conversation)
            ->whereKey((int) $message)
            ->first();
        abort_unless($note !== null && $note->type === MessageType::Audio, 404);

        $etat = $transcriptions->etats($conversation, [(int) $note->id])[(int) $note->id];
        $servie = in_array($etat['etat'], [TranscriptionsDuFil::AUCUNE], true)
            || ($etat['etat'] === TranscriptionsDuFil::INDISPONIBLE && in_array($etat['code'] ?? null, ['copilote.budget_epuise', 'copilote.echec'], true));
        if (! $servie) {
            return $this->json(['data' => $etat]);
        }

        if (TranscriptionsDuFil::marquer((int) $note->id)) {
            $profil = $request->activeProfile();
            TranscrireLaNoteVocale::dispatch(
                (int) $user->id, (int) $note->id,
                $profil?->getMorphClass(), $profil?->getKey() !== null ? (int) $profil->getKey() : null,
            );
        }

        return $this->json(['data' => ['etat' => TranscriptionsDuFil::EN_COURS]], 202);
    }
}
