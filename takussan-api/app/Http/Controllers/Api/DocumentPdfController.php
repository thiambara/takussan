<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Pdf\DocumentPdfService;
use App\Services\Pdf\PrintedIdentity;
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

        return self::streamRentReceipt($this->pdf, $lease, $payment);
    }

    /**
     * Le rendu de la quittance de TCK-593 — UN gabarit, servi aussi par le lien de paiement
     * public (TCK-602, `PublicPaymentLinkController::receipt`), qui ne crée pas le sien.
     */
    public static function streamRentReceipt(DocumentPdfService $pdf, Lease $lease, LeasePayment $payment): Response
    {
        // P130.02 (TCK-1250) — le bien supprimé (suppression douce) reste celui du bail : le gabarit
        // le lit, au lieu de rendre 500 sur `$property->id`. La policy a pu déjà charger la relation,
        // à `null` sous la portée `SoftDeletes` : `loadMissing` ne la relirait pas.
        // P130.06 (TCK-1334) — de même pour le locataire : la quittance atteste un paiement passé,
        // elle imprime la fiche qui l'a fait, même supprimée depuis.
        foreach (['property', 'tenant'] as $relation) {
            if ($lease->relationLoaded($relation) && $lease->{$relation} === null) {
                $lease->unsetRelation($relation);
            }
        }
        $lease->loadMissing([
            'property' => fn ($q) => $q->withTrashed(),
            'property.address',
            'tenant' => fn ($q) => $q->withTrashed(),
            'agency',
        ]);
        $wording = self::receiptWording($payment->payment_type);
        // P140.02 (TCK-1792) — les identités du jour du règlement, quand l'échéance les a figées.
        ['tenant' => $tenant, 'property' => $property, 'agency' => $agency] = PrintedIdentity::restore($payment->metadata, [
            'tenant' => $lease->tenant, 'property' => $lease->property, 'agency' => $lease->agency,
        ]);

        return $pdf->stream('pdf.receipts.rent', [
            'title' => $wording['title'],
            'document_label' => $wording['label'],
            'wording' => $wording,
            'lease' => $lease,
            'payment' => $payment,
            'tenant' => $tenant,
            'property' => $property,
            'agency' => $agency,
            'filename' => sprintf('quittance-%s.pdf', $payment->reference_number ?? $payment->id),
        ]);
    }

    /**
     * TCK-725 (P26.01) — un intitulé et une ligne de montant par type d'échéance : une caution, une
     * pénalité ou des charges payées sortaient en « Quittance de loyer — Loyer acquitté ». Seul le
     * loyer a une quittance ; les autres types ont un reçu qui ne dit rien du loyer.
     *
     * @return array{title: string, label: string, amount_line: string, attestation: string}
     */
    private static function receiptWording(?LeasePaymentType $type): array
    {
        $receipt = static fn (string $title, string $line, string $object): array => [
            'title' => $title,
            'label' => 'Reçu',
            'amount_line' => $line,
            'attestation' => "Ce reçu atteste du règlement {$object} au titre du bail. Il ne vaut pas quittance de loyer.",
        ];

        return match ($type) {
            LeasePaymentType::Deposit => $receipt('Reçu de dépôt de garantie', 'Dépôt de garantie versé', 'du dépôt de garantie'),
            LeasePaymentType::Penalty => $receipt('Reçu de pénalité', 'Pénalité acquittée', 'de la pénalité'),
            LeasePaymentType::Charges => $receipt('Reçu de charges', 'Charges acquittées', 'des charges'),
            LeasePaymentType::Regularization => $receipt('Reçu de régularisation de charges', 'Régularisation acquittée', 'de la régularisation de charges'),
            default => [
                'title' => 'Quittance de loyer',
                'label' => 'Quittance',
                'amount_line' => 'Loyer acquitté',
                'attestation' => 'Cette quittance atteste du règlement du loyer pour la période indiquée.',
            ],
        };
    }

    public function invoice(Request $request, Invoice $invoice): Response
    {
        // TCK-587 — la règle de `InvoicePolicy::view`, que l'ancien helper recopiait à l'identique.
        $this->authorize('view', $invoice);

        // P130.06 (TCK-1334) — une facture atteste un fait passé : elle imprime le client qu'elle
        // désignait, même supprimé depuis (suppression douce), au lieu de « — ». La policy a pu
        // charger la relation à `null` : `loadMissing` ne la relirait pas.
        if ($invoice->relationLoaded('customer') && $invoice->customer === null) {
            $invoice->unsetRelation('customer');
        }
        $invoice->loadMissing(['customer' => fn ($q) => $q->withTrashed(), 'agency', 'creditedInvoice']);
        $label = ($invoice->kind?->value ?? 'invoice') === 'credit_note' ? 'Avoir' : 'Facture';

        return $this->pdf->stream('pdf.invoices.default', [
            'title' => $label.' '.($invoice->reference_number ?? $invoice->id),
            'document_label' => $label,
            'invoice' => $invoice,
            // P133.02 (TCK-1377) — les lignes saisies ; sans elles, le gabarit imprime la désignation.
            'lines' => $invoice->lines(),
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

        // P130.02 (TCK-1250) — le bien supprimé (suppression douce) reste celui du bail : le gabarit
        // le lit, au lieu de rendre 500 sur `$property->id`. La policy a pu déjà charger la relation,
        // à `null` sous la portée `SoftDeletes` : `loadMissing` ne la relirait pas.
        if ($lease->relationLoaded('property') && $lease->property === null) {
            $lease->unsetRelation('property');
        }
        $lease->loadMissing(['property' => fn ($q) => $q->withTrashed(), 'property.address', 'tenant', 'landlord', 'agency', 'guarantors']);

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
        // TCK-1154 (P86.04) — le collaborateur `agent` ou `manager` accepté, encore personnel de
        // l'agence du bail, comme `BookingStakeholders::collaboratorsOf`. Sans condition de rôle, un
        // `viewer` accepté téléchargeait la quittance d'un bien que `PropertyPolicy` lui refuse.
        $collabAgencyId = $lease->agency_id ?? $lease->property?->agency_id;
        $isCollab = $collabAgencyId !== null
            && (bool) $lease->property?->collaborators()
                ->where('user_id', $user->id)
                ->whereNotNull('accepted_at')
                ->whereIn('role', [CollaboratorRole::Agent->value, CollaboratorRole::Manager->value])
                ->exists()
            && app(MembershipCapabilityResolver::class)->isStaffAt($user, (int) $collabAgencyId);
        $isAdmin = $user->isSuperAdmin();

        abort_unless($isAdmin || $isTenant || $isLandlord || $isAgency || $isCollab, 403);
    }
}
