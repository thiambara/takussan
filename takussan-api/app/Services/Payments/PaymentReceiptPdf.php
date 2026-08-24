<?php

namespace App\Services\Payments;

use App\Models\BookingPayment;
use App\Services\Pdf\DocumentPdfService;

/**
 * TCK-172 — quittance PDF d'un paiement de réservation acquitté.
 *
 * Le rendu passe par {@see DocumentPdfService}, et il DOIT y passer (TCK-354).
 *
 * Cette classe instanciait `new Dompdf(…)` en dur. `dompdf/dompdf` n'est déclaré NULLE PART
 * dans `composer.json` — il n'arrive qu'en développement, et transitivement, par les
 * `require-dev` de `phpoffice/phpspreadsheet` et `spatie/laravel-pdf`. `deploy.sh` installant
 * en `--no-dev`, la classe était absente de toute release déployée et l'endpoint rendait 500.
 * Mesuré le 2026-08-24 sur la préproduction, qui déclarait DÉJÀ
 * `LARAVEL_PDF_DRIVER=cloudflare` :
 *
 *     driver configure : cloudflare
 *     ECHEC : Error — Class "Dompdf\Options" not found
 *
 * *Un réglage ne corrige que le code qui le lit, et une abstraction ne protège que les
 * appelants qui passent par elle.*
 *
 * Deux gardes tiennent le résultat, et aucune n'est un test d'endpoint — un test qui vérifie
 * que la route rend des octets `%PDF-` reste vert quel que soit le moteur ET quel que soit le
 * gabarit :
 *   · `scripts/check-deps-dev-atteignables.mjs` refuse tout `use` de `app/` vers un paquet que
 *     `composer.lock` ne connaît qu'en `packages-dev` ;
 *   · `tests/Feature/Services/PaymentReceiptPdfTest.php` épingle le gabarit employé et les clés
 *     transmises.
 *
 * ⚠ **`forLeasePayment()` a été SUPPRIMÉE, elle n'avait aucun appelant** (TCK-354). La quittance
 * de bail est servie par `DocumentPdfController` avec `pdf.receipts.rent`, et l'avoir en double
 * ici était un piège : le prochain à en avoir besoin aurait câblé celle-ci et livré un document
 * différent de celui que le reste du produit rend déjà.
 */
class PaymentReceiptPdf
{
    public function __construct(protected DocumentPdfService $documents) {}

    public function forBookingPayment(BookingPayment $payment): string
    {
        $payment->loadMissing(['booking.property.address', 'booking.customer', 'booking.agency']);

        return $this->documents->render('pdf.receipts.booking', [
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
}
