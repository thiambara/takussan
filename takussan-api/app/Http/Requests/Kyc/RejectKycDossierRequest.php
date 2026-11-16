<?php

namespace App\Http\Requests\Kyc;

use App\Http\Requests\BaseFormRequest;

class RejectKycDossierRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:5', 'max:2000'],
        ];
    }
}
