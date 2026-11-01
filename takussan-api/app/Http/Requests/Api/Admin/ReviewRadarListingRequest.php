<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2387 (ADR-0077 §5) — valider une fiche relue : le geste n'a pas de corps, l'opérateur a déjà
 * corrigé par `PATCH`. La classe existe comme point d'extension (une note de relecture, plus tard).
 */
class ReviewRadarListingRequest extends BaseFormRequest
{
    /** Gardée par `super-admin` + `platform-can:platform.radar.operate` sur la route, comme la saisie. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
