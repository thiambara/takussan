<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PaymentMethod;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Validation\Rule;

/**
 * TCK-593 — `POST lease-payments/{payment}/late-fee/mark-paid` : la pénalité réglée à l'agence.
 */
class MarkLateFeePaidRequest extends BaseFormRequest
{
    /**
     * Même autorisation que l'encaissement du loyer (`MarkPaidLeasePaymentRequest`) :
     * `LeasePolicy::recordPayment` (TCK-587) — le personnel titulaire de `payments.record`, ou le
     * bailleur du bail tant qu'il n'est pas bloqué dans l'agence (`landlordWrites`). Le locataire en
     * est exclu : `LeasePaymentPolicy::update`, que le ticket nommait, l'admet (c'est elle qui ouvre
     * le checkout), et il aurait pu déclarer sa propre pénalité réglée.
     */
    public function authorize(): bool
    {
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
            // TCK-593 (vérification adverse, V7) — un règlement ne se date pas dans le futur.
            'paid_at' => ['nullable', 'date', 'before_or_equal:now'],
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
            // Passe 2, M5 — passer outre au checkout ouvert, motif obligatoire.
            'override_open_checkout' => ['sometimes', 'boolean'],
            'override_reason' => ['nullable', 'string', 'max:500', 'required_if_accepted:override_open_checkout'],
        ];
    }
}
