<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use Illuminate\Validation\Rule;

class StoreAnnouncementRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() ?? false;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'array'],
            'title.fr' => ['required', 'string', 'max:160'],
            'title.en' => ['required', 'string', 'max:160'],
            'title.wo' => ['required', 'string', 'max:160'],
            'body' => ['required', 'array'],
            'body.fr' => ['required', 'string', 'max:4000'],
            'body.en' => ['required', 'string', 'max:4000'],
            'body.wo' => ['required', 'string', 'max:4000'],
            'severity' => ['required', Rule::in(['info', 'success', 'warning', 'critical'])],
            'segment' => ['nullable', 'array'],
            'segment.roles' => ['nullable', 'array'],
            'segment.roles.*' => ['string', 'max:80'],
            'segment.agency_ids' => ['nullable', 'array'],
            'segment.agency_ids.*' => ['integer', 'exists:agencies,id'],
            'segment.rollout_percentage' => ['nullable', 'integer', 'min:0', 'max:100'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
