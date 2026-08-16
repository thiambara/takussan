<?php

namespace App\Http\Requests\Agency;

use App\Http\Requests\BaseFormRequest;
use App\Models\AgencyRole;
use App\Models\Enums\Capability;
use Illuminate\Validation\Rule;

/**
 * TCK-279 — remplacement en bloc des capacités d'un rôle (AC6).
 *
 * `capabilities` est un tableau **présent et éventuellement vide** : vider
 * un rôle est une opération légitime, et `required` la refuserait.
 * Toute valeur hors de l'enum `Capability` → 422 (spec §53 : le catalogue
 * est code-defined, aucune FK ne le garde en base).
 */
class SyncCapabilitiesRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $role = $this->route('role');

        return $role instanceof AgencyRole
            && $this->user()?->can('syncCapabilities', $role) === true;
    }

    /**
     * @return array<string,mixed>
     */
    public function rules(): array
    {
        return [
            'capabilities' => ['present', 'array'],
            'capabilities.*' => [
                'string',
                Rule::enum(Capability::class),
                // `Rule::enum` seul accepte TOUT cas du catalogue, y compris
                // les deux réservées plateforme — ce par quoi un agency_admin
                // se les accordait à lui-même (cf. `Capability::platformReserved()`).
                Rule::notIn(array_map(
                    static fn (Capability $c): string => $c->value,
                    Capability::platformReserved(),
                )),
            ],
        ];
    }

    /**
     * @return array<string,string>
     */
    public function messages(): array
    {
        return [
            'capabilities.*.not_in' => 'Cette capacité est réservée à la plateforme : '
                .'aucun rôle d\'agence ne peut la porter.',
        ];
    }
}
