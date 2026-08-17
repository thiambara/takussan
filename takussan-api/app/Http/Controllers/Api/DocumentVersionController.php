<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\UploadDocumentVersionRequest;
use App\Http\Resources\DocumentVersionResource;
use App\Models\Document;
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
        $this->authorize('view', $document);

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
        $this->authorize('view', $document);

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
        $this->authorize('view', $document);

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
        $this->authorize('view', $document);

        $media = $this->service->restoreVersion($document, $versionId, $request->user());

        return $this->json([
            'data' => DocumentVersionResource::make($media)->toArray($request),
        ]);
    }

    // TCK-306 — les quatre helpers d'autorisation de ce contrôleur (`authorizeAccess`,
    // `authorizeManage`, `ensureCanActOn`, `checkDocumentableAccess`) ont été déplacés dans
    // `App\Policies\DocumentPolicy`. Le commentaire qu'ils portaient — « mirror
    // DocumentController::authorizeUpload semantics » — disait la duplication sans la corriger.
    //
    // ⚠ Ses DEUX helpers déléguaient à `ensureCanActOn()`, c'est-à-dire à la règle de LECTURE :
    // `authorizeManage` y était donc plus large que celui de `DocumentController` (téléverseur
    // seul). Les appels ci-dessus pointent tous sur `view` pour cette raison — les mapper sur
    // `update` aurait rendu 403 là où l'endpoint répondait 200.
}
