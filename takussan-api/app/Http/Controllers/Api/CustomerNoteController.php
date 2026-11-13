<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreCustomerNoteRequest;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\LastContactChannel;
use App\Services\Crm\ContactGestureService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerNoteController extends Controller
{
    public function index(Request $request, Customer $customer): JsonResponse
    {
        $this->authorize('view', $customer);

        // TCK-2578 (ADR-0101 § 2) — les comptes rendus de visite, au seul personnel de l'agence ;
        // retirés de la requête, ils ne comptent pas dans le total.
        $notes = $customer->notes()
            ->when(! $request->user()->can('viewVisitReports', $customer), fn ($q) => $q->withoutVisitReports())
            ->with('author')
            ->orderByDesc('pinned')
            ->latest()
            // TCK-1842 (P186.03) — un ordre total : le front lit toutes les pages, et deux notes de
            // la même seconde changeaient de page d'une lecture à l'autre.
            ->orderByDesc('id')
            ->paginate($this->tailleDePage($request, 20));

        return $this->paginated($notes, $notes->getCollection()->map(fn (CustomerNote $n) => $this->format($n))->values());
    }

    public function store(StoreCustomerNoteRequest $request, Customer $customer, ContactGestureService $gestures): JsonResponse
    {
        $data = $request->validated();

        $note = $customer->notes()->create(array_merge($data, [
            'author_id' => $request->user()->id,
        ]));

        // TCK-2583 — une note écrite sur la fiche est un contact : le dernier contact avance.
        $gestures->touchCustomer($customer, LastContactChannel::Note, $note->created_at);

        return $this->json(['data' => $this->format($note)], 201);
    }

    public function destroy(Request $request, Customer $customer, CustomerNote $note): JsonResponse
    {
        abort_unless($note->customer_id === $customer->id, 404);

        $user = $request->user();
        $ok = $user->isSuperAdmin() || $note->author_id === $user->id;
        abort_unless($ok, 403);

        $note->delete();

        return $this->json(null, 204);
    }

    private function format(CustomerNote $note): array
    {
        return [
            'id' => $note->id,
            'customer_id' => $note->customer_id,
            'body' => $note->body,
            // TCK-591 — `conversion` | `loss` | `visit_report` (TCK-2578) | null : le préfixe se rend côté front.
            'kind' => $note->kind?->value,
            // TCK-2578 — la visite que cite une note `visit_report` ; `null` pour toute autre.
            'property_visit_id' => $note->property_visit_id,
            'pinned' => $note->pinned,
            'author' => $note->relationLoaded('author') && $note->author
                ? ['id' => $note->author->id, 'name' => $note->author->getFullNameAttribute()]
                : null,
            'created_at' => $this->instant($note->created_at),
        ];
    }
}
