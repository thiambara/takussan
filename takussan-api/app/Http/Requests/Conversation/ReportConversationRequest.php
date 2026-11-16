<?php

namespace App\Http\Requests\Conversation;

use App\Http\Requests\BaseFormRequest;
use App\Models\Conversation;
use App\Policies\ConversationPolicy;
use Illuminate\Validation\Rule;

/**
 * TCK-2859 (ADR-0114 § 2) — `POST /conversations/{conversation}/reports` : un motif codé, un
 * commentaire libre facultatif. Le front porte les libellés des motifs.
 *
 * L'autorisation (participant actif du fil) est jugée par `ConversationPolicy::report`, ici même :
 * un tiers reçoit 403 avant toute validation.
 */
class ReportConversationRequest extends BaseFormRequest
{
    public const REASONS = ['spam', 'harassment', 'fraud', 'inappropriate', 'other'];

    public function authorize(): bool
    {
        $conversation = $this->route('conversation');

        // Appel direct de la policy, et non `can()` : le `Gate::before` du super-admin
        // l'accepterait, alors qu'un signalement ne vient que d'un participant (ADR-0114 § 2).
        return $this->user() !== null
            && $conversation instanceof Conversation
            && app(ConversationPolicy::class)->report($this->user(), $conversation);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', Rule::in(self::REASONS)],
            'comment' => ['nullable', 'string', 'max:500'],
        ];
    }
}
