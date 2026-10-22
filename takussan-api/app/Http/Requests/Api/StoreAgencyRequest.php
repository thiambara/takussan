<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\AgencyUpdateRequest;
use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\Currency;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de AgencyController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreAgencyRequest extends BaseFormRequest
{
    /**
     * L'autorisation NE migre PAS ici : elle appartient au contrôleur puis aux policies
     * (principes non négociables 1 et 2, et TCK-306). `BaseFormRequest` refuse par défaut —
     * *fail-closed* — donc sans cette surcharge l'endpoint rendrait 403 pour tout le monde.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // TCK-1106 (P91.01) — les bornes des colonnes (`name`, `license_number` en 255,
            // `phone` en 30) : au-delà, 422 sur la clé, et non le 500 de PostgreSQL.
            'name' => ['required', 'string', 'max:255'],
            // TCK-1105 (P92.04) — `agencies.license_number` est unique sur toutes les lignes,
            // supprimées comprises : la règle les compte de même (422, plus le 500 de la contrainte).
            'license_number' => ['nullable', 'string', 'max:255', Rule::unique('agencies', 'license_number')],
            'description' => ['nullable', 'string'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'website' => ['nullable', 'url'],
            'commission_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            // TCK-600 — les devises que la plateforme accepte (`currency.supported`), pas tout l'enum.
            'currency' => ['nullable', Rule::enum(Currency::class), Rule::in(AgencyUpdateRequest::supportedCurrencies())],
            // P147.07 (TCK-1279) — pas de `status` : l'agence naît `active`, et seuls les gestes de
            // la console (`suspend`, `unverify`, `reinstate`) le changent.
        ];
    }
}
