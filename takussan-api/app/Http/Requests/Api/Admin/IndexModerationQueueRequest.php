<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de `ModerationQueueController::index()`.
 *
 * Ce site-là ne comptait pas dans les 120 : il n'écrivait pas `$request->validate()` mais
 * `validator([...], [...])->validate()`, avec un tableau reconstruit à la main à partir de la
 * requête. Même défaut, autre orthographe — et c'était exactement l'échappatoire par laquelle la
 * garde aurait pu être contournée sans mentir. `scripts/check-inline-validation.mjs` interdit donc
 * les deux formes.
 *
 * Les valeurs par défaut ne sont **pas** reproduites ici : le contrôleur les applique déjà par
 * `?? '-reported_at'` / `?? 20`. L'ancien code les posait deux fois, avant et après validation.
 */
class IndexModerationQueueRequest extends BaseFormRequest
{
    /**
     * L'autorisation NE migre PAS ici : la route est gardée par le middleware alias `super-admin`
     * (`EnsureSuperAdmin`). `BaseFormRequest` refuse par défaut — *fail-closed* — d'où cette
     * surcharge.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'filter.type' => ['nullable', Rule::in(['property', 'review'])],
            'filter.status' => ['nullable', Rule::in(['pending', 'flagged'])],
            'filter.agency_id' => ['nullable', 'integer', 'min:1'],
            'sort' => ['nullable', Rule::in(['reported_at', '-reported_at', 'created_at', '-created_at'])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ];
    }
}
