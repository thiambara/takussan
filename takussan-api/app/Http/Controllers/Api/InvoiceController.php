<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\InvoiceResource;
use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Invoice;
use App\Services\Model\InvoiceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class InvoiceController extends Controller
{
    public function __construct(protected InvoiceService $invoices) {}

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
            'invoiceable_type' => ['nullable', 'string', 'required_with:invoiceable_id'],
            'invoiceable_id' => ['nullable', 'integer', 'required_with:invoiceable_type'],
            'issue_date' => ['required', 'date'],
            'due_date' => ['nullable', 'date', 'after_or_equal:issue_date'],
            'subtotal' => ['required', 'numeric', 'min:0'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'currency' => ['nullable', Rule::enum(Currency::class)],
            'notes' => ['nullable', 'string'],
        ]);

        $customer = Customer::findOrFail($data['customer_id']);
        $invoice = $this->invoices->create($request->user(), $customer, $data);

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
        $invoice = $this->invoices->send($invoice);

        return $this->json([
            'data' => InvoiceResource::make($invoice)->toArray($request),
        ]);
    }

    public function markPaid(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorizeManage($request, $invoice);
        $invoice = $this->invoices->markPaid($invoice);

        return $this->json([
            'data' => InvoiceResource::make($invoice)->toArray($request),
        ]);
    }

    public function cancel(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorizeManage($request, $invoice);
        $invoice = $this->invoices->cancel($invoice);

        return $this->json([
            'data' => InvoiceResource::make($invoice)->toArray($request),
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
