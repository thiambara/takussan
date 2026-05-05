<?php

namespace App\Services\Payments;

use App\Models\BookingPayment;
use App\Models\LeasePayment;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Contracts\View\Factory as ViewFactory;

/**
 * TCK-172 — render a PDF receipt for a paid booking or lease payment using
 * Dompdf. The view (`payments/receipt.blade.php`) is the single source of
 * truth for the receipt layout; this service handles the HTML→PDF leg.
 */
class PaymentReceiptPdf
{
    public function __construct(protected ViewFactory $views) {}

    public function forBookingPayment(BookingPayment $payment): string
    {
        $payment->loadMissing(['booking.property.address', 'booking.customer', 'booking.agency']);

        $html = $this->views->make('payments.receipt', [
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
        ])->render();

        return $this->renderPdf($html);
    }

    public function forLeasePayment(LeasePayment $payment): string
    {
        $payment->loadMissing(['lease.property.address', 'lease.tenant', 'lease.agency']);

        $html = $this->views->make('payments.receipt', [
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
        ])->render();

        return $this->renderPdf($html);
    }

    protected function renderPdf(string $html): string
    {
        $options = new Options;
        $options->set('isRemoteEnabled', false);
        $options->set('defaultFont', 'sans-serif');

        $dompdf = new Dompdf($options);
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        return (string) $dompdf->output();
    }
}
