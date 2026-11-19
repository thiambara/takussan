<?php

namespace App\Http\Requests\Conversation;

use Illuminate\Foundation\Http\FormRequest;

/**
 * TCK-2975 (ADR-0131 § 3) — `PUT /api/copilote/suggestions/{suggestion}/decision`. `final` (pour `edited`) : le
 * texte envoyé (brouillon) ou les champs de l'engagement créé (promesse). Le droit se juge dans le contrôleur, en
 * 404 : la décision d'un autre ne dit pas que la suggestion existe.
 */
class DeciderUneSuggestionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'decision' => ['required', 'string', 'in:accepted,edited,rejected'],
            'final' => ['required_if:decision,edited', 'array'],
        ];
    }
}
