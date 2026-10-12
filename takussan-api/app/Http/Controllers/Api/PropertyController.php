<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\AssignAgentPropertyRequest;
use App\Http\Requests\Api\StorePropertyRequest;
use App\Http\Requests\Api\UpdateStatusPropertyRequest;
use App\Http\Requests\Api\UpdateVisibilityPropertyRequest;
use App\Http\Requests\PropertyBulkArchiveRequest;
use App\Http\Requests\PropertyBulkAssignRequest;
use App\Http\Requests\PropertyBulkVisibilityRequest;
use App\Http\Requests\PropertyDuplicateRequest;
use App\Http\Requests\UpdatePropertyRequest;
use App\Http\Resources\PropertyResource;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\User;
use App\Notifications\PropertyProposedNotification;
use App\Services\Billing\QuotaResolver;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Property\PrimaryPropertyContact;
use App\Services\Property\PropertyBulkArchiveService;
use App\Services\Property\PropertyBulkAssignService;
use App\Services\Property\PropertyBulkVisibilityService;
use App\Services\Property\PropertyDuplicationService;
use App\Services\Property\PropertyPublication;
use App\Services\Property\PropertyViewCounter;
use App\Services\Property\ResponsibleAgentAssigner;
use App\Support\Logging\SafeExceptionContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;

class PropertyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // TCK-595 (§4) — ce que `PropertyResource` lit pour une ligne : la photo principale (`media`) et
        // l'avatar du propriétaire. TCK-603 — `PrimaryPropertyContact::eagerLoads()` : la liste rend
        // l'agent responsable (`primary_contact`) à côté du propriétaire, sans une requête d'avatar par
        // ligne. `is_agent` se juge par l'amorce de la page (plus bas), jamais par une requête par ligne.
        $base = Property::query()->with([
            'address',
            'media',
            'owner.media',
            ...PrimaryPropertyContact::eagerLoads(),
        ]);

        if (! $user->isSuperAdmin()) {
            $base->where(function ($q) use ($user) {
                $q->where('user_id', $user->id);
                // TCK-587 — « Mes biens » d'un bailleur sont les siens (`user_id`) ; le parc de
                // l'agence est celui de son PERSONNEL (ADR-0031).
                if (($staffAgencyId = $user->staffAgencyId()) !== null) {
                    $q->orWhere('agency_id', $staffAgencyId);
                }
            });
        }

        $statusFilter = $request->query('filter.status')
            ?? data_get($request->query('filter', []), 'status');
        $includeArchived = filter_var(
            $request->query('include_archived', false),
            FILTER_VALIDATE_BOOL,
        );
        if (! $includeArchived && ! $statusFilter) {
            $base->where('status', '!=', PropertyStatus::Archived);
        }

        $paginator = Property::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        // TCK-603 (ADR-0059 §6, verif-603 m4) — `agency_id` demandé, chaque ligne rend `primary_contact`
        // et le bloc `agency` (que `is_agent` charge) : sans ce préchargement, six requêtes par bien.
        $biens = $paginator->getCollection();
        if ($biens->isNotEmpty() && array_key_exists('agency_id', $biens->first()->getAttributes())) {
            $biens->loadMissing(['agency' => fn ($q) => $q->with('media')->withAvg(
                ['reviews as '.PropertyResource::AGENCY_RATING => fn ($r) => $r->where('is_approved', true)],
                'rating',
            )]);
        }

        return $this->paginated($paginator, MembershipCapabilityResolver::primed(
            $biens->flatMap(fn (Property $p) => [$p->getAttributes()['user_id'] ?? null, ...$p->collaborators->pluck('user_id')]),
            $biens->map(fn (Property $p) => $p->getAttributes()['agency_id'] ?? null),
            fn () => PropertyResource::collection($paginator)->toArray($request),
        ));
    }

    public function store(StorePropertyRequest $request): JsonResponse
    {
        $data = $request->validated();

        if (! $request->user()->isSuperAdmin()) {
            $data['agency_id'] = $request->user()->agency_id;
        }

        if (! empty($data['agency_id'])) {
            app(QuotaResolver::class)->assertCanCreateActiveListing((int) $data['agency_id']);
        }

        // TCK-587 (ADR-0031 §2) — un bailleur sans `properties.create` PROPOSE un bien à son
        // agence : brouillon privé imposé, quel que soit le corps ; la publication reste au
        // personnel tenant `properties.publish`.
        $isProposal = $request->user()->can('createsProposal', Property::class);
        if ($isProposal) {
            $data['status'] = PropertyStatus::Draft->value;
            $data['visibility'] = PropertyVisibility::Private->value;
        }

        try {
            $property = DB::transaction(function () use ($data, $request) {
                $property = Property::create(array_merge($data, [
                    'user_id' => $request->user()->id,
                    'status' => $data['status'] ?? PropertyStatus::Draft->value,
                    'visibility' => $data['visibility'] ?? PropertyVisibility::Private->value,
                ]));

                if (! empty($data['address'])) {
                    $property->address()->create($data['address']);
                }

                return $property;
            });

            if ($isProposal && $property->agency_id !== null) {
                $this->notifyAgencyAdminsOfProposal($property);
            }

            return $this->json(
                ['data' => PropertyResource::make($property->load('address'))->toArray($request)],
                201
            );
        } catch (\Throwable $e) {
            // TCK-601 (ADR-0044 §2) — ni la saisie (`$request->all()`), ni le message, qui la
            // recopie pour une erreur SQL : les CLÉS de la saisie et la forme sûre de l'exception.
            Log::error('[PropertyController::store] Failed to create property', [
                'user_id' => $request->user()?->id,
                'payload_keys' => array_keys($request->all()),
            ] + SafeExceptionContext::of($e));
            throw $e;
        }
    }

    public function show(Request $request, Property $property): JsonResponse
    {
        $this->authorize('view', $property);

        if ($request->boolean('raw')) {
            $firstMedia = $property->getFirstMedia('photos');
            if ($firstMedia !== null) {
                Gate::authorize('viewRaw', $firstMedia);
            }
        }

        return $this->json([
            'data' => PropertyResource::make($property->load(['address', 'media', ...PrimaryPropertyContact::eagerLoads()]))->toArray($request),
        ]);
    }

    public function update(UpdatePropertyRequest $request, Property $property): JsonResponse
    {
        $this->authorize('update', $property);

        $data = $request->validated();

        // TCK-086 — re-parenting requires update rights on the candidate parent.
        if (array_key_exists('parent_id', $data)) {
            $newParent = $data['parent_id'] !== null ? Property::find($data['parent_id']) : null;
            abort_unless(
                Gate::forUser($request->user())->allows('updateParent', [$property, $newParent]),
                403
            );
        }

        DB::transaction(function () use ($data, $property) {
            $addressData = $data['address'] ?? null;
            unset($data['address']);

            $property->fill($data)->save();

            if ($addressData !== null) {
                $property->address
                    ? $property->address->update($addressData)
                    : $property->address()->create($addressData);
            }
        });

        return $this->json([
            'data' => PropertyResource::make($property->refresh()->load('address'))->toArray($request),
        ]);
    }

    public function destroy(Request $request, Property $property): JsonResponse
    {
        $this->authorize('delete', $property);
        $property->delete();

        return $this->json(['message' => 'deleted'], 204);
    }

    public function publish(Request $request, Property $property): JsonResponse
    {
        $this->authorize('publish', $property);
        abort_code_if(
            in_array($property->status, [PropertyStatus::Sold, PropertyStatus::Rented], true),
            422,
            'property.cannot_publish'
        );
        // TCK-627 — publier une annonce qui n'occupait pas encore le quota (un brouillon) l'y fait
        // entrer : la borne se juge ici aussi. Elle n'était jugée qu'à la création, et un
        // brouillon créé sous la limite se publiait au-delà.
        if (! in_array($property->status, QuotaResolver::ACTIVE_LISTING_STATUSES, true)) {
            app(QuotaResolver::class)->assertCanCreateActiveListing($property->agency_id);
        }
        $property->update([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'published_at' => now(),
        ]);

        return $this->json([
            'data' => PropertyResource::make($property->refresh()->load('address'))->toArray($request),
        ]);
    }

    public function unpublish(Request $request, Property $property): JsonResponse
    {
        $this->authorize('publish', $property);
        // TCK-591 (verif-591 M3) — la règle et l'écriture partagées avec `bulk-visibility`.
        $publication = app(PropertyPublication::class);
        abort_code_unless($publication->canUnpublish($property), 422, 'property.cannot_unpublish');
        $property->update($publication->unpublishedAttributes());

        return $this->json([
            'data' => PropertyResource::make($property->refresh()->load('address'))->toArray($request),
        ]);
    }

    public function updateStatus(UpdateStatusPropertyRequest $request, Property $property): JsonResponse
    {

        $data = $request->validated();

        $status = PropertyStatus::from($data['status']);
        $updates = ['status' => $status];

        if ($status === PropertyStatus::Archived) {
            // TCK-591 (verif-591 M3) — l'écriture partagée avec `bulk-archive`.
            $updates = app(PropertyPublication::class)->archivedAttributes();
        }

        if ($property->status === PropertyStatus::Archived && $status !== PropertyStatus::Archived) {
            $updates['archived_at'] = null;
        }

        $property->update($updates);

        return $this->json([
            'data' => PropertyResource::make($property->refresh()->load('address'))->toArray($request),
        ]);
    }

    public function updateVisibility(UpdateVisibilityPropertyRequest $request, Property $property): JsonResponse
    {

        $data = $request->validated();

        $visibility = PropertyVisibility::from($data['visibility']);
        if ($visibility === PropertyVisibility::Public) {
            return $this->publish($request, $property);
        }

        return $this->unpublish($request, $property);
    }

    /**
     * TCK-603 (ADR-0036, ADR-0059) — « Changer l'agent responsable » : la cible devient le
     * collaborateur `agent` principal du bien ; `properties.user_id`, le PROPRIÉTAIRE, n'est jamais
     * réécrit. La règle de cible (personnel actif de l'agence du bien, TCK-587) et la désignation
     * vivent dans {@see ResponsibleAgentAssigner}, que le lot et la passation appellent aussi.
     */
    public function assignAgent(AssignAgentPropertyRequest $request, Property $property, ResponsibleAgentAssigner $assigner): JsonResponse
    {
        $assigner->assign($property, User::findOrFail($request->validated('user_id')), $request->user());

        return $this->json([
            'data' => PropertyResource::make($property->refresh()->load(['address', ...PrimaryPropertyContact::eagerLoads()]))->toArray($request),
        ]);
    }

    /**
     * TCK-587 — chaque admin ACTIF de l'agence reçoit la proposition ; un admin suspendu n'a plus
     * rien à y relire.
     */
    private function notifyAgencyAdminsOfProposal(Property $property): void
    {
        $admins = User::query()
            ->whereIn('id', AgencyAdminProfile::query()
                ->where('agency_id', $property->agency_id)
                ->active()
                ->select('user_id'))
            ->get();

        Notification::send($admins, new PropertyProposedNotification($property));
    }

    /**
     * TCK-598 (contrainte 3) — même service, même clé de déduplication que
     * `POST /public/properties/{slug}/view` : un visiteur compte une fois, quelle que soit la route.
     */
    public function recordView(Request $request, Property $property, PropertyViewCounter $compteur): JsonResponse
    {
        $compteur->record($property, (string) $request->ip());

        return $this->json(['data' => ['views_count' => $property->refresh()->views_count]]);
    }

    /**
     * TCK-074 — duplicate a property as a new draft.
     */
    public function duplicate(
        PropertyDuplicateRequest $request,
        Property $property,
        PropertyDuplicationService $service,
    ): JsonResponse {
        abort_unless($request->user()->can('duplicate', $property), 403);

        $clone = $service->duplicate(
            source: $property,
            actor: $request->user(),
            options: $request->only(['copy_media', 'copy_collaborators', 'title_suffix']),
        );

        return $this->json(
            ['data' => PropertyResource::make($clone->load('address'))->toArray($request)],
            201
        );
    }

    /**
     * TCK-074 — archive a batch of properties. Returns the per-id outcome.
     */
    public function bulkArchive(
        PropertyBulkArchiveRequest $request,
        PropertyBulkArchiveService $service,
    ): JsonResponse {
        abort_unless($request->user()->can('bulkArchive', Property::class), 403);

        $result = $service->archive(
            propertyIds: $request->input('property_ids'),
            actor: $request->user(),
            reason: $request->input('reason'),
        );

        return $this->json([
            'archived' => $result['archived'],
            'failed' => $result['failed'],
            'archived_ids' => $result['archived_ids'],
        ]);
    }

    /**
     * TCK-591 §7 — dépublier en lot : chaque ligne sous `publish` et la règle de statut de
     * `unpublish` (`PropertyPublication`), motifs en codes, transaction sur le sous-ensemble autorisé.
     */
    public function bulkVisibility(
        PropertyBulkVisibilityRequest $request,
        PropertyBulkVisibilityService $service,
    ): JsonResponse {
        return $this->json($service->apply(
            $request->input('property_ids'),
            PropertyVisibility::from($request->input('visibility')),
            $request->user(),
        ));
    }

    /**
     * TCK-603 (ADR-0059 §2) — changer l'agent responsable d'un lot : chaque ligne sous `update` et
     * {@see ResponsibleAgentAssigner} (la règle et la désignation de l'unitaire), motifs en codes,
     * une transaction, un point de sauvegarde par bien.
     */
    public function bulkAssign(
        PropertyBulkAssignRequest $request,
        PropertyBulkAssignService $service,
    ): JsonResponse {
        return $this->json($service->assign(
            $request->input('property_ids'),
            User::findOrFail($request->integer('user_id')),
            $request->user(),
        ));
    }
}
