<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-599 — la désinscription. Le jeton arrive dans le corps (page à un bouton) OU dans la
 * chaîne de requête : un client de messagerie qui applique RFC 8058 POSTe sur l'URI de
 * `List-Unsubscribe` telle quelle, avec un corps `List-Unsubscribe=One-Click`.
 */
class UnsubscribePublicSearchAlertRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        if (! $this->filled('token') && is_string($this->query('token'))) {
            $this->merge(['token' => $this->query('token')]);
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'token' => ['required', 'string', 'max:100'],
        ];
    }
}
