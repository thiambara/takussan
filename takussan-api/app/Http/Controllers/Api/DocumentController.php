<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\DocumentResource;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DocumentController extends Controller
{
    /**
     * Allow-list of documentable types accepted by the API.
     * Keyed by short alias, value is FQCN.
     */
    protected const ALLOWED_DOCUMENTABLE_TYPES = [
        'property' => Property::class,
        'lease' => Lease::class,
        'booking' => Booking::class,
        'customer' => Customer::class,
        'user' => User::class,
        'agency' => Agency::class,
        'inventory' => Inventory::class,
    ];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $base = Document::query();

        if (! $user->isSuperAdmin()) {
            $base->where('uploaded_by', $user->id);
        }

        $paginator = Document::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->paginated($paginator, DocumentResource::collection($paginator)->toArray($request));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'documentable_type' => ['required', 'string'],
            'documentable_id' => ['required', 'integer'],
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', Rule::enum(DocumentType::class)],
            'description' => ['nullable', 'string'],
            'expiry_date' => ['nullable', 'date'],
            'file' => ['required', 'file', 'max:10240'],
        ]);

        $fqcn = $this->resolveDocumentableType($data['documentable_type']);
        abort_if($fqcn === null, 422, 'Unsupported documentable_type.');

        $model = $fqcn::query()->find($data['documentable_id']);
        abort_if($model === null, 404, 'Documentable resource not found.');

        $user = $request->user();
        $this->authorizeUpload($user, $model);

        $document = Document::create([
            'documentable_id' => $model->getKey(),
            'documentable_type' => $fqcn,
            'uploaded_by' => $user->id,
            'name' => $data['name'],
            'type' => $data['type'],
            'description' => $data['description'] ?? null,
            'expiry_date' => $data['expiry_date'] ?? null,
            'is_verified' => false,
        ]);

        $document->addMediaFromRequest('file')->toMediaCollection('file');

        return $this->json([
            'data' => DocumentResource::make($document->refresh())->toArray($request),
        ], 201);
    }

    public function show(Request $request, Document $document): JsonResponse
    {
        $this->authorizeAccess($request, $document);

        return $this->json([
            'data' => DocumentResource::make($document)->toArray($request),
        ]);
    }

    public function verify(Request $request, Document $document): JsonResponse
    {
        abort_unless(
            $request->user()->isSuperAdmin(),
            403,
            'Only administrators can verify documents.'
        );

        $document->update([
            'is_verified' => true,
            'verified_by' => $request->user()->id,
            'verified_at' => now(),
        ]);

        return $this->json([
            'data' => DocumentResource::make($document->refresh())->toArray($request),
        ]);
    }

    public function destroy(Request $request, Document $document): JsonResponse
    {
        $this->authorizeManage($request, $document);
        $document->delete();

        return $this->json([], 204);
    }

    protected function resolveDocumentableType(string $type): ?string
    {
        $type = strtolower($type);
        if (isset(self::ALLOWED_DOCUMENTABLE_TYPES[$type])) {
            return self::ALLOWED_DOCUMENTABLE_TYPES[$type];
        }

        // Also accept the FQCN directly.
        foreach (self::ALLOWED_DOCUMENTABLE_TYPES as $fqcn) {
            if (strtolower($fqcn) === $type) {
                return $fqcn;
            }
        }

        return null;
    }

    protected function authorizeUpload($user, $documentable): void
    {
        if ($user->isSuperAdmin()) {
            return;
        }

        $ok = false;

        if ($documentable instanceof Property) {
            $ok = $documentable->user_id === $user->id
                || ($user->agency_id && $documentable->agency_id === $user->agency_id);
        } elseif ($documentable instanceof Lease) {
            $ok = $documentable->landlord_id === $user->id
                || ($user->agency_id && $documentable->agency_id === $user->agency_id)
                || ($documentable->tenant && $documentable->tenant->user_id === $user->id);
        } elseif ($documentable instanceof Booking) {
            $property = $documentable->property;
            $ok = $documentable->created_by_id === $user->id
                || ($property && $property->user_id === $user->id)
                || ($user->agency_id && $documentable->agency_id === $user->agency_id);
        } elseif ($documentable instanceof Customer) {
            $ok = $documentable->added_by_id === $user->id
                || $documentable->user_id === $user->id
                || ($user->agency_id && $documentable->agency_id === $user->agency_id);
        } elseif ($documentable instanceof User) {
            $ok = $documentable->id === $user->id;
        } elseif ($documentable instanceof Agency) {
            $ok = $user->agency_id === $documentable->id;
        } elseif ($documentable instanceof Inventory) {
            $ok = $documentable->conducted_by === $user->id
                || ($documentable->property && $documentable->property->user_id === $user->id)
                || ($user->agency_id && $documentable->property && $documentable->property->agency_id === $user->agency_id);
        }

        abort_unless($ok, 403);
    }

    protected function authorizeAccess(Request $request, Document $document): void
    {
        $user = $request->user();
        if ($user->isSuperAdmin()) {
            return;
        }

        if ($document->uploaded_by === $user->id) {
            return;
        }

        $documentable = $document->documentable;
        abort_if($documentable === null, 403);
        $this->authorizeUpload($user, $documentable);
    }

    protected function authorizeManage(Request $request, Document $document): void
    {
        $user = $request->user();
        $ok = $user->isSuperAdmin()
            || $document->uploaded_by === $user->id;

        abort_unless($ok, 403);
    }
}
