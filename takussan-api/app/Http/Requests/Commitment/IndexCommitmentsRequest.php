<?php

namespace App\Http\Requests\Commitment;

use App\Http\Requests\BaseFormRequest;
use App\Models\Conversation;
use App\Services\Messaging\ConversationAccess;

/**
 * TCK-2969 (ADR-0130 § 2) — `GET /api/conversations/{conversation}/commitments` : les engagements d'un fil,
 * pour un LECTEUR du fil (la règle même de `CommitmentPolicy::view`), 403 sinon.
 */
class IndexCommitmentsRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $conversation = $this->route('conversation');

        return $this->user() !== null
            && $conversation instanceof Conversation
            && app(ConversationAccess::class)->allows($this->user(), $conversation);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
