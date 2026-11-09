<?php

namespace App\Http\Requests;

use App\Domain\Settings\AgencySettings;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\Currency;
use App\Services\Admin\PlatformSettingService;
use App\Support\TelephoneSaisi;
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
        // TCK-2024 (P116.02) — `configure` : `update()` ET `agency.update`.
        return $this->user()?->can('configure', $this->route('agency')) === true;
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
     * TCK-2504 — les numéros de paiement hors ligne passent par la normalisation de tout téléphone
     * saisi (`TelephoneSaisi`, E.164), puis par ses règles (`AgencySettings`).
     */
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();

        $settings = $this->input('settings');
        if (! is_array($settings)) {
            return;
        }
        foreach (AgencySettings::PHONE_KEYS as $key) {
            if (array_key_exists($key, $settings)) {
                $settings[$key] = TelephoneSaisi::normaliser($settings[$key]);
            }
        }
        $this->merge(['settings' => $settings]);
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            // TCK-1106 (P91.01) — les bornes des colonnes (`name`, `license_number` en 255,
            // `phone` en 30) : au-delà, 422 sur la clé, et non le 500 de PostgreSQL.
            'name' => ['sometimes', 'string', 'max:255'],
            // TCK-1105 (P92.04) — unique sur toutes les lignes, supprimées comprises, comme la
            // contrainte ; l'agence modifiée ne se compte pas elle-même.
            'license_number' => [
                'sometimes', 'nullable', 'string', 'max:255',
                Rule::unique('agencies', 'license_number')->ignore($this->route('agency')),
            ],
            'description' => ['sometimes', 'nullable', 'string'],
            // TCK-2518 — la vitrine de la fiche publique : accroche, « Pourquoi nous » (trois chaînes),
            // sélection (six biens DE CETTE AGENCE au plus, dans l'ordre choisi). Un bien d'une autre
            // agence rend 422 et rien n'est écrit ; un bien de l'agence devenu non public reste
            // sélectionnable — c'est la lecture publique qui le saute.
            'tagline' => ['sometimes', 'nullable', 'string', 'max:120'],
            'highlights' => ['sometimes', 'nullable', 'array', 'list', 'max:3'],
            'highlights.*' => ['required', 'string', 'max:80'],
            'showcase_property_ids' => ['sometimes', 'nullable', 'array', 'list', 'max:6'],
            'showcase_property_ids.*' => [
                'required', 'integer', 'distinct',
                Rule::exists('properties', 'id')
                    ->where('agency_id', $this->route('agency') instanceof Agency ? $this->route('agency')->getKey() : 0)
                    ->whereNull('deleted_at'),
            ],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:30'],
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
            // TCK-2488 — une liste hors de sa borne ne fait pas valider ses éléments un à un : le
            // mécanisme commun de `BaseFormRequest` (`BorneLesReglesDElement`) le tient, sur le `max:`
            // de la liste comme sur le `prohibited` posé ci-dessous pour une agence `individual`.
            ...AgencySettings::rules(),
            // TCK-2483 (ADR-0089, amendement) — une agence `individual` n'a pas d'équipe dont masquer
            // le menu : la clé y serait un réglage sans effet. `null` et `[]` passent (`prohibited`).
            ...($this->isIndividual() ? ['settings.hidden_modules' => ['prohibited']] : []),
            // TCK-2487 — ni d'équipe à qui exiger la 2FA : l'hôte la porte déjà en tant qu'admin
            // d'agence (`TwoFactorRequirement::requiredAtAgency`), l'interrupteur n'y change rien.
            // `null` passe (`prohibited`) et retire une valeur ancienne.
            ...($this->isIndividual() ? ['settings.require_team_two_factor' => ['prohibited']] : []),
            // TCK-594 (ADR-0039 §4) — qui le modifie : `AgencyPolicy::updatePayoutThreshold`.
            'payout_approval_threshold' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:999999999999'],
            // TCK-594 (ADR-0039 §7) — TVA par défaut des factures (un taux explicite gagne).
            'default_tax_rate' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            ...$this->legalRules(),
            'slug' => $this->slugRules(),
        ];
    }

    /**
     * TCK-1004 (P49.04) — le slug ne s'édite qu'une fois, sur une agence passée en professionnelle
     * (`Agency::slugEditableOnce()`). Partout ailleurs il est `prohibited` : `validated()` l'écartait
     * jusqu'ici sans un mot.
     *
     * @return array<int, mixed>
     */
    private function slugRules(): array
    {
        $agency = $this->route('agency');
        if (! $agency instanceof Agency || ! $agency->slugEditableOnce()) {
            return ['prohibited'];
        }

        return [
            'sometimes', 'required', 'string', 'max:100', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
            // Toutes les lignes, supprimées comprises : l'index unique de la colonne les compte.
            Rule::unique('agencies', 'slug')->ignore($agency->getKey()),
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
