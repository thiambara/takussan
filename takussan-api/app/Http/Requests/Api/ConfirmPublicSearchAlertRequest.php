<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/** TCK-599 — la confirmation : le jeton du lien e-mail, OU le numéro et son code. */
class ConfirmPublicSearchAlertRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'token' => ['required_without:phone', 'nullable', 'string', 'max:100'],
            'phone' => ['required_without:token', 'nullable', 'string', 'max:20'],
            'code' => ['required_with:phone', 'nullable', 'string', 'digits:6'],
        ];
    }
}
