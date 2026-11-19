<?php

namespace App\Http\Requests\Conversation;

/**
 * TCK-2967 (ADR-0128 § 7) — confier une salle ou un groupe : `{user_id}`, ou `null` pour le reprendre.
 * L'identifiant est une forme ; qui peut être confié (personnel actif de l'agence du fil ET participant
 * actif) se juge dans le contrôleur, en 422 codé, jamais par `exists:` (un compte d'une autre agence ne se
 * distingue pas d'un compte absent).
 */
class AssignConversationRequest extends GesteDeLaBoiteRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'user_id' => ['present', 'nullable', 'integer', 'min:1'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['user_id' => __('messaging.attributes.assignee')];
    }
}
