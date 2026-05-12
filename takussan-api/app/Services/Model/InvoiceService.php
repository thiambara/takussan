<?php

namespace App\Services\Model;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\User;

class InvoiceService
{
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
        $canIssue = $user->hasRole('super_admin')
            || ($user->agency_id && $customer->agency_id && $customer->agency_id === $user->agency_id)
            || $customer->added_by_id === $user->id;
        abort_unless($canIssue, 403);

        [$invoiceableType, $invoiceableId] = $this->resolveInvoiceableTarget(
            $data['invoiceable_type'] ?? null,
            $data['invoiceable_id'] ?? null,
        );

        $subtotal = (float) $data['subtotal'];
        $taxRate = isset($data['tax_rate']) ? (float) $data['tax_rate'] : 0;
        $taxAmount = round($subtotal * $taxRate / 100, 2);
        $total = $subtotal + $taxAmount;

        return Invoice::create([
            'customer_id' => $customer->id,
            'invoiceable_type' => $invoiceableType,
            'invoiceable_id' => $invoiceableId,
            'issued_by_id' => $user->id,
            'agency_id' => $user->agency_id,
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
        abort_unless(
            $invoice->status === InvoiceStatus::Draft,
            422,
            'Only draft invoices can be sent.'
        );

        $invoice->update(['status' => InvoiceStatus::Sent]);

        return $invoice->refresh();
    }

    public function markPaid(Invoice $invoice): Invoice
    {
        abort_unless(
            in_array($invoice->status, [InvoiceStatus::Sent, InvoiceStatus::Overdue, InvoiceStatus::Draft], true),
            422,
            'Invoice cannot be marked paid in its current state.'
        );

        $invoice->update(['status' => InvoiceStatus::Paid]);

        return $invoice->refresh();
    }

    public function cancel(Invoice $invoice): Invoice
    {
        abort_if(
            in_array($invoice->status, [InvoiceStatus::Paid, InvoiceStatus::Cancelled, InvoiceStatus::Void], true),
            422,
            'Invoice cannot be cancelled in its current state.'
        );

        $invoice->update(['status' => InvoiceStatus::Cancelled]);

        return $invoice->refresh();
    }

    /**
     * @return array{0:?string,1:?int}
     */
    protected function resolveInvoiceableTarget(?string $typeAlias, ?int $id): array
    {
        if (empty($typeAlias)) {
            return [null, null];
        }

        $fqcn = $this->resolveInvoiceableType($typeAlias);
        abort_if($fqcn === null, 422, 'Unsupported invoiceable_type.');

        abort_if(
            $fqcn::query()->whereKey($id)->doesntExist(),
            404,
            'Invoiceable resource not found.'
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
