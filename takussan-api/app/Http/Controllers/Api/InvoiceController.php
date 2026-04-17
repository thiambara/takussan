<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\InvoiceResource;
use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class InvoiceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Invoice::query()->with('customer');

        if (! $user->hasRole(['admin', 'super_admin'])) {
            $query->where(function ($q) use ($user) {
                $q->where('issued_by_id', $user->id)
                    ->orWhereHas('customer', fn ($c) => $c->where('user_id', $user->id));
                if ($user->agency_id) {
                    $q->orWhere('agency_id', $user->agency_id);
                }
            });
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $paginator = $query->latest()->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => InvoiceResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'invoiceable_type' => ['nullable', 'string'],
            'invoiceable_id' => ['nullable', 'integer'],
            'issue_date' => ['required', 'date'],
            'due_date' => ['nullable', 'date', 'after_or_equal:issue_date'],
            'subtotal' => ['required', 'numeric', 'min:0'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'currency' => ['nullable', Rule::enum(Currency::class)],
            'notes' => ['nullable', 'string'],
        ]);

        $user = $request->user();
        $customer = Customer::findOrFail($data['customer_id']);

        $canIssue = $user->hasRole(['admin', 'super_admin'])
            || ($user->agency_id && $customer->agency_id && $customer->agency_id === $user->agency_id)
            || $customer->added_by_id === $user->id;
        abort_unless($canIssue, 403);

        $subtotal = (float) $data['subtotal'];
        $taxRate = isset($data['tax_rate']) ? (float) $data['tax_rate'] : 0;
        $taxAmount = round($subtotal * $taxRate / 100, 2);
        $total = $subtotal + $taxAmount;

        $invoice = Invoice::create([
            'customer_id' => $customer->id,
            'invoiceable_type' => $data['invoiceable_type'] ?? null,
            'invoiceable_id' => $data['invoiceable_id'] ?? null,
            'issued_by_id' => $user->id,
            'agency_id' => $user->agency_id,
            'reference_number' => 'INV-'.now()->format('Ym').'-'.strtoupper(Str::random(6)),
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

        return $this->json([
            'data' => InvoiceResource::make($invoice)->toArray($request),
        ], 201);
    }

    public function show(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorizeAccess($request, $invoice);

        return $this->json([
            'data' => InvoiceResource::make($invoice->load('customer'))->toArray($request),
        ]);
    }

    public function send(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorizeManage($request, $invoice);
        abort_unless($invoice->status === InvoiceStatus::Draft, 422, 'Only draft invoices can be sent.');

        $invoice->update(['status' => InvoiceStatus::Sent]);

        return $this->json([
            'data' => InvoiceResource::make($invoice->refresh())->toArray($request),
        ]);
    }

    public function markPaid(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorizeManage($request, $invoice);
        abort_unless(
            in_array($invoice->status, [InvoiceStatus::Sent, InvoiceStatus::Overdue, InvoiceStatus::Draft], true),
            422,
            'Invoice cannot be marked paid in its current state.'
        );

        $invoice->update(['status' => InvoiceStatus::Paid]);

        return $this->json([
            'data' => InvoiceResource::make($invoice->refresh())->toArray($request),
        ]);
    }

    public function cancel(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorizeManage($request, $invoice);
        abort_if(
            in_array($invoice->status, [InvoiceStatus::Paid, InvoiceStatus::Cancelled, InvoiceStatus::Void], true),
            422,
            'Invoice cannot be cancelled in its current state.'
        );

        $invoice->update(['status' => InvoiceStatus::Cancelled]);

        return $this->json([
            'data' => InvoiceResource::make($invoice->refresh())->toArray($request),
        ]);
    }

    protected function authorizeAccess(Request $request, Invoice $invoice): void
    {
        $user = $request->user();
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $invoice->issued_by_id === $user->id
            || ($user->agency_id && $user->agency_id === $invoice->agency_id)
            || ($invoice->customer && $invoice->customer->user_id === $user->id);

        abort_unless($ok, 403);
    }

    protected function authorizeManage(Request $request, Invoice $invoice): void
    {
        $user = $request->user();
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $invoice->issued_by_id === $user->id
            || ($user->agency_id && $user->agency_id === $invoice->agency_id);

        abort_unless($ok, 403);
    }
}
