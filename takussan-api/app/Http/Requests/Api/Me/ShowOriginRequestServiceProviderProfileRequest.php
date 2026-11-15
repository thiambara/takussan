<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\BaseFormRequest;
use App\Support\Http\ParametreUnique;

/**
 * TCK-2613 — `GET /api/me/profiles/{sp_profile}/intervention-d-origine` : la demande d'intervention qui attend le
 * prestataire invité, à l'écran 2 de son assistant. La porte est la policy (`viewOriginRequest`, le titulaire
 * seul), invoquée avant la validation.
 *
 * `fields[intervention_d_origine]` : les blocs voulus, séparés par des virgules, parmi {@see self::CHAMPS} ;
 * tous sans le paramètre, un nom inconnu ignoré, `id` toujours rendu. Une valeur reçue en liste vaut absente
 * (ADR-0075), comme `fields[radar_observatory]`.
 */
class ShowOriginRequestServiceProviderProfileRequest extends BaseFormRequest
{
    /** Ce que la projection peut rendre — jamais l'adresse exacte, le demandeur ni son téléphone. */
    public const CHAMPS = ['title', 'category', 'place', 'photo', 'quote'];

    public function authorize(): bool
    {
        return $this->user()?->can('viewOriginRequest', $this->route('sp_profile')) === true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['fields' => ['intervention_d_origine' => ParametreUnique::chaine($this, 'fields.intervention_d_origine')]]);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'fields.intervention_d_origine' => ['nullable', 'string', 'max:200'],
        ];
    }

    /** @return list<string> les blocs demandés, connus seulement */
    public function champs(): array
    {
        $demandes = $this->validated('fields.intervention_d_origine');
        if ($demandes === null) {
            return self::CHAMPS;
        }

        return array_values(array_intersect(self::CHAMPS, array_map('trim', explode(',', (string) $demandes))));
    }
}
