<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RejectPropertyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'rejection_reason' => ['required', 'string', 'min:20', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'rejection_reason.required' => __('moderation.rejection_reason.required'),
            'rejection_reason.min' => __('moderation.rejection_reason.min'),
            'rejection_reason.max' => __('moderation.rejection_reason.max'),
        ];
    }
}
