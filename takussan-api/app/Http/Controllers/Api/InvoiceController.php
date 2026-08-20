<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreInvoiceRequest;
use App\Http\Resources\InvoiceResource;
use App\Models\Customer;
use App\Models\Invoice;
use App\Services\Model\InvoiceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InvoiceController extends Controller
{
    public function __construct(protected InvoiceService $invoices) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $base = Invoice::query()->with('customer');

        if (! $user->isSuperAdmin()) {
            $base->where(function ($q) use ($user) {
                $q->where('issued_by_id', $user->id)
                    ->orWhereHas('customer', fn ($c) => $c->where('user_id', $user->id));
                if ($user->agency_id) {
                    $q->orWhere('agency_id', $user->agency_id);
                }
            });
        }

        $paginator = Invoice::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->paginated($paginator, InvoiceResource::collection($paginator)->toArray($request));
    }

    public function store(StoreInvoiceRequest $request): JsonResponse
    {
        $data = $request->validated();

        $customer = Customer::findOrFail($data['customer_id']);
        $invoice = $this->invoices->create($request->user(), $customer, $data);

        return $this->json([
            'data' => InvoiceResource::make($invoice)->toArray($request),
        ], 201);
    }

    public function show(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorize('view', $invoice);

        return $this->json([
            'data' => InvoiceResource::make($invoice->load('customer'))->toArray($request),
        ]);
    }

    public function send(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorize('update', $invoice);
        $invoice = $this->invoices->send($invoice);

        return $this->json([
            'data' => InvoiceResource::make($invoice)->toArray($request),
        ]);
    }

    public function markPaid(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorize('update', $invoice);
        $invoice = $this->invoices->markPaid($invoice);

        return $this->json([
            'data' => InvoiceResource::make($invoice)->toArray($request),
        ]);
    }

    public function cancel(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorize('update', $invoice);
        $invoice = $this->invoices->cancel($invoice);

        return $this->json([
            'data' => InvoiceResource::make($invoice)->toArray($request),
        ]);
    }
}
