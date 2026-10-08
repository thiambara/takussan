<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PaymentMethod;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de LeasePaymentController::markPaid(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class MarkPaidLeasePaymentRequest extends BaseFormRequest
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
        // TCK-587 — `recordPayment` et non plus `update` : encaisser exige `payments.record` pour le
        // personnel, et le bailleur du bail le peut toujours (`LeasePolicy::recordPayment`).
        return $this->user()?->can('recordPayment', $this->route('payment')?->lease) === true
            && (! $this->boolean('override_open_checkout') || $this->mayOverrideOpenCheckout());
    }

    /**
     * TCK-593 (passe 2, M5) — passer outre à un checkout ouvert est réservé au PERSONNEL de
     * l'agence du bail (prédicat de TCK-587, profil d'agent ou d'admin actif) : le bailleur, même
     * autorisé à encaisser, et le locataire ne le peuvent pas.
     *
     * Passe 3 (m2) — un bail SANS agence n'a pas de personnel : c'est son bailleur qui passe outre
     * (`landlordWrites` d'une agence `null`), sans quoi le blocage y restait sans recours. Même
     * motif obligatoire, même journal.
     */
    private function mayOverrideOpenCheckout(): bool
    {
        $lease = $this->route('payment')?->lease;
        if ($lease === null) {
            return false;
        }

        if ($lease->agency_id === null) {
            return $lease->landlord_id !== null && (int) $lease->landlord_id === $this->user()?->id;
        }

        return app(MembershipCapabilityResolver::class)->isStaffAt($this->user(), (int) $lease->agency_id);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'paid_at' => ['nullable', 'date'],
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
            'transaction_id' => ['nullable', 'string'],
            // Passe 2, M5 — passer outre au checkout ouvert, motif obligatoire.
            'override_open_checkout' => ['sometimes', 'boolean'],
            'override_reason' => ['nullable', 'string', 'max:500', 'required_if_accepted:override_open_checkout'],
        ];
    }
}
