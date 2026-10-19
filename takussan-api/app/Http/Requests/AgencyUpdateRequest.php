<?php

namespace App\Http\Requests;

use App\Domain\Settings\AgencySettings;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\Currency;
use App\Services\Admin\PlatformSettingService;
use Illuminate\Validation\Rule;

/**
 * TCK-084 — typed validator for the `PATCH /api/agencies/{id}` payload.
 *
 * The rule lives in `AgencyPolicy::update`; `authorize()` calls it so the refusal
 * precedes validation (TCK-816). Adding the rules here lets us exercise the multi-
 * currency contract under unit tests without spinning the full HTTP stack.
 */
class AgencyUpdateRequest extends BaseFormRequest
{
    /**
     * TCK-816 (P22.01) — l'ability que le contrôleur juge, appelée ici pour que le refus précède la
     * validation : `true` sec rendait 422 et les noms des champs à un compte sans lien.
     */
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('agency')) === true;
    }

    /**
     * TCK-600 — le lecteur de `currency.supported` : sans lui, la clé s'éditait dans la console et
     * ne restreignait rien.
     *
     * @return list<string>
     */
    public static function supportedCurrencies(): array
    {
        return array_values(array_map(
            'strtoupper',
            (array) app(PlatformSettingService::class)->getValue('currency.supported'),
        ));
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string'],
            'license_number' => ['sometimes', 'nullable', 'string'],
            'description' => ['sometimes', 'nullable', 'string'],
            'email' => ['sometimes', 'nullable', 'email'],
            'phone' => ['sometimes', 'nullable', 'string'],
            'website' => ['sometimes', 'nullable', 'url'],
            'commission_rate' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            // TCK-600 — les devises que la plateforme accepte (`currency.supported`), pas tout l'enum.
            'currency' => ['sometimes', Rule::enum(Currency::class), Rule::in(self::supportedCurrencies())],
            // TCK-597 — l'agence choisit de modérer ses annonces. TCK-686 — pas une agence
            // `individual` : sa file de modération n'existe pas (la page exige `standard`), et ses
            // biens resteraient en attente pour toujours. `false` reste accepté.
            'moderation_required' => ['sometimes', 'boolean', ...($this->isIndividual() ? ['declined'] : [])],
            // TCK-593 — plus `nullable` : `settings` se FUSIONNE clé par clé dans
            // `AgencyController::update`, et un `null` au premier niveau ne dit pas quelle clé
            // retirer. Une clé à `null`, elle, revient au défaut du code.
            'settings' => ['sometimes', 'array'],
            // TCK-970 — les clés de `settings`, leur type et leur défaut : une seule liste, que lit
            // aussi `Agency::setting()`.
            ...AgencySettings::rules(),
            // TCK-594 (ADR-0039 §4) — qui le modifie : `AgencyPolicy::updatePayoutThreshold`.
            'payout_approval_threshold' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:999999999999'],
            // TCK-594 (ADR-0039 §7) — TVA par défaut des factures (un taux explicite gagne).
            'default_tax_rate' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            ...$this->legalRules(),
        ];
    }

    /**
     * TCK-594 (ADR-0039 §7) — les mentions légales d'une personne morale. Une agence `individual`
     * (l'hôte) n'en a pas : elles y sont `prohibited`. Aucun contrôle de forme du NINEA ni du RCCM
     * (dette D-68) : seulement une longueur.
     *
     * @return array<string, array<int, mixed>>
     */
    private function legalRules(): array
    {
        $individual = $this->isIndividual();

        $rules = [
            'legal_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'ninea' => ['sometimes', 'nullable', 'string', 'max:30'],
            'rccm' => ['sometimes', 'nullable', 'string', 'max:30'],
            'legal_address' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ];

        return $individual ? array_map(static fn (): array => ['prohibited'], $rules) : $rules;
    }

    private function isIndividual(): bool
    {
        $agency = $this->route('agency');

        return $agency instanceof Agency && $agency->kind === AgencyKind::Individual;
    }
}
