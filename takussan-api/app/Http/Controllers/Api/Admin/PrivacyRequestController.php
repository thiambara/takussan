<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StorePrivacyRequestRequest;
use App\Http\Requests\Api\Admin\UpdatePrivacyRequestRequest;
use App\Http\Resources\PrivacyRequestResource;
use App\Models\Enums\PrivacyRequestStatus;
use App\Models\PrivacyRequest;
use App\Services\Export\ExportWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * TCK-601 (ADR-0044 §4) — le registre des demandes de droits : la console les suit par échéance,
 * en saisit une reçue hors de l'application, la fait avancer jusqu'à sa réponse (avec preuve), et
 * exporte le registre. Super-admin seul.
 */
class PrivacyRequestController extends Controller
{
    /** Colonnes de l'export : ce que la CDP demanderait à lire, rien de plus. */
    private const EXPORT_COLUMNS = [
        'id', 'type', 'channel', 'status', 'requester_name', 'requester_contact', 'user_id',
        'received_at', 'due_at', 'answered_at', 'response_summary', 'handled_by', 'proof',
    ];

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', PrivacyRequest::class);

        $perPage = max(1, min((int) $request->query('per_page', 25), 100));
        $entries = PrivacyRequest::buildQuery(request: $request)
            ->with(['handler', 'media'])
            ->defaultSort('due_at')
            ->paginate($perPage);

        return $this->paginated($entries, PrivacyRequestResource::collection($entries)->resolve($request));
    }

    public function store(StorePrivacyRequestRequest $request): JsonResponse
    {
        $entry = PrivacyRequest::query()->create($request->validated() + [
            'received_at' => $request->validated('received_at') ?? now(),
            'status' => PrivacyRequestStatus::Received,
            'handled_by' => $request->user()->id,
        ]);

        return $this->json(['data' => (new PrivacyRequestResource($entry->load('handler')))->resolve($request)], 201);
    }

    public function update(UpdatePrivacyRequestRequest $request, PrivacyRequest $privacyRequest): JsonResponse
    {
        $status = $request->has('status') ? PrivacyRequestStatus::from($request->validated('status')) : null;

        // Une demande close (répondue, rejetée, retirée) ne se rouvre pas : on en ouvre une autre.
        if ($status !== null && $status !== $privacyRequest->status && ! $privacyRequest->status->isOpen()) {
            abort_code(422, 'privacy.request_closed');
        }

        $privacyRequest->fill($request->safe()->only(['response_summary']));
        $privacyRequest->handled_by = $request->user()->id;
        if ($status !== null) {
            $privacyRequest->status = $status;
            if ($status === PrivacyRequestStatus::Answered && $privacyRequest->answered_at === null) {
                $privacyRequest->answered_at = now();
            }
        }
        $privacyRequest->save();

        if ($request->hasFile('proof')) {
            $privacyRequest->addMediaFromRequest('proof')->toMediaCollection('proof');
        }

        return $this->json(['data' => (new PrivacyRequestResource($privacyRequest->refresh()->load(['handler', 'media'])))->resolve($request)]);
    }

    public function export(Request $request, ExportWriter $writer): StreamedResponse
    {
        $this->authorize('export', PrivacyRequest::class);

        $rows = PrivacyRequest::query()->with(['handler', 'media'])->orderBy('due_at')->get()
            ->map(fn (PrivacyRequest $entry) => [
                'id' => $entry->id,
                'type' => $entry->type->value,
                'channel' => $entry->channel->value,
                'status' => $entry->status->value,
                'requester_name' => $entry->requester_name,
                'requester_contact' => $entry->requester_contact,
                'user_id' => $entry->user_id,
                'received_at' => $entry->received_at?->toIso8601String(),
                'due_at' => $entry->due_at?->toIso8601String(),
                'answered_at' => $entry->answered_at?->toIso8601String(),
                'response_summary' => $entry->response_summary,
                'handled_by' => $entry->handler?->full_name,
                'proof' => $entry->getFirstMedia('proof')?->file_name,
            ])->all();

        activity(PrivacyRequest::LOG_NAME)
            ->causedBy($request->user())
            ->event('privacy_register_exported')
            ->withProperties(['count' => count($rows)])
            ->log('privacy_register_exported');

        return $writer->csv([
            'columns' => self::EXPORT_COLUMNS,
            'rows' => $rows,
            'filename' => 'registre-demandes-de-droits-'.now()->format('Ymd'),
        ]);
    }
}
