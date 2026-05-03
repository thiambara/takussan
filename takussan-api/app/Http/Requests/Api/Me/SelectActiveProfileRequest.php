<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\BaseFormRequest;

class SelectActiveProfileRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'profile_id' => ['required', 'string', 'regex:/^(owner|agent|broker|service_provider):\d+$/'],
        ];
    }
}
