<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Document;
use App\Models\DocumentShareLink;
use App\Services\Model\DocumentShareLinkService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DocumentShareLinkController extends Controller
{
    public function __construct(protected DocumentShareLinkService $shareLinks) {}

    public function store(Request $request, Document $document): JsonResponse
    {
        $this->authorizeDocument($request, $document);

        $data = $request->validate([
            'expires_at' => ['nullable', 'date', 'after:now'],
            'max_downloads' => ['nullable', 'integer', 'min:1'],
            'password' => ['nullable', 'string', 'min:4'],
        ]);

        $link = $this->shareLinks->create($document, $request->user(), $data);

        return $this->json(['data' => $this->format($link)], 201);
    }

    public function show(Request $request, string $token): JsonResponse
    {
        $password = $request->input('password');
        $link = $this->shareLinks->validate($token, $password);
        $document = $link->document;

        return $this->json([
            'data' => [
                'token' => $link->token,
                'document' => [
                    'id' => $document->id,
                    'name' => $document->name,
                    'type' => $document->type?->value ?? $document->type,
                    'size' => $document->getFirstMedia('files')?->size,
                ],
                'expires_at' => $link->expires_at?->toISOString(),
                'downloads_count' => $link->downloads_count,
                'max_downloads' => $link->max_downloads,
            ],
        ]);
    }

    public function download(Request $request, string $token): StreamedResponse|JsonResponse
    {
        $password = $request->input('password');
        $link = $this->shareLinks->validate($token, $password);

        $media = $link->document->getFirstMedia('files');
        abort_unless($media !== null, 404, 'No file attached to this document.');

        $this->shareLinks->recordDownload($link);

        return response()->streamDownload(function () use ($media) {
            echo file_get_contents($media->getPath());
        }, $media->file_name, [
            'Content-Type' => $media->mime_type,
        ]);
    }

    public function destroy(Request $request, Document $document, DocumentShareLink $link): JsonResponse
    {
        $this->authorizeDocument($request, $document);
        abort_unless($link->document_id === $document->id, 404);

        $this->shareLinks->revoke($link);

        return $this->json(null, 204);
    }

    protected function authorizeDocument(Request $request, Document $document): void
    {
        $user = $request->user();
        $documentable = $document->documentable;
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $document->uploaded_by_id === $user->id
            || ($documentable && isset($documentable->user_id) && $documentable->user_id === $user->id)
            || ($user->agency_id && $documentable && isset($documentable->agency_id) && $documentable->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }

    private function format(DocumentShareLink $link): array
    {
        return [
            'id' => $link->id,
            'document_id' => $link->document_id,
            'token' => $link->token,
            'expires_at' => $link->expires_at?->toISOString(),
            'max_downloads' => $link->max_downloads,
            'downloads_count' => $link->downloads_count,
            'has_password' => $link->password_hash !== null,
            'revoked_at' => $link->revoked_at?->toISOString(),
            'created_at' => $link->created_at?->toISOString(),
        ];
    }
}
