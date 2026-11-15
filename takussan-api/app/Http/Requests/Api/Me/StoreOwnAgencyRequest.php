<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\BaseFormRequest;
use App\Support\TelephoneSaisi;
use Illuminate\Validation\Rule;

/**
 * TCK-2937 (ADR-0125) — `POST /api/me/agencies` : « Créer mon espace pro » depuis l'orientation.
 *
 * Les champs de l'écran : le nom de l'agence, sa ville principale (le référentiel,
 * `GET /api/public/geo/cities`), son téléphone (à défaut, celui du compte). Le NINEA est facultatif ;
 * s'il est donné et déjà porté par une autre agence, le service refuse (`agency.ninea_taken`).
 * L'autorisation (déjà admin d'une agence → 409) est jugée par le service, sous verrou.
 */
class StoreOwnAgencyRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $nettoye = [];
        foreach (['name', 'phone', 'ninea'] as $champ) {
            $valeur = $this->input($champ);
            if (is_string($valeur)) {
                $valeur = trim($valeur);
                $nettoye[$champ] = $valeur === '' ? null : $valeur;
            }
        }
        if (array_key_exists('phone', $nettoye)) {
            $nettoye['phone'] = TelephoneSaisi::normaliser($nettoye['phone']);
        }

        $this->merge($nettoye);
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:160'],
            'geo_city_id' => ['nullable', 'integer', 'min:1', 'max:9223372036854775807', Rule::exists('geo_cities', 'id')],
            'phone' => ['nullable', 'string', 'max:30', new TelephoneSaisi],
            'ninea' => ['nullable', 'string', 'max:30'],
        ];
    }
}
