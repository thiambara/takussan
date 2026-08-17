<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Customer;
use App\Models\CustomerNote;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerNoteController extends Controller
{
    public function index(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeCustomerAccess($request, $customer);

        $notes = $customer->notes()
            ->with('author')
            ->orderByDesc('pinned')
            ->latest()
            ->paginate((int) $request->input('per_page', 20));

        return $this->paginated($notes, $notes->getCollection()->map(fn (CustomerNote $n) => $this->format($n))->values());
    }

    public function store(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeCustomerAccess($request, $customer);

        $data = $request->validate([
            'body' => ['required', 'string'],
            'pinned' => ['nullable', 'boolean'],
        ]);

        $note = $customer->notes()->create(array_merge($data, [
            'author_id' => $request->user()->id,
        ]));

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

    protected function authorizeCustomerAccess(Request $request, Customer $customer): void
    {
        $user = $request->user();
        $ok = $user->isSuperAdmin()
            || $customer->added_by_id === $user->id
            || ($user->agency_id && $customer->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }

    private function format(CustomerNote $note): array
    {
        return [
            'id' => $note->id,
            'customer_id' => $note->customer_id,
            'body' => $note->body,
            'pinned' => $note->pinned,
            'author' => $note->relationLoaded('author') && $note->author
                ? ['id' => $note->author->id, 'name' => $note->author->getFullNameAttribute()]
                : null,
            'created_at' => $note->created_at?->toISOString(),
        ];
    }
}
