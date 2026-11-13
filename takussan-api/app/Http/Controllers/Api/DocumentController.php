<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreDocumentRequest;
use App\Http\Requests\Api\UpdateDocumentVisibilityRequest;
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
use App\Policies\DocumentPolicy;
use App\Services\Documents\DocumentVisibility;
use App\Services\Privacy\PersonalDataAccessLogger;
use App\Support\ImpersonationContext;
use Illuminate\Database\Eloquent\Model;
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
        //
        // P218.06 (TCK-2295) — sous la règle d'auteur de `DocumentPolicy::view` (ADR-0031, amendement du
        // 2026-10-25, D3) : l'agent suspendu ou retiré ne liste plus ce qu'il a téléversé dans l'agence.
        //
        // TCK-2655 (ADR-0099 §1) — AVEC une cible (`filter[documentable_type]` + `filter[documentable_id]`),
        // la liste suit la lecture : tout ce que `view` ouvre sur cette cible, quel qu'en soit l'auteur
        // ({@see DocumentPolicy::listableOn()}). Une cible illisible ou introuvable retombe sur la règle
        // de TCK-820, jamais sur un 403 ou un 404 qui dirait qu'elle existe (TCK-732).
        $target = $this->targetOf($request);
        $base = $target !== null
            ? DocumentPolicy::listableOn(Document::query(), $user, $target)
            : DocumentPolicy::restreindreAuTeleverseur(Document::query(), $user);

        // TCK-697 (P23.01) — la règle de `DocumentPolicy::view()` : sous impersonation, les pièces
        // rattachées à un profil ne se listent pas.
        if (app(ImpersonationContext::class)->active()) {
            $base->excludingProfilePieces();
        }

        // P16.03 (TCK-785) — la pertinence de `filter[search]` à défaut d'un `sort=`, comme TCK-281 :
        // `defaultSortsWithRelevance()` s'évalue APRÈS `buildQuery()`, qui interroge Meilisearch.
        $query = Document::buildQuery($base, $request);

        // P199.03 (TCK-2165) — le compte par type de toute la liste filtrée : l'écran groupe par
        // type une page triée par date, et le badge d'un groupe comptait les lignes de sa page.
        $parType = $query->getEloquentBuilder()->clone()->toBase()
            ->reorder()
            ->select('type')
            ->selectRaw('COUNT(*) as aggregate')
            ->groupBy('type')
            ->pluck('aggregate', 'type');
        $counts = [];
        foreach (DocumentType::cases() as $type) {
            $counts[$type->value] = (int) ($parType[$type->value] ?? 0);
        }

        // TCK-2655 — les pastilles « expire bientôt » et « à vérifier » de toute la liste filtrée, lues
        // avant la pagination (qui borne la requête).
        $attention = Document::attentionCounts($query->getEloquentBuilder());

        // P20.05 (TCK-901) — le fichier et la version active de chaque ligne se lisent sur `media`
        // chargé une fois pour la page, et non par deux requêtes par document.
        $paginator = $query
            ->defaultSorts(...Document::defaultSortsWithRelevance('-created_at'))
            ->with('media')
            ->paginate();

        return $this->paginated($paginator, DocumentResource::page($paginator, $request), ['counts' => $counts, ...$attention]);
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
            'is_internal' => $this->internalAtUpload($request, $user, $model),
            'name' => $data['name'],
            'type' => $data['type'],
            'description' => $data['description'] ?? null,
            'expiry_date' => $data['expiry_date'] ?? null,
            'is_verified' => false,
        ]);

        $document->addMediaFromRequest('file')->toMediaCollection('file');

        return $this->json([
            // TCK-2773 — un document seul : ses auteurs nommés selon le lecteur.
            'data' => DocumentResource::make($document->refresh())->avecAuteurs()->resolve($request),
        ], 201);
    }

    /**
     * TCK-2759 (ADR-0099, amendement du 2026-11-12, §§ 2, 4 et 5) — `is_internal` d'un téléversement :
     *
     * - sans le champ : vrai pour le lecteur des documents internes d'une fiche client (le personnel
     *   qui dépose sur une fiche), faux partout ailleurs — le défaut tombe du côté réparable ;
     * - `true` : 422 `document.internal_customer_only` hors d'une fiche client, puis 403 pour qui n'en
     *   lit pas les documents internes (le client, un bailleur), et 422 `document.internal_own_upload`
     *   pour le sujet de la fiche — rien n'est créé.
     */
    private function internalAtUpload(StoreDocumentRequest $request, User $user, Model $porteur): bool
    {
        if (! $request->has('is_internal')) {
            return $porteur instanceof Customer && ! $this->isSubjectOf($user, $porteur)
                && $user->can('keepsInternalOn', [Document::class, $porteur]);
        }

        if (! $request->boolean('is_internal')) {
            return false;
        }

        abort_code_unless($porteur instanceof Customer, 422, 'document.internal_customer_only');
        $this->authorize('keepsInternalOn', [Document::class, $porteur]);
        abort_code_if($this->isSubjectOf($user, $porteur), 422, 'document.internal_own_upload');

        return true;
    }

    /** TCK-2759 — le sujet de la fiche (`customers.user_id`), dont la pièce n'est jamais interne. */
    private function isSubjectOf(User $user, Customer $customer): bool
    {
        return $customer->user_id !== null && (int) $customer->user_id === (int) $user->id;
    }

    /**
     * TCK-2759 (ADR-0099, amendement du 2026-11-12) — `PATCH /api/documents/{document}/visibility` :
     * garder pour l'agence, ou montrer au client, un document de fiche client
     * ({@see DocumentVisibility}). Autorisé par `DocumentPolicy::setVisibility()`.
     */
    public function visibility(UpdateDocumentVisibilityRequest $request, Document $document, DocumentVisibility $visibility): JsonResponse
    {
        $document = $visibility->change($document, $request->boolean('is_internal'), $request->user());

        return $this->json([
            // TCK-2773
            'data' => DocumentResource::make($document)->avecAuteurs()->resolve($request),
        ]);
    }

    public function show(Request $request, Document $document, PersonalDataAccessLogger $accessLog): JsonResponse
    {
        $this->authorize('view', $document);
        $accessLog->recordPlatformPieceRead($request->user(), $document);

        return $this->json([
            // TCK-2773 — la fiche : qui a ajouté, vérifié, versionné, selon le lecteur.
            'data' => DocumentResource::make($document)->avecAuteurs()->resolve($request),
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
            // TCK-2773
            'data' => DocumentResource::make($document->refresh())->avecAuteurs()->resolve($request),
        ]);
    }

    public function destroy(Request $request, Document $document): JsonResponse
    {
        $this->authorize('delete', $document);
        $document->delete();

        return $this->json([], 204);
    }

    /**
     * TCK-2655 — la cible d'une liste : un type de {@see Document::TARGET_ALIASES} et UN identifiant
     * scalaire, qui désignent une ligne existante. Toute autre forme (liste, tableau, type inconnu,
     * ligne absente ou supprimée) n'est pas une cible.
     */
    private function targetOf(Request $request): ?Model
    {
        $filter = $request->query('filter');
        if (! is_array($filter)) {
            return null;
        }

        $class = Document::targetClass($filter['documentable_type'] ?? null);
        $id = $filter['documentable_id'] ?? null;
        if ($class === null || ! is_string($id) || ! ctype_digit($id) || strlen($id) > 18) {
            return null;
        }

        return $class::query()->find((int) $id);
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
