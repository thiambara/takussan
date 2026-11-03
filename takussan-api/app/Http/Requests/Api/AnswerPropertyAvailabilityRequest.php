<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Services\Radar\Observatory\RadarAvailabilityCheck;
use Illuminate\Validation\Rule;

/**
 * TCK-2432 — la réponse du titulaire à « votre bien est-il toujours disponible ? » : loué, vendu, ou toujours disponible.
 *
 * Qui peut modifier le bien répond (la policy `update`, comme `PUT …/status` pour les statuts qui sortent un bien de la
 * vitrine) : le titulaire, et le personnel de son agence qui en a la capacité.
 */
class AnswerPropertyAvailabilityRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('property')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'answer' => ['required', 'string', Rule::in(RadarAvailabilityCheck::ANSWERS)],
        ];
    }
}
