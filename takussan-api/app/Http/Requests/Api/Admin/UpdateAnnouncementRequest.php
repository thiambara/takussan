<?php

namespace App\Http\Requests\Api\Admin;

use Illuminate\Validation\Rule;

class UpdateAnnouncementRequest extends StoreAnnouncementRequest
{
    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'array'],
            'title.fr' => ['required_with:title', 'string', 'max:160'],
            'title.en' => ['required_with:title', 'string', 'max:160'],
            'title.wo' => ['required_with:title', 'string', 'max:160'],
            'body' => ['sometimes', 'array'],
            'body.fr' => ['required_with:body', 'string', 'max:4000'],
            'body.en' => ['required_with:body', 'string', 'max:4000'],
            'body.wo' => ['required_with:body', 'string', 'max:4000'],
            'severity' => ['sometimes', Rule::in(['info', 'success', 'warning', 'critical'])],
            'segment' => ['nullable', 'array'],
            'segment.roles' => ['nullable', 'array'],
            'segment.roles.*' => ['string', 'max:80'],
            'segment.agency_ids' => ['nullable', 'array'],
            'segment.agency_ids.*' => ['integer', 'exists:agencies,id'],
            'segment.rollout_percentage' => ['nullable', 'integer', 'min:0', 'max:100'],
            'starts_at' => ['sometimes', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
