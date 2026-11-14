<?php

namespace App\Http\Requests\Api;

use App\Domain\Settings\EditablePlatformSettings;
use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\Currency;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentFrequency;
use App\Models\Lease;
use App\Models\Property;
use App\Rules\JourIso;
use App\Rules\PersonnelDeLAgence;
use App\Services\Lease\EarlyTerminationService;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de LeaseController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreLeaseRequest extends BaseFormRequest
{
    /**
     * TCK-1240 (P114.01) — borne des conditions particulières, celle du schéma du front. Relue par
     * `RenewLeaseRequest` (P209.05, TCK-2177) : un renouvellement crée aussi une ligne `leases`.
     */
    public const SPECIAL_CONDITIONS_MAX = 5000;

    /** Le bien jugé par `authorize()`, relu par `propertyAgencyId()` sans seconde requête. */
    private ?Property $property = null;

    /**
     * TCK-2767 — ouvrir un bail SUR CE BIEN se juge ici, AVANT `rules()` (piège 2 de
     * `takussan-api/CLAUDE.md`) : `true` sec rendait à l'appelant sans droit sur le bien un 422
     * détaillant les règles du bail pour un corps invalide, et le 403 seulement pour un corps
     * valide. La RÈGLE reste dans `LeasePolicy::createOn()`, celle que lit aussi
     * `LeaseDefaultsRequest` : la lecture et l'écriture d'un même droit répondent pareil.
     *
     * Un `property_id` manquant, non entier, absent ou d'une autre agence rend le même refus — la
     * propriété de TCK-1068 (pas d'oracle d'existence) tient. Le locataire, le garant et la
     * réservation restent jugés après la validation, dans `LeaseService::create()`, qui garde
     * aussi le contrôle du bien : la défense en profondeur ne bouge pas.
     */
    public function authorize(): bool
    {
        $id = filter_var($this->input('property_id'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        $this->property = $id === false ? null : Property::query()->find($id);

        return $this->property !== null && $this->user()?->can('createOn', [Lease::class, $this->property]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // TCK-1068 (P62.01) — plus de `exists:` : jugés avant toute autorisation, ils rendaient 422
            // pour un identifiant absent quand un identifiant tiers passait, et faisaient de la création
            // un ORACLE d'existence. L'existence se juge après l'autorisation, avec la réponse du refus
            // (`LeaseController::store()`, `LeaseService::create()` ; modèle de TCK-599).
            'property_id' => ['required', 'integer'],
            'tenant_id' => ['required', 'integer'],
            'booking_id' => ['nullable', 'integer'],
            'guarantor_id' => ['nullable', 'integer'],
            'type' => ['required', Rule::enum(LeaseType::class)],
            'start_date' => ['required', 'date', new JourIso],
            'end_date' => ['nullable', 'date', new JourIso, 'after:start_date'],
            'monthly_rent' => ['nullable', 'numeric', 'min:0'],
            // TCK-2679 — les charges mensuelles, terme imprimé au contrat et appelé par l'échéancier.
            'monthly_charges' => ['nullable', 'numeric', 'min:0'],
            // TCK-2643 — la pénalité de retard, l'indemnité de départ anticipé et le plafond de
            // révision s'écrivent dès la création (préremplis par `GET /api/leases/defaults`), aux
            // bornes d'`UpdateLeaseRequest` : ils ne s'écrivaient qu'après coup, par PATCH.
            'late_fee_percent' => ['nullable', 'numeric', 'between:0,50'],
            'late_fee_grace_days' => ['nullable', 'integer', 'between:0,30'],
            'early_termination_penalty_months' => ['nullable', 'integer', ...EditablePlatformSettings::reglesDeBornes(EarlyTerminationService::SETTING_KEY)], // TCK-2842
            'rent_review_max_pct' => ['nullable', 'numeric', 'between:0,100'],
            'sale_price' => ['nullable', 'numeric', 'min:0'],
            'deposit_amount' => ['nullable', 'numeric', 'min:0'],
            'commission_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            // TCK-595 (ADR-0049 §2) — la base du grand livre. Absente des règles, elle était écartée par
            // `validated()` : un bail créé par l'API naissait sans commission, et la tuile restait à 0.
            'commission_amount' => ['nullable', 'numeric', 'min:0'],
            // TCK-595 (ADR-0049 §1) — le négociateur : personnel actif de l'agence DU BIEN, jamais un
            // bailleur, un client ni le compte d'une autre agence. Un bien sans agence n'en a aucun.
            'agent_id' => ['nullable', 'integer', new PersonnelDeLAgence($this->propertyAgencyId())],
            'payment_frequency' => ['nullable', Rule::enum(PaymentFrequency::class)],
            'payment_day' => ['nullable', 'integer', 'between:1,28'],
            'currency' => ['nullable', Rule::enum(Currency::class)],
            'terms' => ['nullable', 'string'],
            // TCK-1240 (P114.01) — le formulaire de création l'envoie ; absente des règles, `validated()`
            // l'écartait et le bail naissait sans ses conditions particulières. Borne du schéma du front.
            'special_conditions' => ['nullable', 'string', 'max:'.self::SPECIAL_CONDITIONS_MAX],
        ];
    }

    private function propertyAgencyId(): ?int
    {
        $agencyId = $this->property?->agency_id;

        return $agencyId !== null ? (int) $agencyId : null;
    }
}
