<?php

namespace App\Http\Requests\Maintenance;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class SubmitQuoteRequest extends FormRequest
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
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'amount' => ['required', 'numeric', 'min:0'],
            'currency' => ['nullable', 'string', 'max:3'],
            'attachments' => ['nullable', 'array', 'max:5'],
            // TCK-592 — PDF ou image SEULEMENT. Sans `mimes`, tout fichier partait dans `quotes`, et la
            // sortie privée sert un média avec son type, en `inline` : un `.html` ou un `.svg` déposé
            // par un prestataire se serait ouvert dans le navigateur de l'agence le jour où la fiche
            // expose `media.quotes`.
            'attachments.*' => ['file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:5120'], // 5MB max
        ];
    }
}
