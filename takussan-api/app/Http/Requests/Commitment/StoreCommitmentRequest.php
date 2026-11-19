<?php

namespace App\Http\Requests\Commitment;

use App\Http\Requests\BaseFormRequest;
use App\Models\Conversation;
use App\Rules\InstantIso;
use App\Services\Messaging\ConversationAccess;

/**
 * TCK-2969 (ADR-0130 § 2) — `POST /api/conversations/{conversation}/commitments`
 * `{source_message_id?, holder_id, beneficiary_id?, title, due_at}` : noter un engagement.
 *
 * `authorize()` court avant les règles : l'auteur ÉCRIT dans le fil (`ConversationAccess::allowsWriting`),
 * et n'est pas le super-admin (ADR-0130 § 3 : il lit, il ne fait aucun geste). `object_type` et
 * `object_id` ne sont jamais lus du corps : le serveur les pose depuis le fil.
 *
 * Les identifiants sont des entiers, résolus par la route contre le fil (participants actifs, message du
 * fil) : aucune règle `exists:` (`ExistsSurTableASuppressionDouceTest`). L'échéance passée est refusée
 * par la route, avec son code (`commitment.due_in_past`).
 */
class StoreCommitmentRequest extends BaseFormRequest
{
    public const TITRE_MAX = 160;

    public function authorize(): bool
    {
        $conversation = $this->route('conversation');
        $user = $this->user();

        return $user !== null
            && ! $user->isSuperAdmin()
            && $conversation instanceof Conversation
            && app(ConversationAccess::class)->allowsWriting($user, $conversation);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'source_message_id' => ['nullable', 'integer', 'min:1'],
            'holder_id' => ['required', 'integer', 'min:1'],
            'beneficiary_id' => ['nullable', 'integer', 'min:1'],
            'title' => ['required', 'string', 'max:'.self::TITRE_MAX],
            'due_at' => ['required', 'date', new InstantIso],
        ];
    }
}
