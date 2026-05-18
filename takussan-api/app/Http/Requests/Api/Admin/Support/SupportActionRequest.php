<?php

namespace App\Http\Requests\Api\Admin\Support;

use App\Http\Requests\BaseFormRequest;

abstract class SupportActionRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:3', 'max:500'],
        ];
    }
}
