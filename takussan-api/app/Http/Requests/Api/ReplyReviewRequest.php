<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-305 — extrait de ReviewController::reply(), où les règles étaient écrites en ligne.
 *
 * TCK-597 (ADR-0043 §1) — l'autorisation DÉLÈGUE à `ReviewPolicy::reply`. L'expression reprise
 * ici acceptait tout membre dont le profil actif était dans l'agence du bien, bailleur compris.
 * Elle court avant la validation : un appel non autorisé et mal formé rend 403, pas 422.
 */
class ReplyReviewRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('reply', $this->route('review')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reply_content' => ['required', 'string'],
        ];
    }
}
