<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\Currency;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentFrequency;
use App\Models\Property;
use App\Rules\PersonnelDeLAgence;
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
            // TCK-1068 (P62.01) — plus de `exists:` : jugés avant toute autorisation, ils rendaient 422
            // pour un identifiant absent quand un identifiant tiers passait, et faisaient de la création
            // un ORACLE d'existence. L'existence se juge après l'autorisation, avec la réponse du refus
            // (`LeaseController::store()`, `LeaseService::create()` ; modèle de TCK-599).
            'property_id' => ['required', 'integer'],
            'tenant_id' => ['required', 'integer'],
            'booking_id' => ['nullable', 'integer'],
            'guarantor_id' => ['nullable', 'integer'],
            'type' => ['required', Rule::enum(LeaseType::class)],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after:start_date'],
            'monthly_rent' => ['nullable', 'numeric', 'min:0'],
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
        $propertyId = $this->input('property_id');
        $agencyId = is_numeric($propertyId)
            ? Property::query()->whereKey((int) $propertyId)->value('agency_id')
            : null;

        return $agencyId !== null ? (int) $agencyId : null;
    }
}
