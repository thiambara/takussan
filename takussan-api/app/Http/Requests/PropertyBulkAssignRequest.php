<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * TCK-603 (ADR-0059 §2) — `POST /api/properties/bulk-assign` : changer l'agent responsable d'un lot.
 *
 * Même forme que `bulk-visibility` (TCK-591) : un identifiant inconnu n'est pas une erreur de
 * validation, il revient en `not_found` dans le bilan ; l'autorisation se juge bien par bien, dans le
 * service. La cible doit exister ; qu'elle soit du personnel actif de l'agence de CHAQUE bien se juge
 * ligne à ligne (`invalid_target`).
 */
class PropertyBulkAssignRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'property_ids' => ['required', 'array', 'min:1', 'max:100'],
            'property_ids.*' => ['integer', 'distinct'],
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ];
    }
}
