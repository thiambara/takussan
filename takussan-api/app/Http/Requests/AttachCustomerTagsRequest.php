<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\BorneLesReglesDElement;
use Illuminate\Foundation\Http\FormRequest;

class AttachCustomerTagsRequest extends FormRequest
{
    // TCK-2488 — une liste hors de sa borne ne fait pas valider ses éléments un à un (hérité de
    // `BaseFormRequest` par les autres : cette requête l'étend encore en direct, TCK-730).
    use BorneLesReglesDElement;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // TCK-2488 — borne technique : `CustomerTagPicker` envoie une étiquette à la fois.
            'tags' => ['required', 'array', 'min:1', 'max:100'],
            'tags.*' => ['required', 'string', 'max:100'],
        ];
    }

    /** Returns normalized (lowercase, trimmed) unique tag names from the request. */
    public function normalizedNames(): array
    {
        $names = array_map(
            fn (string $n) => mb_strtolower(trim($n)),
            $this->input('tags', []),
        );

        return array_values(array_unique(array_filter($names)));
    }
}
