<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PaymentMethod;
use App\Models\Payout;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de PayoutController::markProcessed(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class MarkProcessedPayoutRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * **Simple DÉLÉGATION** : la règle vit dans sa policy, cette méthode ne fait que l'invoquer —
     * aucune règle d'autorisation n'a migré ici (AC4).
     */
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('payout')) === true;
    }

    /**
     * TCK-594 (ADR-0039 §4, §6) — la référence est obligatoire hors espèces
     * (`required_unless:payment_method,cash`, le moyen se lisant sur la requête, à défaut sur le
     * reversement) ; en espèces, une note suffit. Le moyen est exigé s'il n'est pas déjà connu.
     *
     * Point de raccord TCK-589 : le step-up 2FA s'ajoute sur la route, pas ici.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $payout = $this->route('payout');
        $known = $payout instanceof Payout ? $payout->payment_method?->value : null;
        $method = $this->input('payment_method') ?? $known;

        return [
            'payment_method' => [$known === null ? 'required' : 'nullable', Rule::enum(PaymentMethod::class)],
            'transaction_id' => [$method === PaymentMethod::Cash->value ? 'nullable' : 'required', 'string', 'max:255'],
            'notes' => [$method === PaymentMethod::Cash->value ? 'required_without:transaction_id' : 'nullable', 'nullable', 'string', 'max:2000'],
            'payout_method_id' => ['nullable', 'integer'],
        ];
    }
}
