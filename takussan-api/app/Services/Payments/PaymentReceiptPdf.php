<?php

namespace App\Services\Payments;

use App\Models\BookingPayment;
use App\Models\LeasePayment;
use App\Services\Pdf\DocumentPdfService;

/**
 * TCK-172 — render a PDF receipt for a paid booking or lease payment.
 * The view (`payments/receipt.blade.php`) is the single source of truth for
 * the receipt layout; this service handles the HTML→PDF leg.
 *
 * ⚠ Le rendu passe par `DocumentPdfService`, et il DOIT y passer (TCK-354).
 *
 * Cette classe instanciait `new Dompdf(…)` en dur. `dompdf/dompdf` n'est
 * déclaré NULLE PART dans `composer.json` — il n'arrive qu'en développement, et
 * transitivement, par `phpoffice/phpspreadsheet` et `spatie/laravel-pdf`.
 * `deploy.sh` installant en `--no-dev`, la classe était absente de toute
 * release déployée et l'endpoint rendait 500. Mesuré le 2026-08-24 sur la
 * préproduction :
 *
 *     driver configure : cloudflare
 *     ECHEC : Error — Class "Dompdf\Options" not found
 *
 * Le serveur déclarait DÉJÀ `LARAVEL_PDF_DRIVER=cloudflare`, et le reçu
 * échouait quand même : ce chemin-ci ne consultait pas le pilote. *Un réglage
 * ne corrige que le code qui le lit, et une abstraction ne protège que les
 * appelants qui passent par elle.*
 *
 * `scripts/check-deps-dev-atteignables.mjs` refuse désormais tout `use` de
 * `app/` vers un paquet que `composer.lock` ne connaît qu'en `packages-dev`.
 */
class PaymentReceiptPdf
{
    public function __construct(protected DocumentPdfService $documents) {}

    public function forBookingPayment(BookingPayment $payment): string
    {
        $payment->loadMissing(['booking.property.address', 'booking.customer', 'booking.agency']);

        return $this->documents->render('payments.receipt', [
            'kind' => 'booking',
            'payment' => $payment,
            'reference' => $payment->receipt_number ?? $payment->reference_number,
            'amount' => (float) $payment->amount,
            'currency' => $payment->currency?->value ?? 'XOF',
            'paid_at' => $payment->paid_at,
            'method' => $payment->payment_method?->value,
            'type' => $payment->payment_type?->value,
            'property' => $payment->booking?->property,
            'customer' => $payment->booking?->customer,
            'agency' => $payment->booking?->agency,
            'context_label' => 'Réservation #'.($payment->booking?->reference_number ?? $payment->booking_id),
            'title' => 'Quittance de paiement',
            'document_label' => 'Quittance',
        ]);
    }

    public function forLeasePayment(LeasePayment $payment): string
    {
        $payment->loadMissing(['lease.property.address', 'lease.tenant', 'lease.agency']);

        return $this->documents->render('payments.receipt', [
            'kind' => 'lease',
            'payment' => $payment,
            'reference' => $payment->receipt_number ?? $payment->reference_number,
            'amount' => (float) $payment->amount,
            'currency' => $payment->currency?->value ?? 'XOF',
            'paid_at' => $payment->paid_at,
            'method' => $payment->payment_method?->value,
            'type' => $payment->payment_type?->value,
            'property' => $payment->lease?->property,
            'customer' => $payment->lease?->tenant,
            'agency' => $payment->lease?->agency,
            'context_label' => 'Bail #'.($payment->lease?->reference_number ?? $payment->lease_id)
                .' · '.optional($payment->period_start)->format('Y-m-d').' → '.optional($payment->period_end)->format('Y-m-d'),
            'title' => 'Quittance de paiement',
            'document_label' => 'Quittance',
        ]);
    }
}
