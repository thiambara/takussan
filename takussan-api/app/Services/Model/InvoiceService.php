<?php

namespace App\Services\Model;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\InvoiceKind;
use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\User;
use App\Services\Invoice\InvoiceNumberAllocator;
use Illuminate\Support\Facades\DB;

class InvoiceService
{
    public function __construct(private readonly InvoiceNumberAllocator $numbers) {}

    /**
     * Allow-list of invoiceable types accepted by the API.
     *
     * @var array<string,class-string>
     */
    protected const ALLOWED_INVOICEABLE_TYPES = [
        'lease' => Lease::class,
        'booking' => Booking::class,
    ];

    /**
     * @param  array<string,mixed>  $data
     */
    public function create(User $user, Customer $customer, array $data): Invoice
    {
        // TCK-528 — « client ajouté par lui » ne vaut plus que pour un client SANS agence : un client
        // rattaché à une autre agence que celle de l'émetteur était facturé au nom de celle-ci.
        $canIssue = $user->isSuperAdmin()
            // TCK-587 — le PERSONNEL de l'agence du client (ADR-0031), plus tout membre.
            || ($customer->agency_id !== null && $user->staffAgencyId() === (int) $customer->agency_id)
            || ($customer->added_by_id === $user->id && $customer->agency_id === null);
        abort_unless($canIssue, 403);

        $agencyId = $user->agency_id;

        [$invoiceableType, $invoiceableId] = $this->resolveInvoiceableTarget(
            $data['invoiceable_type'] ?? null,
            $data['invoiceable_id'] ?? null,
            $agencyId,
        );

        // TCK-594 (ADR-0039 §7) — sans taux, celui de l'agence, à défaut 0. Un taux explicite —
        // `0` compris — gagne.
        $subtotal = (float) $data['subtotal'];
        $taxRate = isset($data['tax_rate'])
            ? (float) $data['tax_rate']
            : (float) ($agencyId !== null ? Agency::query()->whereKey($agencyId)->value('default_tax_rate') ?? 0 : 0);
        $taxAmount = round($subtotal * $taxRate / 100, 2);
        $total = $subtotal + $taxAmount;

        return Invoice::create([
            'customer_id' => $customer->id,
            'invoiceable_type' => $invoiceableType,
            'invoiceable_id' => $invoiceableId,
            'issued_by_id' => $user->id,
            'agency_id' => $agencyId,
            'reference_number' => ReferenceNumberGenerator::invoice(),
            'status' => InvoiceStatus::Draft->value,
            'issue_date' => $data['issue_date'],
            'due_date' => $data['due_date'] ?? null,
            'subtotal' => $subtotal,
            'tax_rate' => $taxRate,
            'tax_amount' => $taxAmount,
            'total_amount' => $total,
            'currency' => $data['currency'] ?? 'XOF',
            'notes' => $data['notes'] ?? null,
        ]);
    }

    public function send(Invoice $invoice): Invoice
    {
        abort_code_unless(
            $invoice->status === InvoiceStatus::Draft,
            422,
            'invoice.not_draft_send'
        );

        // TCK-594 (ADR-0039 §7) — l'émission attribue le numéro, dans la même transaction.
        DB::transaction(function () use ($invoice): void {
            $invoice->update(['status' => InvoiceStatus::Sent]);
            $this->numbers->allocate($invoice);
        });

        return $invoice->refresh();
    }

    public function markPaid(Invoice $invoice): Invoice
    {
        abort_code_unless(
            in_array($invoice->status, [InvoiceStatus::Sent, InvoiceStatus::Overdue, InvoiceStatus::Draft], true),
            422,
            'invoice.cannot_mark_paid'
        );

        // TCK-594 (ADR-0039 §7) — payer un brouillon vaut émission : il reçoit son numéro.
        DB::transaction(function () use ($invoice): void {
            $invoice->update(['status' => InvoiceStatus::Paid]);
            $this->numbers->allocate($invoice);
        });

        return $invoice->refresh();
    }

    public function cancel(Invoice $invoice, ?User $actor = null): Invoice
    {
        abort_code_if(
            in_array($invoice->status, [InvoiceStatus::Paid, InvoiceStatus::Cancelled, InvoiceStatus::Void], true),
            422,
            'invoice.cannot_cancel'
        );

        // TCK-594 (ADR-0039 §7) — une facture ÉMISE ne s'annule que par un avoir du même montant,
        // créé dans la même transaction ; un brouillon reste un simple changement de statut.
        DB::transaction(function () use ($invoice, $actor): void {
            $issued = in_array($invoice->status, [InvoiceStatus::Sent, InvoiceStatus::Overdue], true);
            $invoice->update(['status' => InvoiceStatus::Cancelled]);

            if ($issued && $invoice->kind !== InvoiceKind::CreditNote) {
                $this->numbers->allocate($this->creditNoteFor($invoice, $actor));
            }
        });

        return $invoice->refresh();
    }

    /**
     * L'avoir reprend les montants de l'originale. Son statut est `void` : il n'appelle aucun
     * paiement (ni relance, ni encours), et il ne compte pas comme encaissé.
     */
    private function creditNoteFor(Invoice $invoice, ?User $actor): Invoice
    {
        return Invoice::query()->create([
            'kind' => InvoiceKind::CreditNote->value,
            'credited_invoice_id' => $invoice->id,
            'customer_id' => $invoice->customer_id,
            'invoiceable_type' => $invoice->invoiceable_type,
            'invoiceable_id' => $invoice->invoiceable_id,
            'issued_by_id' => $actor?->id ?? $invoice->issued_by_id,
            'agency_id' => $invoice->agency_id,
            'reference_number' => ReferenceNumberGenerator::invoice(),
            'status' => InvoiceStatus::Void->value,
            'issue_date' => now()->toDateString(),
            'due_date' => null,
            'subtotal' => $invoice->subtotal,
            'tax_rate' => $invoice->tax_rate,
            'tax_amount' => $invoice->tax_amount,
            'total_amount' => $invoice->total_amount,
            'currency' => $invoice->currency,
        ]);
    }

    /**
     * @return array{0:?string,1:?int}
     */
    protected function resolveInvoiceableTarget(?string $typeAlias, ?int $id, ?int $agencyId = null): array
    {
        if (empty($typeAlias)) {
            return [null, null];
        }

        $fqcn = $this->resolveInvoiceableType($typeAlias);
        abort_code_if($fqcn === null, 422, 'invoice.unsupported_target');

        $target = $fqcn::query()->whereKey($id)->first(['id', 'agency_id']);
        abort_code_if($target === null, 404, 'invoice.target_not_found');

        // TCK-594 (AC22) — un bail ou une réservation d'une AUTRE agence ne se facture pas au nom de
        // celle-ci.
        abort_code_unless(
            $target->agency_id !== null && (int) $target->agency_id === (int) $agencyId,
            422,
            'invoice.foreign_target'
        );

        return [$fqcn, $id];
    }

    protected function resolveInvoiceableType(string $type): ?string
    {
        $type = strtolower($type);
        if (isset(self::ALLOWED_INVOICEABLE_TYPES[$type])) {
            return self::ALLOWED_INVOICEABLE_TYPES[$type];
        }

        foreach (self::ALLOWED_INVOICEABLE_TYPES as $fqcn) {
            if (strtolower($fqcn) === $type) {
                return $fqcn;
            }
        }

        return null;
    }
}
