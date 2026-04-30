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
            'rejection_reason.required' => 'Une raison de rejet est obligatoire.',
            'rejection_reason.min' => 'La raison doit contenir au moins 20 caractères.',
            'rejection_reason.max' => 'La raison ne peut pas dépasser 1000 caractères.',
        ];
    }
}
