<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCustomerRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array|string>
     */
    public function rules(): array
    {
        return [
            'first_name' => 'sometimes|string|max:255',
            'last_name' => 'sometimes|string|max:255',
            'email' => [
                'nullable',
                'email',
                Rule::unique('customers')->ignore($this->route('customer')),
            ],
            'phone' => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('customers')->ignore($this->route('customer')),
            ],
            'birth_date' => 'nullable|date',
            'status' => 'nullable|string|in:active,inactive,blocked,deleted',
            'metadata' => 'nullable|json',
        ];
    }
}
