<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 lot F (ADR-0061 §5, AC16) — annuler un boost, en disant pourquoi et s'il est remboursé. */
class CancelBoostRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'refund' => ['required', 'boolean'],
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ];
    }
}
