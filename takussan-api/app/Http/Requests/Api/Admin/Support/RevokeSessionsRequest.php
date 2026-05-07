<?php

namespace App\Http\Requests\Api\Admin\Support;

class RevokeSessionsRequest extends SupportActionRequest
{
    public function rules(): array
    {
        return parent::rules() + [
            'keep_current_session' => ['sometimes', 'boolean'],
        ];
    }
}
