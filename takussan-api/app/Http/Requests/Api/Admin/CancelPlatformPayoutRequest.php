<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

class CancelPlatformPayoutRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:3', 'max:1000'],
        ];
    }
}
