<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Services\Admin\PaymentSupervisionService;
use Illuminate\Validation\Rule;

/**
 * TCK-602 — `GET /api/admin/payments` : `filter[status]=failed|late`, `filter[provider]`,
 * `filter[agency_id]`, et une période `filter[from]` / `filter[to]` (30 derniers jours par défaut).
 */
class IndexPaymentSupervisionRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'filter' => ['sometimes', 'array'],
            'filter.status' => ['sometimes', 'nullable', Rule::in([PaymentSupervisionService::STATUS_FAILED, PaymentSupervisionService::STATUS_LATE])],
            'filter.provider' => ['sometimes', 'nullable', 'string', 'max:60'],
            'filter.agency_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'filter.from' => ['sometimes', 'nullable', 'date'],
            'filter.to' => ['sometimes', 'nullable', 'date', 'after_or_equal:filter.from'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }
}
