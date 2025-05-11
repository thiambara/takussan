<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateTagRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->hasPermission('tags.update');
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:50', Rule::unique('tags')->ignore($this->tag)],
            'slug' => ['nullable', 'string', 'max:60', Rule::unique('tags')->ignore($this->tag)],
            'description' => ['nullable', 'string', 'max:255'],
            'type' => ['sometimes', 'required', 'string', 'in:property,customer,general'],
            'color' => ['nullable', 'string', 'max:20'],
        ];
    }
}
