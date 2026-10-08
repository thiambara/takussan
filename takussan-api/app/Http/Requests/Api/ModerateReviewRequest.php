<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\ModerationReasonCode;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de ReviewController::moderate(), où les règles étaient écrites en ligne.
 *
 * TCK-597 (ADR-0043 §1) — l'autorisation DÉLÈGUE à `ReviewPolicy::moderate`. L'expression reprise
 * ici ouvrait le geste à l'admin de n'importe quelle agence sur les avis de toutes les agences.
 * Elle court avant la validation : un appel non autorisé et mal formé rend 403, pas 422.
 *
 * Le motif est un code (`reason_code`) pour tout autre geste qu'approuver ; le texte libre n'est
 * exigé que pour `other` (ADR-0043 §7).
 */
class ModerateReviewRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('moderate', $this->route('review')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'decision' => ['required', Rule::in(['approve', 'hide', 'delete', 'ignore'])],
            'reason_code' => ['exclude_if:decision,approve', 'required', Rule::enum(ModerationReasonCode::class)],
            'reason' => ['nullable', 'string', 'max:1000', 'required_if:reason_code,'.ModerationReasonCode::Other->value],
        ];
    }
}
