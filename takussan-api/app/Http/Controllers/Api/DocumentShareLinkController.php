<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreDocumentShareLinkRequest;
use App\Models\Document;
use App\Models\DocumentShareLink;
use App\Services\Media\PrivateMediaAccess;
use App\Services\Model\DocumentShareLinkService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DocumentShareLinkController extends Controller
{
    public function __construct(protected DocumentShareLinkService $shareLinks) {}

    /**
     * TCK-078 — list active share links for a given document (used by the
     * "share" tab in the document detail drawer so the user can revoke or
     * copy URLs without leaving the page).
     *
     * "Active" = not revoked, not expired, still under the max_downloads
     * ceiling when one is set. Expired/revoked links stay in the table for
     * audit but are hidden from this listing; admins can see the full
     * history via the audit-log endpoint.
     */
    public function index(Request $request, Document $document): JsonResponse
    {
        $this->authorizeDocument($request, $document);

        $links = $document->shareLinks()
            ->whereNull('revoked_at')
            ->where(function ($q): void {
                $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->where(function ($q): void {
                $q->whereNull('max_downloads')
                    ->orWhereColumn('downloads_count', '<', 'max_downloads');
            })
            ->orderByDesc('created_at')
            ->get();

        return $this->json([
            'data' => $links->map(fn (DocumentShareLink $l) => $this->format($l))->values(),
            'meta' => ['total' => $links->count()],
        ]);
    }

    public function store(StoreDocumentShareLinkRequest $request, Document $document): JsonResponse
    {

        $data = $request->validated();

        $link = $this->shareLinks->create($document, $request->user(), $data);

        return $this->json(['data' => $this->format($link)], 201);
    }

    public function show(Request $request, string $token): JsonResponse
    {
        $password = $this->passwordFromBody($request);
        $link = $this->shareLinks->validate($token, $password);
        $document = $link->document;

        return $this->json([
            'data' => [
                'token' => $link->token,
                'document' => [
                    'id' => $document->id,
                    'name' => $document->name,
                    'type' => $document->type?->value ?? $document->type,
                    // TCK-285 — la collection est `file` au singulier (Document.php:71,
                    // écrite par DocumentController.php:92). Ce contrôleur lisait `files` :
                    // la taille était donc TOUJOURS nulle, et le téléchargement toujours 404.
                    'size' => $document->getFirstMedia('file')?->size,
                ],
                'expires_at' => $this->instant($link->expires_at),
                'downloads_count' => $link->downloads_count,
                'max_downloads' => $link->max_downloads,
            ],
        ]);
    }

    public function download(Request $request, string $token, PrivateMediaAccess $access): StreamedResponse|JsonResponse
    {
        $password = $this->passwordFromBody($request);
        $link = $this->shareLinks->validate($token, $password);

        $media = $link->document->getFirstMedia('file');
        abort_code_unless($media !== null, 404, 'document.file_missing');

        $this->shareLinks->recordDownload($link);

        // TCK-539 — EN FLUX, jamais par redirection présignée : chaque téléchargement doit
        // repasser par `recordDownload`, sinon l'URL présignée se rejouerait 5 minutes hors du
        // plafond `max_downloads`.
        return $access->stream($media, 'attachment');
    }

    public function destroy(Request $request, Document $document, DocumentShareLink $link): JsonResponse
    {
        $this->authorizeDocument($request, $document);
        abort_unless($link->document_id === $document->id, 404);

        $this->shareLinks->revoke($link);

        return $this->json(null, 204);
    }

    /**
     * TCK-587 §8 — le mot de passe d'un lien protégé se lit dans le CORPS (formulaire ou JSON),
     * jamais dans l'URL.
     *
     * `input('password')` lisait aussi la query : le mot de passe voyageait dans
     * `GET /api/share/{t}?password=…`, donc dans l'historique, les journaux d'accès et l'en-tête
     * `Referer`. Une URL qui le porte est refusée en 400 AVANT toute validation — l'accepter en
     * l'ignorant laisserait croire à l'appelant qu'elle fonctionne.
     */
    private function passwordFromBody(Request $request): ?string
    {
        abort_code_if($request->query->has('password'), 400, 'share_link.password_in_query');

        $password = $request->post('password');

        return is_string($password) ? $password : null;
    }

    /**
     * TCK-1144 (P82.03) — lister les liens (donc lire leurs jetons, l'URL publique du document) et
     * en révoquer un se jugent par la règle de leur création, `DocumentPolicy::share`. La recopie
     * qui vivait ici n'avait pas `landlordWrites` : le bailleur suspendu, refusé à la création,
     * lisait encore les jetons et révoquait.
     *
     * Le helper reste un simple relais : `scripts/check-controller-authorization.mjs` porte une
     * exemption à son nom, qui rougit si la méthode disparaît, et une garde existante ne se
     * modifie pas dans ce ticket.
     */
    protected function authorizeDocument(Request $request, Document $document): void
    {
        $this->authorize('share', $document);
    }

    private function format(DocumentShareLink $link): array
    {
        return [
            'id' => $link->id,
            'document_id' => $link->document_id,
            'token' => $link->token,
            'expires_at' => $this->instant($link->expires_at),
            'max_downloads' => $link->max_downloads,
            'downloads_count' => $link->downloads_count,
            'has_password' => $link->password_hash !== null,
            'revoked_at' => $this->instant($link->revoked_at),
            'created_at' => $this->instant($link->created_at),
        ];
    }
}
