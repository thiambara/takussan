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
                // TCK-587 — le périmètre d'agence est celui du PERSONNEL (ADR-0031) : un bailleur de l'agence
                // listait les ressources de tous les autres.
                if (($staffAgencyId = $user->staffAgencyId()) !== null) {
                    $q->orWhere('agency_id', $staffAgencyId);
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

        return $this->json(['data' => $this->presenter($request, $invoice)], 201);
    }

    public function show(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorize('view', $invoice);

        return $this->json(['data' => $this->presenter($request, $invoice)]);
    }

    public function send(Request $request, Invoice $invoice): JsonResponse
    {
        // TCK-587 — une ability par geste, chacune adossée à sa capacité (`InvoicePolicy`).
        $this->authorize('send', $invoice);
        $invoice = $this->invoices->send($invoice);

        return $this->json(['data' => $this->presenter($request, $invoice)]);
    }

    public function markPaid(Request $request, Invoice $invoice): JsonResponse
    {
        // TCK-587 — une ability par geste, chacune adossée à sa capacité (`InvoicePolicy`).
        $this->authorize('markPaid', $invoice);
        $invoice = $this->invoices->markPaid($invoice);

        return $this->json(['data' => $this->presenter($request, $invoice)]);
    }

    public function cancel(Request $request, Invoice $invoice): JsonResponse
    {
        // TCK-587 — une ability par geste, chacune adossée à sa capacité (`InvoicePolicy`).
        $this->authorize('cancel', $invoice);
        $invoice = $this->invoices->cancel($invoice, $request->user());

        return $this->json(['data' => $this->presenter($request, $invoice)]);
    }

    /**
     * ADR-0071 (TCK-1511, P95.03) — le seul chemin de présentation d'une facture : le `show` et
     * les écritures (`store`, `send`, `markPaid`, `cancel`) rendent la même forme. Chaque auteur
     * d'une écriture est lecteur du `show` (`InvoicePolicy` : émetteur, personnel de l'agence,
     * super-admin). Aucun montant n'est calculé ici : l'avoir est lu tel que `cancel` l'a écrit.
     *
     * @return array<string, mixed>
     */
    private function presenter(Request $request, Invoice $invoice): array
    {
        // TCK-594 (ADR-0039 §7) — l'avoir se lit sur la facture qu'il annule.
        return InvoiceResource::make($invoice->load(['creditNotes']))->resolve($request);
    }
}
