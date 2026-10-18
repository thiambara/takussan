<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreDocumentRequest;
use App\Http\Resources\DocumentResource;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Privacy\PersonalDataAccessLogger;
use App\Support\ImpersonationContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

        // TCK-820 (P23.04) — ses propres téléversements, pour tous, super-admin compris : aucun écran
        // de la console ne lit cette liste, et elle lui rendait les pièces de toute la plateforme.
        // Le super-admin ouvre toujours un document par son identifiant (`show`), journalisé.
        $base = Document::query()->where('uploaded_by', $user->id);

        // TCK-697 (P23.01) — la règle de `DocumentPolicy::view()` : sous impersonation, les pièces
        // rattachées à un profil ne se listent pas.
        if (app(ImpersonationContext::class)->active()) {
            $base->excludingProfilePieces();
        }

        // P16.03 (TCK-785) — la pertinence de `filter[search]` à défaut d'un `sort=`, comme TCK-281 :
        // `defaultSortsWithRelevance()` s'évalue APRÈS `buildQuery()`, qui interroge Meilisearch.
        $query = Document::buildQuery($base, $request);

        // P20.05 (TCK-901) — le fichier et la version active de chaque ligne se lisent sur `media`
        // chargé une fois pour la page, et non par deux requêtes par document.
        $paginator = $query
            ->defaultSorts(...Document::defaultSortsWithRelevance('-created_at'))
            ->with('media')
            ->paginate();

        return $this->paginated($paginator, DocumentResource::collection($paginator)->toArray($request));
    }

    public function store(StoreDocumentRequest $request): JsonResponse
    {
        $data = $request->validated();

        $fqcn = $this->resolveDocumentableType($data['documentable_type']);
        abort_code_if($fqcn === null, 422, 'document.unsupported_type');

        $user = $request->user();

        // TCK-732 (P03.06) — un porteur interdit rend la même réponse qu'un porteur introuvable :
        // un 403 ici dirait qu'un bien, un bail ou un client d'une autre agence existe.
        $model = $fqcn::query()->find($data['documentable_id']);
        abort_code_if(
            $model === null || ! $user->can('attachTo', [Document::class, $model]),
            404,
            'document.owner_not_found'
        );

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

    public function show(Request $request, Document $document, PersonalDataAccessLogger $accessLog): JsonResponse
    {
        $this->authorize('view', $document);
        $accessLog->recordPlatformPieceRead($request->user(), $document);

        return $this->json([
            'data' => DocumentResource::make($document)->toArray($request),
        ]);
    }

    public function verify(Request $request, Document $document): JsonResponse
    {
        abort_code_unless(
            $request->user()->isSuperAdmin(),
            403,
            'document.verify_forbidden'
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
        $this->authorize('delete', $document);
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
}
