<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\ContractType;
use Illuminate\Validation\Rule;

/**
 * TCK-1730 (P168.02) — la page paginée du portefeuille d'un profil public (agent ou agence).
 *
 * `filter[contract_type]` (`rent`|`sale`, exact) borne la page à un contrat : chaque onglet du
 * portefeuille se charge par l'API, au lieu de filtrer côté client les seuls biens déjà chargés.
 * Une autre valeur rend 422 — y compris pour un profil inconnu, la validation précédant le
 * contrôleur ; sans le filtre, rien ne change (404 pour un profil inconnu).
 */
class PublicPortfolioRequest extends BaseFormRequest
{
    /** Route publique : le périmètre est le portefeuille publié. `BaseFormRequest` refuse par défaut. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'filter.contract_type' => ['nullable', Rule::enum(ContractType::class)],
            // TCK-1853 (P187.06) — validé comme sur les autres listes publiques ; la borne haute
            // reste le `min(…, 48)` des deux contrôleurs, pour ne refuser aucune page servie.
            'per_page' => 'nullable|integer|min:1',
        ];
    }

    public function contractType(): ?ContractType
    {
        return ContractType::tryFrom((string) $this->input('filter.contract_type', ''));
    }
}
