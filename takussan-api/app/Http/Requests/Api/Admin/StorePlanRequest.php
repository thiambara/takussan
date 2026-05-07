<?php

namespace App\Http\Requests\Api\Admin;

use Illuminate\Foundation\Http\FormRequest;

class StorePlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'code' => ['required', 'string', 'max:64', 'alpha_dash', 'unique:plans,code'],
            'label' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'monthly_price_xof' => ['required', 'numeric', 'min:0'],
            'platform_fee_pct' => ['required', 'numeric', 'min:0', 'max:100'],
            'trial_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'limits' => ['nullable', 'array'],
            'limits.max_active_listings' => ['nullable', 'integer', 'min:0'],
            'limits.max_agents' => ['nullable', 'integer', 'min:0'],
            'limits.max_branches' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],
        ];
    }
}
