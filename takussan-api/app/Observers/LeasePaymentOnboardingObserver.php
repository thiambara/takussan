<?php

namespace App\Observers;

use App\Models\LeasePayment;
use App\Models\TenantOnboardingChecklist;
use App\Services\Tenant\TenantOnboardingService;

/**
 * TCK-266 — Quand un `LeasePayment` est créé pour un bail, marque
 * `first_payment_at` sur la checklist du bail si c'est le premier
 * paiement enregistré.
 *
 * On observe `created` (insertion finalisée) plutôt que `creating` :
 * le compteur `payments()->count()` doit voir l'instance courante donc
 * être post-insert. Idempotence : `markItem` no-op si déjà set, donc un
 * 2ᵉ paiement crée le même result via la garde "count === 1" ici, et
 * de toute façon n'écraserait pas le timestamp.
 *
 * Note : `LeaseService::generateSchedule` insère N paiements `pending`
 * d'un coup à l'activation du bail. Ce n'est *pas* "le premier paiement
 * enregistré" au sens onboarding (le tenant n'a rien fait). On filtre
 * en exigeant que le payment ait soit `paid_at` non null (paiement
 * réellement reçu) soit un `payment_method` (création manuelle par
 * l'agence/tenant via le formulaire).
 */
class LeasePaymentOnboardingObserver
{
    public function __construct(private readonly TenantOnboardingService $service) {}

    public function created(LeasePayment $payment): void
    {
        if ($payment->lease_id === null) {
            return;
        }

        // Filtre les inserts massifs de l'échéancier auto (status pending,
        // pas de payment_method, pas de paid_at) — ce sont des promesses,
        // pas des paiements effectifs.
        if ($payment->paid_at === null && $payment->payment_method === null) {
            return;
        }

        $checklist = TenantOnboardingChecklist::query()
            ->where('lease_id', $payment->lease_id)
            ->first();

        if ($checklist === null) {
            return;
        }

        // Idempotence forte : on ne fait rien si l'item est déjà set.
        // (markItem aurait fait la même chose, mais on évite la query sur
        // les comptages futurs.)
        if ($checklist->first_payment_at !== null) {
            return;
        }

        $this->service->markItem($checklist, TenantOnboardingChecklist::ITEM_FIRST_PAYMENT);
    }

    public function updated(LeasePayment $payment): void
    {
        // Cas typique : le `LeaseService::generateSchedule` a inséré le
        // payment en `pending`, puis le tenant le règle → `markPaid` fait
        // un update qui pose `paid_at`. C'est ce moment qui marque le
        // premier paiement effectif.
        if (! $payment->wasChanged('paid_at')) {
            return;
        }
        if ($payment->paid_at === null) {
            return;
        }
        if ($payment->lease_id === null) {
            return;
        }

        $checklist = TenantOnboardingChecklist::query()
            ->where('lease_id', $payment->lease_id)
            ->first();

        if ($checklist === null) {
            return;
        }

        if ($checklist->first_payment_at !== null) {
            return;
        }

        $this->service->markItem($checklist, TenantOnboardingChecklist::ITEM_FIRST_PAYMENT);
    }
}
