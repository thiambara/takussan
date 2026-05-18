<?php

namespace App\Http\Requests\Api\Admin;

use Illuminate\Foundation\Http\FormRequest;

class AssignAgencySubscriptionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'plan_id' => ['required', 'integer', 'exists:plans,id'],
            'trial_ends_at' => ['nullable', 'date', 'after:now'],
            'overrides' => ['nullable', 'array'],
            'overrides.platform_fee_pct' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'overrides.limits' => ['nullable', 'array'],
            'overrides.limits.max_active_listings' => ['nullable', 'integer', 'min:0'],
            'overrides.limits.max_agents' => ['nullable', 'integer', 'min:0'],
            'overrides.limits.max_branches' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
