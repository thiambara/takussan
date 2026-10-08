<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Generates PDFs for business documents (TCK-077):
 *   - GET /api/leases/{lease}/receipts/{payment}/pdf
 *   - GET /api/invoices/{invoice}/pdf
 *   - GET /api/leases/{lease}/contract/pdf
 *
 * Each endpoint authorises the caller against a distinct policy (receipt:
 * tenant + landlord + agency staff ; invoice: destinataire + issuer + admin ;
 * lease: parties), renders the matching Blade template via
 * DocumentPdfService and streams the PDF inline.
 */
class DocumentPdfController extends Controller
{
    public function __construct(private readonly DocumentPdfService $pdf) {}

    public function receipt(Request $request, Lease $lease, LeasePayment $payment): Response
    {
        abort_unless($payment->lease_id === $lease->id, 404);
        $this->authorizeReceipt($request, $lease);
        // TCK-593 — une quittance atteste un paiement : en délivrer une pour un impayé créerait une
        // preuve contre le bailleur. Même règle que le reçu de réservation.
        abort_code_unless($payment->status === PaymentStatus::Paid, 422, 'lease_payment.receipt_unpaid');
        // TCK-594 (VERIF-594 passe 5, P5-3) — une caution rendue est l'argent de l'agence vers le
        // locataire : une « Quittance de loyer » attesterait l'inverse.
        abort_code_if($payment->payment_type === LeasePaymentType::DepositRefund, 422, 'lease_payment.receipt_not_a_payment');

        $lease->loadMissing(['property.address', 'tenant', 'agency']);

        return $this->pdf->stream('pdf.receipts.rent', [
            'title' => 'Quittance de loyer',
            'document_label' => 'Quittance',
            'lease' => $lease,
            'payment' => $payment,
            'tenant' => $lease->tenant,
            'property' => $lease->property,
            'agency' => $lease->agency,
            'filename' => sprintf('quittance-%s.pdf', $payment->reference_number ?? $payment->id),
        ]);
    }

    public function invoice(Request $request, Invoice $invoice): Response
    {
        // TCK-587 — la règle de `InvoicePolicy::view`, que l'ancien helper recopiait à l'identique.
        $this->authorize('view', $invoice);

        $invoice->loadMissing(['customer', 'agency', 'creditedInvoice']);
        $label = ($invoice->kind?->value ?? 'invoice') === 'credit_note' ? 'Avoir' : 'Facture';

        return $this->pdf->stream('pdf.invoices.default', [
            'title' => $label.' '.($invoice->reference_number ?? $invoice->id),
            'document_label' => $label,
            'invoice' => $invoice,
            'customer' => $invoice->customer,
            'agency' => $invoice->agency,
            'filename' => sprintf('facture-%s.pdf', $invoice->reference_number ?? $invoice->id),
        ]);
    }

    public function leaseContract(Request $request, Lease $lease): Response
    {
        // TCK-587 — la règle de `LeasePolicy::view`, que l'ancien helper recopiait à l'identique.
        $this->authorize('view', $lease);

        // TCK-596 §4B (ADR-0042 §1) — dès qu'un contrat est figé (signature demandée, ou scan de
        // la voie papier), c'est LUI qui est servi, octet pour octet : c'est son empreinte que les
        // parties signent. Le rendu à la volée ne reste que pour un contrat NON figé (brouillon, ou
        // défigé par une modification). Et l'on FERME À L'ÉCHEC : un contrat figé introuvable, ou
        // dont les octets n'ont plus l'empreinte enregistrée, n'est jamais remplacé par un rendu.
        if ($lease->contract_sha256 !== null) {
            $bytes = $lease->frozenContractBytes();
            abort_code_if($bytes === null, 409, 'lease_signature.contract_missing');
            $frozen = $lease->getFirstMedia('signed_contract');

            return new Response($bytes, 200, [
                'Content-Type' => $frozen?->mime_type ?: 'application/pdf',
                'Content-Disposition' => sprintf('inline; filename="%s"', $frozen?->file_name ?? 'bail.pdf'),
                'Cache-Control' => 'private, max-age=0, no-cache',
            ]);
        }

        $lease->loadMissing(['property.address', 'tenant', 'landlord', 'agency', 'guarantors']);

        return $this->pdf->stream('pdf.leases.contract', [
            'title' => 'Contrat de bail '.($lease->reference_number ?? $lease->id),
            'document_label' => 'Bail',
            'lease' => $lease,
            'tenant' => $lease->tenant,
            'landlord' => $lease->landlord,
            'property' => $lease->property,
            'agency' => $lease->agency,
            'guarantors' => $lease->guarantors,
            'filename' => sprintf('bail-%s.pdf', $lease->reference_number ?? $lease->id),
        ]);
    }

    /**
     * Quittance : accessible au locataire, au bailleur, à l'agence propriétaire
     * du bail et aux collaborateurs agents du bien, plus admins.
     */
    protected function authorizeReceipt(Request $request, Lease $lease): void
    {
        $user = $request->user();
        abort_unless($user, 401);

        $isTenant = $lease->tenant && $lease->tenant->user_id === $user->id;
        $isLandlord = $lease->landlord_id === $user->id;
        // TCK-587 — le PERSONNEL de l'agence du bail (ADR-0031) : un autre bailleur de l'agence
        // téléchargeait la quittance. La branche collaborateur, propre à ce geste, reste.
        $staffAgencyId = $user->staffAgencyId();
        $isAgency = $staffAgencyId !== null && $staffAgencyId === (int) $lease->agency_id;
        $isCollab = (bool) $lease->property?->collaborators()
            ->where('user_id', $user->id)
            ->whereNotNull('accepted_at')
            ->exists();
        $isAdmin = $user->isSuperAdmin();

        abort_unless($isAdmin || $isTenant || $isLandlord || $isAgency || $isCollab, 403);
    }
}
