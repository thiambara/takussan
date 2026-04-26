<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\UploadDocumentVersionRequest;
use App\Http\Resources\DocumentVersionResource;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Document\DocumentVersionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Manages the versioned files attached to a Document via the `versions` media
 * collection. Implements:
 *
 *   POST   /api/documents/{document}/versions              → store  (upload new version)
 *   GET    /api/documents/{document}/versions              → index  (list all versions)
 *   GET    /api/documents/{document}/versions/{versionId}/download  → download
 *   POST   /api/documents/{document}/versions/{versionId}/restore   → restore
 */
class DocumentVersionController extends Controller
{
    public function __construct(private readonly DocumentVersionService $service) {}

    /**
     * List all versions for the document (latest first).
     */
    public function index(Request $request, Document $document): JsonResponse
    {
        $this->authorizeAccess($request, $document);

        $versions = $this->service->listVersions($document);

        return $this->json([
            'data' => DocumentVersionResource::collection($versions)->toArray($request),
        ]);
    }

    /**
     * Upload a new version. The previous active version is archived atomically.
     */
    public function store(UploadDocumentVersionRequest $request, Document $document): JsonResponse
    {
        $this->authorizeManage($request, $document);

        $media = $this->service->uploadVersion(
            $document,
            $request->file('file'),
            $request->user(),
            $request->string('comment')->value() ?: null,
        );

        return $this->json([
            'data' => DocumentVersionResource::make($media)->toArray($request),
        ], 201);
    }

    /**
     * Download a specific version — returns a redirect to a signed / direct URL.
     */
    public function download(Request $request, Document $document, int $versionId): Response
    {
        $this->authorizeAccess($request, $document);

        $media = $document->getMedia(DocumentVersionService::COLLECTION)
            ->firstWhere('id', $versionId);

        abort_if($media === null, 404, 'Version not found.');

        try {
            $url = $media->getTemporaryUrl(now()->addMinutes(15));

            return redirect()->away($url);
        } catch (\Exception) {
            // Local disk — stream directly.
            return response()->download($media->getPath(), $media->file_name);
        }
    }

    /**
     * Restore an archived version as the new active version.
     */
    public function restore(Request $request, Document $document, int $versionId): JsonResponse
    {
        $this->authorizeManage($request, $document);

        $media = $this->service->restoreVersion($document, $versionId, $request->user());

        return $this->json([
            'data' => DocumentVersionResource::make($media)->toArray($request),
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Authorization helpers (delegate to DocumentController logic)
    // ─────────────────────────────────────────────────────────────────────────

    protected function authorizeAccess(Request $request, Document $document): void
    {
        $user = $request->user();
        if ($user->hasRole(['admin', 'super_admin'])) {
            return;
        }
        if ($document->uploaded_by === $user->id) {
            return;
        }
        // If user can manage the documentable, they can read its versions.
        $this->authorizeManageDocumentable($user, $document);
    }

    protected function authorizeManage(Request $request, Document $document): void
    {
        $user = $request->user();
        if ($user->hasRole(['admin', 'super_admin'])) {
            return;
        }
        if ($document->uploaded_by === $user->id) {
            return;
        }
        $this->authorizeManageDocumentable($user, $document);
    }

    private function authorizeManageDocumentable($user, Document $document): void
    {
        // Reuse the same permission check as DocumentController::authorizeUpload.
        $documentable = $document->documentable;
        abort_if($documentable === null, 403);

        $documentController = app(DocumentController::class);
        // Reflection-free: call the protected method via the controller instance.
        // We cannot call protected from here directly, so replicate the essential logic.
        $ok = $this->checkDocumentableAccess($user, $documentable);
        abort_unless($ok, 403);
    }

    /**
     * Mirrors DocumentController::authorizeUpload() without the abort_unless.
     */
    private function checkDocumentableAccess($user, $documentable): bool
    {
        if ($documentable instanceof Property) {
            return $documentable->user_id === $user->id
                || ($user->agency_id && $documentable->agency_id === $user->agency_id);
        }
        if ($documentable instanceof Lease) {
            return $documentable->landlord_id === $user->id
                || ($user->agency_id && $documentable->agency_id === $user->agency_id)
                || ($documentable->tenant && $documentable->tenant->user_id === $user->id);
        }
        if ($documentable instanceof Booking) {
            $property = $documentable->property;

            return $documentable->created_by_id === $user->id
                || ($property && $property->user_id === $user->id)
                || ($user->agency_id && $documentable->agency_id === $user->agency_id);
        }
        if ($documentable instanceof Customer) {
            return $documentable->added_by_id === $user->id
                || $documentable->user_id === $user->id
                || ($user->agency_id && $documentable->agency_id === $user->agency_id);
        }
        if ($documentable instanceof User) {
            return $documentable->id === $user->id;
        }
        if ($documentable instanceof Agency) {
            return $user->agency_id === $documentable->id;
        }
        if ($documentable instanceof Inventory) {
            return $documentable->conducted_by === $user->id
                || ($documentable->property && $documentable->property->user_id === $user->id)
                || ($user->agency_id && $documentable->property && $documentable->property->agency_id === $user->agency_id);
        }

        return false;
    }
}
