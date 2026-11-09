<?php

namespace App\Http\Requests\Api;

use App\Http\Controllers\Api\PublicSearchAlertController;
use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2513 — « moins souvent plutôt que plus du tout » : le jeton de DÉSINSCRIPTION, et la seule fréquence que la
 * page propose (`weekly`). Rien à autoriser avant de valider : le jeton est l'autorisation, et un jeton inconnu rend
 * la même réponse qu'un succès ({@see PublicSearchAlertController::frequency()}).
 */
class UpdatePublicSearchAlertFrequencyRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'token' => ['required', 'string', 'max:100'],
            'frequency' => ['required', 'in:weekly'],
        ];
    }
}
