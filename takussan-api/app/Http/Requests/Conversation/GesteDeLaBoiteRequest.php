<?php

namespace App\Http\Requests\Conversation;

use App\Http\Controllers\Api\ConversationPilotageController;
use App\Http\Requests\BaseFormRequest;
use App\Models\Conversation;
use App\Policies\ConversationPolicy;

/**
 * TCK-2967 (ADR-0128 § 7) — un geste de la boîte de pilotage ({@see ConversationPilotageController}) :
 * participant ACTIF du fil, que la garde de lecture accepte (`ConversationPolicy::piloter`), 403 sinon,
 * avant toute validation. Sous impersonation, `EnforceImpersonationReadOnly` refuse toute écriture avant.
 */
class GesteDeLaBoiteRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $conversation = $this->route('conversation');

        // Appel direct de la policy, et non `can()` : le `Gate::before` du super-admin l'accepterait,
        // alors qu'il n'a aucune ligne de participation où écrire son geste.
        return $this->user() !== null
            && $conversation instanceof Conversation
            && app(ConversationPolicy::class)->piloter($this->user(), $conversation);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
