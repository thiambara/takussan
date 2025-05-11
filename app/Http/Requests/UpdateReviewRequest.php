<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateReviewRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        $review = $this->route('review');
        return $this->user()->id === $review->user_id || 
               $this->user()->hasPermission('reviews.update');
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'model_id' => ['sometimes', 'integer'],
            'model_type' => [
                'sometimes', 
                'string', 
                Rule::in(['App\\Models\\Property'])
            ],
            'rating' => ['sometimes', 'numeric', 'min:1', 'max:5'],
            'title' => ['sometimes', 'string', 'max:255'],
            'content' => ['sometimes', 'string'],
            'is_approved' => ['sometimes', 'boolean'],
            'approved_by' => ['nullable', 'exists:users,id'],
            'approved_at' => ['nullable', 'date'],
            'reported_count' => ['sometimes', 'integer', 'min:0'],
        ];
    }

    /**
     * Prepare the data for validation.
     */
    protected function prepareForValidation()
    {
        // If the model_type doesn't have the full namespace, add it
        if ($this->filled('model_type') && !str_contains($this->model_type, '\\')) {
            $this->merge([
                'model_type' => 'App\\Models\\' . ucfirst($this->model_type)
            ]);
        }
    }
}
