<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RejectPropertyRequest extends FormRequest
{
    /** TCK-2672 — les motifs d'une demande de correction ; le texte reste exigé (20 caractères). */
    public const REASON_CODES = ['photos', 'price', 'address', 'description', 'other'];

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'rejection_reason' => ['required', 'string', 'min:20', 'max:1000'],
            'reason_code' => ['required', 'string', Rule::in(self::REASON_CODES)],
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
