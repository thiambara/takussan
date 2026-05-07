<?php

namespace App\Http\Requests\Api\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $plan = $this->route('plan');

        return [
            'code' => ['sometimes', 'string', 'max:64', 'alpha_dash', Rule::unique('plans', 'code')->ignore($plan?->id)],
            'label' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'monthly_price_xof' => ['sometimes', 'numeric', 'min:0'],
            'platform_fee_pct' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'trial_days' => ['sometimes', 'integer', 'min:0', 'max:365'],
            'limits' => ['nullable', 'array'],
            'limits.max_active_listings' => ['nullable', 'integer', 'min:0'],
            'limits.max_agents' => ['nullable', 'integer', 'min:0'],
            'limits.max_branches' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],
        ];
    }
}
