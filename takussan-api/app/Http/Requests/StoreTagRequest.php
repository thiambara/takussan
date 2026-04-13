<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTagRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->hasPermissionTo('tags.create');
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:50', Rule::unique('tags')],
            'slug' => ['nullable', 'string', 'max:60', Rule::unique('tags')],
            'description' => ['nullable', 'string', 'max:255'],
            'type' => ['required', 'string', 'in:property,customer,general'],
            'color' => ['nullable', 'string', 'max:20'],
        ];
    }
}
