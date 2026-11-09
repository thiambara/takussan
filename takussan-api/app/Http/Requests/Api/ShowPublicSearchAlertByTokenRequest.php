<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2513 — lire l'alerte à laquelle répond un lien (confirmation ou désinscription), par son jeton en chaîne de
 * requête. Une LECTURE : elle ne consomme ni ne confirme rien. Rien à autoriser avant de valider : le jeton EST
 * l'autorisation, et c'est le contrôleur qui le juge (404 identique pour tout jeton qui ne sert pas).
 */
class ShowPublicSearchAlertByTokenRequest extends BaseFormRequest
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
        ];
    }
}
